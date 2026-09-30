import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { gameRoutes } from "./routes/game.js";
import { profileRoutes } from "./routes/profiles.js";
import { startPackPublisher } from "./pack-publisher.js";
import { cosmeticRoutes } from "./routes/cosmetics.js";
import path from "node:path";

const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 2 * 1024 * 1024 });
await app.register(helmet, { crossOriginResourcePolicy: { policy: "cross-origin" } });
await app.register(cors, { origin: true, credentials: false });
await app.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute",
  allowList: (request) => request.url.startsWith("/artifacts/"),
});
await app.register(jwt, { secret: config.JWT_SECRET });
await app.register(multipart, { limits: { files: 1, fileSize: 2 * 1024 * 1024 } });
app.decorate("authenticate", async (request, reply) => {
  try { await request.jwtVerify(); } catch { return reply.code(401).send({ code: "unauthorized", error: "Authentication required" }); }
});
await app.register(staticFiles, { root: path.resolve(config.ARTIFACT_ROOT), prefix: "/artifacts/", immutable: true, maxAge: "1y" });
await app.register(authRoutes, { prefix: "/v1/auth" });
await app.register(gameRoutes, { prefix: "/v1/game" });
await app.register(profileRoutes, { prefix: "/v1/profiles" });
await app.register(cosmeticRoutes, { prefix: "/v1/cosmetics" });
app.get("/health", async () => ({ ok: true, service: "rare-launcher-api" }));
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof Error && error.name === "ZodError") return reply.code(400).send({ code: "invalid_request", error: "Request validation failed" });
  app.log.error(error);
  const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
    ? (error as { statusCode: number }).statusCode
    : 500;
  const message = error instanceof Error ? error.message : "Internal server error";
  return reply.code(statusCode).send({ code: statusCode === 429 ? "rate_limited" : "internal_error", error: message });
});

await migrate();
startPackPublisher(app.log);
await app.listen({ host: config.HOST, port: config.PORT });
