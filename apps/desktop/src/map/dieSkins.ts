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

const SPECIES: Array<{ match: RegExp; color: string; label: string; outline: string }> = [
  { match: /halfling|hobbit/i, color: "#c4783a", label: "#fff7e8", outline: "#5c3214" },
  { match: /dragonborn/i, color: "#b4533c", label: "#ffe8a8", outline: "#3f140c" },
  { match: /elf|eladrin/i, color: "#3f7a5a", label: "#e8fff2", outline: "#163528" },
  { match: /dwarf/i, color: "#7a5a3a", label: "#ffe9c8", outline: "#2e1c0c" },
  { match: /human/i, color: "#6b7280", label: "#f8fafc", outline: "#1f2937" },
  { match: /tiefling/i, color: "#7c2d4a", label: "#ffe4ec", outline: "#3b0d1f" },
  { match: /orc|half-?orc/i, color: "#4b6b3a", label: "#f0ffe4", outline: "#1f3014" },
  { match: /gnome/i, color: "#5b6bb0", label: "#eef2ff", outline: "#1e2550" },
  { match: /goblin/i, color: "#4f7a3a", label: "#f4ffe8", outline: "#223816" },
  { match: /tabaxi|cat/i, color: "#b7791f", label: "#fff8e8", outline: "#5c3a08" },
  { match: /aasimar/i, color: "#c9a227", label: "#fffdf0", outline: "#5a4508" },
  { match: /genasi/i, color: "#2f6f8f", label: "#e8f8ff", outline: "#123748" },
];

const CLASSES: Array<{ match: RegExp; pattern: DiePattern }> = [
  { match: /druid/i, pattern: "leaves" },
  { match: /monk/i, pattern: "wraps" },
  { match: /barbarian/i, pattern: "stripes" },
  { match: /rogue|ranger/i, pattern: "dots" },
  { match: /wizard|sorcerer|warlock/i, pattern: "checks" },
  { match: /paladin|cleric/i, pattern: "solid" },
  { match: /fighter/i, pattern: "solid" },
  { match: /artificer/i, pattern: "checks" },
  { match: /bard/i, pattern: "stripes" },
];

export const PATTERN_OPTIONS: DiePattern[] = [...PATTERNS];

export const COLOR_OPTIONS = [
  "#8b5a2b",
  "#c4783a",
  "#b4533c",
  "#3f7a5a",
  "#7a5a3a",
  "#6b7280",
  "#7c2d4a",
  "#4b6b3a",
  "#5b6bb0",
  "#c9a227",
  "#2f6f8f",
  "#1f2937",
];

function rgbToHex(rgb: number[] | null | undefined): string | null {
  if (!rgb || rgb.length < 3) return null;
  const [r, g, b] = rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function classWord(classLevel: string | null | undefined): string {
  return (classLevel || "").split(/\s+/)[0] || "";
}

export function skinFromCreature(input: {
  species?: string | null;
  race?: string | null;
  class_level?: string | null;
  hand_color?: number[] | null;
  name?: string | null;
}): DieSkin {
  const species = input.species || input.race || "";
  const classText = input.class_level || "";
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
  }
  let pattern: DiePattern = "solid";
  const word = classWord(classText);
  for (const row of CLASSES) {
    if (row.match.test(word) || row.match.test(classText)) {
      pattern = row.pattern;
      break;
    }
  }
  if (/dragonborn/i.test(species)) pattern = pattern === "solid" ? "scales" : pattern;
  const who = (input.name || species || word || "stone").trim();
  return {
    color,
    labelColor: label,
    outlineColor: outline,
    pattern,
    name: who,
  };
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

/** Colors DiceBox theme accepts for themed rolls. */
export function diceBoxTheme(skin: DieSkin): Record<string, string> {
  return {
    foreground: skin.labelColor,
    background: skin.color,
    outline: skin.outlineColor,
  };
}
