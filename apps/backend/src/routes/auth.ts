import type { FastifyPluginAsync } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "../db.js";
import { normalizeUsername, offlineMinecraftUuid, randomToken, tokenHash } from "../security.js";
import { config } from "../config.js";
import { randomUUID } from "node:crypto";
import { loadAccess } from "../access.js";

const credentials = z.object({ login: z.string().min(3).max(254), password: z.string().min(8).max(256) });
const registration = z.object({
  username: z.string().regex(/^[A-Za-z0-9_]{3,16}$/),
  email: z.string().email().max(254),
  password: z.string().min(10).max(256),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  const publicUser = async (user: { id: string; username: string; minecraft_uuid: string; roles: string[]; skin_key?: string; cape_key?: string; skin_model?: "classic" | "slim" }) => {
    const access = await loadAccess(user.id);
    return {
      id: user.id, username: user.username, uuid: user.minecraft_uuid, roles: user.roles,
      roleAssignments: access.roles.map((role) => ({
        id: role.id, name: role.name, color: role.color, iconUrl: role.iconUrl, position: role.position,
      })),
      skinUrl: user.skin_key ? `${config.PUBLIC_URL}/artifacts/${user.skin_key}` : undefined,
      capeUrl: user.cape_key ? `${config.PUBLIC_URL}/artifacts/${user.cape_key}` : undefined,
      skinModel: user.skin_model ?? "classic",
    };
  };
  async function issue(user: { id: string; username: string; minecraft_uuid: string; roles: string[]; skin_key?: string; cape_key?: string; skin_model?: "classic" | "slim" }) {
    const accessToken = await app.jwt.sign({ sub: user.id, username: user.username, roles: user.roles }, { expiresIn: "15m" });
    const refreshToken = randomToken(48);
    await db.query("insert into refresh_sessions(id,user_id,token_hash,expires_at) values($1,$2,$3,now()+interval '30 days')", [randomUUID(), user.id, tokenHash(refreshToken)]);
    return { accessToken, refreshToken, expiresIn: 900, user: await publicUser(user) };
  }

  app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request, reply) => {
    const body = registration.parse(request.body);
    const username = normalizeUsername(body.username);
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    try {
      const result = await db.query("insert into users(id,username,email,password_hash,minecraft_uuid) values($1,$2,lower($3),$4,$5) returning id,username,minecraft_uuid,roles,skin_key,cape_key,skin_model", [randomUUID(), username, body.email, passwordHash, offlineMinecraftUuid(username)]);
      return reply.code(201).send(await issue(result.rows[0]));
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ code: "account_exists", error: "Ник или почта уже зарегистрированы" });
      throw error;
    }
  });

  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const body = credentials.parse(request.body);
    const result = await db.query("select id,username,minecraft_uuid,roles,skin_key,cape_key,skin_model,password_hash,disabled_at from users where lower(username)=lower($1) or lower(email)=lower($1)", [body.login]);
    const user = result.rows[0];
    if (!user || user.disabled_at || !(await argon2.verify(user.password_hash, body.password))) return reply.code(401).send({ code: "invalid_credentials", error: "Invalid credentials" });
    return issue(user);
  });

  app.post("/refresh", async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(20) }).parse(request.body);
    const result = await db.query(`select u.id,u.username,u.minecraft_uuid,u.roles,u.skin_key,u.cape_key,u.skin_model,s.id session_id
      from refresh_sessions s join users u on u.id=s.user_id
      where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and u.disabled_at is null`, [tokenHash(refreshToken)]);
    if (!result.rows[0]) return reply.code(401).send({ code: "invalid_session", error: "Refresh session is invalid" });
    await db.query("update refresh_sessions set revoked_at=now() where id=$1", [result.rows[0].session_id]);
    return issue(result.rows[0]);
  });

  app.get("/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const result = await db.query("select id,username,minecraft_uuid,roles,skin_key,cape_key,skin_model from users where id=$1 and disabled_at is null", [request.user.sub]);
    if (!result.rows[0]) return reply.code(404).send({ code: "account_missing", error: "Account not found" });
    return publicUser(result.rows[0]);
  });

  app.post("/logout", async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(20) }).parse(request.body);
    await db.query("update refresh_sessions set revoked_at=now() where token_hash=$1 and revoked_at is null", [tokenHash(refreshToken)]);
    return reply.code(204).send();
  });
};
