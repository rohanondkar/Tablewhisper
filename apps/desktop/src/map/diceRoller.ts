import DiceBox from "@3d-dice/dice-box";
import type { DieSkin } from "./dieSkins";
import { prewarmDieThemes, resolveDieTheme } from "./diePatternTheme";
import { noteDieLanded, playDiceSettleSound, startDiceRollSound, stopDiceSounds } from "./diceSounds";

type RollFace = { sides: number; value: number };

let box: InstanceType<typeof DiceBox> | null = null;
let host: HTMLDivElement | null = null;
let overlay: HTMLDivElement | null = null;
let ready: Promise<InstanceType<typeof DiceBox> | null> | null = null;
let rolling = false;
let lastError = "";
let assetPathCache = "";

async function resolveAssetPath(): Promise<string> {
  if (assetPathCache) return assetPathCache;
  try {
    const fromDesktop = await window.dmDesktop?.getDiceAssetUrl?.();
    if (fromDesktop) {
      assetPathCache = fromDesktop.endsWith("/") ? fromDesktop : `${fromDesktop}/`;
      return assetPathCache;
    }
  } catch {
    /* fall through */
  }
  try {
    assetPathCache = new URL("assets/dice-box/", window.location.href).href;
    return assetPathCache;
  } catch {
    const base = import.meta.env.BASE_URL || "./";
    const root = base.endsWith("/") ? base : `${base}/`;
    assetPathCache = `${root}assets/dice-box/`;
    return assetPathCache;
  }
}

function ensureHost() {
  if (overlay && host) return;
  overlay = document.createElement("div");
  overlay.className = "dice-box-overlay";
  overlay.id = "tablewhisper-dice-overlay";
  overlay.style.display = "none";

  host = document.createElement("div");
  host.className = "dice-box-host";
  host.id = "tablewhisper-dice-box";

  overlay.appendChild(host);
  document.body.appendChild(overlay);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function showOverlay(on: boolean) {
  ensureHost();
  if (!overlay || !host) return;
  overlay.classList.toggle("active", on);
  overlay.style.display = on ? "block" : "none";
  if (on) {
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(320, window.innerHeight);
    host.style.width = `${w}px`;
    host.style.height = `${h}px`;
    try {
      box?.resizeWorld?.();
    } catch {
      /* optional */
    }
  }
}

async function getBox(): Promise<InstanceType<typeof DiceBox>> {
  if (box) return box;
  if (ready) {
    const existing = await ready;
    if (existing) return existing;
    throw new Error(lastError || "Dice tray failed to start.");
  }
  ensureHost();
  showOverlay(true);
  ready = (async () => {
    try {
      const path = await resolveAssetPath();
      const themeUrl = `${path}themes/default/theme.config.json`;
      const probe = await fetch(themeUrl);
      if (!probe.ok) {
        throw new Error(`Dice theme missing (${probe.status}) at ${themeUrl}`);
      }

      const created = new DiceBox({
        container: "#tablewhisper-dice-box",
        assetPath: path,
        origin: "",
        offscreen: false,
        scale: 7,
        gravity: 1,
        mass: 1,
        friction: 0.6,
        restitution: 0.35,
        angularDamping: 0.35,
        linearDamping: 0.3,
        throwForce: 10,
        spinForce: 9,
        startingHeight: 14,
        settleTimeout: 6000,
        delay: 80,
        lightIntensity: 1.15,
        theme: "default",
        themeColor: "#6b7280",
        preloadThemes: [],
        enableShadows: true,
        shadowTransparency: 0.7,
      });
      await withTimeout(created.init(), 20000, "Dice init");
      try {
        created.resizeWorld?.();
      } catch {
        /* optional */
      }
      box = created;
      lastError = "";
      // Background-load patterned themes so Roll stays cache-hit only.
      void prewarmDieThemes(created as unknown as Parameters<typeof prewarmDieThemes>[0]);
      return created;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error("DiceBox init failed:", err);
      ready = null;
      box = null;
      return null;
    }
  })();
  const started = await ready;
  if (!started) throw new Error(lastError || "Dice tray failed to start.");
  return started;
}

function groupSides(sides: number[]): Array<{ qty: number; sides: number }> {
  const counts = new Map<number, number>();
  for (const side of sides) {
    counts.set(side, (counts.get(side) || 0) + 1);
  }
  return [...counts.entries()].map(([side, qty]) => ({ qty, sides: side }));
}

function flattenFaces(results: unknown, expected: number[]): number[] {
  const values: number[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === "object") {
      const row = node as Record<string, unknown>;
      if (typeof row.value === "number") {
        values.push(row.value);
        return;
      }
      if (Array.isArray(row.rolls)) walk(row.rolls);
      if (Array.isArray(row.results)) walk(row.results);
    }
  };
  walk(results);
  while (values.length < expected.length) {
    const sides = expected[values.length] || 20;
    values.push(1 + Math.floor(Math.random() * sides));
  }
  return values.slice(0, expected.length);
}

