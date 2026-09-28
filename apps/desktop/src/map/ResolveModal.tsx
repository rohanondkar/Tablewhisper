import { useState } from "react";
import type { Character, CheckResult, EncounterEnemy, MonsterTemplate, NpcTemplate, SceneNpc } from "../api";
import type { RulingCreature } from "./effects";
import ResolveCard from "./ResolveCard";

export type ResolveRow = {
  key: string;
  label: string;
  creature: RulingCreature | null;
  roll: string;
  /** Saving throw from the creature being hit. */
  save: string;
  info: string;
  /** Faces typed into the printed damage dice, in order. */
  dice: string[];
};

export type PrintedDie = { sides: number };

function amountIn(info: string): number | null {
  const match = info.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function faceOf(roll: string): number | null {
  const value = Number(roll);
  if (!Number.isInteger(value) || value < 1 || value > 20) return null;
  return value;
}

export function attackConnects(result: CheckResult, face: number): boolean {
  if (face === 1) return false;
  if (face === 20) return true;
  if (result.to_hit_needed == null) return true;
  return face >= result.to_hit_needed;
}

/** A hit that doubles the weapon's damage dice. Modifiers are added once. */
export function attackCrit(result: CheckResult, face: number): boolean {
  if (!attackConnects(result, face)) return false;
  if (face === 20) return true;
  const note = result.crit_note || "";
  if (face === 19 && /improved critical|\b19\b/i.test(note)) return true;
  if (/paralyz|unconscious/i.test(note) && /critical hit/i.test(note)) return true;
  return false;
}

export function printedSaveBonus(result: CheckResult, creature: RulingCreature | null | undefined): number | null {
  const ability = result.save_ability;
  if (!ability || !creature) return null;
  const listed = creature.saves?.[ability];
  if (typeof listed === "number") return listed;
  if (listed && typeof listed.modifier === "number") return listed.modifier;
  const score = creature.abilities?.[ability];
  if (typeof score === "number") return Math.floor((score - 10) / 2);
  if (score && typeof score.modifier === "number") return score.modifier;
  if (score && typeof score.score === "number") return Math.floor((score.score - 10) / 2);
  return null;
}

export function saveSucceeds(result: CheckResult, face: number, bonus: number | null = null): boolean | null {
  if (result.suggested_dc == null) return null;
  const mod = bonus != null ? bonus : (result.modifier ?? 0);
  return face + mod >= result.suggested_dc;
}

function flatPrinted(formula: string | null | undefined): number | null {
  if (!formula || /\d+\s*d\s*\d+/i.test(formula)) return null;
  const flat = formula.match(/^\s*([+-]?\d+)\b/);
  if (!flat || flat.index == null) return null;
  let total = Number(flat[1]);
  if (!Number.isFinite(total)) return null;
  const rest = formula.slice(flat.index + flat[0].length);
  for (const mod of rest.matchAll(/([+-])\s*(\d+)/g)) {
    const value = Number(mod[2]);
    if (!Number.isFinite(value)) continue;
    total += mod[1] === "-" ? -value : value;
  }
  return Math.max(0, total);
}

export function parsePrintedDice(formula: string | null | undefined): { dice: PrintedDie[]; modifier: number } {
  if (!formula) return { dice: [], modifier: 0 };
  const dice: PrintedDie[] = [];
  for (const pool of formula.matchAll(/(\d+)\s*d\s*(\d+)/gi)) {
    const count = Number(pool[1]);
    const sides = Number(pool[2]);
    if (!Number.isInteger(count) || !Number.isInteger(sides) || count < 1 || count > 40 || sides < 2 || sides > 100) {
      continue;
    }
    for (let i = 0; i < count; i += 1) dice.push({ sides });
  }
  let modifier = 0;
  const leftover = formula.replace(/\d+\s*d\s*\d+/gi, " ");
  for (const mod of leftover.matchAll(/([+-])\s*(\d+)/g)) {
    const value = Number(mod[2]);
    if (!Number.isFinite(value)) continue;
    modifier += mod[1] === "-" ? -value : value;
  }
  return { dice, modifier };
}

export function shownDice(formula: string | null | undefined, crit = false): PrintedDie[] {
  const { dice } = parsePrintedDice(formula);
  return crit ? [...dice, ...dice] : dice;
}

export function dieFace(roll: string | undefined, sides: number): number | null {
  const value = Number(roll);
  if (!Number.isInteger(value) || value < 1 || value > sides) return null;
  return value;
}

function acceptDie(raw: string, sides: number): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const value = Number(digits);
  if (!Number.isInteger(value) || value < 1 || value > sides) {
    return digits.length > 1 ? acceptDie(digits.slice(0, -1), sides) : "";
  }
  return String(value);
}

