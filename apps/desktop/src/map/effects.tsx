import { useEffect, useState } from "react";
import { Arc, Circle, Group, Line, Rect, Text } from "react-konva";
import type { CheckResult } from "../api";
import { actionFromSpell, spellByName, spellFromText, spellsNamedIn, type SpellAim, type SpellResolution } from "./spellCatalog";
import type { Seg } from "./vision";

export type Tile = { c: number; r: number };

export type Family =
  | "swing"
  | "shot"
  | "thrown"
  | "ray"
  | "burst"
  | "cone"
  | "line"
  | "cube"
  | "heal"
  | "social";

export type ShapeKind = "melee" | "ranged" | "thrown" | "ray" | "burst" | "cone" | "line" | "cube" | "heal" | "social";

export type MapAction = {
  id: string;
  label: string;
  family: Family;
  damageType: string;
  shape: ShapeKind;
  reachFt: number;
  rangeFt: number;
  longFt: number;
  radiusFt: number;
  sentence: boolean;
  spellNote: string | null;
  longRange: boolean;
  aim?: SpellAim;
  sight?: boolean;
  resolution?: SpellResolution;
};

export type Grid = {
  grid_size_px: number;
  grid_offset_x: number;
  grid_offset_y: number;
  feet_per_square: number;
  width: number;
  height: number;
};

export type AimTile = Tile & { far: boolean };

export type Travel = {
  id: number;
  family: Family;
  damageType: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  tiles: Tile[];
};

export type Mark = {
  id: string;
  kind: string;
  x: number;
  y: number;
  tile: Tile;
};

const THROWN = new Set(["dagger", "handaxe", "javelin", "light hammer", "spear", "dart", "trident", "net"]);
const REACH = new Set(["glaive", "halberd", "lance", "pike", "whip"]);
const RANGED: Record<string, [number, number]> = {
  "light crossbow": [80, 320],
  shortbow: [80, 320],
  sling: [30, 120],
  blowgun: [25, 100],
  "hand crossbow": [30, 120],
  "heavy crossbow": [100, 400],
  longbow: [150, 600],
};
const THROWN_RANGE: Record<string, [number, number]> = {
  dagger: [20, 60],
  handaxe: [20, 60],
  javelin: [30, 120],
  "light hammer": [20, 60],
  spear: [20, 60],
  dart: [20, 60],
  trident: [20, 60],
  net: [5, 15],
};

export function tileKey(tile: Tile): string {
  return `${tile.c},${tile.r}`;
}

export function tileOf(x: number, y: number, grid: Grid): Tile {
  const gs = Math.max(1, grid.grid_size_px);
  return {
    c: Math.floor((x - grid.grid_offset_x) / gs),
    r: Math.floor((y - grid.grid_offset_y) / gs),
  };
}

export function tileRect(tile: Tile, grid: Grid): { x: number; y: number; s: number } {
  const s = grid.grid_size_px;
  return {
    x: grid.grid_offset_x + tile.c * s,
    y: grid.grid_offset_y + tile.r * s,
    s,
  };
}

export function tileCenter(tile: Tile, grid: Grid): { x: number; y: number } {
  const rect = tileRect(tile, grid);
  return { x: rect.x + rect.s / 2, y: rect.y + rect.s / 2 };
}

export function footprint(x: number, y: number, sizeSq: number, grid: Grid): Tile[] {
  const origin = tileOf(x + 1, y + 1, grid);
  const n = Math.max(1, Math.round(sizeSq || 1));
  const tiles: Tile[] = [];
  for (let dc = 0; dc < n; dc += 1) {
    for (let dr = 0; dr < n; dr += 1) tiles.push({ c: origin.c + dc, r: origin.r + dr });
  }
  return tiles;
}

function chebyshev(from: Tile[], to: Tile): number {
  let best = Infinity;
  for (const tile of from) {
    best = Math.min(best, Math.max(Math.abs(tile.c - to.c), Math.abs(tile.r - to.r)));
  }
  return best;
}

function inBounds(tile: Tile, grid: Grid): boolean {
  const cols = Math.ceil(grid.width / Math.max(1, grid.grid_size_px));
  const rows = Math.ceil(grid.height / Math.max(1, grid.grid_size_px));
  return tile.c >= 0 && tile.r >= 0 && tile.c < cols && tile.r < rows;
}

