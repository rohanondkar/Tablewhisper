import catalog from "./attackPresentation.json";

type AttackLike = { id: string; label: string; family: string; damageType: string };

export type Presentation = {
  motion: string;
  sound: string;
  seconds: number;
  sheet: string;
  animation: string;
};

type MotionInfo = { sound: string; seconds: number; sheet: string; animation: string };

const data = catalog as {
  byKey: Record<string, Presentation>;
  motions: Record<string, MotionInfo>;
};

const ALIASES: Record<string, string> = {
  claws: "claw",
  bites: "bite",
  tentacles: "tentacle",
  talons: "talon",
  hooves: "hoof",
  horns: "horn",
  tusks: "tusk",
};

export function foldAttackName(name: string): string {
  const text = name
    .replace(/\s*\([^)]*\)/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return ALIASES[text] || text;
}

function fromMotion(motion: string): Presentation {
  const info = data.motions[motion] || data.motions.slash;
  return { motion, sound: info.sound, seconds: info.seconds, sheet: info.sheet, animation: info.animation };
}

function infer(action: AttackLike): string {
  const name = foldAttackName(action.label);
  const damage = (action.damageType || "").toLowerCase();
  if (/breath|spray|hurl flame|steam/.test(name)) {
    if (name.includes("steam")) return "fire";
    if (damage && data.motions[damage]) return damage === "healing" ? "heal" : damage;
    return "fire";
  }
  if (action.family === "thrown") return name === "net" ? "net" : "thrown";
  if (action.family === "shot") {
    if (name.includes("crossbow")) return "crossbow";
    if (name.includes("sling") || name === "rock") return "sling";
    if (name.includes("blowgun")) return "blowgun";
    return "bow";
  }
  if (action.family === "heal" || damage === "healing") return "heal";
  if (action.id.startsWith("spell-") && data.byKey[name]) return data.byKey[name].motion;
  if (damage === "fire") return "fire";
  if (damage === "cold") return "cold";
  if (damage === "lightning") return "lightning";
  if (damage === "acid") return "acid";
  if (damage === "poison") return "poison";
  if (damage === "necrotic") return "necrotic";
  if (damage === "psychic") return "psychic";
  if (damage === "piercing") return "stab";
  if (damage === "bludgeoning") return "blunt";
  if (action.family === "swing") return "slash";
  return "other";
}

export function presentAction(action: AttackLike): Presentation {
  const name = foldAttackName(action.label);
  const damage = (action.damageType || "").toLowerCase();
  const keys = [
    /breath|spray|hurl flame|steam/.test(name) ? `${name}|${damage || "fire"}` : "",
    action.family === "thrown" ? `${name}|thrown` : "",
    name,
  ].filter(Boolean);
  for (const key of keys) {
    const hit = data.byKey[key];
    if (hit) return hit;
  }
  return fromMotion(infer(action));
}

export function attackIsMagical(action: AttackLike): boolean {
  const name = foldAttackName(action.label);
  return action.id.startsWith("spell-") || /breath|spray|hurl flame|steam/.test(name);
}
