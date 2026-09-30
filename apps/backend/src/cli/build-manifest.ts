import { createHash, sign } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuildFile, BuildManifest } from "@rare/contracts";

async function digest(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function walk(root: string, current = root): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await walk(root, absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

const [source, output, profileId = "minecraft-1.21.1-neoforge", version = new Date().toISOString()] = process.argv.slice(2);
if (!source || !output) throw new Error("Usage: pnpm manifest <source-dir> <output-json> [profile-id] [version]");
const root = path.resolve(source);
const files: BuildFile[] = [];
for (const absolute of await walk(root)) {
  const relative = path.relative(root, absolute).replaceAll("\\", "/");
  const details = await stat(absolute);
  const sha256 = await digest(absolute);
  files.push({ path: relative, size: details.size, sha256, url: `objects/${sha256.slice(0, 2)}/${sha256}`, kind: "required", side: "client" });
}
files.sort((a, b) => a.path.localeCompare(b.path));
const unsigned = { schemaVersion: 1 as const, profileId, version, minecraftVersion: "1.21.1", loader: { type: "neoforge" as const, version: "21.1.252" }, java: { major: 21 as const, distribution: "temurin" }, generatedAt: new Date().toISOString(), files, mirrors: [] };
const canonical = JSON.stringify(unsigned);
const privateKey = process.env.MANIFEST_PRIVATE_KEY?.replaceAll("\\n", "\n");
const signature = privateKey ? sign(null, Buffer.from(canonical), privateKey).toString("base64url") : "UNSIGNED-DEVELOPMENT-MANIFEST";
const manifest: BuildManifest = { ...unsigned, signature };
await writeFile(output, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${files.length} files to ${output}`);
