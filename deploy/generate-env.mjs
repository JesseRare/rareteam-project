import { generateKeyPairSync, randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, ".env");
try { await access(target); throw new Error("deploy/.env already exists; remove it explicitly before generating new secrets"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const [
  publicUrl = "https://launcher-api.rarenetwork.ru",
  minecraftAddress = "play.rarenetwork.ru:25565",
  packSourceHost = "/var/lib/pterodactyl/volumes/REPLACE/client-pack",
  databaseUrl,
] = process.argv.slice(2);
if (!databaseUrl) {
  throw new Error("Usage: node deploy/generate-env.mjs <public-url> <minecraft-address> <pack-source-host> <postgresql-url>");
}
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const line = (value) => value.trim().replaceAll("\n", "\\n");
const env = [
  "HOST=0.0.0.0",
  "PORT=8080",
  `PUBLIC_URL=${publicUrl}`,
  `DATABASE_URL=${databaseUrl}`,
  `MINECRAFT_ADDRESS=${minecraftAddress}`,
  "MINECRAFT_STATUS_ADDRESS=192.168.1.118:25565",
  `PACK_SOURCE_HOST=${packSourceHost}`,
  "PACK_SOURCE=./client-pack",
  "ARTIFACT_ROOT=./data/artifacts",
  "PACK_POLL_SECONDS=30",
  "PACK_PROFILE_ID=melchior-1",
  "PACK_TITLE=Мельхиор-1",
  "PACK_SUBTITLE=Minecraft 1.21.1 · NeoForge 21.1.252",
  `JWT_SECRET=${randomBytes(48).toString("base64url")}`,
  `GAME_SERVER_KEY=${randomBytes(48).toString("base64url")}`,
  `MANIFEST_PRIVATE_KEY=${line(privateKey.export({ type: "pkcs8", format: "pem" }).toString())}`,
  `MANIFEST_PUBLIC_KEY=${line(publicKey.export({ type: "spki", format: "pem" }).toString())}`,
  "",
].join("\n");
await writeFile(target, env, { mode: 0o600, flag: "wx" });
console.log("Created deploy/.env with fresh secrets and Ed25519 keys");
