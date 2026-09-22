/// <reference types="vite/client" />

interface DmDesktop {
  getApiBase: () => Promise<string>;
  quitAll?: () => Promise<{ ok: boolean }>;
  onCaptureHotkey: (cb: () => void) => () => void;
}

interface Window {
  dmDesktop?: DmDesktop;
}
