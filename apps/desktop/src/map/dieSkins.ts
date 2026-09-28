/** Shared color and pattern skins for relation nodes and 3D dice. */

export type DiePattern = "solid" | "stripes" | "checks" | "dots" | "scales" | "leaves" | "wraps";

export interface DieSkin {
  color: string;
  labelColor: string;
  outlineColor: string;
  pattern: DiePattern;
  name: string;
}

const PATTERNS: DiePattern[] = ["solid", "stripes", "checks", "dots", "scales", "leaves", "wraps"];

/** Order matters: more specific subrace matches before broad ones. */
const SPECIES: Array<{ match: RegExp; color: string; label: string; outline: string }> = [
  { match: /drow|dark\s*elf/i, color: "#5b3d7a", label: "#f3e8ff", outline: "#2a1540" },
  { match: /shadar-?kai/i, color: "#4b5563", label: "#f3f4f6", outline: "#111827" },
  { match: /eladrin/i, color: "#2f9e7a", label: "#e8fff6", outline: "#0f3d2e" },
  { match: /wood\s*elf/i, color: "#2f6b45", label: "#e8fff0", outline: "#12301c" },
  { match: /high\s*elf/i, color: "#4a8f6a", label: "#eefcf4", outline: "#1a3d2a" },
  { match: /half-?\s*elf/i, color: "#5a8f7a", label: "#eefaf4", outline: "#1c3a30" },
  { match: /\belf\b/i, color: "#3f7a5a", label: "#e8fff2", outline: "#163528" },
  { match: /duergar/i, color: "#5c5346", label: "#f5efe4", outline: "#2a241c" },
  { match: /hill\s*dwarf/i, color: "#8a6a3e", label: "#fff1d6", outline: "#3a2810" },
  { match: /mountain\s*dwarf/i, color: "#6e5330", label: "#ffe9c8", outline: "#2a1c0c" },
  { match: /\bdwarf\b/i, color: "#7a5a3a", label: "#ffe9c8", outline: "#2e1c0c" },
  { match: /lightfoot/i, color: "#d08a4a", label: "#fff7e8", outline: "#5c3214" },
  { match: /stout/i, color: "#b06a32", label: "#fff7e8", outline: "#4a2810" },
  { match: /halfling|hobbit/i, color: "#c4783a", label: "#fff7e8", outline: "#5c3214" },
  { match: /forest\s*gnome/i, color: "#4f8a5a", label: "#eefcf2", outline: "#1a3320" },
  { match: /rock\s*gnome|deep\s*gnome|svirfneblin/i, color: "#6b7bb8", label: "#eef2ff", outline: "#1e2550" },
  { match: /\bgnome\b/i, color: "#5b6bb0", label: "#eef2ff", outline: "#1e2550" },
  { match: /half-?\s*orc/i, color: "#557a40", label: "#f0ffe4", outline: "#1f3014" },
  { match: /\borc\b/i, color: "#4b6b3a", label: "#f0ffe4", outline: "#1f3014" },
  { match: /dragonborn/i, color: "#b4533c", label: "#ffe8a8", outline: "#3f140c" },
  { match: /tiefling/i, color: "#7c2d4a", label: "#ffe4ec", outline: "#3b0d1f" },
  { match: /aasimar/i, color: "#c9a227", label: "#fffdf0", outline: "#5a4508" },
  { match: /air\s*genasi/i, color: "#6ba3c7", label: "#eef8ff", outline: "#1a3a50" },
  { match: /earth\s*genasi/i, color: "#8b7346", label: "#fff6e0", outline: "#3a2e14" },
  { match: /fire\s*genasi/i, color: "#c45c2a", label: "#fff0e4", outline: "#4a1c08" },
  { match: /water\s*genasi/i, color: "#2f6f8f", label: "#e8f8ff", outline: "#123748" },
  { match: /genasi/i, color: "#2f6f8f", label: "#e8f8ff", outline: "#123748" },
  { match: /tabaxi|cat\s*folk/i, color: "#b7791f", label: "#fff8e8", outline: "#5c3a08" },
  { match: /goliath/i, color: "#7d8694", label: "#f4f6f8", outline: "#2a3038" },
  { match: /firbolg/i, color: "#4a7c59", label: "#eaf7ee", outline: "#1a3324" },
  { match: /kenku/i, color: "#5a6270", label: "#eef1f5", outline: "#1f2430" },
  { match: /lizardfolk/i, color: "#3f7a52", label: "#e8fff0", outline: "#163528" },
  { match: /yuan-?\s*ti/i, color: "#6b8f3a", label: "#f4ffe4", outline: "#2a3c14" },
  { match: /tortle/i, color: "#3d8f7a", label: "#e8fff8", outline: "#14382e" },
  { match: /triton/i, color: "#2a7f9e", label: "#e6f7ff", outline: "#0e3544" },
  { match: /hobgoblin/i, color: "#8a4a3a", label: "#ffe8e0", outline: "#3a1810" },
  { match: /bugbear/i, color: "#6b5a3a", label: "#fff4e0", outline: "#2e2414" },
  { match: /kobold/i, color: "#b85a2a", label: "#fff0e0", outline: "#4a220c" },
  { match: /goblin/i, color: "#4f7a3a", label: "#f4ffe8", outline: "#223816" },
  { match: /warforged/i, color: "#6d7585", label: "#eef2f7", outline: "#232830" },
  { match: /changeling/i, color: "#9a8aa8", label: "#f8f4ff", outline: "#3a3044" },
  { match: /autognome/i, color: "#7a8a9a", label: "#f0f4f8", outline: "#2a323c" },
  { match: /thri-?\s*kreen/i, color: "#8a9a3a", label: "#f7ffe0", outline: "#343c14" },
  { match: /human/i, color: "#6b7280", label: "#f8fafc", outline: "#1f2937" },
];