export function facesReady(faces: string[], dice: PrintedDie[]): boolean {
  return dice.every((die, index) => dieFace(faces[index], die.sides) != null);
}

/** Faces the DM typed, plus the printed modifier. Empty dice means the number is not ready. */
export function sumEnteredDice(formula: string | null | undefined, faces: string[], crit = false): number | null {
  const { dice, modifier } = parsePrintedDice(formula);
  if (!dice.length) return flatPrinted(formula);
  const needed = shownDice(formula, crit);
  let total = modifier;
  for (let index = 0; index < needed.length; index += 1) {
    const face = dieFace(faces[index], needed[index].sides);
    if (face == null) return null;
    total += face;
  }
  return Math.max(0, total);
}

export function rollPrintedDamage(formula: string | null | undefined, crit = false): number | null {
  if (!formula) return null;
  const pools = [...formula.matchAll(/(\d+)\s*d\s*(\d+)/gi)];
  if (!pools.length) return flatPrinted(formula);
  let total = 0;
  for (const pool of pools) {
    const count = Number(pool[1]);
    const sides = Number(pool[2]);
    if (!Number.isInteger(count) || !Number.isInteger(sides) || count < 1 || count > 40 || sides < 2 || sides > 100) {
      return null;
    }
    const times = crit ? count * 2 : count;
    for (let i = 0; i < times; i += 1) total += 1 + Math.floor(Math.random() * sides);
  }
  const leftover = formula.replace(/\d+\s*d\s*\d+/gi, " ");
  for (const mod of leftover.matchAll(/([+-])\s*(\d+)/g)) {
    const value = Number(mod[2]);
    if (!Number.isFinite(value)) continue;
    total += mod[1] === "-" ? -value : value;
  }
  return Math.max(0, total);
}

export function saveHalves(result: CheckResult): boolean {
  const text = `${result.notes || ""} ${result.howto || ""} ${result.roll_line || ""}`;
  return /\bhalf\b/i.test(text);
}

export type Strike =
  | { kind: "pending" }
  | { kind: "stay" }
  | { kind: "miss" }
  | { kind: "damage"; amount: number };

/** True when the action missed or the check failed for everyone it touched. */
export function effortFailed(result: CheckResult, rows: ResolveRow[], strikes: (Strike | null)[] | null): boolean {
  if (result.check_type === "skill" || result.check_type === "ability") {
    if (result.suggested_dc == null) return false;
    const faces = rows.map((row) => faceOf(row.roll)).filter((face): face is number => face != null);
    if (!faces.length) return false;
    return faces.every((face) => face + (result.modifier ?? 0) < (result.suggested_dc as number));
  }
  if (result.check_type === "attack") {
    const judged = (strikes || []).filter((strike): strike is Strike => strike != null);
    if (!judged.length) return false;
    return judged.every((strike) => strike.kind === "miss");
  }
  if (result.check_type === "save") {
    const judged = rows.filter((row) => faceOf(row.roll) != null);
    if (!judged.length) return false;
    return judged.every((row) => {
      const face = faceOf(row.roll) as number;
      const saved = saveSucceeds(result, face, printedSaveBonus(result, row.creature));
      if (!saved) return false;
      if (saveHalves(result)) return false;
      return true;
    });
  }
  return false;
}