function waitForRollComplete(
  dice: InstanceType<typeof DiceBox>,
  notation: Array<{ qty: number; sides: number; theme: string; themeColor: string }>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const previousRoll = dice.onRollComplete;
    const previousDie = dice.onDieComplete;
    let done = false;
    const finish = (results: unknown) => {
      if (done) return;
      done = true;
      dice.onRollComplete = previousRoll;
      dice.onDieComplete = previousDie;
      resolve(results);
    };
    dice.onDieComplete = (dieResult: unknown) => {
      try {
        previousDie?.(dieResult);
      } catch {
        /* ignore */
      }
      noteDieLanded();
    };
    dice.onRollComplete = (results: unknown) => {
      try {
        previousRoll?.(results);
      } catch {
        /* ignore */
      }
      finish(results);
    };
    try {
      const rolled = dice.roll(notation.length === 1 ? notation[0] : notation);
      if (rolled && typeof (rolled as Promise<unknown>).then === "function") {
        void (rolled as Promise<unknown>)
          .then((results) => finish(results))
          .catch((err) => {
            if (done) return;
            done = true;
            dice.onRollComplete = previousRoll;
            dice.onDieComplete = previousDie;
            reject(err);
          });
      }
    } catch (err) {
      done = true;
      dice.onRollComplete = previousRoll;
      dice.onDieComplete = previousDie;
      reject(err);
    }
  });
}

export function rollFaceValues(sides: number[]): string[] {
  return sides.map((side) => String(1 + Math.floor(Math.random() * side)));
}

export function isDiceRolling(): boolean {
  return rolling;
}

/** Warm the WebGL physics tray and idle-preload pattern themes. */
export function warmDiceBox(): void {
  void getBox()
    .then(() => {
      showOverlay(false);
      try {
        box?.clear?.();
      } catch {
        /* ignore */
      }
    })
    .catch((err) => {
      console.error(err);
      showOverlay(false);
    });
}

export async function rollPhysicsDice(sides: number[], skin: DieSkin): Promise<RollFace[]> {
  if (!sides.length) return [];
  if (rolling) throw new Error("Dice are already rolling.");
  rolling = true;
  showOverlay(true);
  // Two frames so the overlay + canvas are painted before Ammo throws.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const dice = await getBox();
    showOverlay(true);
    try {
      dice.clear?.();
    } catch {
      /* ignore */
    }

    // Cache-only theme resolve — never generate textures here.
    const resolved = resolveDieTheme(skin);
    try {
      dice.updateConfig?.({
        theme: resolved.theme,
        themeColor: resolved.themeColor,
        offscreen: false,
        throwForce: 10,
        spinForce: 9,
        startingHeight: 14,
        scale: 7,
      });
      dice.resizeWorld?.();
    } catch {
      /* ignore */
    }
    await new Promise((r) => requestAnimationFrame(r));

    startDiceRollSound(sides.length);
    const notation = groupSides(sides).map((row) => ({
      ...row,
      theme: resolved.theme,
      themeColor: resolved.themeColor,
    }));
    let settled: unknown;
    try {
      settled = await withTimeout(waitForRollComplete(dice, notation), 25000, "Dice roll");
    } catch (err) {
      stopDiceSounds(80);
      throw err;
    }
    const values = flattenFaces(settled ?? dice.getRollResults?.(), sides);
    const clamped = sides.map((side, index) => Math.max(1, Math.min(side, Math.round(values[index] || 1))));

    playDiceSettleSound();
    // Hold the settled 3D dice so the result is readable — like D&D Beyond.
    await new Promise((r) => window.setTimeout(r, 1600));

    return sides.map((side, index) => ({
      sides: side,
      value: clamped[index],
    }));
  } finally {
    rolling = false;
    try {
      box?.clear?.();
    } catch {
      /* ignore */
    }
    showOverlay(false);
  }
}
