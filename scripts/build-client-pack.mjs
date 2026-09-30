import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const projectRoot = path.resolve(import.meta.dirname, "..");
const stage = path.resolve(process.argv[2] ?? path.join(projectRoot, ".staging-client"));
const output = path.resolve(process.argv[3] ?? path.join(projectRoot, "client-pack"));
const next = `${output}.next`;
const base = JSON.parse(await readFile(path.join(stage, "versions", "1.21.1", "1.21.1.json"), "utf8"));
const neo = JSON.parse(await readFile(path.join(stage, "versions", "neoforge-21.1.252", "neoforge-21.1.252.json"), "utf8"));

function ruleMatches(rule, os) {
  if (rule.features) return false;
  if (!rule.os) return true;
  if (rule.os.name && rule.os.name !== os) return false;
  if (rule.os.arch && rule.os.arch !== "x64") return false;
  return true;
}

function allowed(rules, os) {
  if (!rules?.length) return true;
  let result = false;
  for (const rule of rules) if (ruleMatches(rule, os)) result = rule.action === "allow";
  return result;
}

async function digest(file, algorithm) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function valid(file, expected, algorithm = "sha1") {
  try { return (await stat(file)).isFile() && (!expected || await digest(file, algorithm) === expected); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function download(url, target, expected, algorithm = "sha1") {
  if (await valid(target, expected, algorithm)) return;
  await mkdir(path.dirname(target), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${url}`);
  const temporary = `${target}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  if (!(await valid(temporary, expected, algorithm))) throw new Error(`Checksum mismatch: ${url}`);
  await rm(target, { force: true });
  await rename(temporary, target);
}

async function parallel(items, worker, concurrency = 12) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  }));
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await files(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

await rm(next, { recursive: true, force: true });
await mkdir(next, { recursive: true });

const libraries = [...base.libraries, ...neo.libraries];
const selected = new Map();
for (const library of libraries) {
  if (!allowed(library.rules, "windows") && !allowed(library.rules, "osx")) continue;
  const artifact = library.downloads?.artifact;
  if (artifact?.path && artifact.url) selected.set(artifact.path, { ...artifact, name: library.name, rules: library.rules });
}
await parallel([...selected.values()], async (artifact) => {
  await download(artifact.url, path.join(stage, "libraries", artifact.path), artifact.sha1);
});

for (const relative of selected.keys()) {
  await cp(path.join(stage, "libraries", relative), path.join(next, "libraries", relative), { recursive: true });
}
await cp(path.join(stage, "libraries", "net", "neoforged", "neoforge", "21.1.252"), path.join(next, "libraries", "net", "neoforged", "neoforge", "21.1.252"), { recursive: true });
const installerOutputs = [
  "libraries/net/minecraft/client/1.21.1-20240808.144430/client-1.21.1-20240808.144430-extra.jar",
  "libraries/net/minecraft/client/1.21.1-20240808.144430/client-1.21.1-20240808.144430-srg.jar",
  "libraries/net/neoforged/neoforge/21.1.252/neoforge-21.1.252-client.jar",
];
for (const relative of installerOutputs) {
  const source = path.join(stage, relative);
  try { if (!(await stat(source)).isFile()) throw new Error(); }
  catch { throw new Error(`Missing NeoForge installer output: ${relative}`); }
  await cp(source, path.join(next, relative), { recursive: true });
}

const assetIndexTarget = path.join(next, "assets", "indexes", `${base.assetIndex.id}.json`);
await download(base.assetIndex.url, assetIndexTarget, base.assetIndex.sha1);
const assetIndex = JSON.parse(await readFile(assetIndexTarget, "utf8"));
const objects = [...new Map(Object.values(assetIndex.objects).map((item) => [item.hash, item])).values()];
let completed = 0;
await parallel(objects, async (item) => {
  const relative = path.join(item.hash.slice(0, 2), item.hash);
  await download(`https://resources.download.minecraft.net/${item.hash.slice(0, 2)}/${item.hash}`, path.join(next, "assets", "objects", relative), item.hash);
  completed += 1;
  if (completed % 100 === 0) console.log(`Assets: ${completed}/${objects.length}`);
}, 16);

for (const [platform, osName, nativePattern] of [["win32", "windows", /:natives-windows$/], ["darwin", "osx", /:natives-macos(?:-arm64|-patch)?$/]]) {
  const nativeRoot = path.join(next, "natives", platform);
  await mkdir(nativeRoot, { recursive: true });
  for (const artifact of selected.values()) {
    if (!nativePattern.test(artifact.name) || !allowed(artifact.rules, osName)) continue;
    const temporary = path.join(next, ".native-extract");
    await rm(temporary, { recursive: true, force: true });
    await mkdir(temporary, { recursive: true });
    await run("tar", ["-xf", path.join(stage, "libraries", artifact.path), "-C", temporary]);
    for (const file of await files(temporary)) {
      if (/\.(dll|dylib|jnilib)$/i.test(file)) await cp(file, path.join(nativeRoot, path.basename(file)));
    }
  }
}
await rm(path.join(next, ".native-extract"), { recursive: true, force: true });

const classpath = [...selected.entries()]
  .filter(([, artifact]) => !artifact.name.includes(":natives-"))
  .map(([relative]) => `libraries/${relative.replaceAll("\\", "/")}`);
for (const required of installerOutputs.slice(0, 2)) {
  if (!classpath.includes(required)) classpath.push(required);
}

const baseJvm = base.arguments.jvm.filter((value) => typeof value === "string").filter((value, index, all) => value !== "-cp" && all[index - 1] !== "-cp" && value !== "${classpath}");
const gameArgs = [...base.arguments.game.filter((value) => typeof value === "string"), ...neo.arguments.game.filter((value) => typeof value === "string"), "--server", "${server_host}", "--port", "${server_port}"];
if (classpath.some((value) => value.startsWith("-") || value.startsWith("--") || !value.toLowerCase().endsWith(".jar"))) {
  throw new Error("Invalid launch.classpath: every entry must be a relative .jar path");
}
const packConfig = { launch: { mainClass: neo.mainClass, classpath, jvmArgs: [...baseJvm, ...neo.arguments.jvm], gameArgs } };
await writeFile(path.join(next, ".rare-pack.json"), JSON.stringify(packConfig, null, 2));
await mkdir(path.join(next, "mods"), { recursive: true });
await writeFile(path.join(next, "mods", ".keep"), "");
await rm(output, { recursive: true, force: true });
await rename(next, output);
console.log(`Client pack ready: ${output}`);