export function strikeOutcome(
  result: CheckResult,
  roll: string,
  info: string,
  saveRoll = "",
  saveBonus: number | null = null,
  faces: string[] = [],
): Strike {
  const typedEarly = amountIn(info);
  if (result.check_type === "save" && result.suggested_dc == null && faceOf(roll) == null) {
    if (typedEarly == null) return { kind: "pending" };
    return typedEarly <= 0 ? { kind: "stay" } : { kind: "damage", amount: typedEarly };
  }
  const face = faceOf(roll);
  if (face == null) return { kind: "pending" };
  const typed = amountIn(info);
  const printed = (crit = false) => typed ?? sumEnteredDice(result.damage, faces, crit);
  if (result.check_type === "attack") {
    if (!attackConnects(result, face)) return { kind: "miss" };
    if (typed == null && parsePrintedDice(result.damage).dice.length && sumEnteredDice(result.damage, faces, attackCrit(result, face)) == null) {
      return { kind: "pending" };
    }
    const amount = printed(attackCrit(result, face));
    if (amount == null) return { kind: "stay" };
    return { kind: "damage", amount };
  }
  if (result.check_type === "save") {
    const saved = saveSucceeds(result, face, saveBonus);
    const needsDice = typed == null && parsePrintedDice(result.damage).dice.length > 0;
    const amount = printed();
    if (saved && !saveHalves(result)) return { kind: "stay" };
    if (needsDice && amount == null) return { kind: "pending" };
    if (saved == null) {
      if (typed != null) return typed <= 0 ? { kind: "stay" } : { kind: "damage", amount: typed };
      if (amount == null) return { kind: "stay" };
      return { kind: "damage", amount };
    }
    if (saved && saveHalves(result)) {
      if (amount == null) return { kind: "stay" };
      const half = Math.floor(amount / 2);
      if (half <= 0) return { kind: "stay" };
      return { kind: "damage", amount: half };
    }
    if (amount == null) return { kind: "stay" };
    if (amount <= 0) return { kind: "stay" };
    return { kind: "damage", amount };
  }
  if (typed == null) return { kind: "pending" };
  return typed <= 0 ? { kind: "stay" } : { kind: "damage", amount: typed };
}

function damagePreview(result: CheckResult, row: ResolveRow, crit = false): string {
  const typed = amountIn(row.info);
  if (typed != null) return String(typed);
  const rolled = sumEnteredDice(result.damage, row.dice || [], crit);
  return rolled == null ? "" : String(rolled);
}

function damageWait(result: CheckResult): string {
  return parsePrintedDice(result.damage).dice.length ? "Enter the damage dice." : "Type the damage in additional info.";
}

function spellDamageLine(result: CheckResult, label: string, info: string, faces: string[]): string {
  const typed = amountIn(info);
  if (typed != null) return `${typed} shows on ${label}.`;
  const rolled = sumEnteredDice(result.damage, faces, false);
  return rolled == null ? `Enter the damage dice.` : `${rolled} shows on ${label}.`;
}

export function rowOutcome(result: CheckResult, heal: boolean, row: ResolveRow): string {
  if (result.check_type === "save" && result.suggested_dc == null && faceOf(row.roll) == null) {
    const amount = amountIn(row.info);
    if (amount == null) return `${row.label}: type the damage. No save DC is printed on this card.`;
    return `${row.label}: ${amount} shows on ${row.label}.`;
  }
  const face = faceOf(row.roll);
  if (face == null) return "Enter the d20.";
  const amount = amountIn(row.info);
  if (heal) {
    const healing = amount ?? face;
    return `${row.label} regains ${healing}.`;
  }
  if (result.check_type === "attack") {
    const attacker = result.character || "The attacker";
    if (!attackConnects(result, face)) return `${attacker} misses ${row.label}. Hit points stay.`;
    const preview = damagePreview(result, row, attackCrit(result, face));
    if (!preview) return `${attacker} hits. ${damageWait(result)}`;
    return amount != null
      ? `${attacker} hits for ${amount}. That number shows on ${row.label}.`
      : `${attacker} hits. ${preview} shows on ${row.label}.`;
  }
  if (result.check_type === "save") {
    const bonus = printedSaveBonus(result, row.creature);
    const saved = saveSucceeds(result, face, bonus);
    const verdict = saved == null ? "no DC on this card" : saved ? "succeeds" : "fails";
    const preview = damagePreview(result, row);
    if (saved == null && amount == null && !preview) return `${row.label} ${verdict}. Hit points stay until a damage number is entered.`;
    if (saved && !saveHalves(result)) return `${row.label} ${verdict}. Hit points stay.`;
    if (saved && saveHalves(result)) {
      return preview
        ? `${row.label} ${verdict}. Half of ${preview} shows on ${row.label}.`
        : `${row.label} ${verdict}. ${damageWait(result)}`;
    }
    return preview
      ? `${row.label} ${verdict}. ${preview} shows on ${row.label}.`
      : `${row.label} ${verdict}. ${damageWait(result)}`;
  }
  if (result.suggested_dc != null) {
    const total = face + (result.modifier ?? 0);
    const ok = total >= result.suggested_dc;
    return `${row.label}: ${face}${result.modifier != null ? ` ${result.modifier >= 0 ? "+" : ""}${result.modifier}` : ""} = ${total} vs DC ${result.suggested_dc}. ${ok ? "Success." : "Failure."}`;
  }
  return `${row.label}: d20 ${face}.`;
}

