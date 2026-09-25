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
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  windowState: () => ipcRenderer.invoke("window:state"),
  onWindowState: (cb) => {
    const handler = (_event, state) => cb(state);
    ipcRenderer.on("window:state", handler);
    return () => ipcRenderer.removeListener("window:state", handler);
  },
});
