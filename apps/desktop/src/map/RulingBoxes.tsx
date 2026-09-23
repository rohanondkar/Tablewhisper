import { useState } from "react";
import type { MapRuling, RulingCreature } from "./effects";

export default function RulingBoxes({
  ruling,
  busy,
  showSummary = true,
  onApply,
  onMiss,
}: {
  ruling: MapRuling;
  busy?: boolean;
  showSummary?: boolean;
  onApply: (creature: RulingCreature, amount: number) => void;
  onMiss: (creature: RulingCreature) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <div className="ruling-boxes">
      {showSummary && (
        <p className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
          {ruling.result.roll_line}
        </p>
      )}
      {ruling.blocked ? (
        <p className="small" style={{ margin: "0.35rem 0 0" }}>
          {ruling.blocked}
        </p>
      ) : (
        <>
          {showSummary && ruling.result.notes && (
            <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
              {ruling.result.notes}
            </p>
          )}
          {(ruling.heal || ruling.result.check_type === "attack" || ruling.result.check_type === "save") &&
            ruling.creatures.length === 0 && (
            <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
              No creature on those squares.
            </p>
          )}
          {ruling.creatures.map((creature) => (
            <div key={creature.key} className="ruling-row">
              <span>{creature.label}</span>
              <input
                type="number"
                min={0}
                placeholder={ruling.heal ? "Healing" : "Damage"}
                value={drafts[creature.key] || ""}
                onChange={(event) => setDrafts((prev) => ({ ...prev, [creature.key]: event.target.value }))}
              />
              <button
                type="button"
                className="btn"
                disabled={busy || !Number.isFinite(Number(drafts[creature.key])) || Number(drafts[creature.key]) <= 0}
                onClick={() => onApply(creature, Number(drafts[creature.key]))}
              >
                {ruling.heal ? "Heal" : "Apply"}
              </button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => onMiss(creature)}>
                Miss
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
