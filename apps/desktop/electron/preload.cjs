const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dmDesktop", {
  getApiBase: () => ipcRenderer.invoke("api:base"),
  isGame: () => ipcRenderer.invoke("app:isGame"),
  quitAll: () => ipcRenderer.invoke("app:quitAll"),
  getDisplay: () => ipcRenderer.invoke("display:get"),
  setDisplay: (choice) => ipcRenderer.invoke("display:set", choice),
  onCaptureHotkey: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("hotkey:capture", handler);
    return () => ipcRenderer.removeListener("hotkey:capture", handler);
  },
});
