const { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");
const http = require("http");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const API_PORT = process.env.DM_API_PORT || "8766";
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const ROOT = path.resolve(__dirname, "..", "..", "..");
let mainWindow = null;
let apiProcess = null;
let quitting = false;

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

function probeApi() {
  return new Promise((resolve) => {
    const req = http.get(`${API_BASE}/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

const WINDOW_PRESETS = [
  [1280, 720],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
];
const DISPLAY_MODES = new Set(["free", "window", "fullscreen"]);
let displayChoice = null;
let freeTimer = null;

function displayPath() {
  if (!app.isPackaged) return null;
  return path.join(packagedLayout().data, "display.json");
}

function modesFor(display) {
  const area = display.workArea;
  const modes = [
    {
      key: "free",
      label: "Windowed — Free",
      mode: "free",
      width: Math.max(980, Math.min(1280, area.width)),
      height: Math.max(680, Math.min(860, area.height)),
    },
  ];
  for (const [w, h] of WINDOW_PRESETS) {
    if (w <= area.width && h <= area.height) {
      modes.push({ key: `${w}x${h}`, label: `${w} × ${h}`, mode: "window", width: w, height: h });
    }
  }
  modes.push({
    key: "fullscreen",
    label: "Fullscreen",
    mode: "fullscreen",
    width: display.bounds.width,
    height: display.bounds.height,
  });
  return modes;
}

function describeDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: display.label || `Display ${index + 1}`,
    primary: display.id === primaryId,
    width: display.bounds.width,
    height: display.bounds.height,
    modes: modesFor(display),
  }));
}

function defaultChoice(displays) {
  const primary = displays.find((item) => item.primary) || displays[0];
  const windowed = (primary?.modes || []).filter((mode) => mode.mode === "window");
  const best = windowed[windowed.length - 1];
  if (!primary) return { displayId: 0, mode: "window", width: 1280, height: 720 };
  if (!best) {
    return { displayId: primary.id, mode: "fullscreen", width: primary.width, height: primary.height };
  }
  return { displayId: primary.id, mode: "window", width: best.width, height: best.height };
}

function readDisplayChoice(displays) {
  const file = displayPath();
  if (file && fs.existsSync(file)) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (saved && typeof saved.displayId === "number" && DISPLAY_MODES.has(saved.mode)) {
        return saved;
      }
    } catch {
      /* use the default */
    }
  }
  const choice = defaultChoice(displays);
  writeDisplayChoice(choice);
  return choice;
}

function writeDisplayChoice(choice) {
  const file = displayPath();
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(choice));
}

function displayState() {
  const displays = describeDisplays();
  return { displays, current: readDisplayChoice(displays) };
}

function unlockChrome() {
  mainWindow.setResizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setFullScreenable(true);
  mainWindow.setMinimumSize(980, 680);
  mainWindow.setMaximumSize(16000, 16000);
}

function lockPreset(width, height) {
  mainWindow.setFullScreen(false);
  mainWindow.setFullScreenable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setResizable(false);
  mainWindow.setMinimumSize(width, height);
  mainWindow.setMaximumSize(width, height);
}

function windowChromeState() {
  if (!mainWindow) return { maximized: false, canMaximize: false, fullscreen: false };
  const locked = Boolean(displayChoice && displayChoice.mode === "window");
  const fullscreen = mainWindow.isFullScreen();
  return {
    maximized: mainWindow.isMaximized(),
    canMaximize: !locked && !fullscreen,
    fullscreen,
  };
}

function publishWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("window:state", windowChromeState());
}

function applyDisplay(choice) {
  if (!mainWindow) return;
  displayChoice = choice;
  const target = screen.getAllDisplays().find((item) => item.id === choice.displayId) || screen.getPrimaryDisplay();
  const area = target.workArea;
  if (mainWindow.isFullScreen() && choice.mode !== "fullscreen") mainWindow.setFullScreen(false);
  if (choice.mode === "fullscreen") {
    unlockChrome();
    mainWindow.setBounds({
      x: target.bounds.x,
      y: target.bounds.y,
      width: target.bounds.width,
      height: target.bounds.height,
    });
    mainWindow.setFullScreen(true);
    publishWindowState();
    return;
  }
  const width = Math.max(980, Math.min(choice.width, area.width));
  const height = Math.max(680, Math.min(choice.height, area.height));
  if (choice.mode === "window") lockPreset(width, height);
  else unlockChrome();
  mainWindow.setBounds({
    x: area.x + Math.max(0, Math.floor((area.width - width) / 2)),
    y: area.y + Math.max(0, Math.floor((area.height - height) / 2)),
    width,
    height,
  });
  publishWindowState();
}

function rememberFreeSize() {
  if (!displayChoice || displayChoice.mode !== "free" || !mainWindow || mainWindow.isFullScreen()) return;
  clearTimeout(freeTimer);
  freeTimer = setTimeout(() => {
    if (!mainWindow || !displayChoice || displayChoice.mode !== "free") return;
    const bounds = mainWindow.getBounds();
    displayChoice = { ...displayChoice, width: bounds.width, height: bounds.height };
    writeDisplayChoice(displayChoice);
  }, 400);
}

function packagedLayout() {
  const resources = process.resourcesPath;
  const exeDir = path.dirname(process.execPath);
  return {
    python: path.join(resources, "python", "python.exe"),
    apiDir: path.join(resources, "api"),
    packages: path.join(resources, "packages"),
    data: path.join(exeDir, "data"),
  };
}

function startApi() {
  const apiDir = path.resolve(__dirname, "..", "..", "api");
  const venvPython = path.join(apiDir, ".venv", "Scripts", "python.exe");
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

function startPackagedApi() {
  const layout = packagedLayout();
  fs.mkdirSync(path.join(layout.data, "logs"), { recursive: true });
  const log = fs.openSync(path.join(layout.data, "logs", "api.log"), "a");
  apiProcess = spawn(
    layout.python,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(API_PORT)],
    {
      cwd: layout.apiDir,
      env: {
        ...process.env,
        DM_API_PORT: String(API_PORT),
        TABLEWHISPER_DATA: layout.data,
        TABLEWHISPER_PACKAGES: layout.packages,
        PYTHONNOUSERSITE: "1",
      },
      windowsHide: true,
      stdio: ["ignore", log, log],
    }
  );
  apiProcess.on("exit", (code) => {
    console.log("API exited", code);
  });
}

function createWindow() {
  const displays = app.isPackaged ? describeDisplays() : [];
  const choice = app.isPackaged ? readDisplayChoice(displays) : null;
  displayChoice = choice;
  const target = choice
    ? screen.getAllDisplays().find((item) => item.id === choice.displayId) || screen.getPrimaryDisplay()
    : null;
  const area = target ? target.workArea : null;
  const sized = choice && choice.mode !== "fullscreen" && area;
  const width = sized ? Math.max(980, Math.min(choice.width, area.width)) : target && choice?.mode === "fullscreen" ? target.bounds.width : 1280;
  const height = sized ? Math.max(680, Math.min(choice.height, area.height)) : target && choice?.mode === "fullscreen" ? target.bounds.height : 860;
  const locked = Boolean(choice && choice.mode === "window");
  const x = target && choice?.mode === "fullscreen"
    ? target.bounds.x
    : area && sized
      ? area.x + Math.max(0, Math.floor((area.width - width) / 2))
      : undefined;
  const y = target && choice?.mode === "fullscreen"
    ? target.bounds.y
    : area && sized
      ? area.y + Math.max(0, Math.floor((area.height - height) / 2))
      : undefined;
  const windowOptions = {
    x,
    y,
    width,
    height,
    fullscreen: Boolean(choice && choice.mode === "fullscreen"),
    resizable: !locked,
    maximizable: !locked,
    fullscreenable: !locked,
    minWidth: locked ? width : 980,
    minHeight: locked ? height : 680,
    backgroundColor: "#14110e",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: app.isPackaged ? "Tablewhisper" : "DM Console",
  };
  if (locked) {
    windowOptions.maxWidth = width;
    windowOptions.maxHeight = height;
  }
  mainWindow = new BrowserWindow(windowOptions);

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
  mainWindow.on("resize", rememberFreeSize);
  mainWindow.on("maximize", publishWindowState);
  mainWindow.on("unmaximize", publishWindowState);
  mainWindow.on("enter-full-screen", publishWindowState);
  mainWindow.on("leave-full-screen", publishWindowState);
  mainWindow.webContents.on("did-finish-load", publishWindowState);
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

function runQuitScript() {
  const ps1 = path.join(ROOT, "scripts", "quit-dm.ps1");
  const bat = path.join(ROOT, "scripts", "quit-dm.bat");
  const fs = require("fs");
  if (fs.existsSync(ps1)) {
    return new Promise((resolve) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
        { windowsHide: true },
        () => resolve(true)
      );
    });
  }
  if (!fs.existsSync(bat)) return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile("cmd.exe", ["/c", bat], { windowsHide: true }, () => resolve(true));
  });
}

function stopSpawnedApi() {
  if (apiProcess && !apiProcess.killed) {
    try {
      apiProcess.kill();
    } catch {
      /* ignore */
    }
  }
}

async function quitEverything() {
  if (quitting) return { ok: true };
  quitting = true;
  try {
    if (app.isPackaged) {
      stopSpawnedApi();
    } else {
      // Prefer HTTP shutdown so start-dev terminal windows are killed too.
      await new Promise((resolve) => {
        const req = http.request(
          `${API_BASE}/shutdown`,
          { method: "POST", timeout: 2000 },
          (res) => {
            res.resume();
            resolve();
          }
        );
        req.on("error", () => resolve());
        req.on("timeout", () => {
          req.destroy();
          resolve();
        });
        req.end();
      });
      stopSpawnedApi();
      await runQuitScript();
    }
  } finally {
    app.quit();
  }
  return { ok: true };
}

const singleInstance = !app.isPackaged || app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  if (app.isPackaged) {
    app.on("second-instance", () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    });
  }

app.whenReady().then(async () => {
  if (app.isPackaged) {
    if (await probeApi()) {
      await dialog.showMessageBox({
        type: "warning",
        title: "Tablewhisper",
        message: "Port 8766 is already in use.",
        detail: "The browser edition is still running. Close it, then start Tablewhisper again. This game will not stop that API.",
      });
      app.quit();
      return;
    }
    const layout = packagedLayout();
    if (!fs.existsSync(layout.python)) {
      await dialog.showMessageBox({
        type: "error",
        title: "Tablewhisper",
        message: "The bundled Python is missing.",
        detail: layout.python,
      });
      app.quit();
      return;
    }
    startPackagedApi();
  } else {
    startApi();
    try {
      await waitForApi();
    } catch (err) {
      console.error(err);
    }
  }
  createWindow();
  registerHotkeys();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopSpawnedApi();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("api:base", () => API_BASE);
ipcMain.handle("app:isGame", () => app.isPackaged);
ipcMain.handle("app:quitAll", () => quitEverything());
ipcMain.handle("display:get", () => displayState());
ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});
ipcMain.handle("window:maximize", () => {
  if (!mainWindow || !windowChromeState().canMaximize) return windowChromeState();
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return windowChromeState();
});
ipcMain.handle("window:close", () => {
  mainWindow?.close();
});
ipcMain.handle("window:state", () => windowChromeState());
ipcMain.handle("display:set", (_event, choice) => {
  if (!choice || !DISPLAY_MODES.has(choice.mode)) return displayState();
  const next = {
    displayId: Number(choice.displayId),
    mode: choice.mode,
    width: Number(choice.width) || 1280,
    height: Number(choice.height) || 720,
  };
  writeDisplayChoice(next);
  applyDisplay(next);
  return displayState();
});
}
