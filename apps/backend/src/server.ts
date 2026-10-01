import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import multipart from "@fastify/multipart";
import cookie from "@fastify/cookie";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { gameRoutes } from "./routes/game.js";
import { profileRoutes } from "./routes/profiles.js";
import { startPackPublisher } from "./pack-publisher.js";
import { cosmeticRoutes } from "./routes/cosmetics.js";
import { controlRoutes } from "./routes/control.js";
import { launcherReleaseRoutes } from "./routes/launcher-releases.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const trustedProxyRanges = [
  "127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
  "::1/128", "fc00::/7", "fe80::/10",
];

export async function buildApp(options: { migrateDatabase?: boolean; startPublisher?: boolean } = {}) {
  const app = Fastify({ logger: options.startPublisher !== false, trustProxy: trustedProxyRanges, bodyLimit: 2 * 1024 * 1024 });
  await app.register(helmet, { crossOriginResourcePolicy: { policy: "cross-origin" } });
  await app.register(cors, { origin: true, credentials: false });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    allowList: (request) => request.url.startsWith("/artifacts/"),
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: "rare_control", signed: false },
  });
  await app.register(multipart, { limits: { files: 1, fileSize: 2 * 1024 * 1024 } });
  app.decorate("authenticate", async (request, reply) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ code: "unauthorized", error: "Authentication required" }); }
  });
  await app.register(launcherReleaseRoutes);
  await app.register(staticFiles, { root: path.resolve(config.ARTIFACT_ROOT), prefix: "/artifacts/", immutable: true, maxAge: "1y" });
  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(gameRoutes, { prefix: "/v1/game" });
  await app.register(profileRoutes, { prefix: "/v1/profiles" });
  await app.register(cosmeticRoutes, { prefix: "/v1/cosmetics" });
  await app.register(controlRoutes, { prefix: "/control" });
  app.get("/health", async () => ({ ok: true, service: "rare-launcher-api" }));
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && error.name === "ZodError") return reply.code(400).send({ code: "invalid_request", error: "Request validation failed" });
    app.log.error(error);
    const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 500;
    const publicError = statusCode < 500 && error instanceof Error ? error.message : "Internal server error";
    return reply.code(statusCode).send({ code: statusCode === 429 ? "rate_limited" : "internal_error", error: publicError });
  });

  if (options.migrateDatabase !== false) await migrate();
  if (options.startPublisher !== false) startPackPublisher(app.log);
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const app = await buildApp();
  await app.listen({ host: config.HOST, port: config.PORT });
}
