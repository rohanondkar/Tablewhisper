/// <reference types="vite/client" />

interface DmDesktop {
  getApiBase: () => Promise<string>;
  onCaptureHotkey: (cb: () => void) => () => void;
}

interface Window {
  dmDesktop?: DmDesktop;
}
