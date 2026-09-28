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

interface WindowChromeState {
  maximized: boolean;
  canMaximize: boolean;
  fullscreen: boolean;
}

interface DmDesktop {
  getApiBase: () => Promise<string>;
  isGame?: () => Promise<boolean>;
  quitAll?: () => Promise<{ ok: boolean }>;
  getDisplay?: () => Promise<{ displays: DisplayPanel[]; current: DisplayChoice }>;
  setDisplay?: (choice: DisplayChoice) => Promise<{ displays: DisplayPanel[]; current: DisplayChoice }>;
  onCaptureHotkey: (cb: () => void) => () => void;
  minimize?: () => Promise<void>;
  maximize?: () => Promise<WindowChromeState>;
  close?: () => Promise<void>;
  windowState?: () => Promise<WindowChromeState>;
  onWindowState?: (cb: (state: WindowChromeState) => void) => () => void;
  getDiceAssetUrl?: () => Promise<string | null>;
}

interface Window {
  dmDesktop?: DmDesktop;
}

declare module "@3d-dice/dice-box" {
  export default class DiceBox {
    constructor(config?: Record<string, unknown>);
    init(): Promise<void>;
    roll(
      notation: string | string[] | Record<string, unknown> | Array<Record<string, unknown>>,
      options?: Record<string, unknown>,
    ): Promise<unknown> | unknown;
    clear(): void;
    getRollResults(): unknown;
    updateConfig(config: Record<string, unknown>): void;
    resizeWorld?: () => void;
    onRollComplete: (results: unknown) => void;
  }
}
