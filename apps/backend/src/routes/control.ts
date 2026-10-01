import type { FastifyPluginAsync } from "fastify";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { activeBan, allows, audit, loadAccess, PERMISSIONS, requirePermission } from "../access.js";
import { config } from "../config.js";
import { db } from "../db.js";
import { controlPanelHtml } from "../control-panel.js";
import { queryMinecraft } from "../minecraft-status.js";
import { querySource } from "../source-status.js";
import { queryPterodactylRunning } from "../pterodactyl-status.js";

const roleInput = z.object({
  name: z.string().trim().min(1).max(64),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#9ca3af"),
  position: z.number().int().min(0).max(100000).default(0),
  permissions: z.array(z.string().min(1).max(80)).max(128).default([]),
  scopes: z.array(z.string().min(1).max(64)).max(64).default(["global"]),
  displayInTab: z.boolean().default(true),
});

const patchRoleInput = roleInput.partial();

function slugify(value: string) {
  const normalized = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || `role-${randomUUID().slice(0, 8)}`;
}

async function actorCanManageRole(actorId: string, roleId: string) {
  const actor = await loadAccess(actorId);
  if (allows(actor.permissions, "*")) return { actor, role: null };
  const maxPosition = Math.max(-1, ...actor.roles.map((role) => role.position));
  const result = await db.query("select id,position,is_system,permissions from role_definitions where id=$1", [roleId]);
  const role = result.rows[0];
  if (!role || role.is_system || role.position >= maxPosition) throw Object.assign(new Error("Нельзя управлять этой ролью"), { statusCode: 403 });
  return { actor, role };
}

function assertGrantablePermissions(actorPermissions: string[], requested: string[]) {
  if (allows(actorPermissions, "*")) return;
  if (requested.some((permission) => !actorPermissions.includes(permission))) {
    throw Object.assign(new Error("Нельзя выдать разрешение, которого нет у вас"), { statusCode: 403 });
  }
}

