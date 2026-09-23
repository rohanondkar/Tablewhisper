import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect, Text, Group, Shape } from "react-konva";
import type Konva from "konva";
import {
  api,
  mediaUrlSync,
  type BattleMap,
  type Character,
  type CheckResult,
  type EncounterEnemy,
  type MapLight,
  type MapPortal,
  type MapToken,
  type MapWall,
  type MonsterTemplate,
  type NpcTemplate,
  type SceneNpc,
} from "../api";
import { CREATURE_SIZES, sizeToSquares } from "./sizes";
import { boundsSegments, feetToPx, visibilityPolygon, wallsToSegments } from "./vision";
import {
  AimOverlay,
  MarkLayer,
  PortalRing,
  RulingChip,
  TravelEffect,
  actionFromQuery,
  actionsFor,
  aimTiles,
  effectTiles,
  footprint,
  markKind,
  rangeGate,
  rulingSentence,
  tileCenter,
  tileKey,
  tileOf,
  type AimTile,
  type MapAction,
  type MapRuling,
  type Mark,
  type MarkPulse,
  type RulingCreature,
  type Tile,
  type Travel,
} from "./effects";
import ResolveModal, { amountIn, strikeOutcome, type ResolveRow } from "./ResolveModal";
import TurnOrder, { sortTurns, type TurnSlot } from "./TurnOrder";

const API_BASE = "http://127.0.0.1:8766";

function portraitUrl(kind: string, url?: string | null): string | null {
  let path = url || "";
  if (path.endsWith(".svg") && path.includes("/monsters/")) path = path.replace(/\.svg$/i, ".png");
  if (!path && kind !== "pc") {
    path = kind === "npc" ? "/media/tokens/token-npc-generic.png" : "/media/tokens/token-humanoid.png";
  }
  if (!path) return null;
  return mediaUrlSync(path, API_BASE);
}
const MIN_SQUARES = 2;
const MAX_SQUARES = 200;
const MIN_MAP_PX = 16;
const MAX_MAP_PX = 40000;

type VisionArea = {
  key: string;
  cx: number;
  cy: number;
  radius: number;
  points: number[];
  dim?: boolean;
};

function visionFill(dim?: boolean) {
  return dim ? "rgba(255,220,120,0.16)" : "rgba(255,220,120,0.35)";
}

function visionStroke(dim?: boolean) {
  return dim ? "rgba(255,220,120,0.35)" : "rgba(255,210,80,0.85)";
}

/** Fan of triangles from the token so a folded outline cannot punch a hole. */
function VisionFan({ area }: { area: VisionArea }) {
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        const pts = area.points;
        const n = pts.length;
        if (n < 6) return;
        ctx.beginPath();
        for (let i = 0; i < n; i += 2) {
          const j = (i + 2) % n;
          ctx.moveTo(area.cx, area.cy);
          ctx.lineTo(pts[i], pts[i + 1]);
          ctx.lineTo(pts[j], pts[j + 1]);
          ctx.closePath();
        }
        ctx.fillStyle = visionFill(area.dim);
        ctx.fill("nonzero");
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < n; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.closePath();
        ctx.strokeStyle = visionStroke(area.dim);
        ctx.lineWidth = 1;
        ctx.stroke();
      }}
    />
  );
}

type Tool =
  | "select"
  | "measure"
  | "fog"
  | "fog-erase"
  | "wall"
  | "door"
  | "light"
  | "portal";

type Props = {
  characters: Character[];
  encounter: EncounterEnemy[];
  scene: SceneNpc[];
  monsters: MonsterTemplate[];
  npcs: NpcTemplate[];
  active: boolean;
  selectedCharacterId: string | null;
  queryPulse: { id: number; text: string; result: CheckResult } | null;
  markPulse: MarkPulse | null;
  ruling: MapRuling | null;
  onRuling: (ruling: MapRuling) => void;
  onApply: (creature: RulingCreature, amount: number) => void;
  onMiss: (creature: RulingCreature) => void;
  damageShown?: Record<string, number>;
  applyBusy?: boolean;
  onError: (msg: string) => void;
  onEncounterChange: () => Promise<void> | void;
  onSceneChange: () => Promise<void> | void;
  onCharactersChange?: () => Promise<void> | void;
};

function useHtmlImage(url: string | null | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    const i = new window.Image();
    // Same-origin API media must not use anonymous CORS — it breaks SVG→canvas/Konva.
    if (!url.startsWith(API_BASE) && !url.startsWith("/")) {
      i.crossOrigin = "anonymous";
    }
    i.onload = () => setImg(i);
    i.onerror = () => setImg(null);
    i.src = url;
  }, [url]);
  return img;
}