function allTiles(grid: Grid): Tile[] {
  const cols = Math.ceil(grid.width / Math.max(1, grid.grid_size_px));
  const rows = Math.ceil(grid.height / Math.max(1, grid.grid_size_px));
  const tiles: Tile[] = [];
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) tiles.push({ c, r });
  }
  return tiles;
}

function crossesWall(a: { x: number; y: number }, b: { x: number; y: number }, segs: Seg[]): boolean {
  for (const seg of segs) {
    if (segmentsHit(a, b, seg.a, seg.b)) return true;
  }
  return false;
}

function segmentsHit(
  p: { x: number; y: number },
  q: { x: number; y: number },
  r: { x: number; y: number },
  s: { x: number; y: number }
): boolean {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = s.x - r.x;
  const sy = s.y - r.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-6) return false;
  const qpx = r.x - p.x;
  const qpy = r.y - p.y;
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  return t > 0.05 && t < 0.95 && u >= 0 && u <= 1;
}

function weaponName(name: string): string {
  const low = name.toLowerCase();
  const keys = Object.keys(RANGED)
    .concat([...THROWN], [...REACH])
    .sort((a, b) => b.length - a.length);
  return keys.find((key) => low.includes(key)) || low;
}

export function damageTypeFor(name: string, given?: string): string {
  if (given) return given.toLowerCase();
  const n = name.toLowerCase();
  if (/bow|crossbow|spear|pike|javelin|dart|dagger|rapier|shortsword|trident|arrow|bolt|pierce/.test(n)) {
    return "piercing";
  }
  if (/sword|axe|scimitar|glaive|halberd|sickle|slash/.test(n)) return "slashing";
  if (/club|mace|staff|hammer|maul|flail|sling|bite|tail|tentacle/.test(n)) return "bludgeoning";
  return "bludgeoning";
}

export function actionFromAttack(name: string, damageType: string | undefined, attackBonus: number, thrown: boolean): MapAction {
  const key = weaponName(name);
  const type = damageTypeFor(name, damageType);
  if (attackBonus === 0 && /breath|spray/.test(name.toLowerCase())) {
    return {
      id: `burst-${name}`,
      label: name,
      family: "burst",
      damageType: type,
      shape: "burst",
      reachFt: 0,
      rangeFt: 30,
      longFt: 30,
      radiusFt: 15,
      sentence: true,
      spellNote: null,
      longRange: false,
    };
  }
  if (!thrown && RANGED[key]) {
    const [normal, far] = RANGED[key];
    return base(name, "shot", type, "ranged", 0, normal, far, 0);
  }
  if (thrown && THROWN_RANGE[key]) {
    const [normal, far] = THROWN_RANGE[key];
    return base(`${name} (thrown)`, "thrown", type, "thrown", 5, normal, far, 0);
  }
  const reach = REACH.has(key) ? 10 : 5;
  return base(name, "swing", type, "melee", reach, 0, 0, 0);
}

function base(
  label: string,
  family: Family,
  damageType: string,
  shape: ShapeKind,
  reachFt: number,
  rangeFt: number,
  longFt: number,
  radiusFt: number
): MapAction {
  return {
    id: `${family}-${label}`,
    label,
    family,
    damageType,
    shape,
    reachFt,
    rangeFt,
    longFt,
    radiusFt,
    sentence: true,
    spellNote: null,
    longRange: false,
  };
}

function namedOnSheet(text: string): MapAction[] {
  const found: MapAction[] = [];
  if (/second wind/i.test(text)) {
    found.push({
      id: "second-wind",
      label: "Second Wind",
      family: "heal",
      damageType: "healing",
      shape: "heal",
      reachFt: 0,
      rangeFt: 0,
      longFt: 0,
      radiusFt: 0,
      sentence: false,
      spellNote: "Bonus action. Regain 1d10+1 hit points. 2 uses per long rest.",
      longRange: false,
      aim: "self",
      resolution: "heal",
    });
  }
  for (const row of spellsNamedIn(text)) found.push(actionFromSpell(row));
  return found;
}

