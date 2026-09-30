import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rare", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  synchronize: (profileId: string, manifestUrl: string, publicKeyPem: string) => ipcRenderer.invoke("sync:run", profileId, manifestUrl, publicKeyPem),
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
  launch: (profileId: string, publicKeyPem: string, identity: { username: string; uuid: string; ticket: string; serverAddress: string }) => ipcRenderer.invoke("game:launch", profileId, publicKeyPem, identity),
});
