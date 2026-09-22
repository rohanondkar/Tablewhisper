const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dmDesktop", {
  getApiBase: () => ipcRenderer.invoke("api:base"),
  quitAll: () => ipcRenderer.invoke("app:quitAll"),
  onCaptureHotkey: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("hotkey:capture", handler);
    return () => ipcRenderer.removeListener("hotkey:capture", handler);
  },
});