export function standardMoves(): MapAction[] {
  const self = ["Dash", "Disengage", "Dodge", "Hide", "Search"].map((label) => ({
    id: `move-${label.toLowerCase()}`,
    label,
    family: "ray" as const,
    damageType: "",
    shape: "ray" as const,
    reachFt: 0,
    rangeFt: 0,
    longFt: 0,
    radiusFt: 0,
    sentence: false,
    spellNote: `${label}. No attack roll. Hit points stay.`,
    longRange: false,
    aim: "self" as const,
    resolution: "none" as const,
  }));
  const near: MapAction[] = [
    ["Help", "none", "Help a creature within 5 feet. No attack roll. Hit points stay."],
    ["Grapple", "contest", "Strength (Athletics) contest. Hit points stay."],
    ["Shove", "contest", "Strength (Athletics) contest. Hit points stay."],
  ].map(([label, resolution, note]) => ({
    id: `move-${label.toLowerCase()}`,
    label,
    family: "social",
    damageType: "",
    shape: "ray",
    reachFt: 5,
    rangeFt: 5,
    longFt: 5,
    radiusFt: 0,
    sentence: false,
    spellNote: note,
    longRange: false,
    aim: "creature",
    resolution: resolution as SpellResolution,
  }));
  return [...self, ...near];
}

