import type { BrowserWindow } from "electron";
import { app, ipcMain } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

export type UpdateState =
  | { phase: "idle" | "checking" | "not-available" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string; percent: number; transferred: number; total: number }
  | { phase: "downloaded"; version: string }
  | { phase: "error"; message: string };

let state: UpdateState = { phase: "idle" };
let mainWindow: BrowserWindow | null = null;

function publish(next: UpdateState) {
  state = next;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("update:state", next);
}

export function configureUpdater(window: BrowserWindow) {
  mainWindow = window;
  ipcMain.handle("update:get-state", () => state);
  ipcMain.handle("update:check", async () => {
    if (!app.isPackaged) return state;
    await autoUpdater.checkForUpdates();
    return state;
  });
  ipcMain.handle("update:install", () => {
    if (state.phase === "downloaded") autoUpdater.quitAndInstall(false, true);
  });

  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  const updateBaseUrl = (process.env.RARE_LAUNCHER_UPDATE_URL ??
    "https://launcher-api.rarenetwork.ru/artifacts/launcher").replace(/\/$/, "");
  autoUpdater.setFeedURL({
    provider: "generic",
    url: `${updateBaseUrl}/${process.platform}-${process.arch}`,
  });
  autoUpdater.on("checking-for-update", () => publish({ phase: "checking" }));
  autoUpdater.on("update-available", (info) => publish({ phase: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => publish({ phase: "not-available" }));
  autoUpdater.on("download-progress", (progress) => publish({
    phase: "downloading",
    version: autoUpdater.currentVersion.version,
    percent: Math.round(progress.percent),
    transferred: progress.transferred,
    total: progress.total,
  }));
  autoUpdater.on("update-downloaded", (info) => publish({ phase: "downloaded", version: info.version }));
  autoUpdater.on("error", (error) => publish({ phase: "error", message: error.message }));

  setTimeout(() => void autoUpdater.checkForUpdates().catch(() => undefined), 5_000);
  setInterval(() => void autoUpdater.checkForUpdates().catch(() => undefined), 30 * 60_000);
}