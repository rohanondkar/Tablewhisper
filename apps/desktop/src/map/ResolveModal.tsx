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
};

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
): Strike {
  const typedEarly = amountIn(info);
  if (result.check_type === "save" && result.suggested_dc == null && faceOf(roll) == null) {
    if (typedEarly == null) return { kind: "pending" };
    return typedEarly <= 0 ? { kind: "stay" } : { kind: "damage", amount: typedEarly };
  }
  const face = faceOf(roll);
  if (face == null) return { kind: "pending" };
  const typed = amountIn(info);
  const printed = (crit = false) => typed ?? rollPrintedDamage(result.damage, crit);
  if (result.check_type === "attack") {
    if (!attackConnects(result, face)) return { kind: "miss" };
    const amount = printed(face === 20);
    if (amount == null) return { kind: "stay" };
    return { kind: "damage", amount };
  }
  if (result.check_type === "save") {
    const saved = saveSucceeds(result, face, saveBonus);
    const amount = printed();
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
    if (saved) return { kind: "stay" };
    if (amount == null) return { kind: "stay" };
    if (amount <= 0) return { kind: "stay" };
    return { kind: "damage", amount };
  }
  if (typed == null) return { kind: "pending" };
  return typed <= 0 ? { kind: "stay" } : { kind: "damage", amount: typed };
}

