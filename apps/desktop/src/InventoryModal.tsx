import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { api, mediaUrl, type BagSummary, type Character } from "./api";
import HeldHand, {
  HAND_KINDS,
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
const FRAME_KEYS = new Set([
  "left-hand",
  "right-hand",
  "left-grip",
  "right-grip",
  "light-hand",
  "body",
  "shoulders",
  "belt",
  "back",
  "pocket",
  "bag-cell",
  ...HAND_KINDS.flatMap((kind) => [`${kind}-hand`, `${kind}-grip`]),
]);

function gearSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Drag = {
  index: number;
  dx: number;
  dy: number;
  x: number;
  y: number;
  w: number;
  h: number;
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
  const [hover, setHover] = useState<{ col: number; row: number; ok: boolean } | null>(null);
  const [art, setArt] = useState<Record<string, string>>({});
  const [tone, setTone] = useState<Rgb | null>(asTone(character.hand_color));
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const gear = character.equipment || [];
  const gearRef = useRef(gear);
  gearRef.current = gear;
  const bags = character.bags?.length ? character.bags : character.bag ? [character.bag] : [];
  const active = bags[Math.min(tab, Math.max(bags.length - 1, 0))] || null;
  const cols = active?.cols || 8;
  const rows = active?.rows || 4;
  const colsRef = useRef(cols);
  const rowsRef = useRef(rows);
  colsRef.current = cols;
  rowsRef.current = rows;
  const activeRef = useRef(active);
  activeRef.current = active;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const thri = /thri[ -]?kreen/i.test(character.species || "");
  const pockets = character.pockets || 0;
  const hands = gear.filter((item) => item.state === "equipped" && (item.effect === "weapon" || item.effect === "shield"));
  const person = gear.filter((item) => (item.state === "worn" || item.state === "attuned") && item.pocket == null);
  const packed = gear.filter(
    (item) => item.state === "unequipped" && item.placed && item.effect !== "unarmed" && inBag(item, active),
  );
  const loose = gear.filter(
    (item) => item.state === "unequipped" && !item.placed && item.effect !== "unarmed" && inBag(item, active),
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

  function picture(name: string): string {
    const key = gearSlug(name);
    if (art[key]) return art[key];
    let best = "";
    for (const known of Object.keys(art)) {
      if (FRAME_KEYS.has(known) || known.startsWith("held-")) continue;
      if ((key.startsWith(known) || key.includes(known)) && known.length > best.length) best = known;
    }
    return best ? art[best] : art.item || "";
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

  function uploadPicture(name: string, file: File) {
    void api.uploadGearImage(name, file).then((res) => applyArt(res.images));
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
        (typeof patch.pocket === "number" && moved.pocket !== patch.pocket) ||
        (typeof patch.col === "number" && (moved.col !== patch.col || moved.row !== patch.row || !moved.placed)) ||
        (patch.rotated !== undefined && Boolean(moved.rotated) !== Boolean(patch.rotated));
      setNote(failed ? notes[0] || "That does not fit." : null);
    } finally {
      setBusy(false);
    }
  }

  function rotate(index: number) {
    const item = gearRef.current[index];
    if (!item || item.state !== "unequipped" || busyRef.current) return;
    void commit(index, {
      state: "unequipped",
      rotated: !item.rotated,
      col: item.col ?? null,
      row: item.row ?? null,
      container: item.container || activeRef.current?.name || null,
      pocket: null,
      hand: null,
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "r" && e.key !== "R") return;
      if (selected == null) return;
      e.preventDefault();
      rotate(selected);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    function move(e: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      const next = { ...current, x: e.clientX, y: e.clientY };
      dragRef.current = next;
      setDrag(next);
      const grid = gridRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      const cell = rect.width / colsRef.current;
      const col = Math.round((e.clientX - current.dx - rect.left) / cell);
      const row = Math.round((e.clientY - current.dy - rect.top) / cell);
      const inside =
        col >= 0 && row >= 0 && col + current.w <= colsRef.current && row + current.h <= rowsRef.current;
      setHover(
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
          ? { col, row, ok: inside && !overlaps(gearRef.current, current.index, col, row, current.w, current.h, activeRef.current) }
          : null,
      );
    }
    function up(e: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      dragRef.current = null;
      setDrag(null);
      setHover(null);
      if (busyRef.current) return;
      const zone = zoneAt(e.clientX, e.clientY);
      const item = gearRef.current[current.index];
      if (!item || !zone) return;
      const left = e.clientX - current.dx;
      const top = e.clientY - current.dy;
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
        const [w, h] = span(item);
        if (item.effect === "weapon" || item.effect === "armor" || item.effect === "shield" || item.effect === "container" || w !== 1 || h !== 1) {
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
        const grid = gridRef.current;
        if (!grid) return;
        const rect = grid.getBoundingClientRect();
        const cell = rect.width / colsRef.current;
        const col = Math.round((left - rect.left) / cell);
        const row = Math.round((top - rect.top) / cell);
        const [w, h] = [current.w, current.h];
        if (col < 0 || row < 0 || col + w > colsRef.current || row + h > rowsRef.current) {
          setNote(`${item.name} does not fit.`);
          return;
        }
        if (overlaps(gearRef.current, current.index, col, row, w, h, activeRef.current)) {
          setNote(`${item.name} does not fit. The bag is full.`);
          return;
        }
        void commit(current.index, {
          state: "unequipped",
          col,
          row,
          placed: false,
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
    const [w, h] = span(item);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const next: Drag = {
      index,
      dx: (w * 2.4 * rem) / 2,
      dy: (h * 2.4 * rem) / 2,
      x: event.clientX,
      y: event.clientY,
      w,
      h,
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
              art={picture}
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
                      art={picture}
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
              art={picture}
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
                    {item && (
                      <ItemBlock
                        item={item}
                        index={index}
                        picture={picture(item.name)}
                        selected={selected === index}
                        dragging={drag?.index === index}
                        onPick={setSelected}
                        onDrag={beginDrag}
                        onRotate={rotate}
                        onUpload={uploadPicture}
                        className="slot-item"
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
                  {item && (
                    <ItemBlock
                      item={item}
                      index={index}
                      picture={picture(item.name)}
                      selected={selected === index}
                      dragging={drag?.index === index}
                      onPick={setSelected}
                      onDrag={beginDrag}
                      onRotate={rotate}
                      onUpload={uploadPicture}
                      className="slot-item"
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
                  <ItemBlock
                    key={`extra-${item.name}-${index}`}
                    item={item}
                    index={index}
                    picture={picture(item.name)}
                    selected={selected === index}
                    dragging={drag?.index === index}
                    onPick={setSelected}
                    onDrag={beginDrag}
                    onRotate={rotate}
                    onUpload={uploadPicture}
                  />
                );
              })}
          </div>
          <div
            ref={gridRef}
            className="bag-grid"
            data-drop="bag"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(2.4rem, 2.4rem))`,
              gridTemplateRows: `repeat(${rows}, minmax(2.4rem, 2.4rem))`,
              gridAutoRows: "0px",
              gridAutoColumns: "0px",
            }}
          >
            {Array.from({ length: cols * rows }, (_, i) => (
              <div
                key={i}
                className="bag-cell"
                style={art["bag-cell"] ? { background: `url(${art["bag-cell"]}) center / cover no-repeat` } : undefined}
              />
            ))}
            {hover && drag && (
              <div
                className={`bag-snap ${hover.ok ? "" : "bad"}`}
                style={{
                  gridColumn: `${hover.col + 1} / span ${drag.w}`,
                  gridRow: `${hover.row + 1} / span ${drag.h}`,
                }}
              />
            )}
            {packed.map((item) => {
              const index = gear.indexOf(item);
              return (
                <ItemBlock
                  key={`${item.name}-${index}`}
                  item={item}
                  index={index}
                  picture={picture(item.name)}
                  selected={selected === index}
                  dragging={drag?.index === index}
                  onPick={setSelected}
                  onDrag={beginDrag}
                  onRotate={rotate}
                  onUpload={uploadPicture}
                  style={{
                    gridColumn: `${(item.col || 0) + 1} / span ${item.w || 1}`,
                    gridRow: `${(item.row || 0) + 1} / span ${item.h || 1}`,
                  }}
                  className="bag-item"
                />
              );
            })}
          </div>
          {loose.length > 0 && (
            <div className="bag-loose">
              {loose.map((item) => {
                const index = gear.indexOf(item);
                return (
                  <ItemBlock
                    key={`${item.name}-loose`}
                    item={item}
                    index={index}
                    picture={picture(item.name)}
                    selected={selected === index}
                    dragging={drag?.index === index}
                    onPick={setSelected}
                    onDrag={beginDrag}
                    onRotate={rotate}
                    onUpload={uploadPicture}
                  />
                );
              })}
            </div>
          )}
          {note && <p className="gear-note">{note}</p>}
          <p className="bag-foot">
            {active?.label || ""}
            {character.carry_label ? ` · body ${character.carry_label}` : ""}
          </p>
        </div>
        {drag && (
          <div
            className="bag-ghost"
            style={{
              left: drag.x - drag.dx,
              top: drag.y - drag.dy,
              width: `calc(${drag.w} * 2.4rem)`,
              height: `calc(${drag.h} * 2.4rem)`,
              zIndex: 200,
            }}
          >
            {gear[drag.index] && picture(gear[drag.index].name) ? (
              <img src={picture(gear[drag.index].name)} alt="" draggable={false} />
            ) : null}
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
  art,
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
  art: (name: string) => string;
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
  return (
    <div
      className={`hand-pad ${side} ${item ? "gripping" : ""} ${effect === "shield" ? "held-shield" : ""} ${compact ? "compact" : ""} ${selected === index && index >= 0 ? "on" : ""}`}
      data-drop={`hand:${side}`}
      title={item?.name || ""}
      onPointerDown={item && index >= 0 ? (event) => onDrag(event, index) : undefined}
      onClick={item && index >= 0 ? () => onPick(index) : undefined}
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
    </div>
  );
}

function ItemBlock({
  item,
  index,
  picture,
  selected,
  dragging,
  onPick,
  onDrag,
  onRotate,
  onUpload,
  style,
  className,
}: {
  item: Gear;
  index: number;
  picture: string;
  selected: boolean;
  dragging: boolean;
  onPick: (index: number) => void;
  onDrag: (event: ReactPointerEvent, index: number) => void;
  onRotate: (index: number) => void;
  onUpload: (name: string, file: File) => void;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`${className || "gear-token"} ${selected ? "on" : ""} ${dragging ? "is-dragging" : ""}`}
      style={style}
      title={item.name}
      onPointerDown={(event) => onDrag(event, index)}
      onClick={() => onPick(index)}
      onContextMenu={(event) => {
        event.preventDefault();
        onPick(index);
        onRotate(index);
      }}
    >
      {picture ? (
        <img src={picture} alt="" draggable={false} />
      ) : selected ? (
        <label className="gear-upload" title={`Add a picture for ${item.name}`} onPointerDown={(event) => event.stopPropagation()}>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(item.name, file);
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

function inBag(item: Gear, bag: BagSummary | null): boolean {
  if (!bag) return true;
  return (item.container || "").toLowerCase() === bag.name.toLowerCase();
}

function span(item: Gear): [number, number] {
  if (item.state === "unequipped" && item.w && item.h) return [item.w, item.h];
  const name = item.name.toLowerCase();
  let w = 1;
  let h = 1;
  if (item.effect === "armor" || name.includes("cloak")) {
    w = 2;
    h = 3;
  } else if (item.effect === "shield") {
    w = 2;
    h = 2;
  } else if (item.effect === "weapon") {
    if ((item.hands || 1) >= 2) h = 5;
    else if (/\b(dagger|knife|dart)\b/.test(name)) h = 2;
    else h = 4;
  }
  return item.rotated ? [h, w] : [w, h];
}

function overlaps(gear: Gear[], index: number, col: number, row: number, w: number, h: number, bag: BagSummary | null) {
  const taken = new Set<string>();
  gear.forEach((item, itemIndex) => {
    if (itemIndex === index || item.state !== "unequipped" || !item.placed || !inBag(item, bag)) return;
    const iw = item.w || 1;
    const ih = item.h || 1;
    for (let y = item.row || 0; y < (item.row || 0) + ih; y += 1) {
      for (let x = item.col || 0; x < (item.col || 0) + iw; x += 1) taken.add(`${x},${y}`);
    }
  });
  for (let y = row; y < row + h; y += 1) {
    for (let x = col; x < col + w; x += 1) {
      if (taken.has(`${x},${y}`)) return true;
    }
  }
  return false;
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