export const controlRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request, reply) => {
    if (config.CONTROL_ALLOW_PUBLIC) return;
    const ip = request.ip.replace(/^::ffff:/, "");
    const privateAddress = ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")
      || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
    if (!privateAddress) return reply.code(404).send({ code: "not_found", error: "Not found" });
  });

  app.get("/", async (_request, reply) => {
    const nonce = randomBytes(18).toString("base64");
    return reply
      .header(
        "Content-Security-Policy",
        `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'nonce-${nonce}'; script-src-attr 'none'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'`,
      )
      .type("text/html; charset=utf-8")
      .send(controlPanelHtml(nonce));
  });

  app.get("/api/session", { onRequest: [app.authenticate] }, async (request) => {
    const access = await loadAccess(request.user.sub);
    return { user: { id: request.user.sub, username: request.user.username }, ...access };
  });

  app.get("/api/permissions", { onRequest: [requirePermission("roles.view")] }, async () => ({
    permissions: PERMISSIONS,
  }));

  app.get("/api/overview", { onRequest: [requirePermission("analytics.view")] }, async () => {
    const result = await db.query(`
      select
        (select count(*)::int from users) users,
        (select count(*)::int from users where created_at>=now()-interval '24 hours') new_users_24h,
        (select count(*)::int from bans where revoked_at is null and (expires_at is null or expires_at>now())) active_bans,
        (select count(*)::int from role_definitions) roles,
        (select count(*)::int from refresh_sessions where revoked_at is null and expires_at>now()) active_sessions
    `);
    const [minecraft, queriedSource] = await Promise.all([
      queryMinecraft(config.MINECRAFT_STATUS_ADDRESS ?? config.MINECRAFT_ADDRESS),
      querySource(config.CSS_STATUS_ADDRESS ?? config.CSS_ADDRESS),
    ]);
    const cssRunning = queriedSource.online ? true : await queryPterodactylRunning(config.CSS_PTERODACTYL_SERVER_ID);
    const source = queriedSource.online
      ? queriedSource
      : { ...queriedSource, online: cssRunning === true, maxPlayers: cssRunning === true ? 64 : 0 };
    return {
      ...result.rows[0],
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      servers: [
        { id: "melchior-1", name: "Мельхиор-1", ...minecraft },
        { id: "survival-jim-css", name: "Survival Jim CSS v34", ...source },
      ],
    };
  });

  app.get("/api/roles", { onRequest: [requirePermission("roles.view")] }, async () => {
    const result = await db.query(`
      select r.*,count(a.id)::int member_count
      from role_definitions r left join user_role_assignments a on a.role_id=r.id
        and (a.expires_at is null or a.expires_at>now())
      group by r.id order by r.position desc,r.created_at asc
    `);
    return result.rows.map((row) => ({
      id: row.id, slug: row.slug, name: row.name, color: row.color,
      iconUrl: row.icon_key ? `${config.PUBLIC_URL}/artifacts/${row.icon_key}` : null,
      position: row.position, permissions: row.permissions, scopes: row.scopes,
      displayInTab: row.display_in_tab, isSystem: row.is_system, memberCount: row.member_count,
    }));
  });

  app.post("/api/roles", { onRequest: [requirePermission("roles.manage")] }, async (request, reply) => {
    const input = roleInput.parse(request.body);
    const actor = await loadAccess(request.user.sub);
    assertGrantablePermissions(actor.permissions, input.permissions);
    if (!allows(actor.permissions, "*")) {
      const maxPosition = Math.max(-1, ...actor.roles.map((role) => role.position));
      if (input.position >= maxPosition) return reply.code(403).send({ code: "role_hierarchy", error: "Позиция роли должна быть ниже вашей" });
    }
    const id = randomUUID();
    const result = await db.query(`
      insert into role_definitions(id,slug,name,color,position,permissions,scopes,display_in_tab,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *
    `, [id, `${slugify(input.name)}-${id.slice(0, 6)}`, input.name, input.color, input.position,
      JSON.stringify(input.permissions), JSON.stringify(input.scopes), input.displayInTab, request.user.sub]);
    await audit(request.user.sub, "role.create", id, { name: input.name });
    return reply.code(201).send(result.rows[0]);
  });

  app.patch("/api/roles/:id", { onRequest: [requirePermission("roles.manage")] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = patchRoleInput.parse(request.body);
    const { actor } = await actorCanManageRole(request.user.sub, id);
    if (input.permissions) assertGrantablePermissions(actor.permissions, input.permissions);
    if (input.position !== undefined && !allows(actor.permissions, "*")) {
      const maxPosition = Math.max(-1, ...actor.roles.map((role) => role.position));
      if (input.position >= maxPosition) return reply.code(403).send({ code: "role_hierarchy", error: "Позиция роли должна быть ниже вашей" });
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    const put = (column: string, value: unknown) => { values.push(value); fields.push(`${column}=$${values.length}`); };
    if (input.name !== undefined) put("name", input.name);
    if (input.color !== undefined) put("color", input.color);
    if (input.position !== undefined) put("position", input.position);
    if (input.permissions !== undefined) put("permissions", JSON.stringify(input.permissions));
    if (input.scopes !== undefined) put("scopes", JSON.stringify(input.scopes));
    if (input.displayInTab !== undefined) put("display_in_tab", input.displayInTab);
    if (!fields.length) return reply.code(204).send();
    values.push(id);
    await db.query(`update role_definitions set ${fields.join(",")},updated_at=now() where id=$${values.length}`, values);
    await audit(request.user.sub, "role.update", id, input);
    return reply.code(204).send();
  });

  app.delete("/api/roles/:id", { onRequest: [requirePermission("roles.manage")] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await actorCanManageRole(request.user.sub, id);
    await db.query("delete from role_definitions where id=$1 and is_system=false", [id]);
    await audit(request.user.sub, "role.delete", id);
    return reply.code(204).send();
  });

  app.post("/api/roles/:id/icon", { onRequest: [requirePermission("roles.manage")] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await actorCanManageRole(request.user.sub, id);
    const upload = await request.file();
    if (!upload) throw Object.assign(new Error("Файл не передан"), { statusCode: 400 });
    if (upload.mimetype !== "image/png") {
      throw Object.assign(new Error("Для игрового TAB используется значок PNG"), { statusCode: 400 });
    }
    const buffer = await upload.toBuffer();
    if (buffer.length > 256 * 1024) throw Object.assign(new Error("Значок должен быть меньше 256 КБ"), { statusCode: 400 });
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < pngSignature.length || !buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
      throw Object.assign(new Error("Файл не является PNG"), { statusCode: 400 });
    }
    const extension = "png";
    const hash = createHash("sha256").update(buffer).digest("hex");
    const key = `role-icons/${hash}.${extension}`;
    const target = path.resolve(config.ARTIFACT_ROOT, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { mode: 0o644 });
    await db.query("update role_definitions set icon_key=$1,updated_at=now() where id=$2", [key, id]);
    await audit(request.user.sub, "role.icon", id, { key });
    return { iconUrl: `${config.PUBLIC_URL}/artifacts/${key}` };
  });

  app.get("/api/users", { onRequest: [requirePermission("users.view")] }, async (request) => {
    const query = z.object({ q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    const term = query.q ? `%${query.q}%` : null;
    const result = await db.query(`
      select u.id,u.username,u.email,u.minecraft_uuid,u.disabled_at,u.created_at,
        coalesce((select jsonb_agg(jsonb_build_object(
          'assignmentId',a.id,'id',r.id,'name',r.name,'color',r.color,'position',r.position,
          'iconKey',r.icon_key,'serverId',a.server_id,'expiresAt',a.expires_at
        ) order by r.position desc) from user_role_assignments a join role_definitions r on r.id=a.role_id
          where a.user_id=u.id and (a.expires_at is null or a.expires_at>now())), '[]'::jsonb) role_assignments,
        (select jsonb_build_object('id',b.id,'reason',b.reason,'scope',b.scope,'serverId',b.server_id,'expiresAt',b.expires_at)
          from bans b where b.user_id=u.id and b.revoked_at is null and (b.expires_at is null or b.expires_at>now())
          order by b.created_at desc limit 1) active_ban
      from users u where ($1::text is null or u.username ilike $1 or u.email ilike $1 or u.minecraft_uuid::text ilike $1)
      order by u.created_at desc limit $2
    `, [term, query.limit]);
    return result.rows;
  });

  app.put("/api/users/:id/roles", { onRequest: [requirePermission("roles.assign")] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({
      roleId: z.string().uuid(), serverId: z.string().min(1).max(64).nullable().optional(),
      expiresAt: z.string().datetime().nullable().optional(), reason: z.string().max(500).optional(),
    }).parse(request.body);
    await actorCanManageRole(request.user.sub, input.roleId);
    const assignmentId = randomUUID();
    const updated = await db.query(`
      update user_role_assignments set expires_at=$1,granted_by=$2,reason=$3,created_at=now()
      where user_id=$4 and role_id=$5 and coalesce(server_id,'')=coalesce($6::text,'')
    `, [input.expiresAt ?? null, request.user.sub, input.reason ?? null, id, input.roleId, input.serverId ?? null]);
    if (!updated.rowCount) {
      await db.query(`
        insert into user_role_assignments(id,user_id,role_id,server_id,expires_at,granted_by,reason)
        values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing
      `, [assignmentId, id, input.roleId, input.serverId ?? null, input.expiresAt ?? null, request.user.sub, input.reason ?? null]);
    }
    await audit(request.user.sub, "role.assign", id, input);
    return reply.code(204).send();
  });

  app.delete("/api/users/:userId/roles/:assignmentId", { onRequest: [requirePermission("roles.assign")] }, async (request, reply) => {
    const params = z.object({ userId: z.string().uuid(), assignmentId: z.string().uuid() }).parse(request.params);
    const result = await db.query("select role_id from user_role_assignments where id=$1 and user_id=$2", [params.assignmentId, params.userId]);
    if (result.rows[0]) await actorCanManageRole(request.user.sub, result.rows[0].role_id);
    await db.query("delete from user_role_assignments where id=$1 and user_id=$2", [params.assignmentId, params.userId]);
    await audit(request.user.sub, "role.revoke", params.userId, { assignmentId: params.assignmentId });
    return reply.code(204).send();
  });

  app.post("/api/users/:id/bans", { onRequest: [requirePermission("moderation.ban.server")] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z.object({
      scope: z.enum(["global", "server"]), serverId: z.string().min(1).max(64).nullable().optional(),
      reason: z.string().trim().min(1).max(1000), evidenceUrl: z.string().url().nullable().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
    }).parse(request.body);
    const actor = await loadAccess(request.user.sub);
    if (input.scope === "global" && !allows(actor.permissions, "moderation.ban.global")) {
      return reply.code(403).send({ code: "forbidden", error: "Нет права на глобальный бан" });
    }
    const idBan = randomUUID();
    await db.query(`
      insert into bans(id,user_id,scope,server_id,reason,evidence_url,expires_at,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8)
    `, [idBan, id, input.scope, input.scope === "server" ? input.serverId : null,
      input.reason, input.evidenceUrl ?? null, input.expiresAt ?? null, request.user.sub]);
    await db.query("update refresh_sessions set revoked_at=now() where user_id=$1 and revoked_at is null", [id]);
    await audit(request.user.sub, "ban.create", id, { banId: idBan, ...input });
    return reply.code(201).send({ id: idBan });
  });

  app.delete("/api/bans/:id", { onRequest: [requirePermission("moderation.revoke")] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await db.query("update bans set revoked_at=now(),revoked_by=$1 where id=$2 and revoked_at is null", [request.user.sub, id]);
    await audit(request.user.sub, "ban.revoke", id);
    return reply.code(204).send();
  });

  app.get("/api/audit", { onRequest: [requirePermission("audit.view")] }, async () => {
    const result = await db.query(`
      select l.id,l.action,l.target,l.metadata,l.created_at,u.username actor
      from audit_log l left join users u on u.id=l.actor_id order by l.created_at desc limit 200
    `);
    return result.rows;
  });

  app.get("/api/users/:id/access", { onRequest: [requirePermission("users.view")] }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { ...(await loadAccess(id)), activeBan: await activeBan(id) };
  });
};