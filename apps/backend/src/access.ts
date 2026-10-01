import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "./db.js";
import { config } from "./config.js";

export const PERMISSIONS = [
  "users.view", "users.private", "users.edit", "users.sessions",
  "roles.view", "roles.manage", "roles.assign",
  "moderation.view", "moderation.warn", "moderation.kick", "moderation.mute",
  "moderation.ban.server", "moderation.ban.global", "moderation.revoke",
  "servers.view", "servers.power", "servers.console", "servers.files", "servers.backups",
  "content.announcements", "content.events",
  "analytics.view", "audit.view", "system.settings", "system.integrations",
] as const;

export interface AccessRole {
  id: string;
  slug: string;
  name: string;
  color: string;
  iconUrl?: string;
  position: number;
  permissions: string[];
  scopes: string[];
  displayInTab: boolean;
  serverId?: string;
  expiresAt?: string;
}

export async function loadAccess(userId: string, serverId?: string): Promise<{ roles: AccessRole[]; permissions: string[] }> {
  const result = await db.query(`
    select r.id,r.slug,r.name,r.color,r.icon_key,r.position,r.permissions,r.scopes,r.display_in_tab,
      a.server_id,a.expires_at
    from user_role_assignments a
    join role_definitions r on r.id=a.role_id
    where a.user_id=$1 and (a.expires_at is null or a.expires_at>now())
      and ($2::text is null or a.server_id is null or a.server_id=$2)
    order by r.position desc,r.created_at asc
  `, [userId, serverId ?? null]);
  const roles = result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    color: row.color,
    iconUrl: row.icon_key ? `${config.PUBLIC_URL}/artifacts/${row.icon_key}` : undefined,
    position: row.position,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    displayInTab: row.display_in_tab,
    serverId: row.server_id ?? undefined,
    expiresAt: row.expires_at ?? undefined,
  }));
  const permissions = [...new Set(roles.flatMap((role) => role.permissions))];
  return { roles, permissions };
}

export function allows(permissions: string[], permission: string) {
  return permissions.includes("*") || permissions.includes(permission);
}

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const access = await loadAccess(request.user.sub);
      if (!allows(access.permissions, permission)) {
        return reply.code(403).send({ code: "forbidden", error: "Недостаточно прав" });
      }
    } catch {
      return reply.code(401).send({ code: "unauthorized", error: "Authentication required" });
    }
  };
}

export async function activeBan(userId: string, serverId?: string) {
  const result = await db.query(`
    select id,scope,server_id,reason,expires_at,created_at
    from bans
    where user_id=$1 and revoked_at is null and (expires_at is null or expires_at>now())
      and (scope='global' or (scope='server' and server_id=$2))
    order by case when scope='global' then 0 else 1 end,created_at desc limit 1
  `, [userId, serverId ?? null]);
  return result.rows[0] ?? null;
}

export async function audit(actorId: string | null, action: string, target?: string, metadata: Record<string, unknown> = {}) {
  await db.query("insert into audit_log(actor_id,action,target,metadata) values($1,$2,$3,$4)", [
    actorId, action, target ?? null, JSON.stringify(metadata),
  ]);
}