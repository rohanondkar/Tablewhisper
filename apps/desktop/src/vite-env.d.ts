/// <reference types="vite/client" />

interface DisplayModeOption {
  key: string;
  label: string;
  mode: "free" | "window" | "fullscreen";
  width: number;
  height: number;
}

interface DisplayPanel {
  id: number;
  label: string;
  primary: boolean;
  width: number;
  height: number;
  modes: DisplayModeOption[];
}

interface DisplayChoice {
  displayId: number;
  mode: "free" | "window" | "fullscreen";
  width: number;
  height: number;
}

interface DmDesktop {
  getApiBase: () => Promise<string>;
  isGame?: () => Promise<boolean>;
  quitAll?: () => Promise<{ ok: boolean }>;
  getDisplay?: () => Promise<{ displays: DisplayPanel[]; current: DisplayChoice }>;
  setDisplay?: (choice: DisplayChoice) => Promise<{ displays: DisplayPanel[]; current: DisplayChoice }>;
  onCaptureHotkey: (cb: () => void) => () => void;
}

interface Window {
  dmDesktop?: DmDesktop;
}
