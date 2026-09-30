import type { Character, MapToken } from "../api";
import { readEffects } from "./tokenEffects";

export type TokenLooks = {
  opacity: number;
  tint?: string;
  ring?: string;
  ringWidth: number;
  dash: boolean;
  ghosts: number;
  halo?: string;
  slash: boolean;
  blindfold: boolean;
  clamps: boolean;
  speed: boolean;
  chevron: boolean;
  pale: boolean;
  pips: { label: string; color: string }[];
};

type Piece = {
  rank: number;
  opacity?: number;
  tint?: string;
  ring?: string;
  ringWidth?: number;
  dash?: boolean;
  ghosts?: number;
  halo?: string;
  slash?: boolean;
  blindfold?: boolean;
  clamps?: boolean;
  speed?: boolean;
  pip: string;
  pipColor: string;
};

const RULES: { test: RegExp; piece: Piece }[] = [
  { test: /greater invisibility|\binvisib|hidden|cloak of invisibility/i, piece: { rank: 100, opacity: 0.35, ring: "#e8f4ff", ringWidth: 2, dash: true, pip: "Unseen", pipColor: "#d7ecff" } },
  { test: /elvenkind|pass without trace|\bstealth\b/i, piece: { rank: 80, opacity: 0.72, tint: "rgba(70, 110, 90, 0.35)", ring: "#9dccb0", ringWidth: 2, dash: true, pip: "Stealth", pipColor: "#b7e2c8" } },
  { test: /paralyz|stunned|unconscious/i, piece: { rank: 70, opacity: 0.55, ring: "#c9d0dc", ringWidth: 3, pip: "Still", pipColor: "#d5dbe6" } },
  { test: /petrif/i, piece: { rank: 66, tint: "rgba(140, 140, 148, 0.55)", ring: "#9a9aa2", ringWidth: 3, pip: "Stone", pipColor: "#c8c8ce" } },
  { test: /\brage\b|berserk|reckless/i, piece: { rank: 60, tint: "rgba(180, 30, 30, 0.38)", ring: "#ff3b3b", ringWidth: 4, pip: "Rage", pipColor: "#ff8a8a" } },
  { test: /\bblur\b|mirror image/i, piece: { rank: 55, ghosts: 2, ring: "#c9b6ff", ringWidth: 2, pip: "Copies", pipColor: "#d7c8ff" } },
  { test: /faerie fire/i, piece: { rank: 50, halo: "#ff4ad8", ring: "#ff4ad8", ringWidth: 3, pip: "Outlined", pipColor: "#ff9ae8" } },
  { test: /poison/i, piece: { rank: 46, tint: "rgba(40, 140, 50, 0.4)", ring: "#3dcc55", ringWidth: 2, pip: "Poison", pipColor: "#9dffa8" } },
  { test: /charm/i, piece: { rank: 44, tint: "rgba(220, 80, 140, 0.28)", pip: "Charmed", pipColor: "#ffb3d0" } },
  { test: /\bbane\b|\bhex\b|cursed|curse/i, piece: { rank: 43, tint: "rgba(90, 30, 140, 0.38)", pip: "Hex", pipColor: "#d7a6ff" } },
  { test: /bless|heroism/i, piece: { rank: 42, halo: "#f0c14a", pip: "Blessed", pipColor: "#ffe29a" } },
  { test: /burning|on fire|\bablaze\b/i, piece: { rank: 40, ring: "#ff7a18", ringWidth: 4, pip: "Fire", pipColor: "#ffb067" } },
  { test: /\bdodge\b|^shield$|shield of faith/i, piece: { rank: 36, ring: "#7ec8ff", ringWidth: 3, pip: "Ward", pipColor: "#b9e4ff" } },
  { test: /mage armor/i, piece: { rank: 34, ring: "#8b6cff", ringWidth: 3, pip: "Armor", pipColor: "#c4b4ff" } },
  { test: /barkskin/i, piece: { rank: 34, ring: "#8a5a32", ringWidth: 4, pip: "Bark", pipColor: "#e0b48a" } },
  { test: /sanctuary/i, piece: { rank: 33, ring: "#f4f7ff", ringWidth: 3, pip: "Ward", pipColor: "#ffffff" } },
  { test: /\bhaste\b|\bdash\b/i, piece: { rank: 30, speed: true, ring: "#ffe08a", ringWidth: 2, pip: "Fast", pipColor: "#ffe08a" } },
  { test: /grappl|restrain/i, piece: { rank: 28, clamps: true, ring: "#ff5a5a", ringWidth: 2, pip: "Held", pipColor: "#ff9a9a" } },
  { test: /prone|shoved/i, piece: { rank: 26, slash: true, pip: "Down", pipColor: "#ffd0a8" } },
  { test: /fright/i, piece: { rank: 24, pip: "Afraid", pipColor: "#e7e7ef" } },
  { test: /blind/i, piece: { rank: 22, blindfold: true, pip: "Blind", pipColor: "#b0b6c4" } },
  { test: /\bfly(?:ing)?\b/i, piece: { rank: 10, pip: "Fly", pipColor: "#b7e0ff" } },
  { test: /hunter'?s mark/i, piece: { rank: 8, pip: "Mark", pipColor: "#ffb020" } },
  { test: /\baid\b/i, piece: { rank: 0, pip: "Aid", pipColor: "#8dffb0" } },
  { test: /guidance/i, piece: { rank: 0, pip: "Guide", pipColor: "#9fd0ff" } },
  { test: /resistance/i, piece: { rank: 0, pip: "Ward", pipColor: "#d0d6e0" } },
  { test: /longstrider/i, piece: { rank: 0, pip: "Stride", pipColor: "#9dff9a" } },
  { test: /enhance ability/i, piece: { rank: 0, pip: "Boost", pipColor: "#fff1a8" } },
  { test: /second wind/i, piece: { rank: 0, pip: "Wind", pipColor: "#9dffc8" } },
  { test: /\bhelp\b/i, piece: { rank: 0, pip: "Help", pipColor: "#ffe08a" } },
  { test: /disengage/i, piece: { rank: 0, pip: "Slip", pipColor: "#9dffe0" } },
  { test: /darkvision/i, piece: { rank: 0, pip: "Sight", pipColor: "#c7b6ff" } },
];

function pieceFor(name: string): Piece | null {
  return RULES.find((rule) => rule.test.test(name))?.piece || null;
}

function cloakPieces(equipment: Character["equipment"]): Piece[] {
  const worn = (equipment || []).filter((item) => item.state === "attuned");
  const found: Piece[] = [];
  for (const item of worn) {
    const blob = `${item.effect || ""} ${item.name || ""}`;
    if (/invisib/i.test(blob)) {
      found.push({ rank: 20, opacity: 0.82, ring: "#d7ecff", ringWidth: 2, dash: true, pip: "Cloak", pipColor: "#d7ecff" });
    } else if (/elvenkind/i.test(blob)) {
      found.push({ rank: 18, opacity: 0.88, tint: "rgba(70, 110, 90, 0.22)", pip: "Cloak", pipColor: "#b7e2c8" });
    }
  }
  return found;
}

export function looksForNames(names: string[], equipment?: Character["equipment"]): TokenLooks {
  const pieces = [...names.map(pieceFor).filter((item): item is Piece => Boolean(item)), ...cloakPieces(equipment)];
  const lead = pieces.reduce<Piece | null>((best, item) => (!best || item.rank > best.rank ? item : best), null);
  const portrait =
    lead != null &&
    (lead.opacity != null ||
      Boolean(lead.tint || lead.ring || lead.halo) ||
      (lead.ghosts || 0) > 0 ||
      Boolean(lead.slash || lead.blindfold || lead.clamps || lead.speed));
  const chevron = pieces.some((item) => item.pip === "Fly");
  const pips: { label: string; color: string }[] = [];
  for (const item of pieces) {
    if (item.pip === "Fly") continue;
    if (portrait && item === lead) continue;
    if (pips.some((pip) => pip.label === item.pip)) continue;
    pips.push({ label: item.pip, color: item.pipColor });
    if (pips.length >= 4) break;
  }
  return {
    opacity: lead?.opacity ?? 1,
    tint: lead?.tint,
    ring: lead?.ring,
    ringWidth: lead?.ringWidth ?? 2,
    dash: Boolean(lead?.dash),
    ghosts: lead?.ghosts ?? 0,
    halo: lead?.halo,
    slash: Boolean(lead?.slash),
    blindfold: Boolean(lead?.blindfold),
    clamps: Boolean(lead?.clamps),
    speed: Boolean(lead?.speed),
    chevron,
    pale: lead?.pip === "Afraid",
    pips,
  };
}

export function looksForToken(token: MapToken, characters: Character[]): TokenLooks {
  const names = readEffects(token.data).map((effect) => effect.name);
  const sheet = token.kind === "pc" ? characters.find((row) => row.id === token.ref_id) : undefined;
  return looksForNames(names, sheet?.equipment);
}
