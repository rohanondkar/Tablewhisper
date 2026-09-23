import { useState } from "react";

export type TurnSlot = {
  key: string;
  refId: string;
  kind: "pc" | "enemy" | "npc";
  name: string;
  mod: number;
  sheetMod: number;
  locked: boolean;
  image: string | null;
  roll: number | null;
};

export function sortTurns(list: TurnSlot[]): TurnSlot[] {
  if (!list.some((slot) => slot.roll != null)) return list;
  return [...list].sort((a, b) => {
    const at = a.roll == null ? -9999 : a.roll + a.mod;
    const bt = b.roll == null ? -9999 : b.roll + b.mod;
    if (bt !== at) return bt - at;
    if (b.mod !== a.mod) return b.mod - a.mod;
    return a.name.localeCompare(b.name);
  });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function math(slot: TurnSlot): string {
  if (slot.roll == null) return slot.mod >= 0 ? `mod +${slot.mod}` : `mod ${slot.mod}`;
  const sign = slot.mod >= 0 ? `+${slot.mod}` : `${slot.mod}`;
  return `${slot.roll}${sign}`;
}

export default function TurnOrder({
  slots,
  activeKey,
  round,
  laterFrom,
  canSwap,
  allies,
  onRoll,
  onNext,
  onPick,
  onMod,
  onSwap,
}: {
  slots: TurnSlot[];
  activeKey: string | null;
  round: number;
  laterFrom: number;
  canSwap: boolean;
  allies: Array<{ key: string; name: string }>;
  onRoll: () => void;
  onNext: () => void;
  onPick: (key: string) => void;
  onMod: (key: string, mod: number) => void;
  onSwap: (key: string) => void;
}) {
  const [swapWith, setSwapWith] = useState("");
  const rolled = slots.some((slot) => slot.roll != null);
  return (
    <div className="turn-order">
      <div className="turn-controls">
        <button type="button" className="btn" onClick={onRoll}>
          Roll initiative
        </button>
        {rolled && <span className="turn-round">Round {round}</span>}
        <button type="button" className="btn" disabled={!slots.length} onClick={onNext}>
          Next
        </button>
        {canSwap && (
          <label className="turn-swap">
            Swap
            <select value={swapWith} onChange={(event) => setSwapWith(event.target.value)}>
              <option value="">ally</option>
              {allies.map((ally) => (
                <option key={ally.key} value={ally.key}>
                  {ally.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn ghost"
              disabled={!swapWith}
              onClick={() => {
                onSwap(swapWith);
                setSwapWith("");
              }}
            >
              Trade
            </button>
          </label>
        )}
      </div>
      <div className="turn-track">
        {slots.map((slot, index) => {
          const now = slot.key === activeKey && slot.roll != null;
          const later = index >= laterFrom && laterFrom < slots.length;
          const total = slot.roll == null ? null : slot.roll + slot.mod;
          return (
            <div key={slot.key} className="turn-slot">
              {later && index === laterFrom && <span className="turn-later">Next round</span>}
              <button
                type="button"
                className={`turn-card ${now ? "now" : ""} ${later ? "later" : ""}`}
                onClick={() => onPick(slot.key)}
              >
                {slot.image ? (
                  <img className="turn-face" src={slot.image} alt="" />
                ) : (
                  <span className={`turn-face turn-initials kind-${slot.kind}`}>{initials(slot.name)}</span>
                )}
                <span className="turn-name">{slot.name}</span>
                <span className="turn-total">{total == null ? "—" : total}</span>
                <span className="turn-math">{math(slot)}</span>
              </button>
              {!slot.locked && (
                <label className="turn-mod">
                  Dex
                  <input
                    type="number"
                    value={slot.mod}
                    title="Dexterity modifier from the stat block"
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isNaN(next)) onMod(slot.key, next);
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
