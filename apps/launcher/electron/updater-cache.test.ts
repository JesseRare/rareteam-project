import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearPendingUpdate, pendingUpdatePath, updaterBaseCachePath, UPDATER_CACHE_DIR_NAME } from "./updater-cache.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("updater cache", () => {
  it("uses the same Windows cache root as electron-updater", () => {
    expect(updaterBaseCachePath("win32", { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" }, "C:\\Users\\test")).toBe("C:\\Users\\test\\AppData\\Local");
    expect(pendingUpdatePath("cache-root")).toBe(path.join("cache-root", UPDATER_CACHE_DIR_NAME, "pending"));
  });

  it("removes stale pending installers without deleting reusable cache data", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rareteam-updater-")); roots.push(root);
    const cache = path.join(root, UPDATER_CACHE_DIR_NAME); const pending = path.join(cache, "pending");
    await mkdir(pending, { recursive: true });
    await writeFile(path.join(pending, "old-setup.exe"), "old installer");
    await writeFile(path.join(cache, "current.blockmap"), "keep");
    await clearPendingUpdate(root);
    await expect(readFile(path.join(pending, "old-setup.exe"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(cache, "current.blockmap"), "utf8")).resolves.toBe("keep");
  });
});