function skillTitle(result: CheckResult): string {
  const raw = result.skill || result.ability || "check";
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function socialAsk(result: CheckResult): "seduce" | "persuade" | "deceive" | "intimidate" | "" {
  const blob = `${result.skill || ""} ${result.notes || ""} ${result.roll_line || ""}`.toLowerCase();
  if (/\bseduc/.test(blob)) return "seduce";
  if (/persuasion|\bpersuad|\bcharm/.test(blob)) return "persuade";
  if (/deception|\bdeceiv/.test(blob)) return "deceive";
  if (/intimidation|\bintimidat/.test(blob)) return "intimidate";
  return "";
}

function socialEnding(ask: ReturnType<typeof socialAsk>, ok: boolean): string {
  if (ask === "seduce") return ok ? "is seduced" : "is not seduced";
  if (ask === "persuade") return ok ? "is persuaded" : "is not persuaded";
  if (ask === "deceive") return ok ? "is deceived" : "is not deceived";
  if (ask === "intimidate") return ok ? "is intimidated" : "is not intimidated";
  return ok ? "succeeds" : "fails";
}

function damageWords(result: CheckResult, amount: number, face: number): string {
  const raw = (result.damage || "").trim();
  const type = raw
    .replace(/\d+\s*d\s*\d+/gi, " ")
    .replace(/[+-]\s*\d+/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const printed = type ? `${amount} ${type.toLowerCase()}` : String(amount);
  if (attackCrit(result, face) && /\d+\s*d\s*\d+/i.test(raw)) {
    return `The critical doubles the dice. The strike is ${printed}, so they take ${amount}.`;
  }
  if (attackCrit(result, face)) return `The strike is ${printed}. The critical has no dice to double, so they take ${amount}.`;
  return `The strike is ${printed}, so they take ${amount}.`;
}

/** One play sentence for the Log, using only numbers already on the card. */
export function playFate(
  result: CheckResult,
  row: ResolveRow,
  opts: { heal?: number | null; strike?: Strike | null } = {},
): string | null {
  if (opts.heal != null) return `${row.label} regains ${opts.heal}.`;
  const face = faceOf(row.roll);
  if (face == null) return null;
  const who = result.character || "They";
  const target = row.label;

  if (result.check_type === "skill" || result.check_type === "ability") {
    if (result.suggested_dc == null) return "No number to beat is printed, so this does not decide it.";
    const total = face + (result.modifier ?? 0);
    const ok = total >= result.suggested_dc;
    return `${who}'s ${skillTitle(result)} is ${total} against DC ${result.suggested_dc}. ${target} ${socialEnding(socialAsk(result), ok)}.`;
  }

  if (result.check_type === "attack") {
    const ac = result.target?.ac;
    if (!attackConnects(result, face)) {
      return ac != null
        ? `${who}'s ${face} misses ${target}'s AC ${ac}. They take nothing.`
        : `${who}'s ${face} misses ${target}. They take nothing.`;
    }
    if (opts.strike?.kind === "damage") {
      return `${who}'s ${face} hits ${target}. ${damageWords(result, opts.strike.amount, face)}`.replace(/\s+/g, " ").trim();
    }
    return `${who}'s ${face} hits ${target}. ${result.damage ? "They take nothing." : "No damage is printed, so they take nothing."}`.replace(/\s+/g, " ").trim();
  }

  if (result.check_type === "save") {
    const bonus = printedSaveBonus(result, row.creature);
    const saved = saveSucceeds(result, face, bonus);
    const rolled = bonus == null ? `${face}` : `${face} ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)} is ${face + bonus}`;
    if (saved == null) {
      if (opts.strike?.kind === "damage") return `${target} takes ${opts.strike.amount}. No save DC is printed.`;
      return "No number to beat is printed, so this does not decide it.";
    }
    if (saved && saveHalves(result) && opts.strike?.kind === "damage") {
      return `${target}'s ${rolled} succeeds against DC ${result.suggested_dc}, so they take half, ${opts.strike.amount}.`;
    }
    if (saved) return `${target}'s ${rolled} succeeds against DC ${result.suggested_dc}. They take nothing.`;
    if (opts.strike?.kind === "damage") {
      return `${target}'s ${rolled} fails against DC ${result.suggested_dc}. They take ${opts.strike.amount}.`;
    }
    return `${target}'s ${rolled} fails against DC ${result.suggested_dc}. They take nothing.`;
  }

  return null;
}

function givenName(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 2 && /^\d+$/.test(parts[1])) return parts.join(" ");
  return parts[0] || label;
}

/** The one line that stays on the map: who it happened to, and what happened. */
export function mapLine(
  result: CheckResult,
  row: ResolveRow,
  opts: { heal?: number | null; strike?: Strike | null } = {},
): string | null {
  const name = givenName(row.label);
  if (opts.heal != null) return `${name} regained ${opts.heal}.`;
  const face = faceOf(row.roll);
  const dealt = opts.strike?.kind === "damage" ? opts.strike.amount : null;

  if (result.check_type === "spell") {
    return dealt == null ? null : `${name} took ${dealt} damage.`;
  }
  if (face == null) return null;

  if (result.check_type === "skill" || result.check_type === "ability") {
    if (result.suggested_dc == null) return null;
    const ok = face + (result.modifier ?? 0) >= result.suggested_dc;
    const ask = socialAsk(result);
    if (ask === "seduce") return ok ? `${name} was seduced.` : `${name} was not seduced.`;
    if (ask === "persuade") return ok ? `${name} was persuaded.` : `${name} was not persuaded.`;
    if (ask === "deceive") return ok ? `${name} was deceived.` : `${name} was not deceived.`;
    if (ask === "intimidate") return ok ? `${name} was intimidated.` : `${name} was not intimidated.`;
    const skill = skillTitle(result);
    return ok ? `${name} succeeded at ${skill}.` : `${name} failed ${skill}.`;
  }

  if (result.check_type === "attack") {
    if (!attackConnects(result, face)) return `${name} was missed.`;
    return dealt == null ? `${name} was hit.` : `${name} took ${dealt} damage.`;
  }

  if (result.check_type === "save") {
    if (dealt != null) return `${name} took ${dealt} damage.`;
    const saved = saveSucceeds(result, face, printedSaveBonus(result, row.creature));
    if (saved == null) return null;
    return saved ? `${name} resisted.` : `${name} failed the save.`;
  }

  return null;
}

function dieClass(sides: number): string {
  if (sides === 4) return "die-d4";
  if (sides === 6) return "die-d6";
  if (sides === 8) return "die-d8";
  if (sides === 10) return "die-d10";
  if (sides === 12) return "die-d12";
  if (sides === 20) return "die-d20";
  return "die-d100";
}

function DieFace({
  sides,
  value,
  onChange,
}: {
  sides: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="die-face">
      <span className={`die-shape ${dieClass(sides)}`}>
        <input
          className="resolve-die-input"
          inputMode="numeric"
          aria-label={`d${sides}`}
          value={value}
          onChange={(event) => onChange(acceptDie(event.target.value, sides))}
        />
      </span>
      <span className="die-caption">d{sides}</span>
    </label>
  );
}

function DamageDice({
  dice,
  faces,
  onChange,
  modifier,
}: {
  dice: PrintedDie[];
  faces: string[];
  onChange: (index: number, value: string) => void;
  modifier: number;
}) {
  if (!dice.length && modifier === 0) return null;
  return (
    <>
      {dice.map((die, index) => (
        <DieFace
          key={`${die.sides}-${index}`}
          sides={die.sides}
          value={faces[index] || ""}
          onChange={(value) => onChange(index, value)}
        />
      ))}
      {modifier !== 0 && <span className="die-mod">{modifier > 0 ? `+${modifier}` : String(modifier)}</span>}
    </>
  );
}

export default function ResolveModal({
  result,
  blocked,
  notice,
  heal,
  creatures,
  characters,
  scene,
  npcs,
  encounter,
  monsters,
  apiBase,
  busy,
  onCancel,
  onSubmit,
}: {
  result: CheckResult;
  blocked: string | null;
  notice: string | null;
  heal: boolean;
  creatures: RulingCreature[];
  characters: Character[];
  scene: SceneNpc[];
  npcs: NpcTemplate[];
  encounter: EncounterEnemy[];
  monsters: MonsterTemplate[];
  apiBase: string;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (rows: ResolveRow[]) => void;
}) {
  const [rows, setRows] = useState<ResolveRow[]>(() => {
    const list = creatures.length
      ? creatures
      : [null];
    return list.map((creature, index) => ({
      key: creature?.key || `open-${index}`,
      label: creature?.label || "Open ground",
      creature,
      roll: "",
      save: "",
      info: "",
      dice: [],
    }));
  });
  const [attackRoll, setAttackRoll] = useState("");
  const [damageFaces, setDamageFaces] = useState<string[]>([]);

  function patch(key: string, field: "roll" | "save" | "info", value: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  function setSharedFace(index: number, value: string) {
    setDamageFaces((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  }

  function setRowDie(key: string, index: number, value: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const dice = (row.dice || []).slice();
        dice[index] = value;
        return { ...row, dice };
      }),
    );
  }

  const formula = parsePrintedDice(result.damage);
  const spellDice = !heal && result.check_type === "spell" && formula.dice.length > 0;
  const quiet = result.check_type === "contest" || (result.check_type === "spell" && !spellDice);
  const printedRoll = /\d+\s*d\s*\d+/i.test(result.damage || "") || flatPrinted(result.damage) != null;
  const typedDamage = result.check_type === "save" && result.suggested_dc == null && !printedRoll;
  const needsAttack = !heal && result.check_type === "attack";
  const needsSave = !heal && !typedDamage && result.check_type === "save";
  const attackerName = result.character || "Attacker";
  const attackFace = faceOf(attackRoll);
  const attackIsCrit = needsAttack && attackFace != null && attackCrit(result, attackFace);
  const attackHits = needsAttack && attackFace != null && attackConnects(result, attackFace);
  const attackDice = shownDice(result.damage, attackIsCrit);
  const ready = blocked
    ? false
    : quiet ||
      ((!needsAttack || attackFace != null) &&
        (!attackHits || !attackDice.length || rows.every((row) => amountIn(row.info) != null) || facesReady(damageFaces, attackDice)) &&
        (!spellDice || rows.every((row) => amountIn(row.info) != null) || facesReady(damageFaces, formula.dice)) &&
        rows.every((row) => {
          if (typedDamage) return amountIn(row.info) != null;
          if (needsAttack || spellDice) return true;
          if (faceOf(row.roll) == null) return false;
          if (!needsSave || !formula.dice.length || amountIn(row.info) != null) return true;
          const saved = saveSucceeds(result, faceOf(row.roll) as number, printedSaveBonus(result, row.creature));
          if (saved && !saveHalves(result)) return true;
          return facesReady(row.dice || [], formula.dice);
        }));

  function filledRow(row: ResolveRow): ResolveRow {
    return {
      ...row,
      roll: needsAttack ? attackRoll : row.roll,
      dice: needsAttack || spellDice ? damageFaces : row.dice || [],
    };
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="resolve-modal-wrap" role="dialog" aria-modal="true" aria-label="Resolve check">
        <ResolveCard
          result={result}
          characters={characters}
          scene={scene}
          npcs={npcs}
          encounter={encounter}
          monsters={monsters}
          apiBase={apiBase}
        >
          {blocked && <p className="resolve-blocked">{blocked}</p>}
          {notice && <p className="muted small">{notice}</p>}
          {!blocked && !quiet && needsAttack && (
            <div className="resolve-row">
              <strong>{attackerName}</strong>
              <div className="die-tray">
                <DieFace sides={20} value={attackRoll} onChange={setAttackRoll} />
                <DamageDice
                  dice={attackDice}
                  faces={damageFaces}
                  onChange={setSharedFace}
                  modifier={formula.modifier}
                />
              </div>
              <p className="muted small">The person hitting rolls the d20 against armor class. Fill each damage die.</p>
            </div>
          )}
          {!blocked && spellDice && (
            <div className="resolve-row">
              <strong>Damage</strong>
              <div className="die-tray">
                <DamageDice
                  dice={formula.dice}
                  faces={damageFaces}
                  onChange={setSharedFace}
                  modifier={formula.modifier}
                />
              </div>
            </div>
          )}
          {!blocked && (spellDice || !quiet) &&
            rows.map((row) => (
              <div key={row.key} className="resolve-row">
                <strong>{row.label}</strong>
                {!needsAttack && !spellDice && (
                <label className="resolve-die">
                  {heal
                    ? "Healing"
                    : typedDamage
                      ? "Damage"
                      : result.check_type === "skill" || result.check_type === "ability"
                        ? skillTitle(result)
                        : "Saving throw"}
                  {!typedDamage && !heal && (
                    <div className="die-tray">
                      <DieFace sides={20} value={row.roll} onChange={(value) => patch(row.key, "roll", value)} />
                      {needsSave && (
                        <DamageDice
                          dice={formula.dice}
                          faces={row.dice || []}
                          onChange={(index, value) => setRowDie(row.key, index, value)}
                          modifier={formula.modifier}
                        />
                      )}
                    </div>
                  )}
                  {(typedDamage || heal) && (
                    <input
                      type="text"
                      placeholder={heal ? "Healing" : "Damage"}
                      value={row.info}
                      onChange={(event) => patch(row.key, "info", event.target.value)}
                    />
                  )}
                </label>
                )}
                {!typedDamage && (
                  <label className="resolve-note">
                    Additional info
                    <input
                      type="text"
                      placeholder={heal ? "Healing, or a note" : "Damage, half, or a note"}
                      value={row.info}
                      onChange={(event) => patch(row.key, "info", event.target.value)}
                    />
                  </label>
                )}
                <p className="muted small">
                  {spellDice
                    ? spellDamageLine(result, row.label, row.info, damageFaces)
                    : rowOutcome(result, heal, filledRow(row))}
                </p>
              </div>
            ))}
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !ready}
              onClick={() => {
                const submitted = rows.map((row) => filledRow(row));
                onSubmit(submitted);
              }}
            >
              Submit
            </button>
            <button type="button" className="btn ghost" onClick={onCancel}>
              Close
            </button>
          </div>
        </ResolveCard>
      </div>
    </div>
  );
}