const CLASSES: Array<{ match: RegExp; pattern: DiePattern }> = [
  { match: /blood\s*hunter/i, pattern: "scales" },
  { match: /druid/i, pattern: "leaves" },
  { match: /monk/i, pattern: "wraps" },
  { match: /barbarian/i, pattern: "stripes" },
  { match: /bard/i, pattern: "stripes" },
  { match: /rogue/i, pattern: "dots" },
  { match: /ranger/i, pattern: "dots" },
  { match: /wizard/i, pattern: "checks" },
  { match: /sorcerer/i, pattern: "checks" },
  { match: /warlock/i, pattern: "checks" },
  { match: /artificer/i, pattern: "checks" },
  { match: /paladin/i, pattern: "solid" },
  { match: /cleric/i, pattern: "solid" },
  { match: /fighter/i, pattern: "solid" },
];

export const PATTERN_OPTIONS: DiePattern[] = [...PATTERNS];

/** All distinct species palette colors (for theme prewarm). */
export const SPECIES_COLORS: string[] = [
  ...new Set(SPECIES.map((row) => row.color.toLowerCase())),
];

export const COLOR_OPTIONS = [
  "#8b5a2b",
  ...SPECIES_COLORS,
  "#1f2937",
].filter((v, i, a) => a.indexOf(v) === i);

