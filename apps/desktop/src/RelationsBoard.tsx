import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Circle, Line, Text, Group, Shape, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import {
  api,
  type Character,
  type RelationEdge,
  type RelationNode,
  type RelationsBoard as BoardState,
  type SceneNpc,
} from "./api";
import { COLOR_OPTIONS, PATTERN_OPTIONS, patternCanvas, skinFromCreature } from "./map/dieSkins";
import { TextAsk } from "./TextAsk";
import { FactionAsk, type FactionAskResult } from "./FactionAsk";
import { ImagePickField } from "./ImagePickField";
import { mediaUrlSync } from "./api";

const API_BASE = "http://127.0.0.1:8766";

const EDGE_PRESETS = ["ally", "rival", "enemy", "family", "serves", "owes"];

function explain(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  try {
    const body = JSON.parse(text) as { detail?: string };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    /* plain text */
  }
  return text;
}

function stringPoints(ax: number, ay: number, bx: number, by: number): number[] {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const pull = Math.min(48, len * 0.22);
  const cx = mx + (-dy / len) * pull;
  const cy = my + (dx / len) * pull;
  const pts: number[] = [];
  for (let i = 0; i <= 18; i += 1) {
    const t = i / 18;
    const u = 1 - t;
    pts.push(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
  }
  return pts;
}

export function RelationsBoard({
  characters,
  scene,
}: {
  characters: Character[];
  scene: SceneNpc[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 640 });
  const [board, setBoard] = useState<BoardState>({ session_id: "", factions: [], nodes: [], edges: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 60, y: 40 });
  const [notice, setNotice] = useState("Click + String, then click two people or factions. You can tie as many strings as you want.");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<{ kind: "person" | "faction"; x: number; y: number } | null>(null);
  const [stringFrom, setStringFrom] = useState<string | null>(null);
  const [factionImages, setFactionImages] = useState<Record<string, HTMLImageElement>>({});
  const panning = useRef(false);
  const panOrigin = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const applyBoard = useCallback((next: BoardState) => setBoard(next), []);

  const reload = useCallback(async () => {
    applyBoard(await api.getRelations());
  }, [applyBoard]);

  useEffect(() => {
    void reload().catch((err) => setNotice(explain(err)));
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    for (const faction of board.factions) {
      if (!faction.image_url) continue;
      const id = faction.id;
      const path = faction.image_url;
      void (async () => {
        const { mediaUrl } = await import("./api");
        const src = await mediaUrl(path);
        if (cancelled) return;
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (!cancelled) setFactionImages((cur) => ({ ...cur, [id]: img }));
        };
        img.src = `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(path)}`;
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [board.factions]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth || 900, h: el.clientHeight || 640 });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const selectedNode = board.nodes.find((n) => n.id === selectedId) || null;
  const selectedEdge = board.edges.find((e) => e.id === selectedEdgeId) || null;
  const selectedFaction =
    selectedNode?.kind === "faction"
      ? board.factions.find((f) => f.id === selectedNode.ref_id) || null
      : board.factions.find((f) => f.id === selectedNode?.faction_id) || null;

  const nodeById = useMemo(() => {
    const map = new Map<string, RelationNode>();
    for (const node of board.nodes) map.set(node.id, node);
    return map;
  }, [board.nodes]);

  function stagePoint(stage: Konva.Stage) {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - offset.x) / scale,
      y: (pointer.y - offset.y) / scale,
    };
  }

  async function run(work: () => Promise<BoardState>) {
    setBusy(true);
    try {
      applyBoard(await work());
    } catch (err) {
      setNotice(explain(err));
    } finally {
      setBusy(false);
    }
  }

  async function placeNamed(name: string) {
    if (!ask || ask.kind === "faction") return;
    const trimmed = name.trim();
    setAsk(null);
    if (!trimmed) return;
    await run(() => api.addRelationNode({ name: trimmed, kind: "person", x: ask.x, y: ask.y }));
  }

  async function placeFaction(result: FactionAskResult) {
    if (!ask || ask.kind !== "faction") return;
    const trimmed = result.name.trim();
    const x = ask.x;
    const y = ask.y;
    setAsk(null);
    if (!trimmed) return;
    setBusy(true);
    try {
      const next = await api.addFaction({
        name: trimmed,
        summary: result.summary.trim(),
        x,
        y,
      });
      applyBoard(next);
      const created =
        next.factions.find((f) => f.name === trimmed && Math.abs(f.x - x) < 1 && Math.abs(f.y - y) < 1) ||
        next.factions.find((f) => f.name === trimmed) ||
        next.factions[next.factions.length - 1];
      if (result.image && created) {
        applyBoard(await api.uploadFactionImage(created.id, result.image));
        setFactionImages((prev) => {
          const copy = { ...prev };
          delete copy[created.id];
          return copy;
        });
      }
      const hub = next.nodes.find((n) => n.kind === "faction" && n.ref_id === created?.id);
      if (hub) setSelectedId(hub.id);
      setNotice("Faction placed. You can still edit picture and description in the inspector.");
    } catch (err) {
      setNotice(explain(err));
    } finally {
      setBusy(false);
    }
  }

  function openAdd(kind: "person" | "faction") {
    const x = (size.w / 2 - offset.x) / scale;
    const y = (size.h / 2 - offset.y) / scale;
    setAsk({ kind, x, y });
  }

  async function addPartyMember(character: Character) {
    if (board.nodes.some((n) => n.kind === "character" && n.ref_id === character.id)) {
      setNotice(`${character.name} is already on the web.`);
      return;
    }
    const skin = skinFromCreature(character);
    await run(() =>
      api.addRelationNode({
        name: character.name,
        kind: "character",
        ref_id: character.id,
        color: skin.color,
        pattern: skin.pattern,
        x: 140 + (board.nodes.length % 6) * 110,
        y: 120 + Math.floor(board.nodes.length / 6) * 120,
      }),
    );
  }

  async function addSceneMember(npc: SceneNpc) {
    if (board.nodes.some((n) => n.kind === "npc" && n.ref_id === npc.id)) {
      setNotice(`${npc.label || npc.name} is already on the web.`);
      return;
    }
    const skin = skinFromCreature({
      name: npc.label || npc.name,
      race: (npc.template as { race?: string } | undefined)?.race,
    });
    await run(() =>
      api.addRelationNode({
        name: npc.label || npc.name,
        kind: "npc",
        ref_id: npc.id,
        color: skin.color,
        pattern: skin.pattern,
        x: 180 + (board.nodes.length % 6) * 110,
        y: 160 + Math.floor(board.nodes.length / 6) * 120,
      }),
    );
  }

  async function removeSelected() {
    if (selectedEdgeId) {
      const id = selectedEdgeId;
      setSelectedEdgeId(null);
      await run(() => api.deleteRelationEdge(id).then(() => api.getRelations()));
      return;
    }
    if (selectedId) {
      const id = selectedId;
      setSelectedId(null);
      await run(() => api.deleteRelationNode(id).then(() => api.getRelations()));
    }
  }

  return (
    <div className="relations-page">
      <div className="relations-toolbar">
        <button type="button" className="btn" disabled={busy} onClick={() => openAdd("faction")}>
          + Faction
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => openAdd("person")}>
          + Person
        </button>
        <button
          type="button"
          className={`btn ${stringFrom ? "" : "ghost"}`}
          disabled={busy}
          onClick={() => {
            if (stringFrom) {
              setStringFrom(null);
              setNotice("Click + String, then click two people or factions. You can tie as many strings as you want.");
              return;
            }
            setStringFrom(selectedId || "pending");
            setNotice(
              selectedId
                ? "Click another person or faction to tie the string."
                : "Click the first person or faction, then the second.",
            );
          }}
        >
          + String
        </button>
        <button type="button" className="btn ghost" disabled={busy || (!selectedId && !selectedEdgeId)} onClick={() => void removeSelected()}>
          Delete
        </button>
        <button type="button" className="btn ghost" disabled={busy || scale <= 0.4} onClick={() => setScale((s) => Math.max(0.4, s - 0.1))}>
          −
        </button>
        <button type="button" className="btn ghost" disabled={busy || scale >= 2.4} onClick={() => setScale((s) => Math.min(2.4, s + 0.1))}>
          +
        </button>
        <span className="relations-notice">{notice}</span>
      </div>
      <div className="relations-body">
        <div
          className="relations-stage relations-web"
          ref={wrapRef}
          onWheel={(event) => {
            event.preventDefault();
            setScale((s) => Math.min(2.4, Math.max(0.4, s + (event.deltaY > 0 ? -0.08 : 0.08))));
          }}
        >
          <Stage
            width={size.w}
            height={size.h}
            onMouseDown={(e) => {
              if (e.evt.button === 1 || e.evt.button === 2) {
                panning.current = true;
                panOrigin.current = { x: e.evt.clientX, y: e.evt.clientY, ox: offset.x, oy: offset.y };
              }
            }}
            onMouseMove={(e) => {
              if (!panning.current) return;
              setOffset({
                x: panOrigin.current.ox + (e.evt.clientX - panOrigin.current.x),
                y: panOrigin.current.oy + (e.evt.clientY - panOrigin.current.y),
              });
            }}
            onMouseUp={() => {
              panning.current = false;
            }}
            onClick={(e) => {
              if (e.target === e.target.getStage()) {
                setSelectedId(null);
                setSelectedEdgeId(null);
              }
            }}
            onContextMenu={(e) => e.evt.preventDefault()}
          >
            <Layer x={offset.x} y={offset.y} scaleX={scale} scaleY={scale}>
              {board.edges.map((edge) => {
                const a = nodeById.get(edge.from_id);
                const b = nodeById.get(edge.to_id);
                if (!a || !b) return null;
                const pts = stringPoints(a.x, a.y, b.x, b.y);
                const mid = pts.length >= 4 ? { x: pts[Math.floor(pts.length / 4) * 2], y: pts[Math.floor(pts.length / 4) * 2 + 1] } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                const hot = selectedEdgeId === edge.id;
                return (
                  <Group key={edge.id} onClick={() => { setSelectedEdgeId(edge.id); setSelectedId(null); }}>
                    <Line points={pts} stroke={hot ? "#f0c674" : "#8a7355"} strokeWidth={hot ? 3.5 : 2} lineCap="round" lineJoin="round" hitStrokeWidth={18} opacity={0.95} />
                    <Line points={pts} stroke="#d4b483" strokeWidth={1} dash={[4, 6]} listening={false} opacity={0.55} />
                    <Text x={mid.x - 36} y={mid.y - 8} width={72} align="center" text={edge.label} fontSize={11} fill={hot ? "#ffe7a8" : "#c9b28a"} />
                  </Group>
                );
              })}
              {board.nodes.map((node) => {
                const faction =
                  node.kind === "faction"
                    ? board.factions.find((f) => f.id === node.ref_id)
                    : board.factions.find((f) => f.id === node.faction_id);
                const isFaction = node.kind === "faction";
                const hot = selectedId === node.id || stringFrom === node.id;
                const radius = isFaction ? 38 : 28;
                const ring = faction?.color || node.color;
                const portrait = isFaction && faction?.id ? factionImages[faction.id] : undefined;
                return (
                  <Group
                    key={node.id}
                    x={node.x}
                    y={node.y}
                    draggable={!stringFrom}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      if (stringFrom) {
                        if (stringFrom === "pending" || stringFrom === node.id) {
                          setStringFrom(node.id);
                          setSelectedId(node.id);
                          setSelectedEdgeId(null);
                          setNotice("Click another person or faction to tie the string.");
                          return;
                        }
                        const from = stringFrom;
                        void run(() => api.addRelationEdge({ from_id: from, to_id: node.id, label: "ally" })).then(() => {
                          setStringFrom("pending");
                          setNotice("String tied. Click the next pair, or + String to stop.");
                        });
                        return;
                      }
                      setSelectedId(node.id);
                      setSelectedEdgeId(null);
                    }}
                    onDragEnd={(e) => {
                      const x = e.target.x();
                      const y = e.target.y();
                      void run(() => {
                        if (isFaction && node.ref_id) return api.patchFaction(node.ref_id, { x, y });
                        return api.patchRelationNode(node.id, { x, y });
                      });
                    }}
                  >
                    {isFaction && (
                      <Circle radius={radius + 10} stroke={ring} strokeWidth={2} dash={[5, 4]} fillEnabled={false} opacity={0.7} />
                    )}
                    <Circle radius={radius + (hot ? 4 : 2)} stroke={hot ? "#f0c674" : ring} strokeWidth={hot ? 3 : 2} fill="#1a1410" />
                    {portrait ? (
                      <KonvaImage
                        image={portrait}
                        width={radius * 2 - 4}
                        height={radius * 2 - 4}
                        offsetX={radius - 2}
                        offsetY={radius - 2}
                        cornerRadius={radius}
                        listening={false}
                      />
                    ) : (
                      <>
                        <Circle
                          radius={radius - 2}
                          fill={node.pattern === "solid" ? node.color : undefined}
                          fillPatternImage={node.pattern === "solid" ? undefined : patternCanvas(node.pattern, node.color)}
                          fillPatternRepeat="repeat"
                          fillPriority={node.pattern === "solid" ? "color" : "pattern"}
                          opacity={0.92}
                        />
                        <Shape
                          sceneFunc={(ctx, shape) => {
                            ctx.beginPath();
                            for (let i = 0; i < 8; i += 1) {
                              const a = (i / 8) * Math.PI * 2;
                              const r = radius * 0.55;
                              ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
                              ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                            }
                            ctx.fillStrokeShape(shape);
                          }}
                          stroke="rgba(255,255,255,0.18)"
                          strokeWidth={1}
                          listening={false}
                        />
                      </>
                    )}
                    <Text
                      text={node.name}
                      fontSize={13}
                      fontStyle="bold"
                      fill="#f6edd8"
                      width={120}
                      offsetX={60}
                      offsetY={-radius - 22}
                      align="center"
                      shadowColor="#000"
                      shadowBlur={4}
                      shadowOpacity={0.7}
                    />
                    {(node.role || (isFaction ? "faction" : "") || (faction?.summary ? faction.summary.slice(0, 42) : "")) && (
                      <Text
                        text={
                          isFaction
                            ? (faction?.summary || "faction").slice(0, 48)
                            : node.role || "person"
                        }
                        fontSize={10}
                        fill="#c9b28a"
                        width={120}
                        offsetX={60}
                        offsetY={radius + 6}
                        align="center"
                      />
                    )}
                  </Group>
                );
              })}
            </Layer>
          </Stage>
        </div>
        <aside className="relations-side">
          <section>
            <h3>Party</h3>
            <div className="relations-list">
              {characters.map((character) => (
                <button key={character.id} type="button" className="btn ghost" disabled={busy} onClick={() => void addPartyMember(character)}>
                  {character.name}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3>Scene</h3>
            <div className="relations-list">
              {scene.map((npc) => (
                <button key={npc.id} type="button" className="btn ghost" disabled={busy} onClick={() => void addSceneMember(npc)}>
                  {npc.label || npc.name}
                </button>
              ))}
            </div>
          </section>
          {selectedNode && (
            <section className="relations-inspect">
              <h3>{selectedNode.kind === "faction" ? "Faction" : "Person"}</h3>
              <label>
                Name
                <input
                  value={selectedNode.name}
                  onChange={(e) =>
                    setBoard((prev) => ({
                      ...prev,
                      nodes: prev.nodes.map((n) => (n.id === selectedNode.id ? { ...n, name: e.target.value } : n)),
                    }))
                  }
                  onBlur={() => {
                    if (selectedNode.kind === "faction" && selectedNode.ref_id) {
                      void run(() => api.patchFaction(selectedNode.ref_id!, { name: selectedNode.name }));
                    } else {
                      void run(() => api.patchRelationNode(selectedNode.id, { name: selectedNode.name }));
                    }
                  }}
                />
              </label>
              <label>
                Color
                <select
                  value={selectedNode.color}
                  onChange={(e) => {
                    const color = e.target.value;
                    void run(() => {
                      if (selectedNode.kind === "faction" && selectedNode.ref_id) {
                        return api.patchFaction(selectedNode.ref_id, { color });
                      }
                      return api.patchRelationNode(selectedNode.id, { color });
                    });
                  }}
                >
                  {[selectedNode.color, ...COLOR_OPTIONS].filter((v, i, a) => a.indexOf(v) === i).map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pattern
                <select
                  value={selectedNode.pattern}
                  onChange={(e) => {
                    const pattern = e.target.value;
                    void run(() => {
                      if (selectedNode.kind === "faction" && selectedNode.ref_id) {
                        return api.patchFaction(selectedNode.ref_id, { pattern });
                      }
                      return api.patchRelationNode(selectedNode.id, { pattern });
                    });
                  }}
                >
                  {PATTERN_OPTIONS.map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {pattern}
                    </option>
                  ))}
                </select>
              </label>
              {selectedNode.kind !== "faction" && (
                <label>
                  Faction
                  <select
                    value={selectedNode.faction_id || ""}
                    onChange={(e) => {
                      const faction_id = e.target.value || null;
                      void run(() => api.patchRelationNode(selectedNode.id, { faction_id }));
                    }}
                  >
                    <option value="">None</option>
                    {board.factions.map((faction) => (
                      <option key={faction.id} value={faction.id}>
                        {faction.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selectedNode.kind !== "faction" && (
                <label>
                  Role
                  <input
                    value={selectedNode.role}
                    onChange={(e) =>
                      setBoard((prev) => ({
                        ...prev,
                        nodes: prev.nodes.map((n) => (n.id === selectedNode.id ? { ...n, role: e.target.value } : n)),
                      }))
                    }
                    onBlur={() => void run(() => api.patchRelationNode(selectedNode.id, { role: selectedNode.role }))}
                  />
                </label>
              )}
              {selectedFaction && selectedNode.kind === "faction" && (
                <>
                  <label>
                    Short description
                    <textarea
                      value={selectedFaction.summary || ""}
                      rows={3}
                      placeholder="Who they are, what they want…"
                      onChange={(e) => {
                        const summary = e.target.value;
                        setBoard((prev) => ({
                          ...prev,
                          factions: prev.factions.map((f) => (f.id === selectedFaction.id ? { ...f, summary } : f)),
                        }));
                      }}
                      onBlur={() =>
                        void run(() =>
                          api.patchFaction(selectedFaction.id, { summary: selectedFaction.summary || "" }),
                        )
                      }
                    />
                  </label>
                  <ImagePickField
                    round
                    disabled={busy}
                    showRemove={false}
                    previewUrl={
                      selectedFaction.image_url
                        ? mediaUrlSync(selectedFaction.image_url, API_BASE)
                        : null
                    }
                    onFile={(file) => {
                      if (!file) return;
                      setFactionImages((prev) => {
                        const next = { ...prev };
                        delete next[selectedFaction.id];
                        return next;
                      });
                      void run(() => api.uploadFactionImage(selectedFaction.id, file));
                    }}
                  />
                  <label>
                    Leader
                    <select
                      value={selectedFaction.leader_node_id || ""}
                      onChange={(e) => {
                        const leader_node_id = e.target.value || null;
                        void run(() => api.patchFaction(selectedFaction.id, { leader_node_id }));
                      }}
                    >
                      <option value="">None</option>
                      {board.nodes
                        .filter((n) => n.kind !== "faction" && (n.faction_id === selectedFaction.id || !n.faction_id))
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              <label>
                Notes
                <textarea
                  value={selectedNode.notes}
                  rows={4}
                  onChange={(e) =>
                    setBoard((prev) => ({
                      ...prev,
                      nodes: prev.nodes.map((n) => (n.id === selectedNode.id ? { ...n, notes: e.target.value } : n)),
                    }))
                  }
                  onBlur={() => {
                    if (selectedNode.kind === "faction" && selectedNode.ref_id) {
                      void run(() => api.patchFaction(selectedNode.ref_id!, { notes: selectedNode.notes }));
                    } else {
                      void run(() => api.patchRelationNode(selectedNode.id, { notes: selectedNode.notes }));
                    }
                  }}
                />
              </label>
            </section>
          )}
          {selectedEdge && (
            <section className="relations-inspect">
              <h3>String</h3>
              <label>
                Label
                <select
                  value={EDGE_PRESETS.includes(selectedEdge.label) ? selectedEdge.label : "custom"}
                  onChange={(e) => {
                    const label = e.target.value === "custom" ? selectedEdge.label || "custom" : e.target.value;
                    void run(() => api.patchRelationEdge(selectedEdge.id, { label }));
                  }}
                >
                  {EDGE_PRESETS.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                  <option value="custom">custom</option>
                </select>
              </label>
              {!EDGE_PRESETS.includes(selectedEdge.label) && (
                <label>
                  Custom
                  <input
                    value={selectedEdge.label}
                    onChange={(e) =>
                      setBoard((prev) => ({
                        ...prev,
                        edges: prev.edges.map((row) => (row.id === selectedEdge.id ? { ...row, label: e.target.value } : row)),
                      }))
                    }
                    onBlur={() => void run(() => api.patchRelationEdge(selectedEdge.id, { label: selectedEdge.label }))}
                  />
                </label>
              )}
              <label>
                Notes
                <textarea
                  value={selectedEdge.notes}
                  rows={3}
                  onChange={(e) =>
                    setBoard((prev) => ({
                      ...prev,
                      edges: prev.edges.map((row) => (row.id === selectedEdge.id ? { ...row, notes: e.target.value } : row)),
                    }))
                  }
                  onBlur={() => void run(() => api.patchRelationEdge(selectedEdge.id, { notes: selectedEdge.notes }))}
                />
              </label>
            </section>
          )}
        </aside>
      </div>
      {ask?.kind === "person" && (
        <TextAsk
          title="Name this person"
          initial="Person"
          onCancel={() => setAsk(null)}
          onSubmit={(name) => void placeNamed(name)}
        />
      )}
      {ask?.kind === "faction" && (
        <FactionAsk onCancel={() => setAsk(null)} onSubmit={(value) => void placeFaction(value)} />
      )}
    </div>
  );
}