function damagePreview(result: CheckResult, typed: number | null): string {
  if (typed != null) return String(typed);
  const flat = flatPrinted(result.damage);
  if (flat != null) return String(flat);
  if (result.damage && /\d+\s*d\s*\d+/i.test(result.damage)) return result.damage;
  return "";
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
    const preview = damagePreview(result, amount);
    if (!preview) return `${attacker} hits. Type the damage in additional info.`;
    return amount != null
      ? `${attacker} hits for ${amount}. That number shows on ${row.label}.`
      : `${attacker} hits. ${preview} shows on ${row.label}.`;
  }
  if (result.check_type === "save") {
    const bonus = printedSaveBonus(result, row.creature);
    const saved = saveSucceeds(result, face, bonus);
    const verdict = saved == null ? "no DC on this card" : saved ? "succeeds" : "fails";
    const preview = damagePreview(result, amount);
    if (saved == null && amount == null) return `${row.label} ${verdict}. Hit points stay until a damage number is entered.`;
    if (saved && !saveHalves(result)) return `${row.label} ${verdict}. Hit points stay.`;
    if (saved && saveHalves(result)) {
      return preview
        ? `${row.label} ${verdict}. Half of ${preview} shows on ${row.label}.`
        : `${row.label} ${verdict}. Type the damage in additional info.`;
    }
    return preview
      ? `${row.label} ${verdict}. ${preview} shows on ${row.label}.`
      : `${row.label} ${verdict}. Type the damage in additional info.`;
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
  if (face === 20 && /\d+\s*d\s*\d+/i.test(raw)) {
    return `The critical doubles the dice. The strike is ${printed}, so they take ${amount}.`;
  }
  if (face === 20) return `The strike is ${printed}. The critical has no dice to double, so they take ${amount}.`;
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
    }));
  });
  const [attackRoll, setAttackRoll] = useState("");

  function patch(key: string, field: "roll" | "save" | "info", value: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  const quiet = result.check_type === "spell" || result.check_type === "contest";
  const printedRoll = /\d+\s*d\s*\d+/i.test(result.damage || "") || flatPrinted(result.damage) != null;
  const typedDamage = result.check_type === "save" && result.suggested_dc == null && !printedRoll;
  const needsAttack = !heal && result.check_type === "attack";
  const needsSave = !heal && !typedDamage && result.check_type === "save";
  const attackerName = result.character || "Attacker";
  const ready = blocked
    ? false
    : quiet ||
      ((!needsAttack || faceOf(attackRoll) != null) &&
        rows.every((row) => {
          if (typedDamage) return amountIn(row.info) != null;
          if (needsAttack) return true;
          if (needsSave) return faceOf(row.roll) != null;
        return faceOf(row.roll) != null;
      }));

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
              <label className="resolve-die">
                Attack roll
                <input
                  className="resolve-die-input"
                  type="number"
                  min={1}
                  max={20}
                  inputMode="numeric"
                  placeholder="d20"
                  value={attackRoll}
                  onChange={(event) => setAttackRoll(event.target.value)}
                />
              </label>
              <p className="muted small">The person hitting rolls this against armor class.</p>
            </div>
          )}
          {!blocked && !quiet &&
            rows.map((row) => (
              <div key={row.key} className="resolve-row">
                <strong>{row.label}</strong>
                {!needsAttack && (
                <label className="resolve-die">
                  {heal
                    ? "Healing"
                    : typedDamage
                      ? "Damage"
                      : result.check_type === "skill" || result.check_type === "ability"
                        ? skillTitle(result)
                        : "Saving throw"}
                  {!typedDamage && !heal && (
                    <input
                      className="resolve-die-input"
                      type="number"
                      min={1}
                      max={20}
                      inputMode="numeric"
                      placeholder="d20"
                      value={row.roll}
                      onChange={(event) => patch(row.key, "roll", event.target.value)}
                    />
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
                  {rowOutcome(result, heal, needsAttack ? { ...row, roll: attackRoll } : row)}
                </p>
              </div>
            ))}
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !ready}
              onClick={() => {
                const submitted = rows.map((row) => (needsAttack ? { ...row, roll: attackRoll } : row));
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
    }))
  );
  const [attackRoll, setAttackRoll] = useState("");
  if (!seeded.length) return null;
  const needsAttack = !heal && result.check_type === "attack";
  const needsSave = !heal && result.check_type === "save";
  const ready =
    (!needsAttack || faceOf(attackRoll) != null) &&
    rows.every((row) => needsAttack || faceOf(row.roll) != null);
  return (
    <div className="ruling-boxes">
      <p className="muted small" style={{ margin: 0 }}>
        Type the d20. Submit rolls the printed damage and shows it on this creature. A number in additional info is used instead.
      </p>
      {needsAttack && (
        <div className="resolve-row">
          <strong>{result.character || "Attacker"}</strong>
          <label className="resolve-die">
            Attack roll
            <input
              className="resolve-die-input"
              type="number"
              min={1}
              max={20}
              inputMode="numeric"
              placeholder="d20"
              value={attackRoll}
              onChange={(event) => setAttackRoll(event.target.value)}
            />
          </label>
        </div>
      )}
      {rows.map((row) => (
        <div key={row.key} className="resolve-row">
          <strong>{row.label}</strong>
          {!needsAttack && (
          <label className="resolve-die">
            {needsSave ? "Saving throw" : social ? skillTitle(result) : heal ? "Healing" : "Check"}
            <input
              className="resolve-die-input"
              type="number"
              min={1}
              max={20}
              inputMode="numeric"
              placeholder="d20"
              value={row.roll}
              onChange={(event) =>
                setRows((prev) =>
                  prev.map((item) => (item.key === row.key ? { ...item, roll: event.target.value } : item))
                )
              }
            />
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
          <p className="muted small">{rowOutcome(result, heal, needsAttack ? { ...row, roll: attackRoll } : row)}</p>
        </div>
      ))}
      <button
        type="button"
        className="btn primary"
        disabled={busy || !ready}
        onClick={() => {
          for (const row of rows) {
            const filled = needsAttack ? { ...row, roll: attackRoll } : row;
            const face = faceOf(filled.roll);
            if (face == null) continue;
            if (social) {
              const line = playFate(result, filled);
              if (line) onFate?.(line);
              continue;
            }
            if (!row.creature) continue;
            if (heal) {
              const healing = amountIn(row.info) ?? face;
              const line = playFate(result, filled, { heal: healing });
              if (line) onFate?.(line);
              onApply(row.creature, healing);
              continue;
            }
            const strike = strikeOutcome(result, filled.roll, row.info, row.save, printedSaveBonus(result, row.creature));
            const line = playFate(result, filled, { strike });
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
