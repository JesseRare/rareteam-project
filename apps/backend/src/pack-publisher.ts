import { createHash, sign } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuildFile, BuildManifest } from "@rare/contracts";
import { config } from "./config.js";
import { db } from "./db.js";
import { syncPterodactylMods } from "./mod-sync.js";
let lastSnapshot = "";

async function sha256(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function walk(current: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === ".rare-pack.json") continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await walk(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

function canonical(manifest: Omit<BuildManifest, "signature">) {
  return JSON.stringify(manifest);
}

function packVersion(entries: Array<{ relative: string; size: number; sha256: string }>, launch: BuildManifest["launch"]) {
  const versionHash = createHash("sha256");
  versionHash.update(`launch\0${JSON.stringify(launch ?? null)}\n`);
  for (const entry of entries) versionHash.update(`${entry.relative}\0${entry.size}\0${entry.sha256}\n`);
  return versionHash.digest("hex").slice(0, 16);
}

async function upsertProfile(version: string) {
  await db.query(`insert into profiles(id,title,subtitle,address,manifest_version,manifest_path,manifest_public_key)
    values($1,$2,$3,$4,$5,$6,$7)
    on conflict(id) do update set title=excluded.title,subtitle=excluded.subtitle,address=excluded.address,
      manifest_version=excluded.manifest_version,manifest_path=excluded.manifest_path,manifest_public_key=excluded.manifest_public_key,updated_at=now()`,
    [config.PACK_PROFILE_ID, config.PACK_TITLE, config.PACK_SUBTITLE, config.MINECRAFT_ADDRESS, version, `profiles/${config.PACK_PROFILE_ID}/manifest.json`, config.MANIFEST_PUBLIC_KEY!.replaceAll("\\n", "\n")]);
}

export async function publishPack() {
  if (!config.PACK_SOURCE || !config.MANIFEST_PRIVATE_KEY || !config.MANIFEST_PUBLIC_KEY) return null;
  const root = path.resolve(config.PACK_SOURCE);
  const outputRoot = path.join(config.ARTIFACT_ROOT, "profiles", config.PACK_PROFILE_ID);
  let packConfig: { launch?: BuildManifest["launch"] } = {};
  let packConfigText = "";
  try { packConfigText = await readFile(path.join(root, ".rare-pack.json"), "utf8"); packConfig = JSON.parse(packConfigText) as typeof packConfig; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const metadata: Array<{ absolute: string; relative: string; size: number; mtimeMs: number }> = [];
  for (const absolute of await walk(root)) {
    const details = await stat(absolute);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    metadata.push({ absolute, relative, size: details.size, mtimeMs: details.mtimeMs });
  }
  metadata.sort((a, b) => a.relative.localeCompare(b.relative));
  const snapshot = JSON.stringify({ packConfigText, files: metadata.map(({ relative, size, mtimeMs }) => ({ relative, size, mtimeMs })) });
  if (lastSnapshot === snapshot) return null;
  const entries: Array<{ absolute: string; relative: string; size: number; sha256: string }> = [];
  for (const item of metadata) entries.push({ ...item, sha256: await sha256(item.absolute) });
  const version = packVersion(entries, packConfig.launch);
  const manifestPath = path.join(outputRoot, "manifest.json");
  try {
    const current = JSON.parse(await readFile(manifestPath, "utf8")) as BuildManifest;
    if (current.version === version) {
      // The artifact volume can survive a database reset. Recreate the profile row
      // even when no pack files changed so a fresh database still exposes the build.
      await upsertProfile(version);
      lastSnapshot = snapshot;
      return current;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const files: BuildFile[] = [];
  for (const entry of entries) {
    const objectRelative = `objects/${entry.sha256.slice(0, 2)}/${entry.sha256}`;
    const objectPath = path.join(outputRoot, objectRelative);
    await mkdir(path.dirname(objectPath), { recursive: true });
    try { await stat(objectPath); } catch { await copyFile(entry.absolute, objectPath); }
    files.push({ path: entry.relative, size: entry.size, sha256: entry.sha256, url: objectRelative, kind: "required", side: "client" });
  }
  const unsigned: Omit<BuildManifest, "signature"> = {
    schemaVersion: 1,
    profileId: config.PACK_PROFILE_ID,
    version,
    minecraftVersion: "1.21.1",
    loader: { type: "neoforge", version: "21.1.252" },
    java: { major: 21, distribution: "temurin" },
    launch: packConfig.launch,
    generatedAt: new Date().toISOString(),
    files,
    mirrors: [],
  };
  const privateKey = config.MANIFEST_PRIVATE_KEY.replaceAll("\\n", "\n");
  const manifest: BuildManifest = { ...unsigned, signature: sign(null, Buffer.from(canonical(unsigned)), privateKey).toString("base64url") };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(`${manifestPath}.next`, JSON.stringify(manifest, null, 2));
  await rename(`${manifestPath}.next`, manifestPath);
  await upsertProfile(version);
  lastSnapshot = snapshot;
  return manifest;
}


export function startPackPublisher(log: { info(value: unknown, message?: string): void; error(value: unknown, message?: string): void }) {
  if (!config.PACK_SOURCE) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const modSync = await syncPterodactylMods();
      if (modSync.enabled && (modSync.downloaded || modSync.removed)) {
        log.info(modSync, "Minecraft mods synchronized");
      }
      const manifest = await publishPack();
      if (manifest) log.info({ version: manifest.version, files: manifest.files.length }, "Pack published");
    } catch (error) { log.error(error, "Pack publishing failed"); }
    finally { running = false; }
  };
  void run();
  setInterval(() => void run(), config.PACK_POLL_SECONDS * 1000).unref();
}
