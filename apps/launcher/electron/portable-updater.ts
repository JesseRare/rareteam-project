import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pendingUpdatePath } from "./updater-cache.js";

export interface PortableUpdateMetadata {
  version: string;
  url: string;
  sha512: string;
  size: number;
}

const versionPattern = /^\d+\.\d+\.\d+$/;
const portableNamePattern = /^rareteam-[A-Za-z0-9._-]+-Windows-Portable-x64\.exe$/;

export function parsePortableUpdateMetadata(value: unknown): PortableUpdateMetadata {
  if (!value || typeof value !== "object") throw new Error("Некорректные metadata portable-обновления");
  const item = value as Record<string, unknown>;
  if (typeof item.version !== "string" || !versionPattern.test(item.version)) throw new Error("Некорректная версия portable-обновления");
  if (typeof item.url !== "string" || !portableNamePattern.test(item.url)) throw new Error("Некорректное имя portable-обновления");
  if (item.url !== `rareteam-${item.version}-Windows-Portable-x64.exe`) throw new Error("Версия и имя portable-обновления не совпадают");
  if (typeof item.sha512 !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(item.sha512)) throw new Error("Некорректная SHA-512 portable-обновления");
  if (typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size <= 0) throw new Error("Некорректный размер portable-обновления");
  return { version: item.version, url: item.url, sha512: item.sha512, size: item.size };
}

export function isNewerVersion(candidate: string, current: string) {
  const next = candidate.split(".").map(Number);
  const installed = current.split(".").map(Number);
  if (next.length !== 3 || installed.length !== 3 || [...next, ...installed].some((part) => !Number.isSafeInteger(part) || part < 0)) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

export async function loadPortableUpdateMetadata(channelUrl: string) {
  const response = await fetch(`${channelUrl}/latest-portable.json`, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Не удалось проверить portable-обновление: HTTP ${response.status}`);
  return parsePortableUpdateMetadata(await response.json());
}

export async function downloadPortableUpdate(
  metadata: PortableUpdateMetadata,
  channelUrl: string,
  onProgress: (transferred: number, total: number) => void,
) {
  const response = await fetch(`${channelUrl}/${encodeURIComponent(metadata.url)}`, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!response.ok || !response.body) throw new Error(`Не удалось скачать portable-обновление: HTTP ${response.status}`);
  const pending = pendingUpdatePath();
  await mkdir(pending, { recursive: true });
  const finalPath = path.join(pending, metadata.url);
  const temporaryPath = `${finalPath}.part`;
  const hash = createHash("sha512");
  let transferred = 0;
  const progress = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      transferred += chunk.length;
      hash.update(chunk);
      onProgress(transferred, metadata.size);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body as never), progress, createWriteStream(temporaryPath, { mode: 0o700 }));
  const size = (await stat(temporaryPath)).size;
  const sha512 = hash.digest("base64");
  if (size !== metadata.size || sha512 !== metadata.sha512) throw new Error("Portable-обновление повреждено: размер или SHA-512 не совпадает");
  await rename(temporaryPath, finalPath);
  return finalPath;
}

const replaceScript = String.raw`$ErrorActionPreference = "Stop"
$parentId = [int]$env:RARETEAM_UPDATE_PARENT_PID
$source = $env:RARETEAM_UPDATE_SOURCE
$target = $env:PORTABLE_EXECUTABLE_FILE
try { Wait-Process -Id $parentId -Timeout 90 -ErrorAction SilentlyContinue } catch {}
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $staged = "$target.new"
    Copy-Item -LiteralPath $source -Destination $staged -Force
    Remove-Item -LiteralPath $target -Force
    Move-Item -LiteralPath $staged -Destination $target -Force
    Start-Process -FilePath $target
    exit 0
  } catch {
    Start-Sleep -Seconds 1
  }
}
exit 1
`;

export async function replacePortableOnExit(downloadedFile: string, portableExecutable: string) {
  const scriptPath = path.join(path.dirname(downloadedFile), "replace-portable.ps1");
  await writeFile(scriptPath, replaceScript, { mode: 0o600 });
  const child = spawn("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath,
  ], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PORTABLE_EXECUTABLE_FILE: portableExecutable,
      RARETEAM_UPDATE_SOURCE: downloadedFile,
      RARETEAM_UPDATE_PARENT_PID: String(process.pid),
    },
  });
  child.unref();
}