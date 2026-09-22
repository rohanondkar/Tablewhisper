const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const API_PORT = process.env.DM_API_PORT || "8766";
const API_BASE = `http://127.0.0.1:${API_PORT}`;
let mainWindow = null;
let apiProcess = null;

function waitForApi(timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${API_BASE}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() - start > timeoutMs) reject(new Error("API timeout"));
        else setTimeout(tick, 400);
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("API timeout"));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

function startApi() {
  const apiDir = path.resolve(__dirname, "..", "..", "api");
  const venvPython = path.join(apiDir, ".venv", "Scripts", "python.exe");
  const fs = require("fs");
  const python = process.env.DM_PYTHON || (fs.existsSync(venvPython) ? venvPython : "python");
  apiProcess = spawn(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(API_PORT)],
    {
      cwd: apiDir,
      env: { ...process.env, DM_API_PORT: String(API_PORT) },
      stdio: "inherit",
      shell: false,
    }
  );
  apiProcess.on("exit", (code) => {
    console.log("API exited", code);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#14110e",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "DM Console",
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function registerHotkeys() {
  const ok = globalShortcut.register("CommandOrControl+N", () => {
    if (mainWindow) {
      mainWindow.webContents.send("hotkey:capture");
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  if (!ok) console.warn("Failed to register Ctrl+N");
}

app.whenReady().then(async () => {
  startApi();
  try {
    await waitForApi();
  } catch (err) {
    console.error(err);
  }
  createWindow();
  registerHotkeys();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("api:base", () => API_BASE);
