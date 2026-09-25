import { useEffect, useRef, useState, type PointerEvent } from "react";
import { api, type BattleMap, type MapSetupBody, type PoolKind } from "../api";
import { POOL_KINDS } from "./pools";

const GRID = 50;

type Cell = { c: number; r: number };
type Flow =
  | { id: "size" }
  | { id: "walls" }
  | { id: "ground" }
  | { id: "liquid"; kind: PoolKind }
  | { id: "lights" }
  | { id: "portals" };

const FLOW: Flow[] = [
  { id: "size" },
  { id: "walls" },
  { id: "ground" },
  ...POOL_KINDS.map((kind) => ({ id: "liquid" as const, kind })),
  { id: "lights" },
  { id: "portals" },
];

type DraftLight = {
  key: string;
  c: number;
  r: number;
  bright_ft: number;
  dim_ft: number;
  kind: "torch" | "lamp";
};

type DraftPortal = {
  key: string;
  c: number;
  r: number;
  targetMapId: string | null;
};

type MarkSnap = {
  walls: string[];
  doors: Record<string, string | null>;
  ground: string[];
  liquids: Record<string, string[]>;
  lights: DraftLight[];
  portals: DraftPortal[];
  selectedLight: string | null;
  selectedPortal: string | null;
  offsetX: number;
  offsetY: number;
};

const LIQUID_FILL: Record<string, string> = {
  water: "rgba(70, 170, 255, 0.28)",
  lava: "rgba(255, 90, 20, 0.32)",
  acid: "rgba(190, 220, 40, 0.3)",
  slime: "rgba(40, 170, 70, 0.32)",
  blood: "rgba(180, 20, 40, 0.32)",
  mana: "rgba(170, 80, 255, 0.3)",
};

const LIQUID_STROKE: Record<string, string> = {
  water: "#b9e6ff",
  lava: "#ffd0a0",
  acid: "#f4ff9a",
  slime: "#b6ffb0",
  blood: "#ffb0b8",
  mana: "#efd0ff",
};

