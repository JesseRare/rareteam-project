import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import Store from "electron-store";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { synchronize } from "./sync.js";
import { launchMinecraft } from "./launch.js";
import { configureUpdater } from "./updater.js";

const here = path.dirname(fileURLToPath(import.meta.url));
type LauncherSettings = { memoryMb: number; gameRoot: string };
const settings = new Store<LauncherSettings>({ defaults: { memoryMb: 4096, gameRoot: "" } });

function installRoot(profileId: string) {
  const configured = settings.get("gameRoot").trim();
  const base = configured || path.join(app.getPath("userData"), "instances");
  return path.join(base, profileId);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    resizable: false,
    maximizable: false,
    frame: false,
    transparent: false,
    backgroundColor: "#080b10",
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  if (!app.isPackaged) void window.loadURL(devUrl);
  else void window.loadFile(path.join(here, "../../dist/index.html"));

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  configureUpdater(window);
}

app.whenReady().then(() => {
  const sessionFile = path.join(app.getPath("userData"), "session.bin");
  ipcMain.handle("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle("window:close", (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle("sync:run", async (event, profileId: string, manifestUrl: string, publicKeyPem: string) => {
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(profileId)) throw new Error("Invalid profile id");
    return synchronize(installRoot(profileId), manifestUrl, publicKeyPem, (progress) => event.sender.send("sync:progress", progress));
  });
  ipcMain.handle("session:load", async () => {
    try {
      const encrypted = await readFile(sessionFile);
      return safeStorage.decryptString(encrypted);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  });
  ipcMain.handle("session:save", async (_event, value: string) => {
    await mkdir(path.dirname(sessionFile), { recursive: true });
    await writeFile(sessionFile, safeStorage.encryptString(value), { mode: 0o600 });
  });
  ipcMain.handle("session:clear", () => rm(sessionFile, { force: true }));
  ipcMain.handle("settings:get", () => settings.store);
  ipcMain.handle("settings:set", (_event, value: Partial<LauncherSettings>) => {
    if (value.memoryMb !== undefined) settings.set("memoryMb", Math.max(2048, Math.min(16384, Math.round(value.memoryMb / 512) * 512)));
    if (value.gameRoot !== undefined) settings.set("gameRoot", value.gameRoot);
    return settings.store;
  });
  ipcMain.handle("settings:choose-directory", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    if (!result.canceled && result.filePaths[0]) settings.set("gameRoot", result.filePaths[0]);
    return settings.store;
  });
  ipcMain.handle("game:launch", async (_event, profileId: string, publicKeyPem: string, identity: { username: string; uuid: string; ticket: string; serverAddress: string }) => {
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(profileId)) throw new Error("Invalid profile id");
    return launchMinecraft(installRoot(profileId), publicKeyPem, identity, settings.get("memoryMb"));
  });
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
