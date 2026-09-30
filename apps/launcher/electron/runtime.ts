import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

async function findFile(root: string, name: string): Promise<string | null> {
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const absolute = path.join(root, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return absolute;
      if (entry.isDirectory()) {
        const found = await findFile(absolute, name);
        if (found) return found;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return null;
}

async function sha256(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function resolveJava21(installRoot: string) {
  if (process.platform !== "win32" && process.platform !== "darwin") throw new Error("Поддерживаются только Windows и macOS");
  const architecture = process.arch === "arm64" ? "aarch64" : "x64";
  const platform = process.platform === "win32" ? "windows" : "mac";
  const runtimeRoot = path.join(installRoot, ".runtime", `${platform}-${architecture}`);
  const executableName = process.platform === "win32" ? "javaw.exe" : "java";
  const existing = await findFile(runtimeRoot, executableName);
  if (existing) return existing;

  const api = `https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=${architecture}&image_type=jre&os=${platform}&vendor=eclipse`;
  const metadataResponse = await fetch(api, { headers: { accept: "application/json" } });
  if (!metadataResponse.ok) throw new Error(`Не удалось получить Java 21: HTTP ${metadataResponse.status}`);
  const assets = await metadataResponse.json() as Array<{ binary?: { package?: { link?: string; checksum?: string } } }>;
  const pkg = assets[0]?.binary?.package;
  if (!pkg?.link || !pkg.checksum) throw new Error("Adoptium не вернул подходящую Java 21");

  await mkdir(path.dirname(runtimeRoot), { recursive: true });
  const archive = `${runtimeRoot}.${process.platform === "win32" ? "zip" : "tar.gz"}`;
  const response = await fetch(pkg.link);
  if (!response.ok || !response.body) throw new Error(`Не удалось скачать Java 21: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(archive));
  if ((await sha256(archive)).toLowerCase() !== pkg.checksum.toLowerCase()) {
    await rm(archive, { force: true });
    throw new Error("Контрольная сумма Java 21 не совпала");
  }

  const temporary = `${runtimeRoot}.extracting`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  try {
    if (process.platform === "win32") {
      await run("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $env:RARE_RUNTIME_ARCHIVE -DestinationPath $env:RARE_RUNTIME_DEST -Force",
      ], { env: { ...process.env, RARE_RUNTIME_ARCHIVE: archive, RARE_RUNTIME_DEST: temporary } });
    } else {
      await run("tar", ["-xzf", archive, "-C", temporary]);
    }
    if (!(await stat(temporary)).isDirectory()) throw new Error("Java runtime extraction directory was not created");
    await rm(runtimeRoot, { recursive: true, force: true });
    await rename(temporary, runtimeRoot);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  await rm(archive, { force: true });
  const installed = await findFile(runtimeRoot, executableName);
  if (!installed || !(await stat(installed)).isFile()) throw new Error("Java 21 распакована, но исполняемый файл не найден");
  if (process.platform !== "win32") await chmod(installed, 0o755);
  return installed;
}
