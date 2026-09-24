import { useState } from "react";
import type { Character, CheckResult, EncounterEnemy, MonsterTemplate, NpcTemplate, SceneNpc } from "../api";
import type { RulingCreature } from "./effects";
import ResolveCard from "./ResolveCard";

export type ResolveRow = {
  key: string;
  label: string;
  creature: RulingCreature | null;
  roll: string;
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

export function saveSucceeds(result: CheckResult, face: number): boolean | null {
  if (result.suggested_dc == null) return null;
  return face + (result.modifier ?? 0) >= result.suggested_dc;
}

export function rollPrintedDamage(formula: string | null | undefined): number | null {
  if (!formula) return null;
  const match = formula.match(/(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?/i);
  if (!match) return null;
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const bonus = match[3] ? Number(match[3].replace(/\s/g, "")) : 0;
  if (!Number.isInteger(count) || !Number.isInteger(sides) || count < 1 || count > 40 || sides < 2 || sides > 100) {
    return null;
  }
  let total = bonus;
  for (let i = 0; i < count; i += 1) total += 1 + Math.floor(Math.random() * sides);
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

export function strikeOutcome(result: CheckResult, roll: string, info: string): Strike {
  const typedEarly = amountIn(info);
  if (result.check_type === "save" && result.suggested_dc == null && faceOf(roll) == null) {
    if (typedEarly == null) return { kind: "pending" };
    return typedEarly <= 0 ? { kind: "stay" } : { kind: "damage", amount: typedEarly };
  }
  const face = faceOf(roll);
  if (face == null) return { kind: "pending" };
  const typed = amountIn(info);
  const printed = () => typed ?? rollPrintedDamage(result.damage);
  if (result.check_type === "attack") {
    if (!attackConnects(result, face)) return { kind: "miss" };
    const amount = printed();
    if (amount == null) return { kind: "pending" };
    if (amount <= 0) return { kind: "stay" };
    return { kind: "damage", amount };
  }
  if (result.check_type === "save") {
    const saved = saveSucceeds(result, face);
    if (saved == null) {
      if (typed == null) return { kind: "pending" };
      return typed <= 0 ? { kind: "stay" } : { kind: "damage", amount: typed };
    }
    const amount = printed();
    if (saved && saveHalves(result)) {
      if (amount == null) return { kind: "pending" };
      const half = Math.floor(amount / 2);
      if (half <= 0) return { kind: "stay" };
      return { kind: "damage", amount: half };
    }
    if (saved) return { kind: "stay" };
    if (amount == null) return { kind: "pending" };
    if (amount <= 0) return { kind: "stay" };
    return { kind: "damage", amount };
  }
  if (typed == null) return { kind: "pending" };
  return typed <= 0 ? { kind: "stay" } : { kind: "damage", amount: typed };
}

function damagePreview(result: CheckResult, typed: number | null): string {
  if (typed != null) return String(typed);
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
    if (!attackConnects(result, face)) return `${row.label}: miss. Hit points stay.`;
    const preview = damagePreview(result, amount);
    if (!preview) return `${row.label}: hit. Type the damage in additional info.`;
    return amount != null
      ? `${row.label}: hit for ${amount}. That number shows on ${row.label}.`
      : `${row.label}: hit. ${preview} shows on ${row.label}.`;
  }
  if (result.check_type === "save") {
    const saved = saveSucceeds(result, face);
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
      info: "",
    }));
  });

  function patch(key: string, field: "roll" | "info", value: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  const quiet = result.check_type === "spell" || result.check_type === "contest";
  const typedDamage = result.check_type === "save" && result.suggested_dc == null;
  const ready = blocked
    ? false
    : quiet || rows.every((row) => (typedDamage ? amountIn(row.info) != null : faceOf(row.roll) != null));

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
          {!blocked && !quiet &&
            rows.map((row) => (
              <div key={row.key} className="resolve-row">
                <strong>{row.label}</strong>
                <label>
                  {heal ? "Healing" : typedDamage ? "Damage" : result.check_type === "save" ? "Saving throw" : "Attack roll"}
                  {!typedDamage && (
                    <input
                      type="number"
                      min={1}
                      max={20}
                      inputMode="numeric"
                      placeholder="d20"
                      value={row.roll}
                      onChange={(event) => patch(row.key, "roll", event.target.value)}
                    />
                  )}
                  {typedDamage && (
                    <input
                      type="text"
                      placeholder="Damage"
                      value={row.info}
                      onChange={(event) => patch(row.key, "info", event.target.value)}
                    />
                  )}
                </label>
                {!typedDamage && (
                  <label>
                    Additional info
                    <input
                      type="text"
                      placeholder={heal ? "Healing, or a note" : "Damage, half, or a note"}
                      value={row.info}
                      onChange={(event) => patch(row.key, "info", event.target.value)}
                    />
                  </label>
                )}
                <p className="muted small">{rowOutcome(result, heal, row)}</p>
              </div>
            ))}
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn primary" disabled={busy || !ready} onClick={() => onSubmit(rows)}>
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
}: {
  result: CheckResult;
  creatures: RulingCreature[];
  heal: boolean;
  busy?: boolean;
  onApply: (creature: RulingCreature, amount: number) => void;
  onMiss?: (creature: RulingCreature) => void;
}) {
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
      : [];
  const [rows, setRows] = useState<ResolveRow[]>(() =>
    seeded.map((creature) => ({
      key: creature.key,
      label: creature.label,
      creature,
      roll: "",
      info: "",
    }))
  );
  if (!seeded.length) return null;
  const ready = rows.every((row) => faceOf(row.roll) != null);
  return (
    <div className="ruling-boxes">
      <p className="muted small" style={{ margin: 0 }}>
        Type the d20. Submit rolls the printed damage and shows it on this creature. A number in additional info is used instead.
      </p>
      {rows.map((row) => (
        <div key={row.key} className="resolve-row">
          <strong>{row.label}</strong>
          <label>
            {result.check_type === "save" ? "Saving throw" : "Attack roll"}
            <input
              type="number"
              min={1}
              max={20}
              inputMode="numeric"
              placeholder="d20"
              value={row.roll}
              onChange={(event) =>
                setRows((prev) => prev.map((item) => (item.key === row.key ? { ...item, roll: event.target.value } : item)))
              }
            />
          </label>
          <label>
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
          <p className="muted small">{rowOutcome(result, heal, row)}</p>
        </div>
      ))}
      <button
        type="button"
        className="btn primary"
        disabled={busy || !ready}
        onClick={() => {
          for (const row of rows) {
            const face = faceOf(row.roll);
            if (!row.creature || face == null) continue;
            if (heal) {
              const healing = amountIn(row.info) ?? face;
              onApply(row.creature, healing);
              continue;
            }
            const strike = strikeOutcome(result, row.roll, row.info);
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
