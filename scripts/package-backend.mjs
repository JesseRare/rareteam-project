import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "apps/backend");
const output = path.join(root, "deploy/backend-package");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(source, "dist"), path.join(output, "dist"), { recursive: true });

const packageJson = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
delete packageJson.devDependencies;
delete packageJson.dependencies?.["@rare/contracts"];
packageJson.scripts = { start: "node dist/server.js" };
await writeFile(path.join(output, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

execFileSync("npm", ["install", "--package-lock-only", "--omit=dev", "--ignore-scripts"], {
  cwd: output,
  stdio: "inherit",
});
console.log(`Backend package prepared in ${path.relative(root, output)}`);
