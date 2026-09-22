import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  mediaUrlSync,
  type Character,
  type CharacterChange,
  type CharacterPreview,
  type CheckResult,
  type EncounterEnemy,
  type MonsterTemplate,
  type NpcTemplate,
  type RulesetSummary,
  type SceneNpc,
  type SessionEvent,
  type SessionInfo,
  type StatusInfo,
} from "./api";

const API_BASE = "http://127.0.0.1:8766";

const CR_OPTIONS = [
  "0",
  "1/8",
  "1/4",
  "1/2",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
];

const CR_TO_XP: Record<string, number> = {
  "0": 10,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
};

export default function App() {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [rulesets, setRulesets] = useState<RulesetSummary[]>([]);
  const [monsters, setMonsters] = useState<MonsterTemplate[]>([]);
  const [encounter, setEncounter] = useState<EncounterEnemy[]>([]);
  const [spawnId, setSpawnId] = useState("orc");
  const [monsterFilter, setMonsterFilter] = useState("");
  const [npcs, setNpcs] = useState<NpcTemplate[]>([]);
  const [scene, setScene] = useState<SceneNpc[]>([]);
  const [spawnNpcId, setSpawnNpcId] = useState("mira");
  const [npcFilter, setNpcFilter] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<Character>>({});
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [reuploadTargetId, setReuploadTargetId] = useState<string | null>(null);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);
  const [reuploadPreview, setReuploadPreview] = useState<CharacterPreview | null>(null);
  const reuploadFileRef = useRef<HTMLInputElement>(null);
  const [customMonster, setCustomMonster] = useState({
    name: "",
    ac: 13,
    hp: 15,
    image: null as File | null,
  });
  const [customNpc, setCustomNpc] = useState({
    name: "",
    ac: 12,
    hp: 12,
    attitude: "indifferent",
    role: "",
    image: null as File | null,
  });
  const [apiBase, setApiBase] = useState(API_BASE);
  const [rightTab, setRightTab] = useState<"foes" | "scene" | "log">("foes");
  const [addModal, setAddModal] = useState<null | "monster" | "npc">(null);
  const [showCustomInModal, setShowCustomInModal] = useState(false);
  const [spawnTune, setSpawnTune] = useState({ cr: "0", xp: 10, ac: 10, hp: 10 });
  const [xpAward, setXpAward] = useState<null | {
    kind: "defeat" | "milestone";
    label: string;
    cr?: string;
    xp: number;
    creatureId?: string;
    milestoneId?: string;
    milestoneLabel?: string;
  }>(null);
  const [xpRecipients, setXpRecipients] = useState<string[]>([]);
  const [awardedDefeatIds, setAwardedDefeatIds] = useState<Set<string>>(() => new Set());
  const rightTabInitialized = useRef(false);

  const selected = useMemo(
    () => characters.find((c) => c.id === selectedId) || null,
    [characters, selectedId]
  );
  const activeSession = useMemo(
    () => sessions.find((s) => s.active) || sessions[0] || null,
    [sessions]
  );
  const filteredMonsters = useMemo(() => {
    const q = monsterFilter.trim().toLowerCase();
    if (!q) return monsters;
    return monsters.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.type || "").toLowerCase().includes(q) ||
        String(m.cr || "").toLowerCase().includes(q)
    );
  }, [monsters, monsterFilter]);
  const filteredNpcs = useMemo(() => {
    const q = npcFilter.trim().toLowerCase();
    if (!q) return npcs;
    return npcs.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        (n.role || "").toLowerCase().includes(q) ||
        (n.attitude || "").toLowerCase().includes(q) ||
        (n.aliases || []).some((a) => a.toLowerCase().includes(q))
    );
  }, [npcs, npcFilter]);

  const refresh = useCallback(async () => {
    const [s, chars, ev, rs, mons, enc, npcList, sceneList] = await Promise.all([
      api.status(),
      api.listCharacters(),
      api.sessionEvents(),
      api.listRulesets(),
      api.listMonsters(),
      api.listEncounter(),
      api.listNpcs().catch(() => [] as NpcTemplate[]),
      api.listScene().catch(() => [] as SceneNpc[]),
    ]);
    setStatus(s);
    setCharacters(chars);
    setEvents(ev);
    setRulesets(rs);
    setMonsters(mons);
    setEncounter(enc);
    setNpcs(npcList);
    setScene(sceneList);
    try {
      const sess = await api.listSessions();
      setSessions(sess);
    } catch {
      setSessions([]);
    }
    if (mons.length && !mons.find((m) => m.id === spawnId)) {
      setSpawnId(mons[0].id);
    }
    if (npcList.length && !npcList.find((n) => n.id === spawnNpcId)) {
      setSpawnNpcId(npcList[0].id);
    }
    if (!selectedId && chars.length) setSelectedId(chars[0].id);
  }, [selectedId, spawnId, spawnNpcId]);

  useEffect(() => {
    if (window.dmDesktop?.getApiBase) {
      window.dmDesktop.getApiBase().then(setApiBase).catch(() => undefined);
    }
    refresh().catch((e) => setError(String(e)));
    const t = setInterval(() => {
      api.status().then(setStatus).catch(() => undefined);
    }, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!window.dmDesktop?.onCaptureHotkey) return;
    return window.dmDesktop.onCaptureHotkey(() => {
      void handleCapture();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rightTabInitialized.current) return;
    if (!monsters.length && !npcs.length && !encounter.length && !scene.length) return;
    rightTabInitialized.current = true;
    if (encounter.length > 0) setRightTab("foes");
    else if (scene.length > 0) setRightTab("scene");
    else setRightTab("foes");
  }, [encounter.length, scene.length, monsters.length, npcs.length]);

  useEffect(() => {
    if (!addModal) return;
    if (addModal === "monster") {
      const m =
        monsters.find((x) => x.id === spawnId) ||
        filteredMonsters[0] ||
        monsters[0];
      if (!m) return;
      setSpawnTune({
        cr: String(m.cr || "0"),
        xp: m.xp ?? CR_TO_XP[String(m.cr || "0")] ?? 10,
        ac: m.ac,
        hp: m.hp,
      });
    } else {
      const n = npcs.find((x) => x.id === spawnNpcId) || filteredNpcs[0] || npcs[0];
      if (!n) return;
      setSpawnTune({
        cr: String(n.cr || "0"),
        xp: n.xp ?? CR_TO_XP[String(n.cr || "0")] ?? 10,
        ac: n.ac,
        hp: n.hp,
      });
    }
  }, [addModal, spawnId, spawnNpcId, monsters, npcs, filteredMonsters, filteredNpcs]);

  useEffect(() => {
    if (!addModal && !reuploadOpen && !xpAward) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (xpAward) setXpAward(null);
      else if (addModal) setAddModal(null);
      else if (reuploadOpen) clearReuploadWizard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addModal, reuploadOpen, xpAward]);

  function openDefeatAward(creature: {
    id: string;
    label: string;
    cr?: string;
    xp?: number;
  }) {
    if (awardedDefeatIds.has(creature.id)) return;
    const xp = creature.xp ?? 10;
    setXpRecipients(characters.map((c) => c.id));
    setXpAward({
      kind: "defeat",
      label: creature.label,
      cr: creature.cr,
      xp,
      creatureId: creature.id,
      milestoneId: `defeat:${creature.id}`,
      milestoneLabel: `Defeated ${creature.label}`,
    });
  }

  function openMilestoneAward() {
    if (!result) return;
    const skill = result.skill || null;
    const subject =
      result.target?.label ||
      (result.target as { name?: string } | null | undefined)?.name ||
      "";
    let kind = "story_beat";
    let storyXp = 25;
    if (skill === "persuasion" || skill === "performance") {
      kind = "social_charm";
      storyXp = 50;
    } else if (skill === "deception") {
      kind = "social_deception";
      storyXp = 50;
    } else if (skill === "intimidation") {
      kind = "social_intimidation";
      storyXp = 50;
    } else if (skill === "animal_handling") {
      kind = "social_animal";
      storyXp = 50;
    }
    const slug = subject
      ? `${kind}:${subject.toLowerCase().replace(/\s+/g, "_")}`
      : kind;
    const labels: Record<string, string> = {
      social_charm: "Social success (charm / persuade / seduce)",
      social_deception: "Social success (deception)",
      social_intimidation: "Social success (intimidation)",
      social_animal: "Social success (animal handling)",
      story_beat: "Story beat",
    };
    setXpRecipients(characters.map((c) => c.id));
    setXpAward({
      kind: "milestone",
      label: subject || result.check_type,
      xp: storyXp,
      milestoneId: slug,
      milestoneLabel: subject ? `${labels[kind]} — ${subject}` : labels[kind],
    });
  }

  async function confirmXpAward() {
    if (!xpAward || !xpRecipients.length) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api.awardXp({
        kind: xpAward.kind,
        character_ids: xpRecipients,
        xp: xpAward.xp,
        creature_id: xpAward.creatureId,
        label: xpAward.label,
        cr: xpAward.cr,
        milestone_id: xpAward.milestoneId,
        milestone_label: xpAward.milestoneLabel,
      });
      if (xpAward.kind === "defeat" && xpAward.creatureId) {
        setAwardedDefeatIds((prev) => new Set(prev).add(xpAward.creatureId!));
      }
      setCharacters(out.characters.length ? out.characters : await api.listCharacters());
      setEvents(await api.sessionEvents());
      setXpAward(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleQuery() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setTranscript(null);
    try {
      const r = await api.query(query.trim(), selectedId);
      setResult(r);
      setEvents(await api.sessionEvents());
      setEncounter(await api.listEncounter());
      setScene(await api.listScene().catch(() => []));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCapture() {
    setBusy(true);
    setError(null);
    try {
      if (status && !status.audio.capturing) {
        await api.audioStart();
        await new Promise((r) => setTimeout(r, 500));
      }
      const out = await api.capture();
      setTranscript(out.transcript);
      setQuery(out.transcript);
      setResult(out.result);
      setEvents(await api.sessionEvents());
      setEncounter(await api.listEncounter());
      setScene(await api.listScene().catch(() => []));
      setStatus(await api.status());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const out = await api.uploadCharacter(file);
      await refresh();
      setSelectedId(out.character.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function clearReuploadWizard() {
    setReuploadOpen(false);
    setReuploadTargetId(null);
    setReuploadFile(null);
    setReuploadPreview(null);
    if (reuploadFileRef.current) reuploadFileRef.current.value = "";
  }

  function startReupload() {
    setError(null);
    if (!characters.length) {
      setError("Upload a character PDF first before re-uploading.");
      return;
    }
    setReuploadPreview(null);
    setReuploadFile(null);
    setReuploadTargetId(null);
    setReuploadOpen(true);
  }

  function pickReuploadTarget(id: string) {
    setReuploadTargetId(id);
    setReuploadPreview(null);
    setReuploadFile(null);
    // Defer so React paints the "Choose PDF" step before the native dialog.
    window.setTimeout(() => reuploadFileRef.current?.click(), 0);
  }

  async function handleReuploadFile(file: File) {
    if (!reuploadTargetId) {
      setError("Pick which character to update first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const preview = await api.previewCharacter(file, reuploadTargetId);
      setReuploadFile(file);
      setReuploadPreview(preview);
    } catch (e) {
      setError(String(e));
      clearReuploadWizard();
    } finally {
      setBusy(false);
    }
  }

  async function confirmReupload() {
    if (!reuploadFile || !reuploadTargetId) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api.uploadCharacter(reuploadFile, reuploadTargetId);
      clearReuploadWizard();
      await refresh();
      setSelectedId(out.character.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadReuploadAsNew() {
    if (!reuploadFile) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api.uploadCharacter(reuploadFile);
      clearReuploadWizard();
      await refresh();
      setSelectedId(out.character.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits() {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await api.updateCharacter(selected.id, editDraft);
      setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditing(false);
      setEditDraft({});
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">DM</div>
          <div>
            <h1>DM Console</h1>
            <span>5e rulings · party · encounters</span>
          </div>
        </div>
        <div className="top-actions">
          <span className={`pill ${status?.ollama.available ? "on" : "off"}`}>
            Ollama {status?.ollama.available ? "ready" : "offline"}
          </span>
          <span className={`pill ${status?.whisper.available ? "on" : "off"}`}>
            Whisper {status?.whisper.available ? status.whisper.model : "optional"}
          </span>
          <span className={`pill ${status?.audio.capturing || status?.audio.source === "discord" ? "on" : ""}`}>
            {status?.audio.source === "discord"
              ? "Discord VC"
              : status?.audio.source === "wasapi" || status?.audio.capturing
                ? "System audio"
                : "Audio idle"}
          </span>
          <select
            className="btn"
            value={status?.active_ruleset || "dnd5e-srd"}
            onChange={async (e) => {
              await api.setRuleset(e.target.value);
              await refresh();
            }}
          >
            {rulesets.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            className="btn ghost"
            onClick={async () => {
              const name = window.prompt("Name this session", `Session ${(sessions.length || 0) + 1}`);
              if (name === null) return;
              await api.newSession(name.trim() || undefined);
              setResult(null);
              await refresh();
            }}
          >
            + Session
          </button>
          <button
            className="btn quit-btn"
            title="Stop API, UI terminals, and close DM Console"
            onClick={async () => {
              if (
                !window.confirm(
                  "Quit DM Console?\n\nThis closes the app and stops the API / UI terminal windows."
                )
              ) {
                return;
              }
              setBusy(true);
              try {
                // Always ask the API to run quit-dm.bat (kills API/UI/Discord terminals).
                await api.shutdown();
                if (window.dmDesktop?.quitAll) {
                  await window.dmDesktop.quitAll();
                  return;
                }
                window.close();
              } catch {
                try {
                  await api.shutdown();
                } catch {
                  /* ignore — process may already be dying */
                }
                if (window.dmDesktop?.quitAll) {
                  try {
                    await window.dmDesktop.quitAll();
                  } catch {
                    /* ignore */
                  }
                  return;
                }
                window.close();
              } finally {
                setBusy(false);
              }
            }}
          >
            Quit
          </button>
        </div>
      </header>

      <div className="session-tabs">
        {sessions.map((s) => (
          <button
            key={s.id}
            className={`session-tab ${s.active ? "active" : ""}`}
            onClick={async () => {
              if (s.active) return;
              await api.activateSession(s.id);
              setResult(null);
              await refresh();
            }}
            onDoubleClick={async () => {
              const name = window.prompt("Rename session", s.name);
              if (!name) return;
              await api.renameSession(s.id, name.trim());
              await refresh();
            }}
            title="Click to switch · Double-click to rename"
          >
            <span className="session-tab-name">{s.name}</span>
            <span className="session-tab-meta">
              {s.event_count} mem · {s.enemy_count} foes
            </span>
            {sessions.length > 1 && (
              <span
                className="session-tab-close"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!window.confirm(`Delete session "${s.name}"? Memory and encounter will be removed.`)) {
                    return;
                  }
                  await api.deleteSession(s.id);
                  setResult(null);
                  await refresh();
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}
      </div>

      <main className="layout">
        <aside className="panel stack">
          <h2>Party</h2>
          {characters.length > 0 && (
            <div className="party-levels" aria-label="Party levels">
              {characters.map((c) => (
                <span key={c.id} className="party-level-chip">
                  <strong>{c.name.split(/\s+/)[0]}</strong> L{c.level}
                  {c.xp_progress && c.xp_progress.level_from_xp !== c.level
                    ? ` · XP L${c.xp_progress.level_from_xp}`
                    : ""}
                </span>
              ))}
            </div>
          )}
          <div className="row">
            <label className="btn file-btn primary">
              Upload PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" className="btn" disabled={busy} onClick={startReupload}>
              Re-upload
            </button>
            <input
              ref={reuploadFileRef}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleReuploadFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="party-list">
            {characters.length === 0 && (
              <p className="muted">Upload D&D Beyond character PDFs to build the party.</p>
            )}
            {characters.map((c) => {
              const initials = c.name
                .split(/\s+/)
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              return (
              <div
                key={c.id}
                className={`char-card ${c.id === selectedId ? "selected" : ""}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="party-hero">
                  <div className="avatar initials">{initials || "?"}</div>
                  <div style={{ minWidth: 0 }}>
                    <strong>{c.name}</strong>
                    <small>
                      L{c.level} · {c.class_level} · {c.species}
                    </small>
                  </div>
                </div>
                <div className="char-meta">
                  <span>AC {c.ac}</span>
                  <span>HP {c.current_hp ?? c.max_hp}/{c.max_hp}</span>
                  <span>Init {c.initiative >= 0 ? `+${c.initiative}` : c.initiative}</span>
                </div>
                <div className="xp-line">
                  <span>
                    XP {c.xp_progress?.xp ?? c.xp ?? 0}
                    {c.xp_progress && c.xp_progress.xp_to_next > 0
                      ? ` / ${c.xp_progress.xp_next_threshold}`
                      : ""}
                  </span>
                  {c.xp_progress?.ready_to_level && (
                    <span className="level-ready-pill">Level up ready</span>
                  )}
                </div>
              </div>
            );})}
          </div>

          {selected && (
            <div>
              <div className="row">
                <button
                  className="btn"
                  onClick={() => {
                    setEditing((v) => !v);
                    setEditDraft({
                      name: selected.name,
                      level: selected.level,
                      max_hp: selected.max_hp,
                      current_hp: selected.current_hp,
                      ac: selected.ac,
                      proficiency_bonus: selected.proficiency_bonus,
                    });
                  }}
                >
                  {editing ? "Cancel edit" : "Edit sheet"}
                </button>
                <button
                  className="btn ghost"
                  onClick={async () => {
                    await api.deleteCharacter(selected.id);
                    setSelectedId(null);
                    await refresh();
                  }}
                >
                  Remove
                </button>
              </div>
              {editing && (
                <div className="edit-form">
                  <label>
                    Name
                    <input
                      value={String(editDraft.name ?? "")}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                  </label>
                  <label>
                    Level
                    <input
                      type="number"
                      value={Number(editDraft.level ?? 1)}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, level: Number(e.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Max HP
                    <input
                      type="number"
                      value={Number(editDraft.max_hp ?? 1)}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, max_hp: Number(e.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Current HP
                    <input
                      type="number"
                      value={Number(editDraft.current_hp ?? editDraft.max_hp ?? 1)}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, current_hp: Number(e.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    AC
                    <input
                      type="number"
                      value={Number(editDraft.ac ?? 10)}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, ac: Number(e.target.value) }))
                      }
                    />
                  </label>
                  <label>
                    Proficiency bonus
                    <input
                      type="number"
                      value={Number(editDraft.proficiency_bonus ?? 2)}
                      onChange={(e) =>
                        setEditDraft((d) => ({
                          ...d,
                          proficiency_bonus: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  {(
                    [
                      "strength",
                      "dexterity",
                      "constitution",
                      "intelligence",
                      "wisdom",
                      "charisma",
                    ] as const
                  ).map((ability) => (
                    <label key={ability}>
                      {ability.slice(0, 3).toUpperCase()} score
                      <input
                        type="number"
                        value={Number(
                          (editDraft.abilities as Character["abilities"] | undefined)?.[ability]
                            ?.score ?? selected.abilities[ability].score
                        )}
                        onChange={(e) => {
                          const score = Number(e.target.value);
                          const modifier = Math.floor((score - 10) / 2);
                          setEditDraft((d) => ({
                            ...d,
                            abilities: {
                              ...(selected.abilities || {}),
                              ...((d.abilities as Character["abilities"]) || {}),
                              [ability]: { score, modifier },
                            },
                          }));
                        }}
                      />
                    </label>
                  ))}
                  <button className="btn primary" onClick={() => void saveEdits()} disabled={busy}>
                    Save changes
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>

        <section className="panel query-box">
          <h2>What needs a roll?</h2>
          <textarea
            placeholder='e.g. "Shardon stabs orc A" or "Shardon tries to sneak past the guards"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleQuery();
              }
            }}
          />
          <div className="query-actions">
            <button className="btn primary" disabled={busy} onClick={() => void handleQuery()}>
              Resolve check
            </button>
            <button className="btn" disabled={busy} onClick={() => void handleCapture()}>
              Ctrl+N capture
            </button>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={async () => {
                if (status?.audio.capturing) await api.audioStop();
                else await api.audioStart();
                setStatus(await api.status());
              }}
            >
              {status?.audio.capturing ? "Stop listening" : "Start listening"}
            </button>
          </div>
          {transcript && (
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Transcript: {transcript}
            </p>
          )}
          {error && <div className="error">{error}</div>}

          {result && (
            <div className="result-card">
              <div className="muted">
                {result.source} · confidence {Math.round(result.confidence * 100)}%
              </div>
              <div className="roll-line">{result.roll_line}</div>
              {result.target && (
                <div className="target-banner">
                  <img
                    src={mediaUrlSync(
                      encounter.find((e) => e.id === result.target?.id)?.image_url ||
                        monsters.find((m) => m.id === result.target?.monster_id)?.image_url,
                      apiBase
                    )}
                    alt={result.target.label}
                  />
                  <div>
                    <strong>
                      {result.check_type === "attack" ? "Target" : "Subject"}:{" "}
                      {result.target.label}
                    </strong>
                    <div className="muted" style={{ fontSize: "0.9rem" }}>
                      {result.check_type === "attack" ? (
                        <>
                          AC {result.target.ac} · HP {result.target.current_hp}/
                          {result.target.max_hp}
                          {result.to_hit_needed != null
                            ? ` · need ${result.to_hit_needed}+ on d20`
                            : ""}
                        </>
                      ) : (
                        <>
                          {result.suggested_dc != null
                            ? `DC ${result.suggested_dc}${
                                result.dc_label ? ` (${result.dc_label})` : ""
                              }`
                            : "No fixed DC"}
                          {result.target.current_hp != null
                            ? ` · HP ${result.target.current_hp}/${result.target.max_hp}`
                            : ""}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="result-grid">
                <div>
                  <span>Character</span>
                  <div>{result.character || "—"}</div>
                </div>
                <div>
                  <span>Check</span>
                  <div>{result.check_type}</div>
                </div>
                <div>
                  <span>Ability / Skill</span>
                  <div>
                    {result.ability || "—"}
                    {result.skill ? ` / ${result.skill}` : ""}
                  </div>
                </div>
                <div>
                  <span>Dice + mod</span>
                  <div>
                    {result.dice}
                    {result.modifier != null
                      ? ` ${result.modifier >= 0 ? "+" : ""}${result.modifier}`
                      : ""}
                  </div>
                </div>
                {result.check_type === "attack" ? (
                  <>
                    <div>
                      <span>Target AC</span>
                      <div>
                        {result.target
                          ? `${result.target.label} AC ${result.target.ac}`
                          : result.target_ac ?? "Pick/spawn a monster"}
                      </div>
                    </div>
                    <div>
                      <span>Need on d20</span>
                      <div>
                        {result.to_hit_needed != null ? `${result.to_hit_needed}+` : "—"}
                      </div>
                    </div>
                    <div>
                      <span>Damage if hit</span>
                      <div>{result.damage || "—"}</div>
                    </div>
                    <div>
                      <span>Target HP</span>
                      <div>
                        {result.target
                          ? `${result.target.current_hp}/${result.target.max_hp}`
                          : "—"}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span>Suggested DC</span>
                      <div>
                        {result.suggested_dc != null
                          ? `${result.suggested_dc}${result.dc_label ? ` (${result.dc_label})` : ""}`
                          : "—"}
                      </div>
                    </div>
                    {result.target && (
                      <div>
                        <span>Subject</span>
                        <div>{result.target.label}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <p style={{ marginTop: "0.85rem" }}>{result.notes}</p>
              {result.howto && (
                <pre
                  className="howto"
                  style={{
                    whiteSpace: "pre-wrap",
                    marginTop: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid var(--line)",
                    fontFamily: "var(--font-body)",
                    fontSize: "0.92rem",
                    lineHeight: 1.45,
                  }}
                >
                  {result.howto}
                </pre>
              )}
              {result.check_type === "attack" && result.target?.id && !result.target.virtual && (
                <div className="row" style={{ marginTop: "0.65rem" }}>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={async () => {
                      const raw = window.prompt("Damage dealt (number)?", "5");
                      if (!raw) return;
                      const dmg = Number(raw);
                      if (!Number.isFinite(dmg)) return;
                      const tid = result.target!.id!;
                      // Prefer encounter damage; fall back to scene NPC patch
                      try {
                        await api.damageEnemy(tid, dmg);
                        const enc = await api.listEncounter();
                        setEncounter(enc);
                        const updated = enc.find((e) => e.id === tid);
                        const newHp = updated
                          ? updated.current_hp
                          : Math.max(0, result.target!.current_hp - dmg);
                        setResult({
                          ...result,
                          target: { ...result.target!, current_hp: newHp },
                        });
                        if (updated && updated.current_hp <= 0) {
                          openDefeatAward(updated);
                        }
                      } catch {
                        await api.setSceneNpcHp(
                          tid,
                          Math.max(0, result.target!.current_hp - dmg)
                        );
                        const sc = await api.listScene();
                        setScene(sc);
                        const updated = sc.find((e) => e.id === tid);
                        const newHp = updated
                          ? updated.current_hp
                          : Math.max(0, result.target!.current_hp - dmg);
                        setResult({
                          ...result,
                          target: { ...result.target!, current_hp: newHp },
                        });
                        if (updated && updated.current_hp <= 0) {
                          openDefeatAward(updated);
                        }
                      }
                    }}
                  >
                    Apply damage to {result.target.label}
                  </button>
                </div>
              )}
              {(result.check_type === "skill" ||
                result.check_type === "ability" ||
                result.check_type === "save") && (
                <div className="row" style={{ marginTop: "0.65rem" }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || characters.length === 0}
                    onClick={openMilestoneAward}
                  >
                    Award milestone
                  </button>
                </div>
              )}
              {result.reasoning && (
                <p className="muted" style={{ marginTop: "0.4rem" }}>
                  {result.reasoning}
                </p>
              )}
              <button
                className="btn"
                style={{ marginTop: "0.5rem" }}
                onClick={() => navigator.clipboard.writeText(result.roll_line)}
              >
                Copy roll line
              </button>
            </div>
          )}

          {!status?.ollama.available && (
            <div className="diff-box" style={{ marginTop: "1rem" }}>
              <strong>Ollama offline</strong>
              <p className="muted">
                Install Ollama and run <code>ollama pull llama3.2</code>. Rules-based matching still
                works without it.
              </p>
            </div>
          )}
        </section>

        <aside className="panel rail-panel">
          <div className="rail-tabs" role="tablist" aria-label="Encounter panels">
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === "foes"}
              className={`rail-tab ${rightTab === "foes" ? "active" : ""}`}
              onClick={() => setRightTab("foes")}
            >
              Foes ({encounter.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === "scene"}
              className={`rail-tab ${rightTab === "scene" ? "active" : ""}`}
              onClick={() => setRightTab("scene")}
            >
              Scene ({scene.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === "log"}
              className={`rail-tab ${rightTab === "log" ? "active" : ""}`}
              onClick={() => setRightTab("log")}
            >
              Log
            </button>
          </div>

          {rightTab === "foes" && (
            <div className="rail-body" role="tabpanel">
              <p className="section-note">Combat foes — e.g. “stabs orc A”.</p>
              <div className="row" style={{ marginBottom: "0.5rem" }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => {
                    setShowCustomInModal(false);
                    setAddModal("monster");
                  }}
                >
                  Add foe
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy || encounter.length === 0}
                  onClick={() => api.clearEncounter().then(refresh)}
                >
                  Clear
                </button>
              </div>
              <div className="party-list rail-list">
                {encounter.length === 0 && (
                  <p className="muted">No enemies. Add a foe or name one in the query.</p>
                )}
                {encounter.map((e) => {
                  const pct =
                    e.max_hp > 0 ? Math.max(0, Math.min(100, (e.current_hp / e.max_hp) * 100)) : 0;
                  return (
                    <div key={e.id} className="char-card enemy-card">
                      <div className="enemy-row">
                        <img
                          className="enemy-portrait"
                          src={mediaUrlSync(e.image_url, apiBase)}
                          alt={e.label}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong>{e.label}</strong>
                          <div className="char-meta">
                            <span>AC {e.ac}</span>
                            <span>
                              HP {e.current_hp}/{e.max_hp}
                            </span>
                            {e.cr != null && <span>CR {e.cr}</span>}
                            {e.xp != null && <span>XP {e.xp}</span>}
                          </div>
                          <div className="hp-bar" title={`${pct.toFixed(0)}%`}>
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="row" style={{ marginTop: "0.4rem" }}>
                        <button
                          className="btn ghost"
                          onClick={async () => {
                            const raw = window.prompt("Set current HP", String(e.current_hp));
                            if (raw == null) return;
                            const updated = await api.setEnemyHp(e.id, Number(raw));
                            setEncounter(await api.listEncounter());
                            if (updated.current_hp <= 0) openDefeatAward(updated);
                          }}
                        >
                          Set HP
                        </button>
                        <button
                          className="btn ghost"
                          onClick={async () => {
                            await api.removeEnemy(e.id);
                            setEncounter(await api.listEncounter());
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {rightTab === "scene" && (
            <div className="rail-body" role="tabpanel">
              <p className="section-note">Social cast — e.g. “persuades the bartender”.</p>
              <div className="row" style={{ marginBottom: "0.5rem" }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => {
                    setShowCustomInModal(false);
                    setAddModal("npc");
                  }}
                >
                  Add NPC
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy || scene.length === 0}
                  onClick={() => api.clearScene().then(refresh)}
                >
                  Clear
                </button>
              </div>
              <div className="party-list rail-list">
                {scene.length === 0 && (
                  <p className="muted">No scene NPCs. Add a bartender, or name one in the query.</p>
                )}
                {scene.map((e) => {
                  const pct =
                    e.max_hp > 0 ? Math.max(0, Math.min(100, (e.current_hp / e.max_hp) * 100)) : 0;
                  return (
                    <div key={e.id} className="char-card enemy-card">
                      <div className="enemy-row">
                        <img
                          className="enemy-portrait"
                          src={mediaUrlSync(e.image_url, apiBase)}
                          alt={e.label}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong>{e.label}</strong>
                          <div className="char-meta">
                            <span className={`attitude-pill attitude-${e.attitude || "indifferent"}`}>
                              {e.attitude || "indifferent"}
                            </span>
                            <span>AC {e.ac}</span>
                            <span>
                              HP {e.current_hp}/{e.max_hp}
                            </span>
                            {e.cr != null && <span>CR {e.cr}</span>}
                            {e.xp != null && <span>XP {e.xp}</span>}
                          </div>
                          <div className="hp-bar" title={`${pct.toFixed(0)}%`}>
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="row" style={{ marginTop: "0.4rem" }}>
                        <button
                          className="btn ghost"
                          onClick={async () => {
                            const raw = window.prompt("Set current HP", String(e.current_hp));
                            if (raw == null) return;
                            const updated = await api.setSceneNpcHp(e.id, Number(raw));
                            setScene(await api.listScene());
                            if (updated.current_hp <= 0) openDefeatAward(updated);
                          }}
                        >
                          Set HP
                        </button>
                        <button
                          className="btn ghost"
                          onClick={async () => {
                            const next = window.prompt(
                              "Attitude (friendly / indifferent / hostile)",
                              e.attitude || "indifferent"
                            );
                            if (next == null || !next.trim()) return;
                            await api.setSceneNpcAttitude(e.id, next.trim().toLowerCase());
                            setScene(await api.listScene());
                          }}
                        >
                          Attitude
                        </button>
                        <button
                          className="btn ghost"
                          onClick={async () => {
                            await api.removeSceneNpc(e.id);
                            setScene(await api.listScene());
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {rightTab === "log" && (
            <div className="rail-body" role="tabpanel">
              <p className="section-note">
                Session memory{activeSession ? ` · ${activeSession.name}` : ""}
              </p>
              <div className="log-list rail-list">
                {events.length === 0 && <p className="muted">No rulings yet this session.</p>}
                {[...events].reverse().map((ev) => (
                  <div key={ev.id} className="log-item">
                    <div className="q">{ev.query}</div>
                    <div className="a">{ev.result.roll_line}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </main>

      {xpAward && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setXpAward(null);
          }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label="Award XP">
            <div className="modal-header">
              <h2>{xpAward.kind === "defeat" ? "Defeat XP" : "Award milestone"}</h2>
              <button type="button" className="btn ghost" onClick={() => setXpAward(null)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <p>
                <strong>{xpAward.milestoneLabel || xpAward.label}</strong>
              </p>
              <p className="muted small">
                {xpAward.kind === "defeat"
                  ? `CR ${xpAward.cr || "?"} · ${xpAward.xp} XP total (split among selected)`
                  : `${xpAward.xp} story XP (split among selected)`}
              </p>
              <label className="muted small" style={{ display: "block", marginTop: "0.75rem" }}>
                Total XP
                <input
                  type="number"
                  min={0}
                  value={xpAward.xp}
                  onChange={(e) =>
                    setXpAward((a) => (a ? { ...a, xp: Number(e.target.value) || 0 } : a))
                  }
                  style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
                />
              </label>
              <p className="muted small" style={{ marginTop: "0.75rem" }}>
                Award to:
              </p>
              <ul className="xp-recipient-list">
                {characters.map((c) => (
                  <li key={c.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={xpRecipients.includes(c.id)}
                        onChange={(e) => {
                          setXpRecipients((prev) =>
                            e.target.checked
                              ? [...prev, c.id]
                              : prev.filter((id) => id !== c.id)
                          );
                        }}
                      />
                      {c.name}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="row" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || xpRecipients.length === 0}
                  onClick={() => void confirmXpAward()}
                >
                  Confirm award
                </button>
                <button type="button" className="btn ghost" onClick={() => setXpAward(null)}>
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reuploadOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) clearReuploadWizard();
          }}
        >
          <div
            className="modal-panel modal-panel-reupload"
            role="dialog"
            aria-modal="true"
            aria-label="Re-upload character"
          >
            <div className="modal-header">
              <h2>
                {!reuploadTargetId
                  ? "Re-upload"
                  : reuploadPreview
                    ? `Updating ${reuploadPreview.current_name}`
                    : `Updating ${characters.find((c) => c.id === reuploadTargetId)?.name || "character"}`}
              </h2>
              <button type="button" className="btn ghost" onClick={clearReuploadWizard}>
                Close
              </button>
            </div>
            <div className="modal-body">
              {!reuploadTargetId && (
                <>
                  <p className="muted small">Which character are you updating? Then choose the new PDF.</p>
                  <ul className="reupload-pick-list">
                    {characters.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="btn reupload-pick-item"
                          disabled={busy}
                          onClick={() => pickReuploadTarget(c.id)}
                        >
                          <span className="reupload-pick-name">{c.name}</span>
                          <span className="muted small">{c.class_level || `Level ${c.level}`}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {reuploadTargetId && !reuploadPreview && (
                <>
                  <p className="muted small">
                    Choose the new D&amp;D Beyond PDF
                    {reuploadFile ? ` (${reuploadFile.name})` : ""}, or pick a different character.
                  </p>
                  <div className="row">
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={() => reuploadFileRef.current?.click()}
                    >
                      Choose PDF
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => {
                        setReuploadTargetId(null);
                        setReuploadFile(null);
                        setReuploadPreview(null);
                      }}
                    >
                      Back
                    </button>
                  </div>
                </>
              )}

              {reuploadPreview && (
                <>
                  {reuploadPreview.name_mismatch && (
                    <p className="reupload-warn">
                      This PDF looks like <em>{reuploadPreview.parsed_name}</em>, not{" "}
                      {reuploadPreview.current_name}. Update the selected sheet anyway, or add it as
                      a new party member.
                    </p>
                  )}
                  {reuploadPreview.changes.length === 0 ? (
                    <p className="muted">No differences detected.</p>
                  ) : (
                    <ul className="change-list">
                      {reuploadPreview.changes.map((ch: CharacterChange) => (
                        <li key={`${ch.label}-${ch.from}-${ch.to}`}>
                          <span className="change-label">{ch.label}</span>
                          <span className="change-values">
                            <span className="change-from">{ch.from}</span>
                            <span className="change-arrow" aria-hidden>
                              →
                            </span>
                            <span className="change-to">{ch.to}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="row" style={{ marginTop: "0.85rem" }}>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={() => void confirmReupload()}
                    >
                      Confirm update
                    </button>
                    {reuploadPreview.name_mismatch && (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void uploadReuploadAsNew()}
                      >
                        Upload as new character
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => {
                        setReuploadPreview(null);
                        setReuploadFile(null);
                      }}
                    >
                      Back
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {addModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddModal(null);
          }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={addModal === "monster" ? "Add foe" : "Add scene NPC"}
          >
            <div className="modal-header">
              <h2>{addModal === "monster" ? "Add foe" : "Add scene NPC"}</h2>
              <button type="button" className="btn ghost" onClick={() => setAddModal(null)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              {addModal === "monster" ? (
                <>
                  <p className="muted small">{monsters.length} SRD monsters (Open5e).</p>
                  <div className="spawn-row modal-spawn">
                    {monsters.find((m) => m.id === spawnId)?.image_url && (
                      <img
                        className="spawn-preview"
                        src={mediaUrlSync(
                          monsters.find((m) => m.id === spawnId)?.image_url,
                          apiBase
                        )}
                        alt=""
                      />
                    )}
                    <input
                      className="btn spawn-filter"
                      placeholder="Filter monsters…"
                      value={monsterFilter}
                      onChange={(e) => setMonsterFilter(e.target.value)}
                      autoFocus
                    />
                    <select
                      className="btn"
                      value={
                        filteredMonsters.some((m) => m.id === spawnId)
                          ? spawnId
                          : filteredMonsters[0]?.id || ""
                      }
                      onChange={(e) => setSpawnId(e.target.value)}
                    >
                      {filteredMonsters.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · CR {m.cr || "?"} · XP {m.xp ?? "?"} · AC {m.ac} · HP {m.hp}
                        </option>
                      ))}
                    </select>
                    <div className="spawn-tune">
                      <p className="muted small">
                        Monsters use <strong>Challenge Rating (CR)</strong>, not PC levels. Adjust
                        before spawn to scale this fight (XP updates with CR).
                      </p>
                      <div className="spawn-tune-grid">
                        <label>
                          CR
                          <select
                            className="btn"
                            value={
                              CR_OPTIONS.includes(spawnTune.cr) ? spawnTune.cr : spawnTune.cr
                            }
                            onChange={(e) => {
                              const cr = e.target.value;
                              setSpawnTune((t) => ({
                                ...t,
                                cr,
                                xp: CR_TO_XP[cr] ?? t.xp,
                              }));
                            }}
                          >
                            {!CR_OPTIONS.includes(spawnTune.cr) && (
                              <option value={spawnTune.cr}>{spawnTune.cr}</option>
                            )}
                            {CR_OPTIONS.map((cr) => (
                              <option key={cr} value={cr}>
                                {cr}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          XP
                          <input
                            type="number"
                            min={0}
                            value={spawnTune.xp}
                            onChange={(e) =>
                              setSpawnTune((t) => ({ ...t, xp: Number(e.target.value) || 0 }))
                            }
                          />
                        </label>
                        <label>
                          AC
                          <input
                            type="number"
                            value={spawnTune.ac}
                            onChange={(e) =>
                              setSpawnTune((t) => ({ ...t, ac: Number(e.target.value) || 0 }))
                            }
                          />
                        </label>
                        <label>
                          HP
                          <input
                            type="number"
                            min={1}
                            value={spawnTune.hp}
                            onChange={(e) =>
                              setSpawnTune((t) => ({
                                ...t,
                                hp: Math.max(1, Number(e.target.value) || 1),
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      className="btn primary"
                      disabled={
                        busy ||
                        !(filteredMonsters.some((m) => m.id === spawnId)
                          ? spawnId
                          : filteredMonsters[0]?.id)
                      }
                      onClick={async () => {
                        const id = filteredMonsters.some((m) => m.id === spawnId)
                          ? spawnId
                          : filteredMonsters[0]?.id;
                        if (!id) return;
                        setBusy(true);
                        try {
                          await api.spawnEnemy(id, 1, undefined, {
                            cr: spawnTune.cr,
                            xp: spawnTune.xp,
                            ac: spawnTune.ac,
                            hp: spawnTune.hp,
                          });
                          setSpawnId(id);
                          setEncounter(await api.listEncounter());
                          setRightTab("foes");
                          setAddModal(null);
                        } catch (e) {
                          setError(String(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Spawn
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ marginTop: "0.75rem" }}
                    onClick={() => setShowCustomInModal((v) => !v)}
                  >
                    {showCustomInModal ? "Hide custom monster" : "Custom monster…"}
                  </button>
                  {showCustomInModal && (
                    <div className="edit-form" style={{ marginTop: "0.5rem" }}>
                      <label>
                        Name
                        <input
                          value={customMonster.name}
                          onChange={(e) =>
                            setCustomMonster((c) => ({ ...c, name: e.target.value }))
                          }
                        />
                      </label>
                      <label>
                        AC
                        <input
                          type="number"
                          value={customMonster.ac}
                          onChange={(e) =>
                            setCustomMonster((c) => ({ ...c, ac: Number(e.target.value) }))
                          }
                        />
                      </label>
                      <label>
                        HP
                        <input
                          type="number"
                          value={customMonster.hp}
                          onChange={(e) =>
                            setCustomMonster((c) => ({ ...c, hp: Number(e.target.value) }))
                          }
                        />
                      </label>
                      <label className="btn file-btn">
                        Portrait image
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            setCustomMonster((c) => ({ ...c, image: f }));
                          }}
                        />
                      </label>
                      <button
                        className="btn"
                        disabled={busy || !customMonster.name.trim()}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const saved = await api.addCustomMonster({
                              name: customMonster.name.trim(),
                              ac: customMonster.ac,
                              hp: customMonster.hp,
                              image: customMonster.image,
                            });
                            setMonsters(await api.listMonsters());
                            setSpawnId(saved.id);
                            setMonsterFilter(saved.name);
                            setCustomMonster({ name: "", ac: 13, hp: 15, image: null });
                            setAddModal(null);
                            setRightTab("foes");
                          } catch (e) {
                            setError(String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Save to bestiary
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="muted small">{npcs.length} scene NPCs in catalog.</p>
                  <div className="spawn-row modal-spawn">
                    {npcs.find((n) => n.id === spawnNpcId)?.image_url && (
                      <img
                        className="spawn-preview"
                        src={mediaUrlSync(
                          npcs.find((n) => n.id === spawnNpcId)?.image_url,
                          apiBase
                        )}
                        alt=""
                      />
                    )}
                    <input
                      className="btn spawn-filter"
                      placeholder="Filter NPCs… (bartender, mira…)"
                      value={npcFilter}
                      onChange={(e) => setNpcFilter(e.target.value)}
                      autoFocus
                    />
                    <select
                      className="btn"
                      value={
                        filteredNpcs.some((n) => n.id === spawnNpcId)
                          ? spawnNpcId
                          : filteredNpcs[0]?.id || ""
                      }
                      onChange={(e) => setSpawnNpcId(e.target.value)}
                    >
                      {filteredNpcs.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} · {n.role || "NPC"} · XP {n.xp ?? "?"} · AC {n.ac}
                        </option>
                      ))}
                    </select>
                    <div className="spawn-tune">
                      <p className="muted small">
                        Scene NPCs also use <strong>CR</strong> (not class levels). Tweak CR / XP /
                        HP before spawning this instance.
                      </p>
                      <div className="spawn-tune-grid">
                        <label>
                          CR
                          <select
                            className="btn"
                            value={spawnTune.cr}
                            onChange={(e) => {
                              const cr = e.target.value;
                              setSpawnTune((t) => ({
                                ...t,
                                cr,
                                xp: CR_TO_XP[cr] ?? t.xp,
                              }));
                            }}
                          >
                            {!CR_OPTIONS.includes(spawnTune.cr) && (
                              <option value={spawnTune.cr}>{spawnTune.cr}</option>
                            )}
                            {CR_OPTIONS.map((cr) => (
                              <option key={cr} value={cr}>
                                {cr}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          XP
                          <input
                            type="number"
                            min={0}
                            value={spawnTune.xp}
                            onChange={(e) =>
                              setSpawnTune((t) => ({ ...t, xp: Number(e.target.value) || 0 }))
                            }
                          />
                        </label>
                        <label>
                          AC
                          <input
                            type="number"
                            value={spawnTune.ac}
                            onChange={(e) =>
                              setSpawnTune((t) => ({ ...t, ac: Number(e.target.value) || 0 }))
                            }
                          />
                        </label>
                        <label>
                          HP
                          <input
                            type="number"
                            min={1}
                            value={spawnTune.hp}
                            onChange={(e) =>
                              setSpawnTune((t) => ({
                                ...t,
                                hp: Math.max(1, Number(e.target.value) || 1),
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      className="btn primary"
                      disabled={
                        busy ||
                        !(filteredNpcs.some((n) => n.id === spawnNpcId)
                          ? spawnNpcId
                          : filteredNpcs[0]?.id)
                      }
                      onClick={async () => {
                        const id = filteredNpcs.some((n) => n.id === spawnNpcId)
                          ? spawnNpcId
                          : filteredNpcs[0]?.id;
                        if (!id) return;
                        setBusy(true);
                        try {
                          await api.spawnNpc(id, 1, undefined, {
                            cr: spawnTune.cr,
                            xp: spawnTune.xp,
                            ac: spawnTune.ac,
                            hp: spawnTune.hp,
                          });
                          setSpawnNpcId(id);
                          setScene(await api.listScene());
                          setRightTab("scene");
                          setAddModal(null);
                        } catch (e) {
                          setError(String(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Spawn
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ marginTop: "0.75rem" }}
                    onClick={() => setShowCustomInModal((v) => !v)}
                  >
                    {showCustomInModal ? "Hide custom NPC" : "Custom NPC…"}
                  </button>
                  {showCustomInModal && (
                    <div className="edit-form" style={{ marginTop: "0.5rem" }}>
                      <label>
                        Name
                        <input
                          value={customNpc.name}
                          onChange={(e) => setCustomNpc((c) => ({ ...c, name: e.target.value }))}
                        />
                      </label>
                      <label>
                        Role
                        <input
                          value={customNpc.role}
                          onChange={(e) => setCustomNpc((c) => ({ ...c, role: e.target.value }))}
                          placeholder="Bartender"
                        />
                      </label>
                      <label>
                        Attitude
                        <select
                          className="btn"
                          value={customNpc.attitude}
                          onChange={(e) =>
                            setCustomNpc((c) => ({ ...c, attitude: e.target.value }))
                          }
                        >
                          <option value="friendly">friendly</option>
                          <option value="indifferent">indifferent</option>
                          <option value="hostile">hostile</option>
                        </select>
                      </label>
                      <label>
                        AC
                        <input
                          type="number"
                          value={customNpc.ac}
                          onChange={(e) =>
                            setCustomNpc((c) => ({ ...c, ac: Number(e.target.value) }))
                          }
                        />
                      </label>
                      <label>
                        HP
                        <input
                          type="number"
                          value={customNpc.hp}
                          onChange={(e) =>
                            setCustomNpc((c) => ({ ...c, hp: Number(e.target.value) }))
                          }
                        />
                      </label>
                      <label className="btn file-btn">
                        Portrait image
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            setCustomNpc((c) => ({ ...c, image: f }));
                          }}
                        />
                      </label>
                      <button
                        className="btn"
                        disabled={busy || !customNpc.name.trim()}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const saved = await api.addCustomNpc({
                              name: customNpc.name.trim(),
                              ac: customNpc.ac,
                              hp: customNpc.hp,
                              attitude: customNpc.attitude,
                              role: customNpc.role.trim(),
                              image: customNpc.image,
                            });
                            setNpcs(await api.listNpcs());
                            setSpawnNpcId(saved.id);
                            setNpcFilter(saved.name);
                            setCustomNpc({
                              name: "",
                              ac: 12,
                              hp: 12,
                              attitude: "indifferent",
                              role: "",
                              image: null,
                            });
                            setAddModal(null);
                            setRightTab("scene");
                          } catch (e) {
                            setError(String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Save to scene catalog
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
