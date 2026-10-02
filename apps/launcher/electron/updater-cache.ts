import { homedir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

export const UPDATER_CACHE_DIR_NAME = "rareteam-launcher-updater";

export function updaterBaseCachePath(platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()) {
  if (platform === "win32") return env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  if (platform === "darwin") return path.join(home, "Library", "Caches");
  return env.XDG_CACHE_HOME || path.join(home, ".cache");
}

export function pendingUpdatePath(baseCachePath = updaterBaseCachePath()) {
  return path.join(baseCachePath, UPDATER_CACHE_DIR_NAME, "pending");
}

export async function clearPendingUpdate(baseCachePath = updaterBaseCachePath()) {
  await rm(pendingUpdatePath(baseCachePath), { recursive: true, force: true });
}
