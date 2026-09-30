import { createHash, verify } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { BuildFile, BuildManifest } from "@rare/contracts";

const DOWNLOAD_CONCURRENCY = 4;
const DOWNLOAD_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export interface SyncPlanItem extends BuildFile {
  reason: "missing" | "size" | "hash";
}

export interface SyncProgress {
  phase: "checking" | "downloading" | "cleaning" | "done";
  completedBytes: number;
  totalBytes: number;
  completedFiles: number;
  totalFiles: number;
  currentPath?: string;
}

export interface SyncResult {
  downloadedFiles: number;
  downloadedBytes: number;
  removedFiles: number;
  version: string;
}

interface InstalledState {
  schemaVersion: 1;
  profileId: string;
  version: string;
  managedFiles: string[];
}

async function sha256(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function isSafeRelativePath(value: string) {
  if (!value || path.isAbsolute(value) || value.includes("\0")) return false;
  const parts = value.split(/[\\/]/);
  return !parts.includes("..") && !parts.includes("");
}

function assertManifest(value: unknown): asserts value is BuildManifest {
  const manifest = value as Partial<BuildManifest> | null;
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error("Unsupported manifest");
  for (const file of manifest.files) {
    if (!file || !isSafeRelativePath(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error(`Invalid manifest file: ${file?.path ?? "unknown"}`);
    }
  }
}

export function unsignedManifest(manifest: BuildManifest) {
  const { signature: _signature, ...unsigned } = manifest;
  return JSON.stringify(unsigned);
}

export function verifyManifest(manifestValue: unknown, publicKeyPem: string) {
  assertManifest(manifestValue);
  if (!publicKeyPem.trim()) throw new Error("Manifest public key is not configured");
  const valid = verify(null, Buffer.from(unsignedManifest(manifestValue)), publicKeyPem, Buffer.from(manifestValue.signature, "base64url"));
  if (!valid) throw new Error("Manifest signature is invalid");
  return manifestValue;
}

export async function planSync(installRoot: string, manifestValue: unknown): Promise<SyncPlanItem[]> {
  assertManifest(manifestValue);
  const plan: SyncPlanItem[] = [];
  for (const file of manifestValue.files) {
    if (file.side === "server" || file.kind === "optional") continue;
    const target = path.join(installRoot, file.path);
    try {
      const current = await stat(target);
      if (current.size !== file.size) plan.push({ ...file, reason: "size" });
      else if ((await sha256(target)) !== file.sha256) plan.push({ ...file, reason: "hash" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") plan.push({ ...file, reason: "missing" });
      else throw error;
    }
  }
  return plan;
}

async function fetchManifest(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
  return response.json();
}

function retryDelay(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.min(750 * 2 ** attempt, 5_000)));
}

async function downloadFileOnce(file: BuildFile, manifestUrl: string, target: string, onBytes: (count: number) => void) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.part`;
  let offset = 0;
  let temporaryExists = false;
  try {
    offset = (await stat(temporary)).size;
    temporaryExists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (offset > file.size) { await rm(temporary, { force: true }); offset = 0; }
  if (temporaryExists && offset === file.size && (await sha256(temporary)) === file.sha256) {
    await rm(target, { force: true });
    await rename(temporary, target);
    onBytes(offset);
    return;
  }
  if (temporaryExists && offset === file.size) {
    await rm(temporary, { force: true });
    offset = 0;
  }
  const headers: Record<string, string> = {};
  if (offset > 0) headers.range = `bytes=${offset}-`;
  let response = await fetch(new URL(file.url, manifestUrl), {
    headers,
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (offset > 0 && response.status !== 206) {
    await response.body?.cancel();
    await rm(temporary, { force: true });
    offset = 0;
    response = await fetch(new URL(file.url, manifestUrl), { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  }
  if (!response.ok || !response.body) throw new Error(`Download failed for ${file.path}: ${response.status}`);
  if (offset) onBytes(offset);
  const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) { onBytes(chunk.length); callback(null, chunk); } });
  await pipeline(Readable.fromWeb(response.body as never), counter, createWriteStream(temporary, { flags: offset ? "a" : "w" }));
  const received = (await stat(temporary)).size;
  if (received !== file.size || (await sha256(temporary)) !== file.sha256) {
    await rm(temporary, { force: true });
    throw new Error(`Integrity check failed for ${file.path}`);
  }
  await rm(target, { force: true });
  await rename(temporary, target);
}

async function downloadFile(file: BuildFile, manifestUrl: string, target: string, onBytes: (count: number) => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt += 1) {
    let attemptBytes = 0;
    try {
      await downloadFileOnce(file, manifestUrl, target, (count) => {
        attemptBytes += count;
        onBytes(count);
      });
      return;
    } catch (error) {
      lastError = error;
      if (attemptBytes) onBytes(-attemptBytes);
      if (attempt + 1 < DOWNLOAD_ATTEMPTS) await retryDelay(attempt);
    }
  }
  throw lastError;
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => consume()));
}

async function readState(stateFile: string): Promise<InstalledState | null> {
  try { return JSON.parse(await readFile(stateFile, "utf8")) as InstalledState; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function synchronize(installRoot: string, manifestUrl: string, publicKeyPem: string, onProgress: (progress: SyncProgress) => void = () => undefined): Promise<SyncResult> {
  const manifest = verifyManifest(await fetchManifest(manifestUrl), publicKeyPem);
  await mkdir(installRoot, { recursive: true });
  onProgress({ phase: "checking", completedBytes: 0, totalBytes: 0, completedFiles: 0, totalFiles: manifest.files.length });
  const plan = await planSync(installRoot, manifest);
  const totalBytes = plan.reduce((sum, file) => sum + file.size, 0);
  let completedBytes = 0;
  let completedFiles = 0;
  await runWithConcurrency(plan, DOWNLOAD_CONCURRENCY, async (file) => {
    onProgress({ phase: "downloading", completedBytes, totalBytes, completedFiles, totalFiles: plan.length, currentPath: file.path });
    await downloadFile(file, manifestUrl, path.join(installRoot, file.path), (count) => {
      completedBytes += count;
      onProgress({ phase: "downloading", completedBytes, totalBytes, completedFiles, totalFiles: plan.length, currentPath: file.path });
    });
    completedFiles += 1;
  });
  const stateFile = path.join(installRoot, ".rare-launcher-state.json");
  const previous = await readState(stateFile);
  const managedFiles = manifest.files.filter((file) => file.side !== "server" && file.kind !== "optional").map((file) => file.path);
  const currentSet = new Set(managedFiles);
  let removedFiles = 0;
  onProgress({ phase: "cleaning", completedBytes, totalBytes, completedFiles, totalFiles: plan.length });
  for (const oldPath of previous?.managedFiles ?? []) {
    if (!currentSet.has(oldPath) && isSafeRelativePath(oldPath)) {
      await rm(path.join(installRoot, oldPath), { force: true });
      removedFiles += 1;
    }
  }
  const state: InstalledState = { schemaVersion: 1, profileId: manifest.profileId, version: manifest.version, managedFiles };
  await writeFile(stateFile, JSON.stringify(state, null, 2));
  await writeFile(path.join(installRoot, ".rare-manifest.json"), JSON.stringify(manifest, null, 2));
  onProgress({ phase: "done", completedBytes, totalBytes, completedFiles, totalFiles: plan.length });
  return { downloadedFiles: plan.length, downloadedBytes: completedBytes, removedFiles, version: manifest.version };
}