export { amountIn };

export function HitEntry({
  result,
  creatures,
  heal,
  busy,
  onApply,
  onMiss,
  onFate,
}: {
  result: CheckResult;
  creatures: RulingCreature[];
  heal: boolean;
  busy?: boolean;
  onApply: (creature: RulingCreature, amount: number) => void;
  onMiss?: (creature: RulingCreature) => void;
  onFate?: (line: string) => void;
}) {
  const social = !heal && (result.check_type === "skill" || result.check_type === "ability");
  const seeded = creatures.length
    ? creatures
    : result.target?.id
      ? [
          {
            key: result.target.id,
            tokenId: null,
            refId: result.target.id,
            kind: result.target.kind || "character",
            label: result.target.label,
            tile: null,
          } satisfies RulingCreature,
        ]
      : social
        ? [
            {
              key: "check",
              tokenId: null,
              refId: null,
              kind: "custom",
              label: result.target?.label || "They",
              tile: null,
            } satisfies RulingCreature,
          ]
        : [];
  const [rows, setRows] = useState<ResolveRow[]>(() =>
    seeded.map((creature) => ({
      key: creature.key,
      label: creature.label,
      creature,
      roll: "",
      save: "",
      info: "",
      dice: [],
    }))
  );
  const [attackRoll, setAttackRoll] = useState("");
  const [damageFaces, setDamageFaces] = useState<string[]>([]);
  if (!seeded.length) return null;
  const needsAttack = !heal && result.check_type === "attack";
  const needsSave = !heal && result.check_type === "save";
  const formula = parsePrintedDice(result.damage);
  const attackFace = faceOf(attackRoll);
  const attackIsCrit = needsAttack && attackFace != null && attackCrit(result, attackFace);
  const attackHits = needsAttack && attackFace != null && attackConnects(result, attackFace);
  const attackDice = shownDice(result.damage, attackIsCrit);
  const spellDice = !heal && result.check_type === "spell" && formula.dice.length > 0;
  const ready =
    (!needsAttack || attackFace != null) &&
    (!attackHits || !attackDice.length || rows.every((row) => amountIn(row.info) != null) || facesReady(damageFaces, attackDice)) &&
    (!spellDice || rows.every((row) => amountIn(row.info) != null) || facesReady(damageFaces, formula.dice)) &&
    rows.every((row) => {
      if (needsAttack || spellDice) return true;
      if (heal) return faceOf(row.roll) != null || amountIn(row.info) != null;
      if (faceOf(row.roll) == null) return false;
      if (!needsSave || !formula.dice.length || amountIn(row.info) != null) return true;
      const saved = saveSucceeds(result, faceOf(row.roll) as number, printedSaveBonus(result, row.creature));
      if (saved && !saveHalves(result)) return true;
      return facesReady(row.dice || [], formula.dice);
    });
  function setSharedFace(index: number, value: string) {
    setDamageFaces((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  }
  function setRowDie(key: string, index: number, value: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const dice = (row.dice || []).slice();
        dice[index] = value;
        return { ...row, dice };
      }),
    );
  }
  function filled(row: ResolveRow): ResolveRow {
    return {
      ...row,
      roll: needsAttack ? attackRoll : row.roll,
      dice: needsAttack || spellDice ? damageFaces : row.dice || [],
    };
  }
  return (
    <div className="ruling-boxes">
      <p className="muted small" style={{ margin: 0 }}>
        Type each die. A number in additional info is used instead of the damage dice.
      </p>
      {needsAttack && (
        <div className="resolve-row">
          <strong>{result.character || "Attacker"}</strong>
          <div className="die-tray">
            <DieFace sides={20} value={attackRoll} onChange={setAttackRoll} />
            <DamageDice dice={attackDice} faces={damageFaces} onChange={setSharedFace} modifier={formula.modifier} />
          </div>
        </div>
      )}
      {spellDice && (
        <div className="resolve-row">
          <strong>Damage</strong>
          <div className="die-tray">
            <DamageDice dice={formula.dice} faces={damageFaces} onChange={setSharedFace} modifier={formula.modifier} />
          </div>
        </div>
      )}
      {rows.map((row) => (
        <div key={row.key} className="resolve-row">
          <strong>{row.label}</strong>
          {!needsAttack && !spellDice && !heal && (
          <label className="resolve-die">
            {needsSave ? "Saving throw" : social ? skillTitle(result) : "Check"}
            <div className="die-tray">
              <DieFace
                sides={20}
                value={row.roll}
                onChange={(value) =>
                  setRows((prev) => prev.map((item) => (item.key === row.key ? { ...item, roll: value } : item)))
                }
              />
              {needsSave && (
                <DamageDice
                  dice={formula.dice}
                  faces={row.dice || []}
                  onChange={(index, value) => setRowDie(row.key, index, value)}
                  modifier={formula.modifier}
                />
              )}
            </div>
          </label>
          )}
          <label className="resolve-note">
            Additional info
            <input
              type="text"
              placeholder={heal ? "Healing" : "Damage"}
              value={row.info}
              onChange={(event) =>
                setRows((prev) => prev.map((item) => (item.key === row.key ? { ...item, info: event.target.value } : item)))
              }
            />
          </label>
          <p className="muted small">
            {spellDice
              ? spellDamageLine(result, row.label, row.info, damageFaces)
              : rowOutcome(result, heal, filled(row))}
          </p>
        </div>
      ))}
      <button
        type="button"
        className="btn primary"
        disabled={busy || !ready}
        onClick={() => {
          for (const row of rows) {
            const next = filled(row);
            const face = faceOf(next.roll);
            if (spellDice) {
              const typed = amountIn(row.info);
              const amount = typed ?? sumEnteredDice(result.damage, damageFaces, false);
              if (amount == null || !row.creature) continue;
              onApply(row.creature, amount);
              onFate?.(`${row.label} takes ${amount}.`);
              continue;
            }
            if (face == null) continue;
            if (social) {
              const line = playFate(result, next);
              if (line) onFate?.(line);
              continue;
            }
            if (!row.creature) continue;
            if (heal) {
              const healing = amountIn(row.info) ?? face;
              const line = playFate(result, next, { heal: healing });
              if (line) onFate?.(line);
              onApply(row.creature, healing);
              continue;
            }
            const strike = strikeOutcome(result, next.roll, row.info, row.save, printedSaveBonus(result, row.creature), next.dice);
            const line = playFate(result, next, { strike });
            if (line && strike.kind !== "pending") onFate?.(line);
            if (strike.kind === "damage") onApply(row.creature, strike.amount);
            else if (strike.kind === "miss") onMiss?.(row.creature);
          }
        }}
      >
        Submit
      </button>
    </div>
  );
}