export function MapSetup({
  file,
  maps,
  currentMapId,
  initialName,
  onCancel,
  onConfirm,
  onError,
}: {
  file: File;
  maps: BattleMap[];
  currentMapId: string | null;
  initialName: string;
  onCancel: () => void;
  onConfirm: (body: MapSetupBody) => void;
  onError: (message: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState(initialName || "Map");
  const [wide, setWide] = useState(24);
  const [tall, setTall] = useState(16);
  const [feet, setFeet] = useState(5);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [index, setIndex] = useState(0);
  const [brush, setBrush] = useState<"wall" | "door">("wall");
  const [wallCells, setWallCells] = useState<string[]>([]);
  const [doorCells, setDoorCells] = useState<Record<string, string | null>>({});
  const [groundCells, setGroundCells] = useState<string[]>([]);
  const [liquidCells, setLiquidCells] = useState<Record<string, string[]>>({});
  const [liquidDepth, setLiquidDepth] = useState<Record<string, number>>({});
  const [liquidCurrent, setLiquidCurrent] = useState<Record<string, number>>({});
  const [lights, setLights] = useState<DraftLight[]>([]);
  const [portals, setPortals] = useState<DraftPortal[]>([]);
  const [selectedLight, setSelectedLight] = useState<string | null>(null);
  const [selectedPortal, setSelectedPortal] = useState<string | null>(null);
  const [guessing, setGuessing] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ w: 640, h: 400 });
  const aspectRef = useRef(1.5);
  const alignDrag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const painting = useRef(false);
  const strokeMode = useRef<"paint" | "erase">("paint");
  const seen = useRef(new Set<string>());
  const guessedSig = useRef("");
  const flowRef = useRef<Flow>(FLOW[0]);
  const brushRef = useRef(brush);
  const wallRef = useRef(wallCells);
  const doorRef = useRef(doorCells);
  const groundRef = useRef(groundCells);
  const liquidRef = useRef(liquidCells);
  const lightsRef = useRef(lights);
  const portalsRef = useRef(portals);
  const history = useRef<MarkSnap[]>([]);

  const width = Math.max(16, wide * GRID);
  const height = Math.max(16, tall * GRID);
  const step = FLOW[index];
  const others = maps.filter((map) => map.id !== currentMapId);
  const light = lights.find((item) => item.key === selectedLight) || null;
  const portal = portals.find((item) => item.key === selectedPortal) || null;
  flowRef.current = step;
  brushRef.current = brush;
  wallRef.current = wallCells;
  doorRef.current = doorCells;
  groundRef.current = groundCells;
  liquidRef.current = liquidCells;
  lightsRef.current = lights;
  portalsRef.current = portals;

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    const image = new Image();
    image.onload = () => {
      const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
      aspectRef.current = aspect || 1.5;
      const nextWide = 24;
      const nextTall = Math.max(4, Math.min(80, Math.round(nextWide / aspectRef.current)));
      setWide(nextWide);
      setTall(nextTall);
    };
    image.src = objectUrl;
    history.current = [];
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      const snap = history.current.pop();
      if (!snap) return;
      setWallCells(snap.walls);
      setDoorCells(snap.doors);
      setGroundCells(snap.ground);
      setLiquidCells(snap.liquids);
      setLights(snap.lights);
      setPortals(snap.portals);
      setSelectedLight(snap.selectedLight);
      setSelectedPortal(snap.selectedPortal);
      setOffsetX(snap.offsetX);
      setOffsetY(snap.offsetY);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function pushHistory() {
    history.current.push({
      walls: [...wallRef.current],
      doors: { ...doorRef.current },
      ground: [...groundRef.current],
      liquids: Object.fromEntries(Object.entries(liquidRef.current).map(([kind, cells]) => [kind, [...cells]])),
      lights: lightsRef.current.map((item) => ({ ...item })),
      portals: portalsRef.current.map((item) => ({ ...item })),
      selectedLight,
      selectedPortal,
      offsetX,
      offsetY,
    });
    if (history.current.length > 40) history.current.shift();
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      if (sw < 2 || sh < 2) return;
      const aspect = width / Math.max(1, height);
      let w = sw;
      let h = w / aspect;
      if (h > sh) {
        h = sh;
        w = h * aspect;
      }
      setFrameSize({ w, h });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [width, height]);

  function setSquares(nextWide: number) {
    const columns = Math.max(4, Math.min(80, nextWide));
    const rows = Math.max(4, Math.min(80, Math.round(columns / (aspectRef.current || 1.5))));
    setWide(columns);
    setTall(rows);
  }

  function toMap(event: { clientX: number; clientY: number }) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
  }

  function cellAt(event: { clientX: number; clientY: number }): Cell | null {
    const point = toMap(event);
    const c = Math.floor((point.x - offsetX) / GRID);
    const r = Math.floor((point.y - offsetY) / GRID);
    const x = offsetX + c * GRID;
    const y = offsetY + r * GRID;
    if (x >= width || y >= height || x + GRID <= 0 || y + GRID <= 0) return null;
    return { c, r };
  }

  function marked(cell: Cell) {
    const key = cellKey(cell.c, cell.r);
    const current = flowRef.current;
    if (current.id === "walls") {
      return brushRef.current === "door" ? key in doorRef.current : wallRef.current.includes(key);
    }
    if (current.id === "ground") return groundRef.current.includes(key);
    if (current.id === "liquid") return (liquidRef.current[current.kind] || []).includes(key);
    return false;
  }

  function applyCell(cell: Cell) {
    const key = cellKey(cell.c, cell.r);
    const current = flowRef.current;
    const erase = strokeMode.current === "erase";
    if (current.id === "walls" && brushRef.current === "door") {
      if (erase) {
        setDoorCells((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return;
      }
      setWallCells((prev) => dropKey(prev, key));
      setGroundCells((prev) => dropKey(prev, key));
      setLiquidCells((prev) => stripLiquid(prev, key));
      setDoorCells((prev) => ({ ...prev, [key]: key in prev ? prev[key] : null }));
      return;
    }
    if (current.id === "walls") {
      if (erase) {
        setWallCells((prev) => dropKey(prev, key));
        return;
      }
      setDoorCells((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setGroundCells((prev) => dropKey(prev, key));
      setLiquidCells((prev) => stripLiquid(prev, key));
      setWallCells((prev) => addKey(prev, key));
      return;
    }
    if (current.id === "ground") {
      if (erase) {
        setGroundCells((prev) => dropKey(prev, key));
        return;
      }
      setWallCells((prev) => dropKey(prev, key));
      setDoorCells((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setLiquidCells((prev) => stripLiquid(prev, key));
      setGroundCells((prev) => addKey(prev, key));
      return;
    }
    if (current.id === "liquid") {
      const kind = current.kind;
      if (erase) {
        setLiquidCells((prev) => ({ ...prev, [kind]: dropKey(prev[kind] || [], key) }));
        return;
      }
      setWallCells((prev) => dropKey(prev, key));
      setDoorCells((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setGroundCells((prev) => dropKey(prev, key));
      setLiquidCells((prev) => {
        const next: Record<string, string[]> = {};
        for (const name of POOL_KINDS) {
          const cleared = dropKey(prev[name] || [], key);
          next[name] = name === kind ? addKey(cleared, key) : cleared;
        }
        return next;
      });
    }
  }

  function toggleLight(cell: Cell) {
    const key = cellKey(cell.c, cell.r);
    const existing = lightsRef.current.find((item) => cellKey(item.c, item.r) === key);
    if (existing) {
      setLights((prev) => prev.filter((item) => item.key !== existing.key));
      setSelectedLight((cur) => (cur === existing.key ? null : cur));
      return;
    }
    const created: DraftLight = {
      key: `light-${Date.now()}`,
      c: cell.c,
      r: cell.r,
      bright_ft: 20,
      dim_ft: 20,
      kind: "torch",
    };
    setLights((prev) => [...prev, created]);
    setSelectedLight(created.key);
  }

  function togglePortal(cell: Cell) {
    const key = cellKey(cell.c, cell.r);
    const existing = portalsRef.current.find((item) => cellKey(item.c, item.r) === key);
    if (existing) {
      setPortals((prev) => prev.filter((item) => item.key !== existing.key));
      setSelectedPortal((cur) => (cur === existing.key ? null : cur));
      return;
    }
    const created: DraftPortal = { key: `portal-${Date.now()}`, c: cell.c, r: cell.r, targetMapId: null };
    setPortals((prev) => [...prev, created]);
    setSelectedPortal(created.key);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    if (step.id === "size") {
      pushHistory();
      alignDrag.current = { x: event.clientX, y: event.clientY, ox: offsetX, oy: offsetY };
      document.documentElement.dataset.dragging = "1";
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const cell = cellAt(event);
    if (!cell) return;
    pushHistory();
    if (step.id === "lights") {
      toggleLight(cell);
      return;
    }
    if (step.id === "portals") {
      togglePortal(cell);
      return;
    }
    painting.current = true;
    seen.current = new Set([cellKey(cell.c, cell.r)]);
    strokeMode.current = marked(cell) ? "erase" : "paint";
    event.currentTarget.setPointerCapture(event.pointerId);
    applyCell(cell);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = alignDrag.current;
    const rect = frameRef.current?.getBoundingClientRect();
    if (drag && rect && step.id === "size") {
      const dx = ((event.clientX - drag.x) / rect.width) * width;
      const dy = ((event.clientY - drag.y) / rect.height) * height;
      setOffsetX(drag.ox + dx);
      setOffsetY(drag.oy + dy);
      return;
    }
    if (!painting.current) return;
    const cell = cellAt(event);
    if (!cell) return;
    const key = cellKey(cell.c, cell.r);
    if (seen.current.has(key)) return;
    seen.current.add(key);
    applyCell(cell);
  }

  function onPointerUp() {
    alignDrag.current = null;
    painting.current = false;
    seen.current.clear();
    delete document.documentElement.dataset.dragging;
  }

  async function guess() {
    setGuessing(true);
    try {
      const suggestion = await api.suggestMapMarks(file, width, height, GRID, offsetX, offsetY);
      pushHistory();
      setWallCells((suggestion.walls || []).map((cell) => cellKey(cell.c, cell.r)));
      const doors: Record<string, string | null> = {};
      for (const door of suggestion.doors || []) doors[cellKey(door.c, door.r)] = null;
      setDoorCells(doors);
      setGroundCells((suggestion.ground || []).map((cell) => cellKey(cell.c, cell.r)));
      const nextCells: Record<string, string[]> = {};
      const depth: Record<string, number> = {};
      const current: Record<string, number> = {};
      for (const kind of POOL_KINDS) {
        nextCells[kind] = [];
        depth[kind] = 5;
        current[kind] = 0;
      }
      for (const pool of suggestion.liquids || []) {
        nextCells[pool.kind] = (pool.cells || []).map((cell) => cellKey(cell.c, cell.r));
        depth[pool.kind] = pool.depth_ft;
        current[pool.kind] = pool.current_ft;
      }
      setLiquidCells(nextCells);
      setLiquidDepth(depth);
      setLiquidCurrent(current);
      setLights(
        (suggestion.lights || []).map((item, lightIndex) => ({
          key: `l-${lightIndex}-${item.c}-${item.r}`,
          c: item.c,
          r: item.r,
          bright_ft: item.bright_ft,
          dim_ft: item.dim_ft,
          kind: item.kind === "lamp" ? "lamp" : "torch",
        }))
      );
      setSelectedLight(null);
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setGuessing(false);
    }
  }

  async function goNext() {
    if (guessing) return;
    if (step.id === "size") {
      const sig = `${wide}|${tall}|${Math.round(offsetX)}|${Math.round(offsetY)}`;
      if (sig !== guessedSig.current) {
        const ok = await guess();
        if (!ok) return;
        guessedSig.current = sig;
      }
    }
    if (index >= FLOW.length - 1) {
      confirm();
      return;
    }
    setIndex(index + 1);
  }

  function confirm() {
    const walls = [
      ...wallCells.map((key) => ({
        points: squareLine(key, offsetX, offsetY, false),
        door: false,
        door_open: false,
        target_map_id: null,
        target_x: null,
        target_y: null,
        link_wall_id: null,
        both_ways: false,
      })),
      ...Object.entries(doorCells).map(([key, targetMapId]) => {
        const scene = others.find((map) => map.id === targetMapId);
        return {
          points: squareLine(key, offsetX, offsetY, true),
          door: true,
          door_open: false,
          target_map_id: scene ? scene.id : null,
          target_x: scene ? scene.width / 2 : null,
          target_y: scene ? scene.height / 2 : null,
          link_wall_id: null,
          both_ways: false,
        };
      }),
    ];
    const pools = POOL_KINDS.flatMap((kind) => {
      const cells = liquidCells[kind] || [];
      if (!cells.length) return [];
      return [
        {
          kind,
          depth_ft: liquidDepth[kind] ?? 5,
          current_ft: liquidCurrent[kind] ?? 0,
          current_deg: 0,
          mask_png: cellsToPng(cells, width, height, offsetX, offsetY),
        },
      ];
    });
    onConfirm({
      name: name.trim() || "Map",
      width,
      height,
      grid_size_px: GRID,
      grid_offset_x: offsetX,
      grid_offset_y: offsetY,
      feet_per_square: Math.max(1, feet),
      walls,
      lights: lights.map((item) => ({
        x: offsetX + item.c * GRID + GRID / 2,
        y: offsetY + item.r * GRID + GRID / 2,
        bright_ft: item.bright_ft,
        dim_ft: item.dim_ft,
        kind: item.kind,
      })),
      portals: portals.flatMap((item) => {
        const scene = others.find((map) => map.id === item.targetMapId);
        if (!scene) return [];
        return [
          {
            x: offsetX + item.c * GRID + GRID / 2,
            y: offsetY + item.r * GRID + GRID / 2,
            radius: GRID * 0.8,
            target_map_id: scene.id,
            target_x: scene.width / 2,
            target_y: scene.height / 2,
            label: `To ${scene.name}`,
          },
        ];
      }),
      pools,
      ground_png: cellsToPng([...groundCells, ...Object.keys(doorCells)], width, height, offsetX, offsetY),
    });
  }

  const tiles = tilesFor(step, brush, wallCells, doorCells, groundCells, liquidCells, lights, portals, selectedLight, selectedPortal, offsetX, offsetY);
  const gridLines = gridPath(width, height, offsetX, offsetY);

  return (
    <div className="map-setup">
      <div className="map-setup-bar">
        <div className="map-setup-heading">
          <strong>Map setup</strong>
          <span>{heading(step)}</span>
          <span className="muted small">{blurb(step, brush)}</span>
        </div>
        <div className="map-setup-nav">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn ghost" disabled={index === 0 || guessing} onClick={() => setIndex(index - 1)}>
            Back
          </button>
          <button type="button" className="btn" disabled={guessing} onClick={() => void goNext()}>
            {guessing ? "Reading…" : "Next"}
          </button>
        </div>
      </div>

      {step.id === "size" && (
        <div className="map-setup-fields">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Feet per square
            <input type="number" min={1} max={30} value={feet} onChange={(event) => setFeet(Number(event.target.value) || 5)} />
          </label>
          <button type="button" className="btn ghost" onClick={() => setSquares(wide - 2)}>
            Fewer squares
          </button>
          <button type="button" className="btn ghost" onClick={() => setSquares(wide + 2)}>
            More squares
          </button>
          <span className="muted small">
            {wide} by {tall}
          </span>
        </div>
      )}

      {step.id === "walls" && (
        <div className="map-setup-fields">
          <button type="button" className={`btn ghost ${brush === "wall" ? "active-tab" : ""}`} onClick={() => setBrush("wall")}>
            Wall
          </button>
          <button type="button" className={`btn ghost ${brush === "door" ? "active-tab" : ""}`} onClick={() => setBrush("door")}>
            Door
          </button>
        </div>
      )}

      {step.id === "liquid" && (
        <div className="map-setup-fields">
          <label>
            Depth ft
            <input
              type="number"
              min={0}
              value={liquidDepth[step.kind] ?? 5}
              onChange={(event) =>
                setLiquidDepth((prev) => ({ ...prev, [step.kind]: Math.max(0, Number(event.target.value) || 0) }))
              }
            />
          </label>
          <label>
            Current ft
            <input
              type="number"
              min={0}
              value={liquidCurrent[step.kind] ?? 0}
              onChange={(event) =>
                setLiquidCurrent((prev) => ({ ...prev, [step.kind]: Math.max(0, Number(event.target.value) || 0) }))
              }
            />
          </label>
        </div>
      )}

      {step.id === "lights" && light && (
        <div className="map-setup-fields">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              pushHistory();
              setLights((prev) => prev.map((item) => (item.key === light.key ? { ...item, kind: "torch" } : item)));
            }}
          >
            Torch
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              pushHistory();
              setLights((prev) => prev.map((item) => (item.key === light.key ? { ...item, kind: "lamp" } : item)));
            }}
          >
            Lamp
          </button>
          <label>
            Bright ft
            <input
              type="number"
              value={light.bright_ft}
              onChange={(event) =>
                setLights((prev) => prev.map((item) => (item.key === light.key ? { ...item, bright_ft: Number(event.target.value) || 0 } : item)))
              }
            />
          </label>
          <label>
            Dim ft
            <input
              type="number"
              value={light.dim_ft}
              onChange={(event) =>
                setLights((prev) => prev.map((item) => (item.key === light.key ? { ...item, dim_ft: Number(event.target.value) || 0 } : item)))
              }
            />
          </label>
        </div>
      )}

      {step.id === "portals" && (
        <div className="map-setup-fields">
          {portal && (
            <label>
              Opens onto
              <select
                value={portal.targetMapId || ""}
                onChange={(event) => {
                  pushHistory();
                  setPortals((prev) =>
                    prev.map((item) => (item.key === portal.key ? { ...item, targetMapId: event.target.value || null } : item))
                  );
                }}
              >
                <option value="">Nowhere</option>
                {others.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {Object.keys(doorCells).map((key, doorIndex) => (
            <label key={key}>
              Door {doorIndex + 1} opens onto
              <select
                value={doorCells[key] || ""}
                onChange={(event) => {
                  pushHistory();
                  setDoorCells((prev) => ({ ...prev, [key]: event.target.value || null }));
                }}
              >
                <option value="">Nowhere</option>
                {others.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      <div className="map-setup-stage" ref={stageRef}>
        <div
          className="map-setup-frame"
          ref={frameRef}
          style={{ width: frameSize.w, height: frameSize.h }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {url && <img src={url} alt="" draggable={false} />}
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="map-setup-svg">
            {tiles.map((tile) => (
              <rect
                key={tile.key}
                x={tile.x}
                y={tile.y}
                width={GRID}
                height={GRID}
                fill={tile.fill}
                stroke={tile.stroke}
                strokeWidth={tile.stroke ? 3 : 0}
              />
            ))}
            <path d={gridLines} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />
          </svg>
        </div>
      </div>
    </div>
  );
}

function heading(step: Flow) {
  if (step.id === "liquid") {
    const name = step.kind.charAt(0).toUpperCase() + step.kind.slice(1);
    return `4 of 6 · ${name}`;
  }
  const names: Record<string, string> = {
    size: "1 of 6 · Size",
    walls: "2 of 6 · Walls",
    ground: "3 of 6 · Solid ground",
    lights: "5 of 6 · Lights",
    portals: "6 of 6 · Portals",
  };
  return names[step.id];
}

function blurb(step: Flow, brush: "wall" | "door") {
  if (step.id === "size") return "More squares makes the grid finer. Drag the picture to line the squares up.";
  if (step.id === "walls" && brush === "door") return "Paint door squares yourself. A drag that starts on a door clears it. Ctrl+Z undoes.";
  if (step.id === "walls") return "No walls are guessed. Paint the squares that block movement. Ctrl+Z undoes.";
  if (step.id === "ground") return "Solid ground is highlighted. Water and other liquids are left empty. Ctrl+Z undoes.";
  if (step.id === "liquid") {
    const name = step.kind.charAt(0).toUpperCase() + step.kind.slice(1);
    return `${name} squares are highlighted. A drag that starts on one clears it. Ctrl+Z undoes.`;
  }
  if (step.id === "lights") return "No lights are guessed. Click a square to place or remove one. Ctrl+Z undoes.";
  return "Click a square to place or remove a portal. Choose where it opens. Ctrl+Z undoes.";
}

function tilesFor(
  step: Flow,
  brush: "wall" | "door",
  wallCells: string[],
  doorCells: Record<string, string | null>,
  groundCells: string[],
  liquidCells: Record<string, string[]>,
  lights: DraftLight[],
  portals: DraftPortal[],
  selectedLight: string | null,
  selectedPortal: string | null,
  offsetX: number,
  offsetY: number
) {
  const tiles: Array<{ key: string; x: number; y: number; fill: string; stroke?: string }> = [];
  const at = (key: string) => {
    const { c, r } = parseCell(key);
    return { x: offsetX + c * GRID, y: offsetY + r * GRID };
  };
  if (step.id === "walls") {
    for (const key of wallCells) {
      tiles.push({
        key: `w-${key}`,
        ...at(key),
        fill: "rgba(220, 60, 60, 0.22)",
        stroke: brush === "wall" ? "#ffb0b0" : "#c45a5a",
      });
    }
    for (const key of Object.keys(doorCells)) {
      tiles.push({
        key: `d-${key}`,
        ...at(key),
        fill: "rgba(232, 122, 58, 0.22)",
        stroke: brush === "door" ? "#ffd0a8" : "#e09050",
      });
    }
  } else if (step.id === "ground") {
    for (const key of groundCells) {
      tiles.push({ key: `g-${key}`, ...at(key), fill: "rgba(90, 190, 80, 0.18)", stroke: "#c6ffb0" });
    }
  } else if (step.id === "liquid") {
    for (const key of liquidCells[step.kind] || []) {
      tiles.push({
        key: `p-${key}`,
        ...at(key),
        fill: LIQUID_FILL[step.kind] || LIQUID_FILL.water,
        stroke: LIQUID_STROKE[step.kind] || LIQUID_STROKE.water,
      });
    }
  } else if (step.id === "lights") {
    for (const item of lights) {
      tiles.push({
        key: item.key,
        x: offsetX + item.c * GRID,
        y: offsetY + item.r * GRID,
        fill: item.kind === "lamp" ? "rgba(255, 246, 208, 0.55)" : "rgba(255, 154, 60, 0.55)",
        stroke: item.key === selectedLight ? "#fff" : undefined,
      });
    }
  } else if (step.id === "portals") {
    for (const item of portals) {
      tiles.push({
        key: item.key,
        x: offsetX + item.c * GRID,
        y: offsetY + item.r * GRID,
        fill: "rgba(155, 89, 255, 0.45)",
        stroke: item.key === selectedPortal ? "#fff" : "#d7bfff",
      });
    }
  }
  return tiles;
}

function cellKey(c: number, r: number) {
  return `${c},${r}`;
}

function parseCell(key: string): Cell {
  const [c, r] = key.split(",");
  return { c: Number(c), r: Number(r) };
}

function addKey(list: string[], key: string) {
  return list.includes(key) ? list : [...list, key];
}

function dropKey(list: string[], key: string) {
  return list.includes(key) ? list.filter((item) => item !== key) : list;
}

function stripLiquid(prev: Record<string, string[]>, key: string) {
  let changed = false;
  const next: Record<string, string[]> = {};
  for (const kind of POOL_KINDS) {
    const cleared = dropKey(prev[kind] || [], key);
    if (cleared !== (prev[kind] || [])) changed = true;
    next[kind] = cleared;
  }
  return changed ? next : prev;
}

function squareLine(key: string, offsetX: number, offsetY: number, door: boolean) {
  const { c, r } = parseCell(key);
  const x = offsetX + c * GRID;
  const y = offsetY + r * GRID;
  if (door) return [x, y + GRID / 2, x + GRID, y + GRID / 2];
  return [x, y, x + GRID, y, x + GRID, y + GRID, x, y + GRID, x, y];
}

function cellsToPng(keys: string[], mapW: number, mapH: number, offsetX: number, offsetY: number) {
  const scale = Math.min(1, 1024 / Math.max(mapW, mapH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(mapW * scale));
  canvas.height = Math.max(1, Math.round(mapH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  for (const key of keys) {
    const { c, r } = parseCell(key);
    ctx.fillRect((offsetX + c * GRID) * scale, (offsetY + r * GRID) * scale, GRID * scale + 0.75, GRID * scale + 0.75);
  }
  return canvas.toDataURL("image/png");
}

function gridPath(width: number, height: number, offsetX: number, offsetY: number) {
  const lines: string[] = [`M 0 0 H ${width} V ${height} H 0 Z`];
  const x0 = ((offsetX % GRID) + GRID) % GRID;
  const y0 = ((offsetY % GRID) + GRID) % GRID;
  for (let x = x0; x <= width; x += GRID) lines.push(`M ${x} 0 V ${height}`);
  for (let y = y0; y <= height; y += GRID) lines.push(`M 0 ${y} H ${width}`);
  return lines.join(" ");
}
