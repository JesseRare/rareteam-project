import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rare", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  synchronize: (profileId: string) => ipcRenderer.invoke("sync:run", profileId),
  onSyncProgress: (listener: (progress: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => listener(progress);
    ipcRenderer.on("sync:progress", handler);
    return () => ipcRenderer.removeListener("sync:progress", handler);
  },
  loadSession: () => ipcRenderer.invoke("session:load"),
  saveSession: (value: string) => ipcRenderer.invoke("session:save", value),
  clearSession: () => ipcRenderer.invoke("session:clear"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (value: unknown) => ipcRenderer.invoke("settings:set", value),
  chooseGameDirectory: () => ipcRenderer.invoke("settings:choose-directory"),
  chooseCssDirectory: () => ipcRenderer.invoke("settings:choose-css-directory"),
  launchSource: (serverAddress: string) => ipcRenderer.invoke("source:launch", serverAddress),
  launch: (profileId: string, identity: { username: string; uuid: string; ticket: string; serverAddress: string }) => ipcRenderer.invoke("game:launch", profileId, identity),
  getUpdateState: () => ipcRenderer.invoke("update:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateState: (listener: (state: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown) => listener(state);
    ipcRenderer.on("update:state", handler);
    return () => ipcRenderer.removeListener("update:state", handler);
  },
});
