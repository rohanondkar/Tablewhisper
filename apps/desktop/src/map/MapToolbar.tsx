import { memo, type Dispatch, type SetStateAction } from "react";
import type { BattleMap, PoolKind } from "../api";
import { POOL_KINDS } from "./pools";

export type MapTool =
  | "select"
  | "measure"
  | "fog"
  | "fog-erase"
  | "wall"
  | "door"
  | "light"
  | "portal"
  | "chest"
  | "liquid"
  | "erase"
  | "delete";

type Props = {
  tool: MapTool;
  setTool: (tool: MapTool) => void;
  setMeasure: (value: null) => void;
  setWallDraft: (points: number[]) => void;
  setPortalDraft: (value: null) => void;
  fogBrush: number;
  setFogBrush: (size: number) => void;
  poolKind: PoolKind;
  poolDepth: number;
  setPoolDepth: (feet: number) => void;
  poolCurrent: number;
  setPoolCurrent: (feet: number) => void;
  poolDeg: number;
  setPoolDeg: (degrees: number) => void;
  poolErase: boolean;
  setPoolErase: Dispatch<SetStateAction<boolean>>;
  onNewPool: () => void;
  onPoolKind: (kind: PoolKind) => void;
  mapReady: boolean;
  onResetFog: () => void;
  onRevealAll: () => void;
};

export const MapToolbar = memo(function MapToolbar({
  tool,
  setTool,
  setMeasure,
  setWallDraft,
  setPortalDraft,
  fogBrush,
  setFogBrush,
  poolKind,
  poolDepth,
  setPoolDepth,
  poolCurrent,
  setPoolCurrent,
  poolDeg,
  setPoolDeg,
  poolErase,
  setPoolErase,
  onNewPool,
  onPoolKind,
  mapReady,
  onResetFog,
  onRevealAll,
}: Props) {
  const tools = [
    ["select", "Select"],
    ["measure", "Ruler"],
    ["wall", "Wall"],
    ["door", "Door"],
    ["liquid", "Liquid"],
    ["light", "Light"],
    ["portal", "Portal"],
    ["chest", "Chest"],
    ["fog", "Fog"],
    ["fog-erase", "Reveal"],
    ["erase", "Erase"],
    ["delete", "Delete"],
  ] as const;
  return (
    <div className="map-tools">
      <div className="map-tool-row">
      {tools.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`btn ghost ${tool === id ? "active-tab" : ""}`}
          data-tip={id === "delete" ? "Click a chest, portal, light, door, wall, or token to remove it." : undefined}
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
      </div>
      {(tool === "fog" || tool === "fog-erase" || tool === "erase" || tool === "liquid" || tool === "delete") && (
      <div className="map-tool-options">
      {(tool === "fog" || tool === "fog-erase" || tool === "erase") && (
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
      {tool === "liquid" && (
        <>
          <select value={poolKind} onChange={(event) => onPoolKind(event.target.value as PoolKind)}>
            {POOL_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <label className="fog-brush-label">
            Depth ft
            <input
              type="number"
              min={0}
              value={poolDepth}
              onChange={(event) => setPoolDepth(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
          <label className="fog-brush-label">
            Current ft
            <input
              type="number"
              min={0}
              value={poolCurrent}
              onChange={(event) => setPoolCurrent(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
          <label className="fog-brush-label">
            Direction
            <input
              type="number"
              min={0}
              max={359}
              value={poolDeg}
              onChange={(event) => setPoolDeg(((Number(event.target.value) || 0) % 360 + 360) % 360)}
            />
          </label>
          <button type="button" className={`btn ghost ${poolErase ? "active-tab" : ""}`} data-tip={poolErase ? "Stop painting the pool away and paint liquid again." : "Paint away the current pool."} onClick={() => setPoolErase((on) => !on)}>
            {poolErase ? "Erasing" : "Erase"}
          </button>
          <button type="button" className="btn ghost" onClick={onNewPool}>
            New pool
          </button>
        </>
      )}
      {(tool === "fog" || tool === "fog-erase") && mapReady && (
        <>
          <button type="button" className="btn ghost" onClick={onResetFog}>
            Reset fog
          </button>
          <button type="button" className="btn ghost" onClick={onRevealAll}>
            Reveal all
          </button>
        </>
      )}
      {tool === "delete" && <span className="muted small">Click a chest, portal, light, door, wall, or token.</span>}
      </div>
      )}
    </div>
  );
});
