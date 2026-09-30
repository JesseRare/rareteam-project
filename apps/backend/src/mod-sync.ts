import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "./config.js";

interface RemoteFile {
  name: string;
  size: number;
  is_file: boolean;
  modified_at: string;
}

interface SyncState {
  files: Record<string, { size: number; modifiedAt: string }>;
}

function enabled() {
  return Boolean(config.PTERODACTYL_URL && config.PTERODACTYL_API_KEY && config.PTERODACTYL_SERVER_ID);
}

function headers() {
  return {
    accept: "application/json",
    authorization: `Bearer ${config.PTERODACTYL_API_KEY}`,
  };
}

async function apiJson<T>(pathname: string): Promise<T> {
  const response = await fetch(new URL(pathname, config.PTERODACTYL_URL), {
    headers: headers(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Pterodactyl API ${response.status}: ${pathname}`);
  return response.json() as Promise<T>;
}

function safeJarName(name: string) {
  return /^[^/\\\0]+\.jar$/i.test(name) && name !== "." && name !== "..";
}

async function existingSize(file: string) {
  try { return (await stat(file)).size; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function loadState(file: string): Promise<SyncState> {
  try { return JSON.parse(await readFile(file, "utf8")) as SyncState; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { files: {} };
    throw error;
  }
}

async function download(remotePath: string, target: string, expectedSize: number) {
  const query = new URLSearchParams({ file: remotePath });
  const result = await apiJson<{ attributes: { url: string } }>(
    `/api/client/servers/${config.PTERODACTYL_SERVER_ID}/files/download?${query}`,
  );
  const response = await fetch(result.attributes.url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!response.ok || !response.body) throw new Error(`Pterodactyl file download failed: HTTP ${response.status}`);
  const temporary = `${target}.part`;
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporary));
  if (await existingSize(temporary) !== expectedSize) {
    await rm(temporary, { force: true });
    throw new Error(`Pterodactyl file size mismatch: ${path.basename(target)}`);
  }
  await rm(target, { force: true });
  await rename(temporary, target);
}

export async function syncPterodactylMods() {
  if (!enabled() || !config.PACK_SOURCE) return { enabled: false, downloaded: 0, removed: 0 };
  const directory = config.PTERODACTYL_MODS_DIRECTORY.startsWith("/")
    ? config.PTERODACTYL_MODS_DIRECTORY
    : `/${config.PTERODACTYL_MODS_DIRECTORY}`;
  const query = new URLSearchParams({ directory });
  const listing = await apiJson<{ data: Array<{ attributes: RemoteFile }> }>(
    `/api/client/servers/${config.PTERODACTYL_SERVER_ID}/files/list?${query}`,
  );
  const remote = listing.data.map((item) => item.attributes)
    .filter((file) => file.is_file && safeJarName(file.name));
  const modsRoot = path.resolve(config.PACK_SOURCE, "mods");
  const stateFile = path.resolve(config.ARTIFACT_ROOT, ".pterodactyl-mod-sync.json");
  const previous = await loadState(stateFile);
  await mkdir(modsRoot, { recursive: true });
  await mkdir(path.dirname(stateFile), { recursive: true });
  const next: SyncState = { files: {} };
  let downloaded = 0;
  for (const file of remote) {
    next.files[file.name] = { size: file.size, modifiedAt: file.modified_at };
    const target = path.join(modsRoot, file.name);
    const before = previous.files[file.name];
    if (before?.size === file.size && before.modifiedAt === file.modified_at && await existingSize(target) === file.size) continue;
    await download(`${directory}/${file.name}`, target, file.size);
    downloaded += 1;
  }
  const remoteNames = new Set(remote.map((file) => file.name));
  let removed = 0;
  for (const name of Object.keys(previous.files)) {
    if (!remoteNames.has(name) && safeJarName(name)) {
      await rm(path.join(modsRoot, name), { force: true });
      removed += 1;
    }
  }
  await writeFile(stateFile, JSON.stringify(next, null, 2));
  return { enabled: true, downloaded, removed };
}