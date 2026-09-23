import catalog from "../../../../packages/rules-dnd5e/spells.json";
import type { Family, MapAction, ShapeKind } from "./effects";

export type SpellAim = "creature" | "point" | "self" | "shape";
export type SpellResolution = "attack" | "save" | "heal" | "none" | "contest";

export type SpellEntry = {
  name: string;
  range_ft: number;
  radius_ft: number;
  shape: ShapeKind;
  aim: SpellAim;
  sight: boolean;
  resolution: Exclude<SpellResolution, "contest">;
  note: string;
};

const spells = catalog as SpellEntry[];
const byLength = [...spells].sort((a, b) => b.name.length - a.name.length);

function fold(text: string): string {
  return text.replace(/[’‘]/g, "'").trim().toLowerCase();
}

export function spellByName(name: string): SpellEntry | null {
  const key = fold(name);
  return spells.find((row) => fold(row.name) === key) || null;
}

function mentioned(text: string, name: string): boolean {
  const escaped = name.replace(/[’‘]/g, "'").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = text.replace(/[’‘]/g, "'");
  if (/[\s']/.test(name.replace(/[’‘]/g, "'"))) return new RegExp(`\\b${escaped}\\b`, "i").test(source);
  return new RegExp(`(?:^|[\\n,;])\\s*${escaped}\\s*(?:$|[\\n,(])`, "i").test(source);
}

export function spellsNamedIn(text: string): SpellEntry[] {
  const found: SpellEntry[] = [];
  for (const row of byLength) {
    if (mentioned(text, row.name)) found.push(row);
  }
  return found;
}

export function actionFromSpell(row: SpellEntry): MapAction {
  const family: Family =
    row.resolution === "heal" ? "heal" : row.aim === "shape" ? (row.shape as Family) : row.shape === "burst" ? "burst" : "ray";
  return {
    id: `spell-${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: row.name,
    family,
    damageType: row.resolution === "heal" ? "healing" : "",
    shape: row.shape,
    reachFt: 0,
    rangeFt: row.range_ft,
    longFt: row.range_ft,
    radiusFt: row.radius_ft,
    sentence: false,
    spellNote: row.note,
    longRange: false,
    aim: row.aim,
    sight: row.sight,
    resolution: row.resolution,
  };
}

export function spellFromText(text: string): SpellEntry | null {
  const cast = text.match(/\bcasts\s+(.+?)(?:\s+on\b|\s+at\b|$)/i);
  if (!cast) return null;
  return spellByName(cast[1].trim());
}
