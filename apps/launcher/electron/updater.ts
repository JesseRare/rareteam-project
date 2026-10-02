import type { BrowserWindow } from "electron";
import { app, ipcMain } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import electronUpdater from "electron-updater";
import { clearPendingUpdate, UPDATER_CACHE_DIR_NAME } from "./updater-cache.js";
import { downloadPortableUpdate, isNewerVersion, loadPortableUpdateMetadata, replacePortableOnExit } from "./portable-updater.js";

const { autoUpdater } = electronUpdater;

export type UpdateState =
  | { phase: "idle" | "checking" | "not-available" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string; percent: number; transferred: number; total: number }
  | { phase: "downloaded"; version: string }
  | { phase: "error"; message: string };

let state: UpdateState = { phase: "idle" };
let mainWindow: BrowserWindow | null = null;
let targetVersion: string | null = null;
let downloadedPortableFile: string | null = null;
let checkImplementation: () => Promise<void> = async () => undefined;

function publish(next: UpdateState) {
  state = next;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("update:state", next);
}

async function checkForUpdates() {
  if (!app.isPackaged || state.phase === "checking" || state.phase === "downloading" || state.phase === "downloaded") return state;
  await checkImplementation();
  return state;
}

function configurePortableUpdater(channelUrl: string) {
  checkImplementation = async () => {
    publish({ phase: "checking" });
    const metadata = await loadPortableUpdateMetadata(channelUrl);
    if (!isNewerVersion(metadata.version, app.getVersion())) {
      await clearPendingUpdate();
      targetVersion = null;
      downloadedPortableFile = null;
      publish({ phase: "not-available" });
      return;
    }
    targetVersion = metadata.version;
    publish({ phase: "available", version: metadata.version });
    await clearPendingUpdate();
    downloadedPortableFile = await downloadPortableUpdate(metadata, channelUrl, (transferred, total) => publish({
      phase: "downloading",
      version: metadata.version,
      percent: Math.min(100, Math.round(transferred / total * 100)),
      transferred,
      total,
    }));
    publish({ phase: "downloaded", version: metadata.version });
  };
}

function configureInstalledUpdater(channelUrl: string) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  const runtimeConfig = path.join(app.getPath("userData"), "app-update.yml");
  mkdirSync(path.dirname(runtimeConfig), { recursive: true });
  writeFileSync(runtimeConfig, [
    "provider: generic",
    `url: ${channelUrl}`,
    `updaterCacheDirName: ${UPDATER_CACHE_DIR_NAME}`,
    "",
  ].join("\n"), { mode: 0o600 });
  autoUpdater.updateConfigPath = runtimeConfig;
  autoUpdater.setFeedURL({ provider: "generic", url: channelUrl });
  autoUpdater.on("checking-for-update", () => publish({ phase: "checking" }));
  autoUpdater.on("update-available", (info) => {
    if (!isNewerVersion(info.version, app.getVersion())) {
      void clearPendingUpdate();
      targetVersion = null;
      publish({ phase: "not-available" });
      return;
    }
    targetVersion = info.version;
    publish({ phase: "available", version: info.version });
    void clearPendingUpdate()
      .then(() => autoUpdater.downloadUpdate())
      .catch((error: unknown) => publish({ phase: "error", message: error instanceof Error ? error.message : "Не удалось загрузить обновление" }));
  });
  autoUpdater.on("update-not-available", () => {
    targetVersion = null;
    publish({ phase: "not-available" });
  });
  autoUpdater.on("download-progress", (progress) => publish({
    phase: "downloading",
    version: targetVersion ?? "новая версия",
    percent: Math.round(progress.percent),
    transferred: progress.transferred,
    total: progress.total,
  }));
  autoUpdater.on("update-downloaded", (info) => {
    if (!isNewerVersion(info.version, app.getVersion()) || (targetVersion && info.version !== targetVersion)) {
      void clearPendingUpdate();
      targetVersion = null;
      publish({ phase: "error", message: "Получен устаревший установщик. Кэш очищен — повторите проверку." });
      return;
    }
    targetVersion = info.version;
    publish({ phase: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (error) => publish({ phase: "error", message: error.message }));
  checkImplementation = async () => { await autoUpdater.checkForUpdates(); };
}

export function configureUpdater(window: BrowserWindow) {
  mainWindow = window;
  const isPortableWindows = process.platform === "win32" && Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
  ipcMain.handle("update:get-state", () => state);
  ipcMain.handle("update:check", async () => {
    try { return await checkForUpdates(); }
    catch (error) {
      publish({ phase: "error", message: error instanceof Error ? error.message : "Не удалось проверить обновление" });
      return state;
    }
  });
  ipcMain.handle("update:install", async () => {
    if (state.phase !== "downloaded" || !isNewerVersion(state.version, app.getVersion())) {
      await clearPendingUpdate();
      targetVersion = null;
      downloadedPortableFile = null;
      publish({ phase: "not-available" });
      return;
    }
    if (isPortableWindows) {
      const portableExecutable = process.env.PORTABLE_EXECUTABLE_FILE;
      if (!downloadedPortableFile || !portableExecutable) {
        publish({ phase: "error", message: "Portable-обновление не подготовлено" });
        return;
      }
      await replacePortableOnExit(downloadedPortableFile, portableExecutable);
      app.quit();
      return;
    }
    autoUpdater.quitAndInstall(false, true);
  });

  if (!app.isPackaged) return;
  const updateBaseUrl = (process.env.RARE_LAUNCHER_UPDATE_URL ??
    "https://launcher-api.rarenetwork.ru/artifacts/launcher").replace(/\/$/, "");
  const channelUrl = `${updateBaseUrl}/${process.platform}-${process.arch}`;
  if (isPortableWindows) configurePortableUpdater(channelUrl);
  else configureInstalledUpdater(channelUrl);

  void clearPendingUpdate()
    .then(() => checkForUpdates())
    .catch((error: unknown) => publish({ phase: "error", message: error instanceof Error ? error.message : "Не удалось подготовить обновление" }));
  setInterval(() => void checkForUpdates().catch(() => undefined), 30 * 60_000);
}