export default function MapPanel({
  characters,
  encounter,
  scene,
  monsters,
  npcs,
  active,
  selectedCharacterId,
  queryPulse,
  markPulse,
  ruling,
  onRuling,
  onApply,
  onMiss,
  damageShown,
  applyBusy,
  onError,
  onEncounterChange,
  onSceneChange,
  onCharactersChange,
}: Props) {
  const [mapsList, setMapsList] = useState<BattleMap[]>([]);
  const [map, setMap] = useState<BattleMap | null>(null);
  const [tokens, setTokens] = useState<MapToken[]>([]);
  const [walls, setWalls] = useState<MapWall[]>([]);
  const [lights, setLights] = useState<MapLight[]>([]);
  const [portals, setPortals] = useState<MapPortal[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [armed, setArmed] = useState<MapAction | null>(null);
  const [hoverTile, setHoverTile] = useState<Tile | null>(null);
  const [travel, setTravel] = useState<Travel | null>(null);
  const [queuedTravel, setQueuedTravel] = useState<Travel | null>(null);
  const [pendingResolve, setPendingResolve] = useState<{
    result: CheckResult;
    blocked: string | null;
    notice: string | null;
    heal: boolean;
    creatures: RulingCreature[];
    travel: Travel | null;
  } | null>(null);
  const [trayW, setTrayW] = useState(() => Number(localStorage.getItem("map-tray-w")) || 240);
  const [inspectW, setInspectW] = useState(() => Number(localStorage.getItem("map-inspect-w")) || 300);
  const mapBodyRef = useRef<HTMLDivElement | null>(null);
  const [travelProgress, setTravelProgress] = useState(0);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [downed, setDowned] = useState<string[]>([]);
  const [grabbing, setGrabbing] = useState(false);
  const [portalSwirl, setPortalSwirl] = useState<{ x: number; y: number } | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnSlot[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [selectedPortalId, setSelectedPortalId] = useState<string | null>(null);
  const [playerPreview, setPlayerPreview] = useState(false);
  const [showVision, setShowVision] = useState(false);
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 40, y: 40 });
  const [measure, setMeasure] = useState<number[] | null>(null);
  const [wallDraft, setWallDraft] = useState<number[]>([]);
  const [portalDraft, setPortalDraft] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [sqWide, setSqWide] = useState("24");
  const [sqTall, setSqTall] = useState("16");
  const [bgVersion, setBgVersion] = useState(0);
  const [fogBrush, setFogBrush] = useState(40);
  const [catalogFilter, setCatalogFilter] = useState("");
  const [trayMode, setTrayMode] = useState<"field" | "add-foe" | "add-npc">("field");
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 900, h: 600 });
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fogVersion, setFogVersion] = useState(0);
  const paintingFog = useRef(false);
  const lastFogPt = useRef<{ x: number; y: number } | null>(null);
  const panning = useRef(false);
  const panOrigin = useRef({ mx: 0, my: 0, sx: 0, sy: 0 });
  const selectPan = useRef<{ mx: number; my: number; sx: number; sy: number; moved: boolean } | null>(null);
  const spaceHeld = useRef(false);
  const onErrorRef = useRef(onError);
  const seenPulse = useRef(0);
  const seenMark = useRef(0);
  onErrorRef.current = onError;

  const bgUrl = map?.background_url
    ? mediaUrlSync(map.background_url, API_BASE) + `?v=${map.id}-${bgVersion}`
    : null;
  const fogUrl = map?.fog_url ? mediaUrlSync(map.fog_url, API_BASE) : null;
  const bgImg = useHtmlImage(bgUrl);
  const fogImg = useHtmlImage(fogUrl);

  useEffect(() => {
    if (!map) return;
    const gs = Math.max(8, Number(map.grid_size_px) || 50);
    setSqWide(String(Math.max(1, Math.round(map.width / gs))));
    setSqTall(String(Math.max(1, Math.round(map.height / gs))));
  }, [map?.id, map?.width, map?.height, map?.grid_size_px]);

  const refreshList = useCallback(async () => {
    const list = await api.listMaps();
    setMapsList(list);
    return list;
  }, []);

  function ensureFogCanvas(m: BattleMap, fillBlack: boolean) {
    let c = fogCanvasRef.current;
    if (!c) {
      c = document.createElement("canvas");
      fogCanvasRef.current = c;
    }
    // Cap fog bitmap so huge maps don't freeze/crash the tab on open.
    const w = Math.max(1, Math.min(2048, Math.round(m.width)));
    const h = Math.max(1, Math.min(2048, Math.round(m.height)));
    if (c.width !== w || c.height !== h) {
      const prev = document.createElement("canvas");
      if (c.width > 0 && c.height > 0) {
        prev.width = c.width;
        prev.height = c.height;
        prev.getContext("2d")?.drawImage(c, 0, 0);
      }
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        if (!fillBlack && prev.width > 0) ctx.drawImage(prev, 0, 0, w, h);
      }
      return;
    }
    if (fillBlack) {
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  const loadState = useCallback(
    async (mapId?: string) => {
      try {
        const state = mapId ? await api.getMapState(mapId) : await api.getActiveMapState();
        const m = {
          ...state.map,
          width: Math.min(MAX_MAP_PX, Math.max(MIN_MAP_PX, Number(state.map.width) || 1200)),
          height: Math.min(MAX_MAP_PX, Math.max(MIN_MAP_PX, Number(state.map.height) || 800)),
        };
        setMap(m);
        setTokens(state.tokens);
        setWalls(state.walls);
        setLights(state.lights);
        setPortals(state.portals);
        setMarks([]);
        setArmed(null);
        setDowned([]);
        await refreshList();
        ensureFogCanvas(m, !m.fog_url);
        setFogVersion((v) => v + 1);
      } catch (e) {
        setMap(null);
        setTokens([]);
        setWalls([]);
        setLights([]);
        setPortals([]);
        onErrorRef.current(e instanceof Error ? e.message : String(e));
      }
    },
    [refreshList]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await refreshList();
        if (cancelled) return;
        if (list.length === 0) {
          const created = await api.createMap("Map 1");
          await api.activateMap(created.id);
        }
        if (cancelled) return;
        await loadState();
      } catch (e) {
        if (!cancelled) onErrorRef.current(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadState, refreshList]);

  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStageSize({
        w: Math.max(320, el.clientWidth || 320),
        h: Math.max(240, el.clientHeight || 240),
      });
    });
    ro.observe(el);
    setStageSize({
      w: Math.max(320, el.clientWidth || 320),
      h: Math.max(240, el.clientHeight || 240),
    });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (!fogImg || !fogCanvasRef.current || !map) return;
    const c = fogCanvasRef.current;
    ensureFogCanvas(map, false);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(fogImg, 0, 0, c.width, c.height);
    setFogVersion((v) => v + 1);
  }, [fogImg, map?.id]);

  const segs = useMemo(() => wallsToSegments(walls), [walls]);
  const selectedToken = tokens.find((t) => t.id === selectedTokenId) || null;
  const tokenActions = useMemo(() => {
    if (!selectedToken) return [] as MapAction[];
    if (selectedToken.kind === "pc") {
      const character = characters.find((c) => c.id === selectedToken.ref_id);
      const weapons = (character?.equipment || [])
        .filter((item) => item.state === "equipped" && (item.effect === "weapon" || item.effect === "unarmed"))
        .map((item) => item.name);
      return actionsFor(character?.attacks || [], { text: character?.features, extraWeapons: weapons });
    }
    if (selectedToken.kind === "enemy") {
      const foe = encounter.find((row) => row.id === selectedToken.ref_id);
      return actionsFor(foe?.template?.attacks || [], { text: foe?.template?.notes });
    }
    const npc = scene.find((row) => row.id === selectedToken.ref_id);
    return actionsFor(npc?.template?.attacks || [], { text: npc?.template?.notes, social: true });
  }, [selectedToken, characters, encounter, scene]);

  const rosterSig = useMemo(
    () =>
      [
        characters.map((c) => `${c.id}|${c.name}|${c.initiative}|${c.image_url || ""}`).join(","),
        encounter.map((e) => `${e.id}|${e.label || e.name}|${e.image_url || ""}`).join(","),
        scene.map((n) => `${n.id}|${n.label || n.name}|${n.image_url || ""}`).join(","),
      ].join(";"),
    [characters, encounter, scene]
  );
  const rosterRef = useRef({ characters, encounter, scene });
  rosterRef.current = { characters, encounter, scene };

  useEffect(() => {
    const { characters: pcs, encounter: foes, scene: people } = rosterRef.current;
    const built: TurnSlot[] = [
      ...pcs.map((c) => ({
        key: `pc:${c.id}`,
        refId: c.id,
        kind: "pc" as const,
        name: c.name,
        mod: c.initiative,
        sheetMod: c.initiative,
        locked: true,
        image: portraitUrl("pc", c.image_url),
        roll: null,
      })),
      ...foes.map((e) => ({
        key: `enemy:${e.id}`,
        refId: e.id,
        kind: "enemy" as const,
        name: e.label || e.name,
        mod: 0,
        sheetMod: 0,
        locked: false,
        image: portraitUrl("enemy", e.image_url),
        roll: null,
      })),
      ...people.map((n) => ({
        key: `npc:${n.id}`,
        refId: n.id,
        kind: "npc" as const,
        name: n.label || n.name,
        mod: 0,
        sheetMod: 0,
        locked: false,
        image: portraitUrl("npc", n.image_url),
        roll: null,
      })),
    ];
    setTurns((prev) => {
      const byKey = new Map(prev.map((slot) => [slot.key, slot]));
      return built.map((slot) => {
        const old = byKey.get(slot.key);
        if (!old) return slot;
        return {
          ...slot,
          mod: old.roll != null ? old.mod : slot.locked ? slot.sheetMod : old.mod,
          roll: old.roll,
        };
      });
    });
    setActiveKey((current) => (current && built.some((slot) => slot.key === current) ? current : null));
  }, [rosterSig]);

  const orderedTurns = useMemo(() => sortTurns(turns), [turns]);
  const turnStart = activeKey ? Math.max(0, orderedTurns.findIndex((slot) => slot.key === activeKey)) : 0;
  const turnQueue = activeKey
    ? orderedTurns.slice(turnStart).concat(orderedTurns.slice(0, turnStart))
    : orderedTurns;
  const laterFrom = activeKey && turnStart > 0 ? orderedTurns.length - turnStart : turnQueue.length;
  const activeSlot = orderedTurns.find((slot) => slot.key === activeKey) || null;
  const activeChar = activeSlot?.kind === "pc" ? characters.find((c) => c.id === activeSlot.refId) : undefined;
  const canSwap = Boolean(
    activeSlot &&
      activeSlot.roll != null &&
      activeChar &&
      /initiative swap/i.test(activeChar.features || "")
  );
  const swapAllies = orderedTurns
    .filter((slot) => slot.kind === "pc" && slot.key !== activeKey && slot.roll != null)
    .map((slot) => ({ key: slot.key, name: slot.name }));
  const activeTokenId =
    tokens.find((token) => activeSlot && token.kind === activeSlot.kind && token.ref_id === activeSlot.refId)?.id ||
    null;

  function focusTurn(slot: TurnSlot | undefined) {
    if (!slot) return;
    setActiveKey(slot.key);
    setArmed(null);
    const token = tokens.find((item) => item.kind === slot.kind && item.ref_id === slot.refId);
    setSelectedTokenId(token?.id ?? null);
  }

  function rollInitiative() {
    const rolled = turns.map((slot) => ({
      ...slot,
      mod: slot.locked ? slot.sheetMod : slot.mod,
      roll: 1 + Math.floor(Math.random() * 20),
    }));
    setTurns(rolled);
    setRound(1);
    const sorted = sortTurns(rolled);
    focusTurn(sorted[0]);
  }

  function nextTurn() {
    if (!orderedTurns.length) return;
    if (orderedTurns.some((slot) => slot.roll == null)) {
      rollInitiative();
      return;
    }
    const index = orderedTurns.findIndex((slot) => slot.key === activeKey);
    if (index < 0 || index === orderedTurns.length - 1) {
      setRound((value) => value + 1);
      focusTurn(orderedTurns[0]);
      return;
    }
    focusTurn(orderedTurns[index + 1]);
  }

  function swapInitiative(otherKey: string) {
    setTurns((prev) => {
      const mine = prev.find((slot) => slot.key === activeKey);
      const theirs = prev.find((slot) => slot.key === otherKey);
      if (!mine || !theirs || mine.roll == null || theirs.roll == null) return prev;
      return prev.map((slot) => {
        if (slot.key === mine.key) return { ...slot, roll: theirs.roll, mod: theirs.mod };
        if (slot.key === theirs.key) return { ...slot, roll: mine.roll, mod: mine.mod };
        return slot;
      });
    });
  }
  const highlighted = useMemo(() => {
    if (!armed || !map || !selectedToken) return [] as AimTile[];
    const from = footprint(selectedToken.x, selectedToken.y, selectedToken.size_sq, map);
    const others = tokens
      .filter((item) => item.id !== selectedToken.id)
      .flatMap((item) => footprint(item.x, item.y, item.size_sq, map));
    return aimTiles(armed, from, hoverTile, map, segs, others);
  }, [armed, map, selectedToken, hoverTile, tokens, segs]);

  useEffect(() => {
    if (!travel) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 520);
      setTravelProgress(t);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setTravel(null);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [travel]);

  function startSplitDrag(side: "tray" | "inspect", event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const start = side === "tray" ? trayW : inspectW;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const next = side === "tray" ? start + dx : start - dx;
      const room = Math.max(280, (mapBodyRef.current?.clientWidth || 900) - 160);
      const clamped = Math.max(0, Math.min(room, next));
      if (side === "tray") setTrayW(clamped);
      else setInspectW(clamped);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setTrayW((width) => {
        const snapped = width > 0 && width < 140 ? 140 : width;
        localStorage.setItem("map-tray-w", String(snapped));
        return snapped;
      });
      setInspectW((width) => {
        const snapped = width > 0 && width < 160 ? 160 : width;
        localStorage.setItem("map-inspect-w", String(snapped));
        return snapped;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  async function commitResolve(rows: ResolveRow[]) {
    const pending = pendingResolve;
    if (!pending || pending.blocked) return;
    if (pending.travel) beginTravel(pending.travel);
    let hold = false;
    for (const row of rows) {
      if (!row.creature) continue;
      const face = Number(row.roll);
      const typed = amountIn(row.info);
      if (pending.heal) {
        const healing = typed ?? (Number.isInteger(face) ? face : null);
        if (healing) await Promise.resolve(onApply(row.creature, healing));
        continue;
      }
      const strike = strikeOutcome(pending.result, row.roll, row.info);
      if (strike.kind === "pending") {
        hold = true;
        continue;
      }
      if (strike.kind === "damage") await Promise.resolve(onApply(row.creature, strike.amount));
      else if (strike.kind === "miss") onMiss(row.creature);
    }
    if (!hold) setPendingResolve(null);
  }

  function beginTravel(next: Travel) {
    if (active) {
      setTravel(next);
      setTravelProgress(0);
      return;
    }
    setQueuedTravel(next);
  }

  useEffect(() => {
    if (!active || !queuedTravel) return;
    setTravel(queuedTravel);
    setTravelProgress(0);
    setQueuedTravel(null);
  }, [active, queuedTravel]);

  function tokenCreature(token: MapToken, tile: Tile): RulingCreature {
    return {
      key: token.id,
      tokenId: token.id,
      refId: token.ref_id,
      kind: token.kind,
      label: token.label,
      tile,
    };
  }

  function tokenFaded(token: MapToken): boolean {
    const hp = tokenVitals(token)?.current;
    if (hp != null) return hp <= 0;
    return downed.includes(token.id);
  }

  function tokenVitals(token: MapToken): { current: number; max: number; temp: number } | null {
    if (token.kind === "pc") {
      const row = characters.find((item) => item.id === token.ref_id);
      if (!row || row.max_hp <= 0) return null;
      return { current: row.current_hp ?? row.max_hp, max: row.max_hp, temp: row.temp_hp ?? 0 };
    }
    if (token.kind === "enemy") {
      const row = encounter.find((item) => item.id === token.ref_id);
      if (!row || row.max_hp <= 0) return null;
      return { current: row.current_hp, max: row.max_hp, temp: 0 };
    }
    if (token.kind === "npc") {
      const row = scene.find((item) => item.id === token.ref_id);
      if (!row || row.max_hp <= 0) return null;
      return { current: row.current_hp, max: row.max_hp, temp: 0 };
    }
    return null;
  }

  function creaturesOn(tiles: Tile[]): RulingCreature[] {
    if (!map) return [];
    const keys = new Set(tiles.map(tileKey));
    const found: RulingCreature[] = [];
    for (const token of tokens) {
      const foot = footprint(token.x, token.y, token.size_sq, map);
      const hit = foot.find((tile) => keys.has(tileKey(tile)));
      if (hit) found.push(tokenCreature(token, hit));
    }
    return found;
  }

  function findTokenByName(name: string | null | undefined): MapToken | null {
    const low = (name || "").trim().toLowerCase();
    if (!low) return null;
    let best: MapToken | null = null;
    let score = 0;
    for (const token of tokens) {
      const pc = token.kind === "pc" ? characters.find((row) => row.id === token.ref_id) : null;
      const foe = token.kind === "enemy" ? encounter.find((row) => row.id === token.ref_id) : null;
      const npc = token.kind === "npc" ? scene.find((row) => row.id === token.ref_id) : null;
      const names = [token.label, pc?.name, foe?.label, foe?.name, npc?.label, npc?.name].filter(
        (item): item is string => Boolean(item)
      );
      for (const item of names) {
        const value = item.toLowerCase();
        let next = 0;
        if (value === low) next = 100 + value.length;
        else if (low.includes(value) || value.includes(low)) next = value.length;
        if (next > score) {
          score = next;
          best = token;
        }
      }
    }
    return best;
  }

  function creatureFromResult(result: CheckResult, token: MapToken | null): RulingCreature | null {
    if (!result.target && !token) return null;
    const tile = token && map ? footprint(token.x, token.y, token.size_sq, map)[0] : null;
    return {
      key: token?.id || result.target?.id || result.target?.label || "target",
      tokenId: token?.id || null,
      refId: token?.ref_id || result.target?.id || null,
      kind: token?.kind || result.target?.kind || "enemy",
      label: token?.label || result.target?.label || "Target",
      tile,
    };
  }

  function publishRuling(
    result: CheckResult,
    action: MapAction | null,
    blocked: string | null,
    tiles: Tile[],
    anchor: Tile | null,
    creatures: RulingCreature[]
  ) {
    const heal = Boolean(action && (action.family === "heal" || action.damageType === "healing"));
    const boxes = heal || result.check_type === "attack" || result.check_type === "save";
    onRuling({
      id: Date.now(),
      result,
      blocked,
      action,
      creatures: blocked || !boxes ? [] : creatures,
      tiles,
      anchor,
      heal,
    });
  }

  async function fireAction(action: MapAction, tile: Tile, target: MapToken | null, far: boolean) {
    if (!map || !selectedToken) return;
    const fromTiles = footprint(selectedToken.x, selectedToken.y, selectedToken.size_sq, map);
    const sentence = rulingSentence(selectedToken.label, action, target?.label || "the open ground", far);
    setArmed(null);
    setHoverTile(null);
    const pcId = selectedToken.kind === "pc" ? selectedToken.ref_id : target?.kind === "pc" ? target.ref_id : null;
    try {
      const result = await api.query(sentence, pcId, "map");
      const blocked = result.possible === false || result.check_type === "impossible" ? result.notes || "That action is not possible." : null;
      const tiles = blocked ? [] : effectTiles(action, fromTiles, tile, map, segs);
      let creatures = blocked ? [] : creaturesOn(tiles);
      const shaped = action.shape === "burst" || action.shape === "cone" || action.shape === "line" || action.shape === "cube";
      if (!blocked && target && !shaped && !creatures.some((item) => item.tokenId === target.id)) {
        creatures = [tokenCreature(target, tile), ...creatures];
      }
      const travel = blocked
        ? null
        : {
            id: Date.now(),
            family: action.family,
            damageType: action.damageType,
            from: tileCenter(fromTiles[0], map),
            to: tileCenter(tile, map),
            tiles,
          };
      publishRuling(result, action, blocked, tiles, tile, creatures);
      setPendingResolve({
        result,
        blocked,
        notice: null,
        heal: Boolean(action.family === "heal" || action.damageType === "healing"),
        creatures: blocked ? [] : creatures,
        travel,
      });
    } catch (err) {
      onErrorRef.current(err instanceof Error ? err.message : String(err));
    }
  }

  function attackerLabel(result: CheckResult, text: string): string {
    const roller = (result.participants || []).find((person) => person.role === "rolling");
    const targetLabel = (result.target?.label || "").toLowerCase();
    if (roller?.label && roller.label.toLowerCase() !== targetLabel) return roller.label;
    const head = text.split(
      /\b(?:stabs?|stabbing|attacks?|attacking|slaps?|slapping|punches?|punching|kicks?|kicking|shoots?|shooting|throws?|throwing|swings?|swinging)\b/i
    )[0];
    const named = head?.replace(/^[^a-z0-9]+/i, "").trim();
    if (named) return named;
    return result.character || "";
  }

  function guessTargetName(text: string): string {
    const match = text.match(
      /\b(?:at|on|against|stabs|stabbing|attacks|attacking|slaps|slapping|punches|punching|kicks|kicking|shoots|shooting|throws|throwing)\s+(.+)$/i
    );
    return match?.[1]?.replace(/\s+with\b[\s\S]*$/i, "").replace(/[.?!]$/, "").trim() || "";
  }

  function pcFromResult(result: CheckResult): RulingCreature | null {
    if (!result.character_id) return null;
    const token = tokens.find((item) => item.kind === "pc" && item.ref_id === result.character_id) || null;
    const tile = token && map ? footprint(token.x, token.y, token.size_sq, map)[0] : null;
    return {
      key: token?.id || result.character_id,
      tokenId: token?.id || null,
      refId: result.character_id,
      kind: "pc",
      label: token?.label || result.character || "Character",
      tile,
    };
  }

  function openResolve(
    result: CheckResult,
    action: MapAction | null,
    blocked: string | null,
    notice: string | null,
    creatures: RulingCreature[],
    travel: Travel | null
  ) {
    const heal = Boolean(action && (action.family === "heal" || action.damageType === "healing"));
    if (!(heal || result.check_type === "attack" || result.check_type === "save")) return;
    setPendingResolve({
      result,
      blocked,
      notice,
      heal,
      creatures: blocked ? [] : creatures,
      travel,
    });
  }

  async function absorbConsole(text: string, result: CheckResult) {
    if (!map) return;
    const action = actionFromQuery(text, result.check_type, result.weapon);
    const impossible = result.possible === false || result.check_type === "impossible";
    if (impossible) {
      const blocked = result.notes || "That action is not possible.";
      publishRuling(result, action, blocked, [], null, []);
      openResolve(result, action, blocked, null, [], null);
      return;
    }
    if (!action) {
      const lone = creatureFromResult(result, findTokenByName(result.target?.label));
      publishRuling(result, null, null, [], lone?.tile || null, lone?.refId ? [lone] : []);
      return;
    }
    const actorName = attackerLabel(result, text);
    const actor = findTokenByName(actorName);
    if (action.shape === "heal" && (action.rangeFt || 0) <= 0) {
      const self = actor ? tokenCreature(actor, footprint(actor.x, actor.y, actor.size_sq, map)[0]) : pcFromResult(result);
      if (self?.tile) {
        beginTravel({
          id: Date.now(),
          family: action.family,
          damageType: action.damageType,
          from: tileCenter(self.tile, map),
          to: tileCenter(self.tile, map),
          tiles: [self.tile],
        });
      }
      publishRuling(result, action, null, self?.tile ? [self.tile] : [], self?.tile || null, self ? [self] : []);
      openResolve(result, action, null, null, self ? [self] : [], null);
      return;
    }
    const targetToken = findTokenByName(result.target?.label || guessTargetName(text));
    if (!actor || !targetToken) {
      const lone = creatureFromResult(result, targetToken || findTokenByName(result.target?.label));
      const creatures = lone?.refId ? [lone] : [];
      const missing = [
        !actor ? `${actorName || "The attacker"} is not on this map, so there is no swing.` : "",
        !targetToken ? `${result.target?.label || "The target"} is not on this map.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      publishRuling(result, action, null, [], lone?.tile || null, creatures);
      openResolve(result, action, null, missing, creatures, null);
      return;
    }
    const fromTiles = footprint(actor.x, actor.y, actor.size_sq, map);
    const to = footprint(targetToken.x, targetToken.y, targetToken.size_sq, map)[0];
    const gate = rangeGate(action, fromTiles, to, map, segs);
    let next = result;
    if (gate.far && !/\blong range\b/i.test(text)) {
      try {
        next = await api.query(`${text} at long range`, selectedCharacterId, "map");
      } catch (err) {
        onErrorRef.current(err instanceof Error ? err.message : String(err));
      }
    }
    if (!gate.play) {
      publishRuling(next, action, gate.blocked, [], to, []);
      openResolve(next, action, gate.blocked, null, [], null);
      return;
    }
    const tiles = effectTiles(action, fromTiles, to, map, segs);
    let creatures = creaturesOn(tiles);
    const shaped = action.shape === "burst" || action.shape === "cone" || action.shape === "line" || action.shape === "cube";
    if (!shaped && !creatures.some((item) => item.tokenId === targetToken.id)) {
      creatures = [tokenCreature(targetToken, to), ...creatures];
    }
    beginTravel({
      id: Date.now(),
      family: action.family,
      damageType: action.damageType,
      from: tileCenter(fromTiles[0], map),
      to: tileCenter(to, map),
      tiles,
    });
    publishRuling(next, action, null, tiles, to, creatures);
    openResolve(next, action, null, null, creatures, null);
  }

  useEffect(() => {
    if (!queryPulse || !map || queryPulse.id === seenPulse.current) return;
    seenPulse.current = queryPulse.id;
    void absorbConsole(queryPulse.text, queryPulse.result);
  }, [queryPulse, map]);

  useEffect(() => {
    if (!markPulse || !map || markPulse.id === seenMark.current) return;
    seenMark.current = markPulse.id;
    if (markPulse.tile) {
      const at = tileCenter(markPulse.tile, map);
      if (markPulse.miss) {
        setMarks((prev) => [
          ...prev,
          { id: `dust-${markPulse.id}`, kind: "dust", x: at.x, y: at.y, tile: markPulse.tile as Tile },
        ]);
      } else if (!markPulse.heal) {
        const kind = markKind(markPulse.damageType);
        if (!["dust", "flash", "radiant", "necrotic", "force", "psychic", "heal"].includes(kind)) {
          setMarks((prev) => [
            ...prev,
            { id: `${kind}-${markPulse.id}`, kind, x: at.x, y: at.y, tile: markPulse.tile as Tile },
          ]);
        }
      }
    }
    if (markPulse.downed && markPulse.tokenId) {
      const tokenId = markPulse.tokenId;
      setDowned((prev) => (prev.includes(tokenId) ? prev : [...prev, tokenId]));
    }
  }, [markPulse, map]);

  async function ensureMap(): Promise<BattleMap> {
    if (map) return map;
    const created = await api.createMap("Map 1");
    const state = await api.activateMap(created.id);
    setMap(state.map);
    return state.map;
  }

  async function onUploadBackground(file: File) {
    setBusy(true);
    try {
      const m = await ensureMap();
      const updated = await api.uploadMapBackground(m.id, file);
      setBgVersion((v) => v + 1);
      setMap(updated);
      ensureFogCanvas(updated, true);
      setFogVersion((v) => v + 1);
      await refreshList();
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function applyMapSquares() {
    if (!map) return;
    const gs = Math.max(8, Number(map.grid_size_px) || 50);
    const wide = Math.min(MAX_SQUARES, Math.max(MIN_SQUARES, Math.round(Number(sqWide) || MIN_SQUARES)));
    const tall = Math.min(MAX_SQUARES, Math.max(MIN_SQUARES, Math.round(Number(sqTall) || MIN_SQUARES)));
    setSqWide(String(wide));
    setSqTall(String(tall));
    setBusy(true);
    try {
      const updated = await api.patchMap(map.id, {
        width: Math.round(wide * gs),
        height: Math.round(tall * gs),
      });
      setMap(updated);
      ensureFogCanvas(updated, false);
      setFogVersion((v) => v + 1);
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveGrid() {
    if (!map) return;
    setBusy(true);
    try {
      const updated = await api.patchMap(map.id, {
        grid_size_px: map.grid_size_px,
        grid_offset_x: map.grid_offset_x,
        grid_offset_y: map.grid_offset_y,
        feet_per_square: map.feet_per_square,
        show_grid_overlay: map.show_grid_overlay,
      });
      setMap(updated);
      setCalibrating(false);
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createScene() {
    const name = window.prompt("Scene name", `Map ${mapsList.length + 1}`);
    if (!name) return;
    setBusy(true);
    try {
      const created = await api.createMap(name);
      await api.activateMap(created.id);
      await loadState(created.id);
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function switchMap(id: string) {
    setBusy(true);
    try {
      await api.activateMap(id);
      await loadState(id);
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function syncTokens() {
    if (!map) return;
    setBusy(true);
    try {
      const list = await api.syncMapTokens(map.id);
      setTokens(list);
      await onEncounterChange();
      await onSceneChange();
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function placeExisting(
    kind: "pc" | "enemy" | "npc",
    refId: string,
    label: string,
    size: string,
    imageUrl?: string | null
  ) {
    if (!map) return;
    const existing = tokens.find((t) => t.kind === kind && t.ref_id === refId);
    if (existing) {
      setSelectedTokenId(existing.id);
      return;
    }
    const gs = map.grid_size_px;
    const t = await api.addMapToken(map.id, {
      kind,
      ref_id: refId,
      label,
      x: map.grid_offset_x + gs * 2,
      y: map.grid_offset_y + gs * 2,
      size,
      size_sq: sizeToSquares(size),
      vision_ft: 60,
      show_vision: false,
      // PCs: only pass a real portrait; omit invents nothing on the API.
      ...(kind === "pc"
        ? { image_url: imageUrl || null }
        : { image_url: imageUrl || defaultTokenImage(kind) }),
    });
    setTokens((prev) => [...prev, t]);
    setSelectedTokenId(t.id);
  }

  async function spawnFoeFromCatalog(m: MonsterTemplate) {
    if (!map) return;
    setBusy(true);
    try {
      const before = new Set(encounter.map((e) => e.id));
      const spawned = await api.spawnEnemy(m.id, 1);
      await onEncounterChange();
      const fresh = await api.listEncounter();
      const neu = fresh.filter((e) => !before.has(e.id));
      // Tokens may already be placed by API; refresh map tokens
      const state = await api.getMapState(map.id);
      setTokens(state.tokens);
      if (neu[0]) {
        const tok = state.tokens.find((t) => t.kind === "enemy" && t.ref_id === neu[0].id);
        if (tok) setSelectedTokenId(tok.id);
      }
      setTrayMode("field");
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function spawnNpcFromCatalog(n: NpcTemplate) {
    if (!map) return;
    setBusy(true);
    try {
      const before = new Set(scene.map((s) => s.id));
      await api.spawnNpc(n.id, 1);
      await onSceneChange();
      const fresh = await api.listScene();
      const neu = fresh.filter((s) => !before.has(s.id));
      const state = await api.getMapState(map.id);
      setTokens(state.tokens);
      if (neu[0]) {
        const tok = state.tokens.find((t) => t.kind === "npc" && t.ref_id === neu[0].id);
        if (tok) setSelectedTokenId(tok.id);
      }
      setTrayMode("field");
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function snap(x: number, y: number) {
    if (!map) return { x, y };
    const gs = map.grid_size_px;
    const ox = map.grid_offset_x;
    const oy = map.grid_offset_y;
    return {
      x: ox + Math.round((x - ox) / gs) * gs,
      y: oy + Math.round((y - oy) / gs) * gs,
    };
  }

  function stagePointer(stage: Konva.Stage) {
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: (pos.x - stagePos.x) / scale,
      y: (pos.y - stagePos.y) / scale,
    };
  }

  function isBgTarget(target: Konva.Node | null, stage: Konva.Stage) {
    if (!target || target === stage) return true;
    const name = target.name?.() || "";
    return name === "bg" || name === "grid" || name === "fog";
  }

  async function persistFog() {
    if (!map || !fogCanvasRef.current) return;
    // Downscale for storage if needed — keep upload small.
    const src = fogCanvasRef.current;
    let blob: Blob | null = null;
    try {
      blob = await new Promise<Blob | null>((resolve) =>
        src.toBlob((b) => resolve(b), "image/png")
      );
    } catch {
      blob = null;
    }
    if (!blob) return;
    const updated = await api.uploadFog(map.id, blob);
    setMap(updated);
  }

  function mapToFog(x: number, y: number) {
    const c = fogCanvasRef.current;
    if (!c || !map || map.width <= 0 || map.height <= 0) return { x, y };
    return {
      x: (x / map.width) * c.width,
      y: (y / map.height) * c.height,
    };
  }

  function paintFogStroke(mapX: number, mapY: number, erase: boolean) {
    const c = fogCanvasRef.current;
    if (!c || !map) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { x, y } = mapToFog(mapX, mapY);
    const scale = c.width / Math.max(1, map.width);
    const r = Math.max(4, fogBrush * scale);
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
    ctx.lineWidth = r * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const prev = lastFogPt.current;
    if (prev) {
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    lastFogPt.current = { x, y };
    setFogVersion((v) => v + 1);
  }

  async function onStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();
    if (!stage || !map) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const wantPan = spaceHeld.current || e.evt.button === 1;
    if (wantPan) {
      panning.current = true;
      setGrabbing(true);
      panOrigin.current = {
        mx: pointer.x,
        my: pointer.y,
        sx: stagePos.x,
        sy: stagePos.y,
      };
      e.evt.preventDefault();
      return;
    }

    const p = stagePointer(stage);
    if (!p) return;

    if (tool === "measure") {
      setMeasure([p.x, p.y, p.x, p.y]);
      return;
    }

    if (tool === "fog" || tool === "fog-erase") {
      paintingFog.current = true;
      lastFogPt.current = null;
      paintFogStroke(p.x, p.y, tool === "fog-erase");
      return;
    }

    if (tool === "wall" || tool === "door") {
      const s = snap(p.x, p.y);
      setWallDraft((d) => [...d, s.x, s.y]);
      return;
    }

    if (tool === "light") {
      const s = snap(p.x, p.y);
      const L = await api.addMapLight(map.id, { x: s.x, y: s.y, bright_ft: 20, dim_ft: 20 });
      setLights((prev) => [...prev, L]);
      setSelectedLightId(L.id);
      setTool("select");
      return;
    }

    if (tool === "portal") {
      const s = snap(p.x, p.y);
      setPortalDraft(s);
      setSelectedPortalId(null);
      return;
    }

    if (tool === "select" && isBgTarget(e.target, stage)) {
      selectPan.current = {
        mx: pointer.x,
        my: pointer.y,
        sx: stagePos.x,
        sy: stagePos.y,
        moved: false,
      };
    }
  }

  function onStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();
    if (!stage || !map) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const pending = selectPan.current;
    if (pending && !panning.current) {
      if (Math.hypot(pointer.x - pending.mx, pointer.y - pending.my) > 4) {
        pending.moved = true;
        panning.current = true;
        setGrabbing(true);
        panOrigin.current = pending;
      }
    }

    if (panning.current) {
      setStagePos({
        x: panOrigin.current.sx + (pointer.x - panOrigin.current.mx),
        y: panOrigin.current.sy + (pointer.y - panOrigin.current.my),
      });
      return;
    }

    const p = stagePointer(stage);
    if (!p) return;
    if (tool === "select" && armed && map) {
      setHoverTile(tileOf(p.x, p.y, map));
    }
    if (tool === "measure" && measure) {
      setMeasure([measure[0], measure[1], p.x, p.y]);
    }
    if ((tool === "fog" || tool === "fog-erase") && paintingFog.current) {
      paintFogStroke(p.x, p.y, tool === "fog-erase");
    }
  }

  async function onStageMouseUp(e?: Konva.KonvaEventObject<MouseEvent>) {
    const pending = selectPan.current;
    selectPan.current = null;
    if (panning.current) {
      panning.current = false;
      setGrabbing(false);
      return;
    }
    if (pending && !pending.moved && tool === "select") {
      const stage = e?.target?.getStage?.();
      const p = stage && map ? stagePointer(stage) : null;
      const tile = p && map ? tileOf(p.x, p.y, map) : null;
      if (armed) {
        if (tile && highlighted.some((item) => item.c === tile.c && item.r === tile.r)) {
          const token = tokens.find((item) =>
            footprint(item.x, item.y, item.size_sq, map!).some((part) => part.c === tile.c && part.r === tile.r)
          );
          void fireAction(
            armed,
            tile,
            token || null,
            highlighted.some((item) => item.c === tile.c && item.r === tile.r && item.far)
          );
        }
        return;
      }
      setSelectedTokenId(null);
      setSelectedWallId(null);
      setSelectedLightId(null);
      setSelectedPortalId(null);
      setArmed(null);
    }
    if ((tool === "fog" || tool === "fog-erase") && paintingFog.current) {
      paintingFog.current = false;
      lastFogPt.current = null;
      try {
        await persistFog();
      } catch (err) {
        onErrorRef.current(err instanceof Error ? err.message : String(err));
      }
    }
  }

  async function finishWall() {
    if (!map || wallDraft.length < 4) {
      setWallDraft([]);
      return;
    }
    const w = await api.addMapWall(map.id, {
      points: wallDraft,
      door: tool === "door",
      door_open: false,
      block_movement: true,
      block_sight: true,
    });
    setWalls((prev) => [...prev, w]);
    setWallDraft([]);
    setTool("select");
  }

  async function onTokenDragEnd(token: MapToken, x: number, y: number) {
    if (!map) return;
    const s = snap(x, y);
    const updated = await api.patchMapToken(token.id, { x: s.x, y: s.y });
    setTokens((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function createPortalTo(target: { id: string; name: string; width: number; height: number }) {
    if (!map || !portalDraft) return;
    const portal = await api.addMapPortal(map.id, {
      x: portalDraft.x,
      y: portalDraft.y,
      radius: map.grid_size_px * 0.8,
      target_map_id: target.id,
      target_x: Math.max(0, target.width) / 2,
      target_y: Math.max(0, target.height) / 2,
      label: `To ${target.name}`,
    });
    setPortals((prev) => [...prev, portal]);
    setPortalDraft(null);
    setSelectedPortalId(portal.id);
    setTool("select");
  }

  async function sendThroughPortal(portalId: string, tokenId: string, targetMapId: string) {
    const portal = portals.find((item) => item.id === portalId);
    if (portal) setPortalSwirl({ x: portal.x, y: portal.y });
    await new Promise((resolve) => setTimeout(resolve, 420));
    await api.traversePortal(portalId, [tokenId]);
    setPortalSwirl(null);
    await loadState(targetMapId);
  }

  const gridLines = useMemo(() => {
    if (!map || !map.show_grid_overlay) return [] as number[][];
    const lines: number[][] = [];
    const { width, height, grid_offset_x: ox, grid_offset_y: oy } = map;
    // Guard against 0/NaN grid size (infinite loop) and runaway line counts.
    const gs = Math.max(8, Number(map.grid_size_px) || 50);
    const maxLines = 500;
    for (let x = ox, n = 0; x <= width && n < maxLines; x += gs, n++) lines.push([x, 0, x, height]);
    for (let y = oy, n = 0; y <= height && n < maxLines; y += gs, n++) lines.push([0, y, width, y]);
    for (let x = ox - gs, n = 0; x >= 0 && n < maxLines; x -= gs, n++) lines.push([x, 0, x, height]);
    for (let y = oy - gs, n = 0; y >= 0 && n < maxLines; y -= gs, n++) lines.push([0, y, width, y]);
    return lines;
  }, [map]);

  const visionPolys = useMemo(() => {
    if (!map || !showVision) return [] as VisionArea[];
    const blockers = segs.length ? [...segs, ...boundsSegments(map.width, map.height)] : segs;
    const out: VisionArea[] = [];
    const push = (key: string, cx: number, cy: number, radius: number, dim?: boolean) => {
      if (radius <= 0) return;
      out.push({
        key,
        cx,
        cy,
        radius,
        dim,
        points: blockers.length ? visibilityPolygon({ x: cx, y: cy }, radius, blockers) : [],
      });
    };
    for (const t of tokens) {
      if (t.vision_ft <= 0) continue;
      const r = feetToPx(t.vision_ft, map.grid_size_px, map.feet_per_square);
      const cx = t.x + (t.size_sq * map.grid_size_px) / 2;
      const cy = t.y + (t.size_sq * map.grid_size_px) / 2;
      push(t.id, cx, cy, r);
    }
    for (const L of lights) {
      const bright = feetToPx(L.bright_ft, map.grid_size_px, map.feet_per_square);
      const dim = feetToPx(L.bright_ft + L.dim_ft, map.grid_size_px, map.feet_per_square);
      push(`L-${L.id}-d`, L.x, L.y, dim, true);
      push(`L-${L.id}-b`, L.x, L.y, bright);
    }
    return out;
  }, [map, tokens, lights, segs, showVision]);

  const measureLabel = useMemo(() => {
    if (!measure || !map) return null;
    const px = Math.hypot(measure[2] - measure[0], measure[3] - measure[1]);
    const feet = (px / map.grid_size_px) * map.feet_per_square;
    return `${feet.toFixed(1)} ft`;
  }, [measure, map]);

  // Force Konva to refresh when fog bitmap changes (canvas element is reused).
  const fogCanvasImage = fogVersion >= 0 ? fogCanvasRef.current : null;

  const filterLower = catalogFilter.trim().toLowerCase();
  const filteredMonsters = monsters.filter(
    (m) => !filterLower || m.name.toLowerCase().includes(filterLower)
  );
  const filteredNpcs = npcs.filter(
    (n) => !filterLower || n.name.toLowerCase().includes(filterLower)
  );

    const cursor =
    grabbing
      ? "grab"
      : tool === "fog" || tool === "fog-erase"
        ? "crosshair"
        : "default";

  return (
    <div className="map-workspace">
      <div className="map-topbar">
        <div className="map-scenes">
          {mapsList.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`btn ghost ${map?.id === m.id ? "active-tab" : ""}`}
              onClick={() => void switchMap(m.id)}
            >
              {m.name}
            </button>
          ))}
          <button type="button" className="btn" disabled={busy} onClick={() => void createScene()}>
            + Scene
          </button>
        </div>
        <div className="row">
          <label className="btn">
            Upload map
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUploadBackground(f);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" className="btn" disabled={busy || !map} onClick={() => void syncTokens()}>
            Sync tokens
          </button>
          <button
            type="button"
            className={`btn ${playerPreview ? "" : "ghost"}`}
            onClick={() => setPlayerPreview((v) => !v)}
          >
            {playerPreview ? "Player preview ON" : "Player preview"}
          </button>
          <button
            type="button"
            className={`btn ${showVision ? "" : "ghost"}`}
            title="Yellow rings are vision / light range. Off by default."
            onClick={() => setShowVision((v) => !v)}
          >
            {showVision ? "Vision ON" : "Vision OFF"}
          </button>
          <button type="button" className="btn ghost" onClick={() => setCalibrating((v) => !v)}>
            Calibrate grid
          </button>
        </div>
      </div>

      {calibrating && map && (
        <div className="map-calibrate">
          <strong>Grid</strong>
          <label>
            squares wide
            <input
              type="number"
              min={MIN_SQUARES}
              max={MAX_SQUARES}
              value={sqWide}
              onChange={(e) => setSqWide(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyMapSquares();
              }}
            />
          </label>
          <label>
            squares tall
            <input
              type="number"
              min={MIN_SQUARES}
              max={MAX_SQUARES}
              value={sqTall}
              onChange={(e) => setSqTall(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void applyMapSquares();
              }}
            />
          </label>
          <button type="button" className="btn" disabled={busy} onClick={() => void applyMapSquares()}>
            Set size
          </button>
          <strong>Calibration</strong>
          <label>
            px / square
            <input
              type="number"
              min={8}
              value={map.grid_size_px}
              onChange={(e) =>
                setMap({ ...map, grid_size_px: Math.max(8, Number(e.target.value) || 50) })
              }
            />
          </label>
          <label>
            offset X
            <input
              type="number"
              value={map.grid_offset_x}
              onChange={(e) => setMap({ ...map, grid_offset_x: Number(e.target.value) || 0 })}
            />
          </label>
          <label>
            offset Y
            <input
              type="number"
              value={map.grid_offset_y}
              onChange={(e) => setMap({ ...map, grid_offset_y: Number(e.target.value) || 0 })}
            />
          </label>
          <label>
            feet / square
            <input
              type="number"
              min={1}
              value={map.feet_per_square}
              onChange={(e) =>
                setMap({ ...map, feet_per_square: Math.max(1, Number(e.target.value) || 5) })
              }
            />
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={map.show_grid_overlay}
              onChange={(e) => setMap({ ...map, show_grid_overlay: e.target.checked })}
            />
            Show grid overlay
          </label>
          <button type="button" className="btn" onClick={() => void saveGrid()}>
            Save grid
          </button>
        </div>
      )}

      {(characters.length > 0 || encounter.length > 0 || scene.length > 0) && (
        <TurnOrder
          slots={turnQueue}
          activeKey={activeKey}
          round={round}
          laterFrom={laterFrom}
          canSwap={canSwap}
          allies={swapAllies}
          onRoll={rollInitiative}
          onNext={nextTurn}
          onPick={(key) => focusTurn(orderedTurns.find((slot) => slot.key === key))}
          onMod={(key, mod) => setTurns((prev) => prev.map((slot) => (slot.key === key ? { ...slot, mod } : slot)))}
          onSwap={swapInitiative}
        />
      )}

      <div
        className="map-body"
        ref={mapBodyRef}
        style={{ gridTemplateColumns: `${trayW}px 8px minmax(0, 1fr) 8px ${inspectW}px` }}
      >
        <aside className={`map-tray${trayW < 48 ? " collapsed" : ""}`}>
          <div className="row" style={{ marginBottom: "0.4rem" }}>
            <button
              type="button"
              className={`btn ghost ${trayMode === "field" ? "active-tab" : ""}`}
              onClick={() => setTrayMode("field")}
            >
              On field
            </button>
            <button
              type="button"
              className={`btn ghost ${trayMode === "add-foe" ? "active-tab" : ""}`}
              onClick={() => setTrayMode("add-foe")}
            >
              + Foe
            </button>
            <button
              type="button"
              className={`btn ghost ${trayMode === "add-npc" ? "active-tab" : ""}`}
              onClick={() => setTrayMode("add-npc")}
            >
              + NPC
            </button>
          </div>

          {trayMode === "field" && (
            <>
              <h3>Party</h3>
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="map-tray-item"
                  onClick={() =>
                    void placeExisting("pc", c.id, c.name, c.size || "Medium", c.image_url)
                  }
                >
                  {c.name}
                  <span className="muted small">{c.size || "Medium"}</span>
                </button>
              ))}
              <h3>Foes (encounter)</h3>
              {encounter.length === 0 && <p className="muted small">None yet — use + Foe</p>}
              {encounter.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="map-tray-item"
                  onClick={() =>
                    void placeExisting(
                      "enemy",
                      e.id,
                      e.label,
                      e.size || "Medium",
                      e.image_url
                    )
                  }
                >
                  {e.label}
                  <span className="muted small">{e.size || ""}</span>
                </button>
              ))}
              <h3>Scene NPCs</h3>
              {scene.length === 0 && <p className="muted small">None yet — use + NPC</p>}
              {scene.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="map-tray-item"
                  onClick={() =>
                    void placeExisting("npc", n.id, n.label, n.size || "Medium", n.image_url)
                  }
                >
                  {n.label}
                </button>
              ))}
            </>
          )}

          {trayMode === "add-foe" && (
            <>
              <input
                className="spawn-filter"
                placeholder="Search monsters…"
                value={catalogFilter}
                onChange={(e) => setCatalogFilter(e.target.value)}
              />
              <p className="muted small">Adds to Encounter and places a token.</p>
              <div className="map-tray-scroll">
                {filteredMonsters.slice(0, 80).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="map-tray-item"
                    disabled={busy}
                    onClick={() => void spawnFoeFromCatalog(m)}
                  >
                    {m.name}
                    <span className="muted small">{m.size || ""}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {trayMode === "add-npc" && (
            <>
              <input
                className="spawn-filter"
                placeholder="Search NPCs…"
                value={catalogFilter}
                onChange={(e) => setCatalogFilter(e.target.value)}
              />
              <p className="muted small">Adds to Scene and places a token.</p>
              <div className="map-tray-scroll">
                {filteredNpcs.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="map-tray-item"
                    disabled={busy}
                    onClick={() => void spawnNpcFromCatalog(n)}
                  >
                    {n.name}
                    <span className="muted small">{n.size || ""}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <div
          className="map-split"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the left column"
          title="Drag to resize. Double-click to collapse."
          onPointerDown={(event) => startSplitDrag("tray", event)}
          onDoubleClick={() => setTrayW((width) => (width < 48 ? 240 : 0))}
        />

        <div className="map-stage-wrap" ref={stageWrapRef} style={{ cursor }}>
          <div className="map-tools">
            {(
              [
                ["select", "Select"],
                ["measure", "Ruler"],
                ["fog", "Fog"],
                ["fog-erase", "Reveal"],
                ["wall", "Wall"],
                ["door", "Door"],
                ["light", "Light"],
                ["portal", "Portal"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`btn ghost ${tool === id ? "active-tab" : ""}`}
                onClick={() => {
                  setTool(id);
                  if (id !== "measure") setMeasure(null);
                  if (id !== "wall" && id !== "door") setWallDraft([]);
                  if (id !== "portal") setPortalDraft(null);
                }}
              >
                {label}
              </button>
            ))}
            {(tool === "fog" || tool === "fog-erase") && (
              <label className="fog-brush-label">
                Brush
                <input
                  type="range"
                  min={10}
                  max={120}
                  value={fogBrush}
                  onChange={(e) => setFogBrush(Number(e.target.value))}
                />
              </label>
            )}
            {(tool === "wall" || tool === "door") && (
              <button type="button" className="btn" onClick={() => void finishWall()}>
                Finish {tool}
              </button>
            )}
            {map && (
              <>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={async () => {
                    ensureFogCanvas(map, true);
                    await api.resetFog(map.id);
                    setFogVersion((v) => v + 1);
                    const updated = await api.getMapState(map.id);
                    setMap(updated.map);
                  }}
                >
                  Reset fog
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    const c = fogCanvasRef.current;
                    if (!c) return;
                    const ctx = c.getContext("2d");
                    if (!ctx) return;
                    ctx.clearRect(0, 0, c.width, c.height);
                    setFogVersion((v) => v + 1);
                    void persistFog();
                  }}
                >
                  Reveal all
                </button>
              </>
            )}
          </div>

          <Stage
            width={stageSize.w}
            height={stageSize.h}
            scaleX={scale}
            scaleY={scale}
            x={stagePos.x}
            y={stagePos.y}
            draggable={false}
            onWheel={(e) => {
              e.evt.preventDefault();
              const factor = e.evt.deltaY > 0 ? 0.9 : 1.1;
              setScale((s) => Math.min(4, Math.max(0.2, s * factor)));
            }}
            onMouseDown={(e) => void onStageMouseDown(e)}
            onMouseMove={(e) => onStageMouseMove(e)}
            onMouseUp={(e) => void onStageMouseUp(e)}
            onMouseLeave={() => void onStageMouseUp()}
          >
            <Layer>
              {map && (
                <Rect name="bg" width={map.width} height={map.height} fill="#1a1a1a" />
              )}
              {bgImg && map && (
                <KonvaImage image={bgImg} width={map.width} height={map.height} name="bg" />
              )}
              {gridLines.map((pts, i) => (
                <Line
                  key={`g-${i}`}
                  name="grid"
                  points={pts}
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth={1}
                  listening={false}
                />
              ))}
            </Layer>

            <Layer listening={false}>
              {map && (
                <Group
                  clipX={0}
                  clipY={0}
                  clipWidth={map.width}
                  clipHeight={map.height}
                  listening={false}
                >
                  {visionPolys.map((v) =>
                    v.points.length >= 6 ? (
                      <VisionFan key={v.key} area={v} />
                    ) : v.radius > 0 ? (
                      <Circle
                        key={v.key}
                        x={v.cx}
                        y={v.cy}
                        radius={v.radius}
                        fill={visionFill(v.dim)}
                        stroke={visionStroke(v.dim)}
                        strokeWidth={1}
                        listening={false}
                      />
                    ) : null
                  )}
                  {showVision && fogCanvasImage && (
                    <KonvaImage
                      image={fogCanvasImage}
                      width={map.width}
                      height={map.height}
                      globalCompositeOperation="destination-out"
                      listening={false}
                    />
                  )}
                </Group>
              )}
            </Layer>

            <Layer>
              {lights.map((L) => (
                <Circle
                  key={L.id}
                  x={L.x}
                  y={L.y}
                  radius={8}
                  fill="#f5c542"
                  stroke={selectedLightId === L.id ? "#fff" : "#a67c00"}
                  onClick={() => {
                    setSelectedLightId(L.id);
                    setSelectedTokenId(null);
                  }}
                  draggable={tool === "select"}
                  onDragStart={(ev) => {
                    ev.cancelBubble = true;
                  }}
                  onDragEnd={async (ev) => {
                    ev.cancelBubble = true;
                    const updated = await api.patchMapLight(L.id, {
                      x: ev.target.x(),
                      y: ev.target.y(),
                    });
                    setLights((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                  }}
                />
              ))}
              {walls.map((w) => (
                <Line
                  key={w.id}
                  points={w.points}
                  stroke={
                    w.door
                      ? w.door_open
                        ? "#6bcb77"
                        : "#e87a3a"
                      : selectedWallId === w.id
                        ? "#7ec8ff"
                        : "#c44"
                  }
                  strokeWidth={w.door ? 5 : 4}
                  lineCap="round"
                  lineJoin="round"
                  onClick={async () => {
                    setSelectedWallId(w.id);
                    if (w.door && tool === "select") {
                      const updated = await api.patchMapWall(w.id, {
                        door_open: !w.door_open,
                      });
                      setWalls((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                    }
                  }}
                />
              ))}
              {wallDraft.length >= 2 && (
                <Line points={wallDraft} stroke="#7ec8ff" strokeWidth={3} dash={[6, 4]} />
              )}
              {portals.map((p) => (
                <Group
                  key={p.id}
                  x={p.x}
                  y={p.y}
                  draggable={tool === "select"}
                  onDragStart={(ev) => {
                    ev.cancelBubble = true;
                  }}
                  onClick={(ev) => {
                    ev.cancelBubble = true;
                    setSelectedPortalId(p.id);
                  }}
                  onDblClick={async (ev) => {
                    ev.cancelBubble = true;
                    if (selectedTokenId) {
                      await sendThroughPortal(p.id, selectedTokenId, p.target_map_id);
                    } else {
                      await switchMap(p.target_map_id);
                    }
                  }}
                  onDragEnd={async (ev) => {
                    ev.cancelBubble = true;
                    const updated = await api.patchMapPortal(p.id, {
                      x: ev.target.x(),
                      y: ev.target.y(),
                    });
                    setPortals((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                  }}
                >
                  <PortalRing radius={p.radius} />
                  <Text text={p.label} y={-p.radius - 14} fontSize={12} fill="#d7bfff" />
                </Group>
              ))}
              {portalDraft && map && (
                <Group x={portalDraft.x} y={portalDraft.y} listening={false}>
                  <Circle
                    radius={map.grid_size_px * 0.8}
                    stroke="#d7bfff"
                    strokeWidth={2}
                    dash={[4, 4]}
                    fill="rgba(155,89,255,0.28)"
                  />
                  <Text text="Pick a scene" y={-map.grid_size_px - 8} fontSize={12} fill="#d7bfff" />
                </Group>
              )}
            </Layer>

            <Layer>
              {tokens.map((t) => {
                const side = (map?.grid_size_px || 50) * (t.size_sq || 1);
                return (
                  <TokenNode
                    key={t.id}
                    token={t}
                    side={side}
                    selected={selectedTokenId === t.id}
                    acting={t.id === activeTokenId}
                    faded={tokenFaded(t)}
                    vitals={tokenVitals(t)}
                    loss={t.ref_id ? damageShown?.[t.ref_id] : undefined}
                    draggable={tool === "select" && !armed}
                    onSelect={() => {
                      if (armed && map) {
                        const tile = tileOf(t.x + 1, t.y + 1, map);
                        const legal = highlighted.some((item) => item.c === tile.c && item.r === tile.r);
                        if (legal) {
                          void fireAction(
                            armed,
                            tile,
                            t,
                            highlighted.some((item) => item.c === tile.c && item.r === tile.r && item.far)
                          );
                        }
                        return;
                      }
                      setSelectedTokenId(t.id);
                      setSelectedWallId(null);
                      setArmed(null);
                    }}
                    onDragEnd={(x, y) => void onTokenDragEnd(t, x, y)}
                  />
                );
              })}
            </Layer>

            <Layer listening={false}>
              {map && <AimOverlay tiles={highlighted} grid={map} />}
              {map && travel && <TravelEffect travel={travel} progress={travelProgress} grid={map} />}
              <MarkLayer marks={marks} />
              {map && ruling?.anchor && !pendingResolve && (
                <RulingChip
                  x={tileCenter(ruling.anchor, map).x}
                  y={tileCenter(ruling.anchor, map).y}
                  text={ruling.blocked || ruling.result.roll_line || ""}
                />
              )}
              {portalSwirl && (
                <Group x={portalSwirl.x} y={portalSwirl.y} listening={false}>
                  <PortalRing radius={map?.grid_size_px ? map.grid_size_px * 0.9 : 36} />
                </Group>
              )}
            </Layer>

            <Layer listening={false}>
              {measure && (
                <>
                  <Line points={measure} stroke="#5ad" strokeWidth={2} dash={[8, 4]} />
                  <Text
                    x={(measure[0] + measure[2]) / 2}
                    y={(measure[1] + measure[3]) / 2 - 16}
                    text={measureLabel || ""}
                    fill="#9cf"
                    fontSize={14}
                  />
                </>
              )}
            </Layer>

            {/* Only show fog while editing it or in player preview — always-on fog looked like a blank black map. */}
            {fogCanvasImage && map && (playerPreview || tool === "fog" || tool === "fog-erase") && (
              <Layer listening={false}>
                <KonvaImage
                  key={`fog-${fogVersion}`}
                  name="fog"
                  image={fogCanvasImage}
                  width={map.width}
                  height={map.height}
                  opacity={playerPreview ? 1 : 0.55}
                />
              </Layer>
            )}
          </Stage>
        </div>

        <div
          className="map-split"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the inspector"
          title="Drag to resize. Double-click to collapse."
          onPointerDown={(event) => startSplitDrag("inspect", event)}
          onDoubleClick={() => setInspectW((width) => (width < 48 ? 300 : 0))}
        />

        <aside className={`map-inspector${inspectW < 48 ? " collapsed" : ""}`}>
          <h3>Inspector</h3>
          <p className="muted small">
            <strong>Select</strong> moves tokens. Drag empty map to slide it. <strong>Portal</strong> is one click, then
            pick the scene in the panel. Double-click a doorway to open that scene. With Vision ON,
            yellow sight uses each token's Vision (ft) and stops at walls and fog.
          </p>
          {selectedToken && (
            <div className="map-inspector-block">
              <strong>{selectedToken.label}</strong>
              <label>
                Size
                <select
                  value={selectedToken.size}
                  onChange={async (e) => {
                    const size = e.target.value;
                    const updated = await api.patchMapToken(selectedToken.id, {
                      size,
                      size_sq: sizeToSquares(size),
                    });
                    setTokens((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                  }}
                >
                  {CREATURE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small">Drag an empty part of the map to slide it. Drag a token to move it.</p>
              <div className="map-action-list">
                {tokenActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={`btn ghost ${armed?.id === action.id ? "active-tab" : ""}`}
                    onClick={() => {
                      setArmed((current) => (current?.id === action.id ? null : action));
                      setHoverTile(null);
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              {armed && <p className="muted small">Click a highlighted square. Amber squares are long range.</p>}
              {armed && highlighted.length === 0 && armed.shape !== "cone" && armed.shape !== "line" && armed.shape !== "cube" && (
                <p className="muted small">That action has no square in reach.</p>
              )}
              <button type="button" className="btn ghost" onClick={() => setMarks([])}>
                Clear marks
              </button>
              <label>
                Vision (ft)
                <input
                  type="number"
                  value={selectedToken.vision_ft}
                  onChange={async (e) => {
                    const updated = await api.patchMapToken(selectedToken.id, {
                      vision_ft: Number(e.target.value) || 0,
                    });
                    setTokens((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                  }}
                />
              </label>
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  await api.deleteMapToken(selectedToken.id);
                  setTokens((prev) => prev.filter((t) => t.id !== selectedToken.id));
                  setSelectedTokenId(null);
                }}
              >
                Remove from map
              </button>
            </div>
          )}
          {selectedWallId && (
            <div className="map-inspector-block">
              <strong>Wall / door</strong>
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  await api.deleteMapWall(selectedWallId);
                  setWalls((prev) => prev.filter((w) => w.id !== selectedWallId));
                  setSelectedWallId(null);
                }}
              >
                Delete
              </button>
            </div>
          )}
          {selectedLightId && (
            <div className="map-inspector-block">
              <strong>Light</strong>
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  await api.deleteMapLight(selectedLightId);
                  setLights((prev) => prev.filter((L) => L.id !== selectedLightId));
                  setSelectedLightId(null);
                }}
              >
                Delete light
              </button>
            </div>
          )}
          {tool === "portal" && portalDraft && map && (
            <div className="map-inspector-block">
              <strong>New doorway</strong>
              <p className="muted small">They arrive in the middle of the scene you pick.</p>
              {mapsList.filter((m) => m.id !== map.id).length === 0 && (
                <p className="muted small">Add another scene first, then pick it here.</p>
              )}
              {mapsList
                .filter((m) => m.id !== map.id)
                .map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    className="btn"
                    onClick={() => void createPortalTo(scene)}
                  >
                    Opens {scene.name}
                  </button>
                ))}
              <button type="button" className="btn ghost" onClick={() => setPortalDraft(null)}>
                Cancel
              </button>
            </div>
          )}
          {selectedPortalId && (
            <div className="map-inspector-block">
              <strong>Portal</strong>
              <p className="muted small">
                {portals.find((p) => p.id === selectedPortalId)?.label || "Doorway"}
              </p>
              {selectedToken && (
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const p = portals.find((x) => x.id === selectedPortalId);
                    if (!p) return;
                    await sendThroughPortal(p.id, selectedToken.id, p.target_map_id);
                  }}
                >
                  Send {selectedToken.label} through
                </button>
              )}
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  const p = portals.find((x) => x.id === selectedPortalId);
                  if (p) await switchMap(p.target_map_id);
                }}
              >
                Open that scene
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  await api.deleteMapPortal(selectedPortalId);
                  setPortals((prev) => prev.filter((p) => p.id !== selectedPortalId));
                  setSelectedPortalId(null);
                }}
              >
                Delete portal
              </button>
            </div>
          )}
        </aside>
      </div>
      {pendingResolve && (
        <ResolveModal
          result={pendingResolve.result}
          blocked={pendingResolve.blocked}
          notice={pendingResolve.notice}
          heal={pendingResolve.heal}
          creatures={pendingResolve.creatures}
          characters={characters}
          scene={scene}
          npcs={npcs}
          encounter={encounter}
          monsters={monsters}
          apiBase={API_BASE}
          busy={applyBusy || busy}
          onCancel={() => setPendingResolve(null)}
          onSubmit={(rows) => void commitResolve(rows)}
        />
      )}
    </div>
  );
}

function hpBarFill(current: number, max: number): string {
  if (max <= 0) return "#d1242f";
  const ratio = current / max;
  if (ratio > 0.5) return "#2ea043";
  if (ratio > 0.2) return "#e6a317";
  return "#d1242f";
}

function TokenNode({
  token,
  side,
  selected,
  acting,
  faded,
  vitals,
  loss,
  draggable,
  onSelect,
  onDragEnd,
}: {
  token: MapToken;
  side: number;
  selected: boolean;
  acting?: boolean;
  faded?: boolean;
  vitals: { current: number; max: number; temp: number } | null;
  loss?: number;
  draggable: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  // PCs: only show a real uploaded portrait (match console). Never invent a face.
  const isPc = token.kind === "pc";
  const fallback =
    token.kind === "npc"
      ? "/media/tokens/token-npc-generic.png"
      : "/media/tokens/token-humanoid.png";
  let path: string | null = token.image_url || null;
  if (path && path.endsWith(".svg") && path.includes("/monsters/")) {
    path = path.replace(/\.svg$/i, ".png");
  }
  if (
    path &&
    (/\/media\/monsters\/srd\/generic\.(png|svg)$/i.test(path) ||
      /\/media\/npcs\/srd\/generic\./i.test(path))
  ) {
    path = isPc ? null : fallback;
  }
  // Strip accidental humanoid fallback that was applied to PCs earlier.
  if (isPc && path && path.includes("/media/tokens/token-humanoid")) {
    path = null;
  }
  if (!isPc && !path) {
    path = fallback;
  }
  const url = path ? mediaUrlSync(path, API_BASE) : null;
  const img = useHtmlImage(url);
  const fill =
    token.kind === "pc" ? "#2d6a4f" : token.kind === "enemy" ? "#9b2226" : "#1d3557";
  const initials = (token.label || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const barH = Math.max(5, Math.min(9, side * 0.1));
  const hpText = vitals
    ? vitals.temp
      ? `${vitals.current}/${vitals.max} +${vitals.temp}`
      : `${vitals.current}/${vitals.max}`
    : "";
  const hpSize = Math.max(9, Math.min(13, side * 0.16));
  const showLoss = loss != null && loss > 0;
  const nameY = vitals ? side + barH + hpSize + (showLoss ? hpSize + 2 : 0) + 4 : side + 2;
  const fillWidth = vitals ? Math.max(0, Math.min(side, (vitals.current / vitals.max) * side)) : 0;
  return (
    <Group
      x={token.x}
      y={token.y}
      opacity={faded ? 0.4 : 1}
      draggable={draggable}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onDragStart={(e) => {
        e.cancelBubble = true;
      }}
      onDragMove={(e) => {
        e.cancelBubble = true;
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        onDragEnd(e.target.x(), e.target.y());
      }}
    >
      {acting && (
        <Rect
          x={-5}
          y={-5}
          width={side + 10}
          height={side + 10}
          stroke="#e6c15a"
          strokeWidth={3}
          cornerRadius={side * 0.2}
          listening={false}
        />
      )}
      {img ? (
        <KonvaImage
          image={img}
          width={side}
          height={side}
          cornerRadius={side * 0.15}
          stroke={selected ? "#fff" : "#000"}
          strokeWidth={selected ? 3 : 1}
        />
      ) : (
        <>
          <Rect
            width={side}
            height={side}
            fill={fill}
            cornerRadius={side * 0.15}
            stroke={selected ? "#fff" : "#000"}
            strokeWidth={selected ? 3 : 1}
          />
          {isPc && (
            <Text
              text={initials}
              width={side}
              height={side}
              align="center"
              verticalAlign="middle"
              fontSize={Math.max(12, side * 0.35)}
              fill="#fff"
              fontStyle="bold"
            />
          )}
        </>
      )}
      {vitals && (
        <>
          <Rect
            y={side + 2}
            width={side}
            height={barH}
            fill="#12151c"
            stroke="#2a2f3a"
            strokeWidth={1}
            cornerRadius={barH / 2}
            listening={false}
          />
          <Rect
            y={side + 3}
            width={fillWidth}
            height={Math.max(1, barH - 2)}
            fill={hpBarFill(vitals.current, vitals.max)}
            cornerRadius={barH / 2}
            listening={false}
          />
          <Text
            text={hpText}
            width={side}
            y={side + barH + 2}
            fontSize={hpSize}
            fill={hpBarFill(vitals.current, vitals.max)}
            align="center"
            listening={false}
          />
          {showLoss && (
            <Text
              text={`−${loss}`}
              width={side}
              y={side + barH + hpSize + 2}
              fontSize={hpSize}
              fill="#ff6a4d"
              fontStyle="bold"
              align="center"
              listening={false}
            />
          )}
        </>
      )}
      <Text
        text={token.label}
        width={side}
        y={nameY}
        fontSize={Math.max(10, side * 0.22)}
        fill="#eee"
        align="center"
      />
    </Group>
  );
}

function formatRuling(result: CheckResult): string {
  return [result.roll_line, result.notes, result.damage ? `Damage: ${result.damage}` : "", result.howto]
    .filter(Boolean)
    .join("\n");
}

function defaultTokenImage(kind: string): string {
  if (kind === "npc") return "/media/tokens/token-npc-generic.png";
  return "/media/tokens/token-humanoid.png";
}