function weaponKey(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

export function actionsFor(
  attacks: Array<{ name: string; attack_bonus?: number | string; damage?: string; damage_type?: string }>,
  opts?: { text?: string; extraWeapons?: string[]; social?: boolean }
): MapAction[] {
  const list: MapAction[] = [];
  const push = (action: MapAction) => {
    if (!list.some((item) => item.id === action.id)) list.push(action);
  };
  for (const atk of attacks) {
    const known = spellByName(atk.name);
    if (known) {
      push(actionFromSpell(known));
      continue;
    }
    const bonus = Number(String(atk.attack_bonus ?? "0").replace("+", "")) || 0;
    const key = weaponName(atk.name);
    if (THROWN_RANGE[key]) {
      if (key !== "dart" && key !== "net") push(actionFromAttack(atk.name, atk.damage_type, bonus, false));
      push(actionFromAttack(atk.name, atk.damage_type, bonus, true));
    } else {
      push(actionFromAttack(atk.name, atk.damage_type, bonus, false));
    }
  }
  const seen = new Set(list.map((action) => weaponKey(action.label)));
  for (const name of opts?.extraWeapons || []) {
    const key = weaponKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const clean = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const bonus = 0;
    const weapon = weaponName(clean);
    if (THROWN_RANGE[weapon]) {
      if (weapon !== "dart" && weapon !== "net") push(actionFromAttack(clean, undefined, bonus, false));
      push(actionFromAttack(clean, undefined, bonus, true));
    } else {
      push(actionFromAttack(clean, undefined, bonus, false));
    }
  }
  if (opts?.text) {
    for (const action of namedOnSheet(opts.text)) push(action);
  }
  if (opts?.social) {
    for (const action of socialActions()) push(action);
  }
  for (const action of standardMoves()) push(action);
  return list;
}

export function rulingSentence(actor: string, action: MapAction, target: string, far: boolean): string {
  if (action.aim) {
    const verb = action.id.startsWith("spell-") ? "casts" : "uses";
    if (action.aim === "self") return `${actor} ${verb} ${action.label}`;
    const prep = action.aim === "point" || action.aim === "shape" ? "at" : "on";
    return `${actor} ${verb} ${action.label} ${prep} ${target}${far ? " at long range" : ""}`;
  }
  if (action.family === "social") {
    const verb =
      action.label === "Persuade" ? "persuades" : action.label === "Intimidate" ? "intimidates" : "deceives";
    return `${actor} ${verb} ${target}`;
  }
  if (!action.sentence) {
    return `${actor} casts ${action.label} at ${target}`;
  }
  const weapon = action.label.replace(/ \(thrown\)$/i, "");
  return `${actor} attacks ${target} with a ${weapon}${far ? " at long range" : ""}`;
}

export function attackSentence(actor: string, action: MapAction, target: string, far: boolean): string {
  return rulingSentence(actor, action, target, far);
}

export type RulingCreature = {
  key: string;
  tokenId: string | null;
  refId: string | null;
  kind: string;
  label: string;
  tile: Tile | null;
};

export type MarkPulse = {
  id: number;
  miss: boolean;
  heal: boolean;
  damageType: string;
  tile: Tile | null;
  tokenId: string | null;
  downed: boolean;
};

export type MapRuling = {
  id: number;
  result: CheckResult;
  blocked: string | null;
  action: MapAction | null;
  creatures: RulingCreature[];
  tiles: Tile[];
  anchor: Tile | null;
  heal: boolean;
};

export function rangeGate(
  action: MapAction,
  from: Tile[],
  to: Tile,
  grid: Grid,
  segs: Seg[]
): { play: boolean; far: boolean; blocked: string | null } {
  const feet = Math.max(1, grid.feet_per_square);
  const distSq = chebyshev(from, to);
  const distFt = distSq * feet;
  const origin = tileCenter(from[0], grid);
  const aim = tileCenter(to, grid);
  const walled = distSq > 0 && crossesWall(origin, aim, segs);
  if (action.shape === "social") return { play: true, far: false, blocked: null };
  if (action.shape === "heal") {
    if (action.rangeFt <= 0) {
      const self = from.some((tile) => tile.c === to.c && tile.r === to.r);
      return self
        ? { play: true, far: false, blocked: null }
        : { play: false, far: false, blocked: "That reaches only the creature using it." };
    }
    if (walled) return { play: false, far: false, blocked: "A wall is between them." };
    if (distFt > action.rangeFt) {
      return { play: false, far: false, blocked: `They are ${distFt} feet apart. This reaches ${action.rangeFt} feet.` };
    }
    return { play: true, far: false, blocked: null };
  }
  if (action.shape === "melee") {
    const reachSq = Math.max(1, Math.round((action.reachFt || 5) / feet));
    if (walled) return { play: false, far: false, blocked: "A wall is between them." };
    if (distSq > reachSq) {
      return {
        play: false,
        far: false,
        blocked: `They are ${distFt} feet apart. This weapon reaches ${action.reachFt || 5} feet.`,
      };
    }
    return { play: true, far: false, blocked: null };
  }
  if (action.shape === "cone" || action.shape === "line" || action.shape === "cube") {
    const reach = action.radiusFt || 0;
    if (reach > 0 && distFt > reach) {
      return {
        play: false,
        far: false,
        blocked: `That is ${distFt} feet away. This reaches ${reach} feet.`,
      };
    }
    return { play: true, far: false, blocked: null };
  }
  const limit = action.longFt || action.rangeFt || action.reachFt;
  const normal = action.rangeFt || limit;
  const shot = action.shape === "ranged" || action.shape === "thrown" || action.shape === "ray";
  if (shot && walled) return { play: false, far: false, blocked: "A wall is between them." };
  if (limit > 0 && distFt > limit) {
    return { play: false, far: false, blocked: `That is ${distFt} feet away. This reaches ${limit} feet.` };
  }
  const far = shot && normal > 0 && distFt > normal;
  return { play: true, far, blocked: null };
}

const EXTRA_WEAPONS = [
  "morningstar",
  "quarterstaff",
  "greatsword",
  "longsword",
  "shortsword",
  "battleaxe",
  "greataxe",
  "handaxe",
  "warhammer",
  "club",
  "mace",
  "rapier",
  "scimitar",
  "flail",
  "maul",
  "spear",
];

export function actionFromQuery(text: string, checkType: string, weaponLabel?: string | null): MapAction | null {
  const low = text.toLowerCase();
  const named = spellFromText(text);
  if (named) return actionFromSpell(named);
  const used = text.match(/\buses\s+([a-z][a-z' ]*?)(?:\s+on\b|\s+at\b|$)/i);
  const move = used
    ? standardMoves().find((action) => action.label.toLowerCase() === used[1].trim().toLowerCase())
    : undefined;
  if (move) return move;
  if (/\bsecond wind\b/.test(low)) return namedOnSheet("second wind")[0] || null;
  if (/\b(persuade|persuades|persuasion)\b/.test(low)) return socialActions()[0];
  if (/\b(intimidate|intimidates|intimidation)\b/.test(low)) return socialActions()[1];
  if (/\b(deceive|deceives|deception)\b/.test(low)) return socialActions()[2];
  if (checkType !== "attack") return null;
  if (/\b(slaps?|slapping|punches?|punching|kicks?|kicking|headbutts?|headbutting|unarmed)\b/.test(low)) {
    const armed = EXTRA_WEAPONS.concat(Object.keys(RANGED), Object.keys(THROWN_RANGE), [...REACH]).some((word) =>
      low.includes(word)
    );
    if (!armed) return actionFromAttack("Unarmed", "bludgeoning", 0, false);
  }
  const words = EXTRA_WEAPONS.concat(Object.keys(RANGED), Object.keys(THROWN_RANGE), [...REACH]).sort(
    (a, b) => b.length - a.length
  );
  const fromResult = (weaponLabel || "").toLowerCase();
  const weaponWord = words.find((word) => low.includes(word) || fromResult.includes(word)) || fromResult || "club";
  const key = weaponName(weaponWord);
  const thrown = /\bthrows?\b|\bthrown\b/.test(low);
  if (thrown && THROWN_RANGE[key]) return actionFromAttack(weaponWord, undefined, 0, true);
  if (RANGED[key] || /\b(shoots?|shooting|bow|crossbow|blowgun)\b/.test(low)) {
    return actionFromAttack(weaponWord, undefined, 0, false);
  }
  return actionFromAttack(weaponWord, undefined, 0, false);
}

export function socialActions(): MapAction[] {
  return ["Persuade", "Intimidate", "Deceive"].map((label) => ({
    id: `social-${label}`,
    label,
    family: "social" as const,
    damageType: "",
    shape: "social" as const,
    reachFt: 0,
    rangeFt: 0,
    longFt: 0,
    radiusFt: 0,
    sentence: true,
    spellNote: null,
    longRange: false,
  }));
}

export function aimTiles(
  action: MapAction,
  from: Tile[],
  hover: Tile | null,
  grid: Grid,
  segs: Seg[],
  others: Tile[]
): AimTile[] {
  const feet = Math.max(1, grid.feet_per_square);
  const self = new Set(from.map(tileKey));
  const blocked = (tile: Tile, distFt: number) =>
    distFt > 0 && crossesWall(tileCenter(from[0], grid), tileCenter(tile, grid), segs);
  if (action.aim === "self") {
    return from.map((tile) => ({ ...tile, far: false }));
  }
  if (action.aim === "creature") {
    return others
      .filter((tile) => {
        if (self.has(tileKey(tile))) return false;
        const distFt = chebyshev(from, tile) * feet;
        if (!action.sight && distFt > (action.rangeFt || 0)) return false;
        return !blocked(tile, distFt);
      })
      .map((tile) => ({ ...tile, far: false }));
  }
  if (action.aim === "point") {
    const limit = action.rangeFt || action.longFt || 0;
    const legal = allTiles(grid).filter((tile) => {
      const distFt = chebyshev(from, tile) * feet;
      if (limit > 0 && distFt > limit) return false;
      return !blocked(tile, distFt);
    });
    if (hover && (action.radiusFt || 0) > 0 && legal.some((tile) => tile.c === hover.c && tile.r === hover.r)) {
      return blast(hover, action.radiusFt, grid).map((tile) => ({ ...tile, far: false }));
    }
    return legal.map((tile) => ({ ...tile, far: false }));
  }
  if (action.shape === "social") {
    return others.filter((tile) => !self.has(tileKey(tile))).map((tile) => ({ ...tile, far: false }));
  }
  if (action.shape === "heal") {
    if (action.rangeFt <= 0) return from.map((tile) => ({ ...tile, far: false }));
    return allTiles(grid)
      .filter((tile) => chebyshev(from, tile) * feet <= action.rangeFt)
      .map((tile) => ({ ...tile, far: false }));
  }
  if (action.shape === "melee") {
    const reachSq = Math.max(1, Math.round(action.reachFt / feet));
    return allTiles(grid)
      .filter((tile) => {
        const dist = chebyshev(from, tile);
        return dist >= 1 && dist <= reachSq;
      })
      .map((tile) => ({ ...tile, far: false }));
  }
  if (action.shape === "burst") {
    if (!hover) return [];
    const limit = action.rangeFt || action.longFt || 0;
    if (chebyshev(from, hover) * feet > limit) return [];
    return blast(hover, action.radiusFt || 20, grid).map((tile) => ({ ...tile, far: false }));
  }
  if (action.shape === "cone" || action.shape === "line" || action.shape === "cube") {
    if (!hover) return [];
    return shaped(action, from, hover, grid, segs).map((tile) => ({ ...tile, far: false }));
  }
  const limit = action.longFt || action.rangeFt || action.reachFt;
  const normal = action.rangeFt || limit;
  return allTiles(grid)
    .filter((tile) => {
      if (self.has(tileKey(tile)) && action.shape !== "burst") return false;
      return chebyshev(from, tile) * feet <= limit;
    })
    .map((tile) => ({ ...tile, far: chebyshev(from, tile) * feet > normal }));
}

export function effectTiles(action: MapAction, from: Tile[], target: Tile, grid: Grid, segs: Seg[]): Tile[] {
  if (action.shape === "burst") {
    return blast(target, action.radiusFt || 20, grid);
  }
  if (action.shape === "cone" || action.shape === "line" || action.shape === "cube") {
    return shaped(action, from, target, grid, segs);
  }
  return [target];
}

function blast(center: Tile, radiusFt: number, grid: Grid): Tile[] {
  const feet = Math.max(1, grid.feet_per_square);
  const mid = tileCenter(center, grid);
  return allTiles(grid).filter((tile) => {
    const at = tileCenter(tile, grid);
    return Math.hypot(at.x - mid.x, at.y - mid.y) <= (radiusFt / feet) * grid.grid_size_px + grid.grid_size_px * 0.2;
  });
}

function shaped(action: MapAction, from: Tile[], hover: Tile, grid: Grid, segs: Seg[]): Tile[] {
  const feet = Math.max(1, grid.feet_per_square);
  const origin = tileCenter(from[0], grid);
  const aim = tileCenter(hover, grid);
  const dx = aim.x - origin.x;
  const dy = aim.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const reachPx = ((action.radiusFt || 15) / feet) * grid.grid_size_px;
  return allTiles(grid).filter((tile) => {
    if (from.some((start) => start.c === tile.c && start.r === tile.r)) return false;
    const at = tileCenter(tile, grid);
    const vx = at.x - origin.x;
    const vy = at.y - origin.y;
    const along = vx * ux + vy * uy;
    const side = Math.abs(vx * uy - vy * ux);
    if (along <= 0 || along > reachPx + grid.grid_size_px * 0.45) return false;
    if (action.shape === "line" && side > grid.grid_size_px * 0.65) return false;
    if (action.shape === "cone" && side > along * 0.5 + grid.grid_size_px * 0.2) return false;
    if (action.shape === "cube" && (side > reachPx || along > reachPx)) return false;
    return !crossesWall(origin, at, segs);
  });
}

export function markKind(damageType: string): string {
  const type = damageType.toLowerCase();
  if (type === "slashing" || type === "piercing" || type === "bludgeoning") return "blood";
  if (type === "fire") return "scorch";
  if (type === "cold") return "frost";
  if (type === "acid") return "acid";
  if (type === "poison") return "poison";
  if (type === "lightning" || type === "thunder") return "flash";
  if (type === "radiant") return "radiant";
  if (type === "necrotic") return "necrotic";
  if (type === "force") return "force";
  if (type === "psychic") return "psychic";
  if (type === "healing") return "heal";
  return "dust";
}

const MARK_COLOR: Record<string, string> = {
  blood: "rgba(140, 20, 24, 0.8)",
  scorch: "rgba(40, 24, 16, 0.72)",
  frost: "rgba(186, 220, 240, 0.55)",
  acid: "rgba(150, 180, 40, 0.45)",
  poison: "rgba(90, 170, 60, 0.7)",
  flash: "rgba(255, 240, 160, 0.0)",
  radiant: "rgba(255, 236, 170, 0.0)",
  necrotic: "rgba(40, 20, 50, 0.0)",
  force: "rgba(160, 190, 255, 0.0)",
  psychic: "rgba(200, 120, 220, 0.0)",
  heal: "rgba(120, 220, 140, 0.0)",
  dust: "rgba(190, 176, 140, 0.65)",
};

export function PortalRing({ radius }: { radius: number }) {
  const [spin, setSpin] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setSpin((now - start) / 14);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  const pulse = 0.86 + 0.14 * Math.sin(spin / 20);
  return (
    <Group listening={false}>
      <Circle radius={radius * 0.42} fill="rgba(18, 0, 36, 0.82)" />
      <Group rotation={spin % 360} scaleX={pulse} scaleY={pulse}>
        <Arc innerRadius={radius * 0.48} outerRadius={radius * 0.9} angle={280} fill="rgba(168, 72, 255, 0.78)" />
        <Arc
          innerRadius={radius * 0.22}
          outerRadius={radius * 0.4}
          angle={180}
          rotation={140}
          fill="rgba(90, 210, 255, 0.7)"
        />
      </Group>
      <Circle radius={radius} stroke="#d7bfff" strokeWidth={2} />
    </Group>
  );
}

export function AimOverlay({ tiles, grid }: { tiles: AimTile[]; grid: Grid }) {
  return (
    <>
      {tiles.map((tile) => {
        const rect = tileRect(tile, grid);
        return (
          <Rect
            key={tileKey(tile)}
            x={rect.x + 2}
            y={rect.y + 2}
            width={rect.s - 4}
            height={rect.s - 4}
            fill={tile.far ? "rgba(220, 160, 40, 0.28)" : "rgba(80, 180, 110, 0.28)"}
            stroke={tile.far ? "rgba(240, 190, 70, 0.9)" : "rgba(120, 220, 150, 0.9)"}
            strokeWidth={1}
            listening={false}
          />
        );
      })}
    </>
  );
}

export function TravelEffect({ travel, progress, grid }: { travel: Travel; progress: number; grid: Grid }) {
  const color = travelColor(travel.damageType, travel.family);
  if (travel.family === "burst" || travel.family === "cone" || travel.family === "line" || travel.family === "cube") {
    const alpha = progress < 0.7 ? 0.45 : 0.45 * (1 - (progress - 0.7) / 0.3);
    return (
      <>
        {travel.tiles.map((tile) => {
          const rect = tileRect(tile, grid);
          return (
            <Rect
              key={tileKey(tile)}
              x={rect.x}
              y={rect.y}
              width={rect.s}
              height={rect.s}
              fill={color}
              opacity={alpha}
              listening={false}
            />
          );
        })}
      </>
    );
  }
  if (travel.family === "heal" || travel.family === "social") {
    return <Circle x={travel.to.x} y={travel.to.y} radius={18 + progress * 10} stroke="#8ee0a0" strokeWidth={3} opacity={1 - progress} listening={false} />;
  }
  const x = travel.from.x + (travel.to.x - travel.from.x) * progress;
  const y = travel.from.y + (travel.to.y - travel.from.y) * progress;
  if (travel.family === "swing") {
    return (
      <Line
        points={[travel.from.x, travel.from.y, travel.to.x, travel.to.y]}
        stroke={color}
        strokeWidth={4}
        opacity={1 - progress * 0.4}
        lineCap="round"
        listening={false}
      />
    );
  }
  if (travel.family === "ray") {
    return (
      <>
        <Line points={[travel.from.x, travel.from.y, x, y]} stroke={color} strokeWidth={3} listening={false} />
        <Circle x={x} y={y} radius={6} fill={color} listening={false} />
      </>
    );
  }
  return <Circle x={x} y={y} radius={travel.family === "thrown" ? 5 : 3} fill={color} listening={false} />;
}

function travelColor(damageType: string, family: Family): string {
  const type = damageType.toLowerCase();
  if (type === "fire" || family === "burst") return "rgba(255, 120, 30, 0.85)";
  if (type === "cold") return "rgba(170, 220, 255, 0.8)";
  if (type === "lightning") return "rgba(230, 230, 255, 0.9)";
  if (type === "thunder") return "rgba(180, 180, 210, 0.75)";
  if (type === "acid") return "rgba(170, 200, 40, 0.8)";
  if (type === "poison") return "rgba(80, 170, 60, 0.8)";
  return "rgba(230, 210, 160, 0.9)";
}

export function MarkLayer({ marks }: { marks: Mark[] }) {
  return (
    <>
      {marks.map((mark) => {
        const color = MARK_COLOR[mark.kind] || MARK_COLOR.dust;
        if (color.endsWith("0.0)")) return null;
        return (
          <Group key={mark.id} x={mark.x} y={mark.y} listening={false}>
            <Circle radius={mark.kind === "blood" ? 7 : 10} fill={color} />
            {mark.kind === "blood" && <Circle x={6} y={-3} radius={3} fill={color} />}
            {mark.kind === "poison" && <Circle radius={14} stroke={color} strokeWidth={2} />}
          </Group>
        );
      })}
    </>
  );
}

export function RulingChip({ x, y, text }: { x: number; y: number; text: string }) {
  return <Text x={x} y={y - 28} text={text} fill="#f4e2b0" fontSize={13} listening={false} />;
}
