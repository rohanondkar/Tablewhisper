import type { DiePattern, DieSkin } from "./dieSkins";
import { PATTERN_OPTIONS, patternThemeId } from "./dieSkins";

const PATTERN_THEME_IDS = PATTERN_OPTIONS.filter((p) => p !== "solid").map((p) => patternThemeId(p));

let prewarmStarted = false;
let prewarmDone: Promise<void> | null = null;
const loaded = new Set<string>(["default"]);

export type ResolvedDieTheme = {
  theme: string;
  themeColor: string;
};

/** Sync cache lookup for the roll path — never blocks on generation. */
export function resolveDieTheme(skin: DieSkin): ResolvedDieTheme {
  const theme = patternThemeId(skin.pattern);
  if (skin.pattern === "solid" || loaded.has(theme)) {
    return { theme, themeColor: skin.color };
  }
  // Pattern theme not ready yet — solid color fallback (no hitch).
  return { theme: "default", themeColor: skin.color };
}

export function markThemeLoaded(themeId: string): void {
  loaded.add(themeId);
}

export function patternThemeIds(): string[] {
  return [...PATTERN_THEME_IDS];
}

type DiceBoxLike = {
  loadTheme?: (name: string) => Promise<unknown>;
  updateConfig?: (config: Record<string, unknown>) => void;
  config?: { preloadThemes?: string[]; externalThemes?: Record<string, string> };
};

/**
 * Idle-preloads the six patterned DiceBox themes so Roll never waits on I/O.
 * Solid uses the built-in default theme + themeColor (instant).
 */
export function prewarmDieThemes(dice: DiceBoxLike): Promise<void> {
  if (prewarmDone) return prewarmDone;
  if (prewarmStarted) return prewarmDone || Promise.resolve();
  prewarmStarted = true;

  prewarmDone = (async () => {
    const ids = patternThemeIds();
    try {
      dice.updateConfig?.({
        preloadThemes: ids,
      });
    } catch {
      /* optional */
    }

    for (const id of ids) {
      await new Promise<void>((resolve) => {
        const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
          .requestIdleCallback;
        if (typeof ric === "function") {
          ric(() => resolve(), { timeout: 400 });
        } else {
          window.setTimeout(() => resolve(), 0);
        }
      });
      try {
        if (typeof dice.loadTheme === "function") {
          await dice.loadTheme(id);
        }
        loaded.add(id);
      } catch (err) {
        console.warn(`Dice pattern theme failed to preload: ${id}`, err);
      }
    }
  })();

  return prewarmDone;
}

export function isPatternThemeReady(pattern: DiePattern): boolean {
  return pattern === "solid" || loaded.has(patternThemeId(pattern));
}
