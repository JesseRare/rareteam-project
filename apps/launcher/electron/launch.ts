import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { BuildManifest } from "@rare/contracts";
import { verifyManifest } from "./sync.js";
import { resolveJava21 } from "./runtime.js";

export interface LaunchIdentity {
  username: string;
  uuid: string;
  ticket: string;
  serverAddress: string;
}

function safeRelative(value: string) {
  return value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]/).includes("..");
}

export function isNeoForgeInstallerOutput(entry: string) {
  const normalized = `/${entry.replaceAll("\\", "/")}`;
  return /\/net\/minecraft\/client\/[^/]+\/client-[^/]+-(?:extra|srg)\.jar$/i.test(normalized)
    || /\/net\/neoforged\/neoforge\/[^/]+\/neoforge-[^/]+-client\.jar$/i.test(normalized);
}

export function withQuickPlayMultiplayer(gameArgs: string[], serverAddress: string) {
  const result: string[] = [];
  for (let index = 0; index < gameArgs.length; index += 1) {
    const argument = gameArgs[index];
    if (argument === "--server" || argument === "--port" || argument === "--quickPlayMultiplayer") {
      index += 1;
      continue;
    }
    result.push(argument);
  }
  return [...result, "--quickPlayMultiplayer", serverAddress];
}

function expand(value: string, identity: LaunchIdentity, installRoot: string, versionName: string, resolvedClasspath: string) {
  const separator = identity.serverAddress.lastIndexOf(":");
  const hasPort = separator > -1 && /^\d+$/.test(identity.serverAddress.slice(separator + 1));
  const serverHost = hasPort ? identity.serverAddress.slice(0, separator) : identity.serverAddress;
  const serverPort = hasPort ? identity.serverAddress.slice(separator + 1) : "25565";
  return value.replaceAll("${game_directory}", installRoot)
    .replaceAll("${assets_root}", path.join(installRoot, "assets"))
    .replaceAll("${natives_directory}", path.join(installRoot, "natives", process.platform))
    .replaceAll("${library_directory}", path.join(installRoot, "libraries"))
    .replaceAll("${classpath_separator}", path.delimiter)
    .replaceAll("${classpath}", resolvedClasspath)
    .replaceAll("${auth_player_name}", identity.username)
    .replaceAll("${auth_uuid}", identity.uuid)
    .replaceAll("${auth_access_token}", identity.ticket)
    .replaceAll("${version_name}", versionName)
    .replaceAll("${assets_index_name}", "17")
    .replaceAll("${launcher_name}", "rareteam")
    .replaceAll("${launcher_version}", "0.1.4")
    .replaceAll("${user_type}", "mojang")
    .replaceAll("${version_type}", "rareteam")
    .replaceAll("${clientid}", "")
    .replaceAll("${auth_xuid}", "")
    .replaceAll("${server_host}", serverHost)
    .replaceAll("${server_port}", serverPort)
    .replaceAll("${server_address}", identity.serverAddress);
}

export async function launchMinecraft(installRoot: string, publicKeyPem: string, identity: LaunchIdentity, memoryMb = 4096) {
  const manifest = verifyManifest(JSON.parse(await readFile(path.join(installRoot, ".rare-manifest.json"), "utf8")), publicKeyPem) as BuildManifest;
  const launch = manifest.launch;
  if (!launch) throw new Error("This build has no launch configuration");
  // NeoForge locates and combines these installer outputs itself through
  // libraryDirectory. Passing them directly through -cp creates overlapping
  // Java modules named minecraft/client and fails ModuleLayer resolution.
  const classpath = launch.classpath.filter((entry) => !isNeoForgeInstallerOutput(entry));
  if (!launch.mainClass || classpath.some((entry) => !safeRelative(entry) || entry.startsWith("-") || entry.startsWith("--") || !entry.toLowerCase().endsWith(".jar"))) {
    throw new Error("Invalid launch configuration: classpath must contain only relative .jar files");
  }
  let java: string;
  if (launch.javaPath) {
    if (!safeRelative(launch.javaPath)) throw new Error("Unsafe Java path");
    java = path.join(installRoot, launch.javaPath);
  } else {
    java = await resolveJava21(installRoot);
  }
  const resolvedClasspathEntries = classpath.map((entry) => path.resolve(installRoot, entry));
  const resolvedClasspath = resolvedClasspathEntries.join(path.delimiter);
  const versionName = manifest.minecraftVersion;
  const expandedJvmArgs = launch.jvmArgs
    .filter((arg) => !/^-Xm[xs]/i.test(arg))
    .map((arg) => expand(arg, identity, installRoot, versionName, resolvedClasspath));
  const expandedGameArgs = withQuickPlayMultiplayer(
    launch.gameArgs.map((arg) => expand(arg, identity, installRoot, versionName, resolvedClasspath)),
    identity.serverAddress,
  );
  const platformJvmArgs = process.platform === "darwin" ? ["-XstartOnFirstThread"] : [];
  const args = [`-Xms512M`, `-Xmx${memoryMb}M`, ...platformJvmArgs, ...expandedJvmArgs, "-cp", resolvedClasspath, launch.mainClass, ...expandedGameArgs];
  const logDir = path.join(installRoot, "logs");
  await mkdir(logDir, { recursive: true });
  const log = createWriteStream(path.join(logDir, "latest-launcher.log"), { flags: "w" });
  const modulePathArgs = expandedJvmArgs.filter((arg, index) => arg === "-p" || arg === "--module-path" || expandedJvmArgs[index - 1] === "-p" || expandedJvmArgs[index - 1] === "--module-path");
  log.write(`Java: ${java}\nJVM args: ${JSON.stringify(expandedJvmArgs)}\n-cp: ${resolvedClasspath}\nmodule-path: ${JSON.stringify(modulePathArgs)}\nMain class: ${launch.mainClass}\nClasspath entries: ${resolvedClasspathEntries.length}\nMinecraft client jar present: ${resolvedClasspathEntries.some((entry) => entry.endsWith(path.join("versions", "1.21.1", "1.21.1.jar")))}\n`);
  const child = spawn(java, args, {
    cwd: installRoot,
    windowsHide: true,
    env: { ...process.env, RARE_GAME_TICKET: identity.ticket, RARE_SERVER_ADDRESS: identity.serverAddress },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.once("close", () => log.end());
  return { pid: child.pid };
}
