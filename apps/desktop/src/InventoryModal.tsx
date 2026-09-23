import { useState } from "react";
import { api, type BagSummary, type Character } from "./api";

type Gear = NonNullable<Character["equipment"]>[number];
type Dest = "equipped" | "worn" | "unequipped";

const PERSON_SLOTS = ["body", "shoulders", "belt", "back"] as const;

export default function InventoryModal({
  character,
  onClose,
  onUpdated,
}: {
  character: Character;
  onClose: () => void;
  onUpdated: (next: Character) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const gear = character.equipment || [];
  const bags = character.bags?.length ? character.bags : character.bag ? [character.bag] : [];
  const active = bags[Math.min(tab, Math.max(bags.length - 1, 0))] || null;
  const cols = active?.cols || 8;
  const rows = active?.rows || 4;
  const hands = gear.filter((item) => item.state === "equipped" && item.effect !== "unarmed");
  const person = gear.filter((item) => item.state === "worn" || item.state === "attuned");
  const packed = gear.filter(
    (item) => item.state === "unequipped" && item.placed && item.effect !== "unarmed" && inBag(item, active),
  );
  const loose = gear.filter(
    (item) => item.state === "unequipped" && !item.placed && item.effect !== "unarmed" && inBag(item, active),
  );
  const current = selected != null ? gear[selected] : null;
  const thri = /thri[ -]?kreen/i.test(character.species || "");
  const handSlots = placeHands(hands, thri);
  const bodyNames = character.carry?.uncounted_names || [];

  async function move(index: number, dest: Dest) {
    setBusy(true);
    setNote(null);
    try {
      const next = gear.map((row, i) =>
        i === index
          ? {
              ...row,
              state: dest,
              col: null,
              row: null,
              placed: false,
              container: dest === "unequipped" ? active?.name || row.container : row.container,
            }
          : row,
      );
      const updated = await api.updateCharacter(character.id, { equipment: next });
      onUpdated(updated);
      const moved = (updated.equipment || [])[index];
      if (moved && moved.state !== dest && (updated.gear_notes || []).length) {
        setNote(updated.gear_notes![0]);
      } else {
        setNote((updated.gear_notes || [])[0] || null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel bag-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {character.name} · {active?.name || "Backpack"}
          </h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="bag-body">
          {bags.length > 1 && (
            <div className="bag-tabs">
              {bags.map((bag, index) => (
                <button
                  key={`${bag.name}-${index}`}
                  type="button"
                  className={`bag-chip ${index === tab ? "on" : ""}`}
                  onClick={() => setTab(index)}
                >
                  {bag.name}
                </button>
              ))}
            </div>
          )}
          <div className="bag-slots">
            <span className="bag-slot-label">Hands</span>
            {handSlots.primary.map((item, index) => (
              <SlotBox
                key={`hand-${index}`}
                label={`Hand ${index + 1}`}
                item={item}
                gear={gear}
                selected={selected}
                onPick={setSelected}
              />
            ))}
            {thri &&
              handSlots.light.map((item, index) => (
                <SlotBox
                  key={`light-${index}`}
                  label={`Light ${index + 1}`}
                  item={item}
                  gear={gear}
                  selected={selected}
                  onPick={setSelected}
                />
              ))}
          </div>
          <div className="bag-slots">
            <span className="bag-slot-label">On person</span>
            {PERSON_SLOTS.map((slot) => (
              <SlotBox
                key={slot}
                label={slot}
                item={person.find((item) => item.person_slot === slot) || null}
                gear={gear}
                selected={selected}
                onPick={setSelected}
              />
            ))}
            {person
              .filter((item) => !item.person_slot || !PERSON_SLOTS.includes(item.person_slot as (typeof PERSON_SLOTS)[number]))
              .map((item) => {
                const index = gear.indexOf(item);
                return (
                  <button
                    key={`extra-${item.name}-${index}`}
                    type="button"
                    className={`bag-chip ${selected === index ? "on" : ""}`}
                    onClick={() => setSelected(index)}
                  >
                    {item.name}
                  </button>
                );
              })}
          </div>
          <p className="bag-foot">Unnamed gear is 1 by 1.</p>
          <div
            className="bag-grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, 2.4rem)`,
              gridTemplateRows: `repeat(${rows}, 2.4rem)`,
            }}
          >
            {Array.from({ length: cols * rows }, (_, i) => (
              <div key={i} className="bag-cell" />
            ))}
            {packed.map((item) => {
              const index = gear.indexOf(item);
              return (
                <button
                  key={`${item.name}-${index}`}
                  type="button"
                  className={`bag-item ${selected === index ? "on" : ""}`}
                  style={{
                    gridColumn: `${(item.col || 0) + 1} / span ${item.w || 1}`,
                    gridRow: `${(item.row || 0) + 1} / span ${item.h || 1}`,
                  }}
                  onClick={() => setSelected(index)}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
          {loose.length > 0 && (
            <div className="bag-loose">
              {loose.map((item) => {
                const index = gear.indexOf(item);
                return (
                  <button
                    key={`${item.name}-loose`}
                    type="button"
                    className={`bag-chip ${selected === index ? "on" : ""}`}
                    onClick={() => setSelected(index)}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          )}
          {current && (
            <div className="bag-actions">
              <span>{current.name}</span>
              {current.fit_note && <span className="gear-note">{current.fit_note}</span>}
              {current.effect !== "armor" && current.effect !== "container" && (
                <button type="button" className="btn tiny" disabled={busy} onClick={() => void move(selected!, "equipped")}>
                  Hands
                </button>
              )}
              <button type="button" className="btn tiny" disabled={busy} onClick={() => void move(selected!, "worn")}>
                On person
              </button>
              <button type="button" className="btn tiny ghost" disabled={busy} onClick={() => void move(selected!, "unequipped")}>
                Bag
              </button>
            </div>
          )}
          {note && <p className="gear-note">{note}</p>}
          <p className="bag-foot">
            {active?.label || ""}
            {character.carry_label ? ` · body ${character.carry_label}` : ""}
            {bodyNames.length ? ` · uncounted ${bodyNames.join(", ")}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function inBag(item: Gear, bag: BagSummary | null): boolean {
  if (!bag) return true;
  return (item.container || "").toLowerCase() === bag.name.toLowerCase();
}

function placeHands(items: Gear[], thri: boolean) {
  const primary: Array<Gear | null> = [null, null];
  const light: Array<Gear | null> = thri ? [null, null] : [];
  let used = 0;
  for (const item of items) {
    if (item.effect !== "weapon" && item.effect !== "shield") continue;
    const hands = item.hands || 1;
    if (item.light && used >= 2 && thri) {
      const open = light.findIndex((slot) => !slot);
      if (open >= 0) light[open] = item;
      continue;
    }
    if (hands >= 2) {
      primary[0] = item;
      primary[1] = item;
      used = 2;
      continue;
    }
    const open = primary.findIndex((slot) => !slot);
    if (open >= 0) {
      primary[open] = item;
      used += 1;
    }
  }
  return { primary, light };
}

function SlotBox({
  label,
  item,
  gear,
  selected,
  onPick,
}: {
  label: string;
  item: Gear | null;
  gear: Gear[];
  selected: number | null;
  onPick: (index: number) => void;
}) {
  const index = item ? gear.indexOf(item) : -1;
  return (
    <button
      type="button"
      className={`bag-slot-box ${item && selected === index ? "on" : ""}`}
      onClick={() => item && onPick(index)}
      disabled={!item}
    >
      <span className="bag-slot-label">{label}</span>
      <span>{item?.name || "Empty"}</span>
    </button>
  );
}