function rgbToHex(rgb: number[] | null | undefined): string | null {
  if (!rgb || rgb.length < 3) return null;
  const [r, g, b] = rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function classWord(classLevel: string | null | undefined): string {
  return (classLevel || "").split(/\s+/)[0] || "";
}

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

function nudgeHex(hex: string, name: string): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const hue = hashHue(name);
  const shift = ((hue % 24) - 12) / 255;
  const nr = Math.max(0, Math.min(255, Math.round(r + shift * 40)));
  const ng = Math.max(0, Math.min(255, Math.round(g + ((hue * 3) % 24 - 12) / 255 * 40)));
  const nb = Math.max(0, Math.min(255, Math.round(b + ((hue * 7) % 24 - 12) / 255 * 40)));
  return `#${[nr, ng, nb].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export function skinCacheKey(skin: DieSkin): string {
  return `${skin.color.toLowerCase()}|${skin.pattern}`;
}

export function skinFromCreature(input: {
  species?: string | null;
  race?: string | null;
  class_level?: string | null;
  hand_color?: number[] | null;
  name?: string | null;
  /** Explicit overrides (e.g. Relations node edits). */
  color?: string | null;
  pattern?: string | null;
}): DieSkin {
  const species = input.species || input.race || "";
  const classText = input.class_level || "";
  const who = (input.name || species || classWord(classText) || "stone").trim();
  let color = "#6b7280";
  let label = "#f8fafc";
  let outline = "#1f2937";
  let matched = false;
  for (const row of SPECIES) {
    if (row.match.test(species)) {
      color = row.color;
      label = row.label;
      outline = row.outline;
      matched = true;
      break;
    }
  }
  const hand = rgbToHex(input.hand_color);
  if (!matched && hand) {
    color = hand;
    label = "#ffffff";
    outline = "#111827";
    matched = true;
  }
  if (!matched) {
    color = nudgeHex("#6b7280", who || "wanderer");
    label = "#f8fafc";
    outline = "#1f2937";
  }
  let pattern: DiePattern = "solid";
  const word = classWord(classText);
  for (const row of CLASSES) {
    if (row.match.test(word) || row.match.test(classText)) {
      pattern = row.pattern;
      break;
    }
  }
  if (/dragonborn|lizardfolk|yuan-?\s*ti|kobold/i.test(species) && pattern === "solid") {
    pattern = "scales";
  }
  if (input.color && /^#[0-9a-fA-F]{6}$/.test(input.color)) {
    color = input.color;
  }
  if (input.pattern && (PATTERNS as string[]).includes(input.pattern)) {
    pattern = input.pattern as DiePattern;
  }
  return {
    color,
    labelColor: label,
    outlineColor: outline,
    pattern,
    name: who,
  };
}

/** Soft unique nudge when two party members would share the exact same skin. */
export function uniquifySkin(skin: DieSkin, siblings: DieSkin[]): DieSkin {
  const key = skinCacheKey(skin);
  const clash = siblings.some((other) => other.name !== skin.name && skinCacheKey(other) === key);
  if (!clash) return skin;
  return { ...skin, color: nudgeHex(skin.color, skin.name) };
}

export function patternFill(pattern: string, color: string): string {
  const safe = color.replace(/[^#a-fA-F0-9]/g, "") || "#6b7280";
  switch (pattern) {
    case "stripes":
      return `repeating-linear-gradient(45deg, ${safe}, ${safe} 6px, #00000033 6px, #00000033 12px)`;
    case "checks":
      return `repeating-conic-gradient(${safe} 0% 25%, #00000033 0% 50%) 0 0 / 14px 14px`;
    case "dots":
      return `radial-gradient(circle at 30% 30%, #ffffff55 0 2px, transparent 3px), ${safe}`;
    case "scales":
      return `radial-gradient(circle at 50% 20%, #ffffff33 0 4px, transparent 5px), ${safe}`;
    case "leaves":
      return `repeating-linear-gradient(-30deg, ${safe}, ${safe} 8px, #ffffff22 8px, #ffffff22 10px)`;
    case "wraps":
      return `repeating-linear-gradient(90deg, ${safe}, ${safe} 10px, #00000044 10px, #00000044 14px)`;
    default:
      return safe;
  }
}

/** Canvas / Image tile for Konva fills (CSS gradients are not valid there). */
const patternImageCache = new Map<string, HTMLImageElement>();

export function patternCanvas(pattern: string, color: string, size = 64): HTMLImageElement {
  const key = `${pattern}|${color}|${size}`;
  const hit = patternImageCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const image = new Image();
  image.width = size;
  image.height = size;
  if (!ctx) {
    patternImageCache.set(key, image);
    return image;
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  switch (pattern) {
    case "stripes":
      for (let x = -size; x < size * 2; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 8, 0);
        ctx.lineTo(x + 8 + size, size);
        ctx.lineTo(x + size, size);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case "checks": {
      const cell = size / 4;
      for (let y = 0; y < size; y += cell) {
        for (let x = 0; x < size; x += cell) {
          if ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0) {
            ctx.fillRect(x, y, cell, cell);
          }
        }
      }
      break;
    }
    case "dots":
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (let y = 8; y < size; y += 16) {
        for (let x = 8; x < size; x += 16) {
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case "scales":
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      for (let y = 0; y < size; y += 14) {
        const ox = Math.floor(y / 14) % 2 === 0 ? 0 : 8;
        for (let x = ox; x < size; x += 16) {
          ctx.beginPath();
          ctx.ellipse(x + 8, y + 7, 8, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case "leaves":
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      for (let x = -size; x < size * 2; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 7, 0);
        ctx.lineTo(x + 7 - size * 0.4, size);
        ctx.lineTo(x - size * 0.4, size);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case "wraps":
      for (let x = 0; x < size; x += 12) {
        ctx.fillRect(x, 0, 5, size);
      }
      break;
    default:
      break;
  }
  image.src = canvas.toDataURL("image/png");
  patternImageCache.set(key, image);
  return image;
}

/** DiceBox theme id for a pattern (solid uses built-in default). */
export function patternThemeId(pattern: DiePattern): string {
  return pattern === "solid" ? "default" : `pattern-${pattern}`;
}

/** Colors DiceBox theme accepts for themed rolls. */
export function diceBoxTheme(skin: DieSkin): Record<string, string> {
  return {
    foreground: skin.labelColor,
    background: skin.color,
    outline: skin.outlineColor,
  };
}
