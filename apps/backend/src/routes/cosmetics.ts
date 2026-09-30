import type { FastifyPluginAsync } from "fastify";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { db } from "../db.js";

function pngDimensions(buffer: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") throw new Error("invalid_png");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export const cosmeticRoutes: FastifyPluginAsync = async (app) => {
  app.post("/skin", { onRequest: [app.authenticate] }, async (request, reply) => {
    const upload = await request.file();
    if (!upload || upload.mimetype !== "image/png") return reply.code(400).send({ code: "invalid_skin", error: "PNG skin is required" });
    const data = await upload.toBuffer();
    let size: { width: number; height: number };
    try { size = pngDimensions(data); } catch { return reply.code(400).send({ code: "invalid_skin", error: "Invalid PNG file" }); }
    if (size.width !== 64 || ![32, 64].includes(size.height)) return reply.code(400).send({ code: "invalid_skin_size", error: "Skin must be 64x64 or legacy 64x32" });
    const key = `cosmetics/skins/${request.user.sub}.png?v=${Date.now()}`;
    const diskPath = path.join(config.ARTIFACT_ROOT, key.split("?")[0]);
    await mkdir(path.dirname(diskPath), { recursive: true });
    await writeFile(diskPath, data, { mode: 0o600 });
    await db.query("update users set skin_key=$1 where id=$2", [key, request.user.sub]);
    await db.query("insert into audit_log(actor_id,action,target) values($1,'skin.updated',$2)", [request.user.sub, request.user.sub]);
    return { skinUrl: `${config.PUBLIC_URL}/artifacts/${key}` };
  });

  app.post("/cape", { onRequest: [app.authenticate] }, async (request, reply) => {
    const upload = await request.file();
    if (!upload || upload.mimetype !== "image/png") return reply.code(400).send({ code: "invalid_cape", error: "Нужен PNG-плащ" });
    const data = await upload.toBuffer();
    let size: { width: number; height: number };
    try { size = pngDimensions(data); } catch { return reply.code(400).send({ code: "invalid_cape", error: "Повреждённый PNG" }); }
    if (![[64, 32], [22, 17]].some(([width, height]) => size.width === width && size.height === height)) {
      return reply.code(400).send({ code: "invalid_cape_size", error: "Плащ должен быть 64x32 или 22x17" });
    }
    const key = `cosmetics/capes/${request.user.sub}.png?v=${Date.now()}`;
    const diskPath = path.join(config.ARTIFACT_ROOT, key.split("?")[0]);
    await mkdir(path.dirname(diskPath), { recursive: true });
    await writeFile(diskPath, data, { mode: 0o600 });
    await db.query("update users set cape_key=$1 where id=$2", [key, request.user.sub]);
    await db.query("insert into audit_log(actor_id,action,target) values($1,'cape.updated',$2)", [request.user.sub, request.user.sub]);
    return { capeUrl: `${config.PUBLIC_URL}/artifacts/${key}` };
  });

  app.patch("/skin-model", { onRequest: [app.authenticate] }, async (request, reply) => {
    const model = (request.body as { model?: string })?.model;
    if (model !== "classic" && model !== "slim") return reply.code(400).send({ code: "invalid_skin_model", error: "Модель скина должна быть classic или slim" });
    await db.query("update users set skin_model=$1 where id=$2", [model, request.user.sub]);
    return { skinModel: model };
  });
};
