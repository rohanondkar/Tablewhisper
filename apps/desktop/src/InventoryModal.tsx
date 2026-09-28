import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { api, mediaUrl, type BagSummary, type Character } from "./api";
import HeldHand, {
  TONES,
  asTone,
  handArtKey,
  handKind,
  handLabel,
  holdPose,
  sameTone,
  type Rgb,
} from "./heldHand";

type Gear = NonNullable<Character["equipment"]>[number];

const PERSON_SLOTS = ["body", "shoulders", "belt", "back"] as const;
function gearSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Drag = {
  index: number;
  x: number;
  y: number;
};

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
  const [drag, setDrag] = useState<Drag | null>(null);
  const [art, setArt] = useState<Record<string, string>>({});
  const [tone, setTone] = useState<Rgb | null>(asTone(character.hand_color));
  const dragRef = useRef<Drag | null>(null);
  const gear = character.equipment || [];
  const gearRef = useRef(gear);
  gearRef.current = gear;
  const bags = character.bags?.length ? character.bags : character.bag ? [character.bag] : [];
  const active = bags[Math.min(tab, Math.max(bags.length - 1, 0))] || null;
  const activeRef = useRef(active);
  activeRef.current = active;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const thri = /thri[ -]?kreen/i.test(character.species || "");
  const pockets = character.pockets || 0;
  const hands = gear.filter((item) => item.state === "equipped" && (item.effect === "weapon" || item.effect === "shield"));
  const person = gear.filter((item) => (item.state === "worn" || item.state === "attuned") && item.pocket == null);
  const stowed = gear.filter(
    (item) => item.state === "unequipped" && item.effect !== "unarmed" && inBag(item, active),
  );
  const pocketItems = gear.filter((item) => item.state === "worn" && item.pocket != null);

  useEffect(() => {
    api
      .gearImages()
      .then((res) => applyArt(res.images))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setTone(asTone(character.hand_color));
  }, [character.hand_color]);

  function applyArt(images: Record<string, string>) {
    void Promise.all(
      Object.entries(images).map(async ([key, path]) => [key, await mediaUrl(path)] as const),
    ).then((pairs) => setArt(Object.fromEntries(pairs)));
  }

  function heldPicture(name: string): string {
    const key = gearSlug(name);
    if (art[`held-${key}`]) return art[`held-${key}`];
    let best = "";
    for (const known of Object.keys(art)) {
      if (!known.startsWith("held-")) continue;
      const weapon = known.slice(5);
      if ((key === weapon || key.startsWith(`${weapon}-`) || key.includes(weapon)) && weapon.length > best.length) best = weapon;
    }
    return best ? art[`held-${best}`] : "";
  }

  const toneRef = useRef<Rgb | null>(asTone(character.hand_color));
  toneRef.current = tone;

  function saveTone(next: Rgb | null) {
    toneRef.current = next;
    setTone(next);
    void api.updateCharacter(character.id, { hand_color: next ?? [] }).then(onUpdated).catch(() => undefined);
  }

  async function commit(index: number, patch: Partial<Gear>) {
    const currentGear = gearRef.current;
    setBusy(true);
    setNote(null);
    try {
      const next = currentGear.map((row, i) => (i === index ? { ...row, ...patch } : row));
      const updated = await api.updateCharacter(character.id, { equipment: next });
      onUpdated(updated);
      const moved = (updated.equipment || [])[index];
      const notes = updated.gear_notes || [];
      const failed =
        !moved ||
        (patch.state != null && moved.state !== patch.state) ||
        (patch.hand != null && moved.hand !== patch.hand) ||
        (typeof patch.pocket === "number" && moved.pocket !== patch.pocket);
      setNote(failed ? notes[0] || "That does not fit." : null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      const next = { ...current, x: e.clientX, y: e.clientY };
      dragRef.current = next;
      setDrag(next);
    }
    function up(e: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      dragRef.current = null;
      setDrag(null);
      if (busyRef.current) return;
      const zone = zoneAt(e.clientX, e.clientY);
      const item = gearRef.current[current.index];
      if (!item || !zone) return;
      if (zone.startsWith("hand:")) {
        const hand = zone.slice(5);
        if (item.effect === "armor" || item.effect === "container") {
          setNote("That does not go in a hand.");
          return;
        }
        if (hand.startsWith("light") && !item.light) {
          setNote("Only a light weapon fits in that hand.");
          return;
        }
        void commit(current.index, {
          state: "equipped",
          hand: (item.hands || 0) >= 2 ? "both" : hand,
          pocket: null,
          col: null,
          row: null,
          placed: false,
        });
        return;
      }
      if (zone.startsWith("slot:")) {
        const slot = zone.slice(5);
        if (item.person_slot !== slot) {
          setNote(item.person_slot ? `That uses the ${item.person_slot}.` : "That does not go on that place.");
          return;
        }
        void commit(current.index, {
          state: "worn",
          hand: null,
          pocket: null,
          col: null,
          row: null,
          placed: false,
        });
        return;
      }
      if (zone.startsWith("pocket:")) {
        if (item.effect === "weapon" || item.effect === "armor" || item.effect === "shield" || item.effect === "container") {
          setNote(`${item.name} does not fit in a pocket.`);
          return;
        }
        void commit(current.index, {
          state: "worn",
          pocket: Number(zone.slice(7)),
          hand: null,
          col: null,
          row: null,
          placed: false,
        });
        return;
      }
      if (zone === "bag") {
        void commit(current.index, {
          state: "unequipped",
          col: null,
          row: null,
          placed: true,
          container: activeRef.current?.name || item.container || null,
          pocket: null,
          hand: null,
        });
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [character.id]);

  function beginDrag(event: ReactPointerEvent, index: number) {
    window.getSelection()?.removeAllRanges();
    if (event.button !== 0 || busy) return;
    const item = gear[index];
    if (!item) return;
    const next: Drag = {
      index,
      x: event.clientX,
      y: event.clientY,
    };
    dragRef.current = next;
    setDrag(next);
    setSelected(index);
  }

  const left = hands.find((item) => item.hand === "left" || item.hand === "both") || null;
  const right = hands.find((item) => item.hand === "right" || item.hand === "both") || null;
  const kind = handKind(character.species || "");
  const handPicture = (gripping: boolean) => art[handArtKey(kind, gripping)] || art[handArtKey("human", gripping)] || "";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel bag-panel"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={() => window.getSelection()?.removeAllRanges()}
      >
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
          <div className="hand-row">
            <HandPad
              side="left"
              handUrl={handPicture(!!left && holdPose(left.name, left.effect || "") === "grip")}
              item={left}
              showItem={!!left}
              tone={tone}
              mirror={false}
              gear={gear}
              held={heldPicture}
              selected={selected}
              dragging={drag?.index}
              onPick={setSelected}
              onDrag={beginDrag}
            />
            {thri && (
              <div className="light-hands">
                {(["light-1", "light-2"] as const).map((side) => {
                  const held = hands.find((item) => item.hand === side) || null;
                  return (
                    <HandPad
                      key={side}
                      side={side}
                      handUrl={handPicture(!!held && holdPose(held.name, held.effect || "") === "grip")}
                      item={held}
                      showItem={!!held}
                      tone={tone}
                      mirror={side === "light-2"}
                      gear={gear}
                      held={heldPicture}
                      selected={selected}
                      dragging={drag?.index}
                      onPick={setSelected}
                      onDrag={beginDrag}
                      compact
                    />
                  );
                })}
              </div>
            )}
            <HandPad
              side="right"
              handUrl={handPicture(!!right && holdPose(right.name, right.effect || "") === "grip")}
              item={right}
              showItem={!!right && right.hand !== "both"}
              tone={tone}
              mirror
              gear={gear}
              held={heldPicture}
              selected={selected}
              dragging={drag?.index}
              onPick={setSelected}
              onDrag={beginDrag}
            />
          </div>
          <div className="tone-bar">
            <span className="equip-caption">{handLabel(character.species || "")}</span>
            {TONES.map((swatch) => (
              <button
                key={swatch.name}
                type="button"
                className={`tone-swatch ${sameTone(tone, swatch.color) ? "on" : ""} ${swatch.color ? "" : "natural"}`}
                style={swatch.color ? { background: `rgb(${swatch.color.join(",")})` } : undefined}
                title={swatch.name}
                onClick={() => saveTone(swatch.color)}
              />
            ))}
            {(["R", "G", "B"] as const).map((channel, index) => (
              <label key={channel} className="tone-slider">
                {channel}
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={(tone || [196, 150, 114])[index]}
                  onChange={(event) => {
                    const next: Rgb = [...(toneRef.current || [196, 150, 114])] as Rgb;
                    next[index] = Number(event.target.value);
                    toneRef.current = next;
                    setTone(next);
                  }}
                  onPointerUp={() => saveTone(toneRef.current)}
                />
              </label>
            ))}
          </div>
          <div className="person-strip">
            {PERSON_SLOTS.map((slot) => {
              const item = person.find((row) => row.person_slot === slot) || null;
              const index = item ? gear.indexOf(item) : -1;
              return (
                <div key={slot} className="equip-well">
                  <div className="bag-slot-box" data-drop={`slot:${slot}`}>
                    {item && index >= 0 && (
                      <BagLine
                        name={item.name}
                        index={index}
                        selected={selected === index}
                        dragging={drag?.index === index}
                        onPick={setSelected}
                        onDrag={beginDrag}
                      />
                    )}
                  </div>
                  <span className="equip-caption">{slot}</span>
                </div>
              );
            })}
            {Array.from({ length: pockets }, (_, pocket) => {
              const item = pocketItems.find((row) => row.pocket === pocket) || null;
              const index = item ? gear.indexOf(item) : -1;
              return (
                <div key={`pocket-${pocket}`} className="equip-well">
                <div className="pocket" data-drop={`pocket:${pocket}`}>
                  {item && index >= 0 && (
                    <BagLine
                      name={item.name}
                      index={index}
                      selected={selected === index}
                      dragging={drag?.index === index}
                      onPick={setSelected}
                      onDrag={beginDrag}
                    />
                  )}
                </div>
                <span className="equip-caption">{pocket + 1}</span>
                </div>
              );
            })}
            {person
              .filter((item) => !item.person_slot || !PERSON_SLOTS.includes(item.person_slot as (typeof PERSON_SLOTS)[number]))
              .map((item) => {
                const index = gear.indexOf(item);
                return (
                  <BagLine
                    key={`extra-${item.name}-${index}`}
                    name={item.name}
                    index={index}
                    selected={selected === index}
                    dragging={drag?.index === index}
                    onPick={setSelected}
                    onDrag={beginDrag}
                  />
                );
              })}
          </div>
          <div className="bag-list" data-drop="bag">
            {stowed.length === 0 && <p className="muted">Nothing in the bag.</p>}
            {stowed.map((item) => {
              const index = gear.indexOf(item);
              return (
                <BagLine
                  key={`${item.name}-${index}`}
                  name={item.name}
                  index={index}
                  selected={selected === index}
                  dragging={drag?.index === index}
                  onPick={setSelected}
                  onDrag={beginDrag}
                />
              );
            })}
          </div>
          {note && <p className="gear-note">{note}</p>}
          <p className="bag-foot">
            {active?.label || ""}
            {character.carry_label ? ` · body ${character.carry_label}` : ""}
          </p>
        </div>
        {drag && gear[drag.index] && (
          <div className="bag-ghost bag-ghost-name" style={{ left: drag.x + 12, top: drag.y + 12, zIndex: 200 }}>
            {gear[drag.index].name}
          </div>
        )}
      </div>
    </div>
  );
}

function HandPad({
  side,
  handUrl,
  item,
  showItem,
  tone,
  mirror,
  gear,
  held,
  selected,
  dragging,
  onPick,
  onDrag,
  compact,
}: {
  side: string;
  handUrl: string;
  item: Gear | null;
  showItem: boolean;
  tone: Rgb | null;
  mirror: boolean;
  gear: Gear[];
  held: (name: string) => string;
  selected: number | null;
  dragging?: number;
  onPick: (index: number) => void;
  onDrag: (event: ReactPointerEvent, index: number) => void;
  compact?: boolean;
}) {
  const index = item ? gear.indexOf(item) : -1;
  const effect = showItem && item ? item.effect || "" : "";
  const baked = showItem && item ? held(item.name) : "";
  const flip = baked ? side === "left" || side === "light-1" : mirror;
  const [plate, setPlate] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      className={`hand-pad ${side} ${item ? "gripping" : ""} ${effect === "shield" ? "held-shield" : ""} ${compact ? "compact" : ""} ${selected === index && index >= 0 ? "on" : ""}`}
      data-drop={`hand:${side}`}
      onPointerDown={item && index >= 0 ? (event) => onDrag(event, index) : undefined}
      onClick={item && index >= 0 ? () => onPick(index) : undefined}
      onMouseEnter={(event) => {
        if (!item) return;
        const box = event.currentTarget.getBoundingClientRect();
        setPlate({ x: box.left + box.width / 2, y: box.top });
      }}
      onMouseLeave={() => setPlate(null)}
    >
      <HeldHand
        handUrl={baked || handUrl}
        weaponUrl=""
        weaponName={showItem && item ? item.name : ""}
        tone={tone}
        mirror={flip}
        shield={effect === "shield"}
        skinOnly={!!baked}
      />
      {dragging === index && index >= 0 ? <span className="hand-dragging" /> : null}
      {plate && item && dragging !== index
        ? createPortal(
            <span className="name-plate" style={{ left: plate.x, top: plate.y }}>
              {item.name}
            </span>,
            document.body,
          )
        : null}
    </div>
  );
}

