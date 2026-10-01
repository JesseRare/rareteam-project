import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { randomToken, tokenHash } from "../security.js";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { activeBan, loadAccess } from "../access.js";

export const gameRoutes: FastifyPluginAsync = async (app) => {
  app.post("/ticket", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { serverId } = z.object({ serverId: z.string().min(1).max(64) }).parse(request.body);
    const ban = await activeBan(request.user.sub, serverId);
    if (ban) return reply.code(403).send({ code: "banned", error: ban.reason, expiresAt: ban.expires_at });
    const token = randomToken(32);
    await db.query("insert into game_tickets(id,user_id,server_id,token_hash,expires_at) values($1,$2,$3,$4,now()+interval '90 seconds')", [randomUUID(), request.user.sub, serverId, tokenHash(token)]);
    return { ticket: token, expiresIn: 90 };
  });

  app.post("/ticket/consume", async (request, reply) => {
    const apiKey = request.headers["x-server-key"];
    if (apiKey !== config.GAME_SERVER_KEY) return reply.code(401).send({ code: "invalid_server", error: "Invalid server key" });
    const { ticket, serverId } = z.object({ ticket: z.string().min(20), serverId: z.string() }).parse(request.body);
    const result = await db.query(`with consumed as (
        update game_tickets set consumed_at=now()
        where token_hash=$1 and server_id=$2 and consumed_at is null and expires_at>now()
        returning user_id
      )
      select u.id,u.username,u.minecraft_uuid,u.skin_key,u.cape_key,u.skin_model
      from consumed c join users u on u.id=c.user_id
      where u.disabled_at is null`, [tokenHash(ticket), serverId]);
    if (!result.rows[0]) return reply.code(401).send({ code: "invalid_ticket", error: "Ticket invalid or already consumed" });
    const user = result.rows[0];
    const ban = await activeBan(user.id, serverId);
    if (ban) return reply.code(403).send({ code: "banned", error: ban.reason, expiresAt: ban.expires_at });
    const access = await loadAccess(user.id, serverId);
    return { ...user, access };
  });

  app.post("/access/snapshot", async (request, reply) => {
    const apiKey = request.headers["x-server-key"];
    if (apiKey !== config.GAME_SERVER_KEY) return reply.code(401).send({ code: "invalid_server", error: "Invalid server key" });
    const { serverId, uuids } = z.object({
      serverId: z.string().min(1).max(64),
      uuids: z.array(z.string().uuid()).max(200),
    }).parse(request.body);
    const users = await db.query("select id,username,minecraft_uuid from users where minecraft_uuid=any($1::uuid[])", [uuids]);
    const players = await Promise.all(users.rows.map(async (user) => {
      const [ban, access] = await Promise.all([activeBan(user.id, serverId), loadAccess(user.id, serverId)]);
      return {
        username: user.username,
        minecraftUuid: user.minecraft_uuid,
        banned: Boolean(ban),
        banReason: ban?.reason,
        roles: access.roles,
        permissions: access.permissions,
      };
    }));
    return { revision: Date.now(), players };
  });
};