function BagLine({
  name,
  index,
  selected,
  dragging,
  onPick,
  onDrag,
}: {
  name: string;
  index: number;
  selected: boolean;
  dragging: boolean;
  onPick: (index: number) => void;
  onDrag: (event: ReactPointerEvent, index: number) => void;
}) {
  const [plate, setPlate] = useState<{ x: number; y: number } | null>(null);
  return (
    <button
      type="button"
      className={`bag-line ${selected ? "on" : ""} ${dragging ? "is-dragging" : ""}`}
      onPointerDown={(event) => onDrag(event, index)}
      onClick={() => onPick(index)}
      onMouseEnter={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        setPlate({ x: box.left + box.width / 2, y: box.top });
      }}
      onMouseLeave={() => setPlate(null)}
    >
      {name}
      {plate && !dragging
        ? createPortal(
            <span className="name-plate" style={{ left: plate.x, top: plate.y }}>
              {name}
            </span>,
            document.body,
          )
        : null}
    </button>
  );
}

function inBag(item: Gear, bag: BagSummary | null): boolean {
  if (!bag) return true;
  return (item.container || "").toLowerCase() === bag.name.toLowerCase();
}

function zoneAt(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.classList.contains("bag-ghost") || el.classList.contains("bag-snap")) continue;
    const zone = el.closest("[data-drop]");
    if (zone) return zone.getAttribute("data-drop");
  }
  return null;
}
