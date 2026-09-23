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
import InventoryModal from "./InventoryModal";
import MapPanel from "./map/MapPanel";
import MapErrorBoundary from "./map/MapErrorBoundary";
import { HitEntry } from "./map/ResolveModal";
import ResolveCard from "./map/ResolveCard";
import type { MapRuling, MarkPulse, RulingCreature } from "./map/effects";
import PicturesPanel from "./map/PicturesPanel";
import { CREATURE_SIZES } from "./map/sizes";

const API_BASE = "http://127.0.0.1:8766";

function logWhen(iso: string): { day: string; time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: "", time: "" };
  return {
    day: date.toLocaleDateString(undefined, { month: "long", day: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function LogEntry({ event }: { event: SessionEvent }) {
  const when = logWhen(event.created_at);
  return (
    <>
      {when.day ? <h3 className="story-day">{when.day}</h3> : null}
      <article className="story-row">
        <div className="story-when">
          <span>{when.time}</span>
          <span className="story-from">{event.source === "map" ? "Map" : "Console"}</span>
        </div>
        <div>
          <p className="story-in">{event.query}</p>
          {event.result?.roll_line ? <p className="story-out">{event.result.roll_line}</p> : null}
        </div>
      </article>
    </>
  );
}

function LogPage({
  events,
  sessionName,
  entryId,
  pinned,
  turn,
  leaving,
  onTurn,
  onLeaveDone,
}: {
  events: SessionEvent[];
  sessionName: string;
  entryId: string | null;
  pinned: boolean;
  turn: "" | "older" | "newer";
  leaving: SessionEvent | null;
  onTurn: (direction: "older" | "newer", nextId: string, stayOnNewest: boolean, shown: SessionEvent) => void;
  onLeaveDone: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [coverAnim, setCoverAnim] = useState<"" | "opening" | "closing">("");
  const ordered = useMemo(() => [...events].reverse(), [events]);
  const found = entryId ? ordered.findIndex((row) => row.id === entryId) : -1;
  const index = pinned || found < 0 ? 0 : found;
  const entry = ordered[index];
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function openCover() {
    if (coverAnim === "opening") return;
    if (reduceMotion()) {
      setOpened(true);
      return;
    }
    setCoverAnim("opening");
  }

  function closeCover() {
    if (reduceMotion()) {
      setOpened(false);
      setCoverAnim("");
      return;
    }
    setOpened(false);
    setCoverAnim("closing");
  }

  function go(direction: "older" | "newer") {
    if (!entry) return;
    const nextIndex = direction === "older" ? index + 1 : index - 1;
    const next = ordered[nextIndex];
    if (!next) return;
    onTurn(direction, next.id, nextIndex === 0, entry);
  }

  return (
    <main className="log-page">
      <div className={`book${opened ? " is-open" : ""}`}>
        {!opened && (
          <button
            type="button"
            className={`book-cover${coverAnim ? ` ${coverAnim}` : ""}`}
            onClick={openCover}
            onAnimationEnd={() => {
              if (coverAnim === "opening") setOpened(true);
              if (coverAnim === "closing") setCoverAnim("");
            }}
          >
            <span className="book-spine" />
            <span className="book-cover-face">
              <span className="book-rule" />
              <span className="book-kicker">A record of the table</span>
              <h2>Log</h2>
              <p>{sessionName}</p>
              <span className="book-rule" />
              <span className="book-open-label">Open</span>
            </span>
          </button>
        )}
        {opened && (
          <div className="book-spread">
            <div className="log-turn book-pages">
              {!entry ? (
                <div className="story-page parchment">
                  <p className="log-empty">The pages are still blank.</p>
                </div>
              ) : (
                <>
                  {leaving ? (
                    <div className={`story-page parchment leaving turn-${turn}`} onAnimationEnd={onLeaveDone}>
                      <LogEntry event={leaving} />
                    </div>
                  ) : null}
                  <div key={entry.id} className={`story-page parchment${turn ? ` turn-${turn}` : ""}`}>
                    <LogEntry event={entry} />
                  </div>
                </>
              )}
            </div>
            <div className="log-nav">
              <button type="button" className="btn ghost" onClick={closeCover}>
                Cover
              </button>
              <button type="button" className="btn ghost" disabled={!entry || index >= ordered.length - 1} onClick={() => go("older")}>
                Older
              </button>
              <span>{entry ? `${ordered.length - index}/${ordered.length}` : "Empty"}</span>
              <button type="button" className="btn ghost" disabled={!entry || index <= 0} onClick={() => go("newer")}>
                Newer
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function initialsFor(label: string): string {
  return (
    label
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function hpTone(current: number, max: number): "high" | "mid" | "low" {
  if (max <= 0) return "low";
  const ratio = current / max;
  if (ratio > 0.5) return "high";
  if (ratio > 0.2) return "mid";
  return "low";
}

function PartyAvatar({
  name,
  imageUrl,
  apiBase,
  onFile,
}: {
  name: string;
  imageUrl?: string | null;
  apiBase: string;
  onFile: (file: File) => void;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [imageUrl]);
  const initials = initialsFor(name);
  return (
    <label
      className="avatar-upload"
      title="Upload portrait. The map token uses this picture."
      onClick={(e) => e.stopPropagation()}
    >
      {imageUrl && !broken ? (
        <img
          className="avatar"
          src={mediaUrlSync(imageUrl, apiBase)}
          alt=""
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="avatar initials">{initials}</div>
      )}
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

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
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [bagFor, setBagFor] = useState<string | null>(null);
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
  const [mapRuling, setMapRuling] = useState<MapRuling | null>(null);
  const [queryPulse, setQueryPulse] = useState<{ id: number; text: string; result: CheckResult } | null>(null);
  const [markPulse, setMarkPulse] = useState<MarkPulse | null>(null);
  const [damageShown, setDamageShown] = useState<Record<string, number>>({});
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
  const [rightTab, setRightTab] = useState<"foes" | "scene" | "log" | "pictures">("foes");
  const [viewMode, setViewMode] = useState<"console" | "map" | "log">("console");
  const [logId, setLogId] = useState<string | null>(null);
  const [logTurn, setLogTurn] = useState<"" | "older" | "newer">("");
  const [logLeaving, setLogLeaving] = useState<SessionEvent | null>(null);
  const logPinned = useRef(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [loadOpen, setLoadOpen] = useState(false);
  const [saves, setSaves] = useState<{ name: string; saved_at: string }[]>([]);
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

  function acceptRuling(ruling: MapRuling) {
    setMapRuling(ruling);
    setResult(ruling.result);
  }

  function patchOpenTarget(
    id: string,
    fields: { current_hp?: number; max_hp?: number; ac?: number },
    dropKey?: string
  ) {
    setResult((prev) =>
      prev?.target?.id === id && prev.target ? { ...prev, target: { ...prev.target, ...fields } } : prev
    );
    setMapRuling((prev) => {
      if (!prev) return prev;
      const result =
        prev.result.target?.id === id && prev.result.target
          ? { ...prev.result, target: { ...prev.result.target, ...fields } }
          : prev.result;
      const creatures = dropKey ? prev.creatures.filter((item) => item.key !== dropKey) : prev.creatures;
      return { ...prev, result, creatures };
    });
  }

  async function applyCreature(creature: RulingCreature, amount: number, heal = mapRuling?.heal ?? false) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    setBusy(true);
    setError(null);
    try {
      let next = 0;
      let downed = false;
      const character =
        creature.refId && (creature.kind === "pc" || creature.kind === "character" || characters.some((row) => row.id === creature.refId))
          ? characters.find((row) => row.id === creature.refId)
          : null;
      if (character && creature.refId) {
        const current = character?.current_hp ?? character?.max_hp ?? 0;
        const max = character?.max_hp ?? current;
        next = heal ? Math.min(max, current + amount) : Math.max(0, current - amount);
        await api.updateCharacter(creature.refId, { current_hp: next });
        setCharacters(await api.listCharacters());
        patchOpenTarget(creature.refId, { current_hp: next, max_hp: max }, creature.key);
        downed = !heal && next <= 0;
      } else if (creature.refId) {
        const foe = encounter.find((row) => row.id === creature.refId);
        const npc = scene.find((row) => row.id === creature.refId);
        const current = foe?.current_hp ?? npc?.current_hp ?? 0;
        const max = foe?.max_hp ?? npc?.max_hp ?? current;
        next = heal ? Math.min(max, current + amount) : Math.max(0, current - amount);
        if (npc && creature.kind === "npc") {
          await api.setSceneNpcHp(creature.refId, next);
          setScene(await api.listScene());
          patchOpenTarget(creature.refId, { current_hp: next, max_hp: max }, creature.key);
          downed = !heal && next <= 0;
        } else if (foe || creature.kind === "enemy" || creature.kind === "monster") {
          const updated = heal
            ? await api.setEnemyHp(creature.refId, next)
            : await api.damageEnemy(creature.refId, amount);
          next = updated.current_hp;
          setEncounter(await api.listEncounter());
          patchOpenTarget(creature.refId, { current_hp: next, max_hp: updated.max_hp ?? max }, creature.key);
          downed = !heal && next <= 0;
          if (downed) openDefeatAward(updated);
        } else {
          await api.setSceneNpcHp(creature.refId, next);
          setScene(await api.listScene());
          patchOpenTarget(creature.refId, { current_hp: next, max_hp: max }, creature.key);
          downed = !heal && next <= 0;
        }
      }
      if (!heal && creature.refId) {
        const dealt = amount;
        setDamageShown((prev) => ({ ...prev, [creature.refId as string]: dealt }));
        const from = viewMode === "map" ? "map" : "console";
        void api
          .storyNote(result?.roll_line || creature.label, `${creature.label} takes ${dealt}. Now ${next} hit points.`, from)
          .then(() => api.sessionEvents().then(setEvents))
          .catch(() => undefined);
      }
      if (!creature.refId) {
        setMapRuling((prev) =>
          prev ? { ...prev, creatures: prev.creatures.filter((item) => item.key !== creature.key) } : prev
        );
      }
      setMarkPulse({
        id: Date.now(),
        miss: false,
        heal,
        damageType: mapRuling?.action?.damageType || (heal ? "healing" : "bludgeoning"),
        tile: creature.tile,
        tokenId: creature.tokenId,
        downed,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function missCreature(creature: RulingCreature) {
    const from = viewMode === "map" ? "map" : "console";
    void api
      .storyNote(result?.roll_line || creature.label, `${creature.label} misses. Hit points stay.`, from)
      .then(() => api.sessionEvents().then(setEvents))
      .catch(() => undefined);
    setMapRuling((prev) =>
      prev ? { ...prev, creatures: prev.creatures.filter((item) => item.key !== creature.key) } : prev
    );
    setMarkPulse({
      id: Date.now(),
      miss: true,
      heal: false,
      damageType: "",
      tile: creature.tile,
      tokenId: creature.tokenId,
      downed: false,
    });
  }

  async function handleQuery() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setTranscript(null);
    try {
      const r = await api.query(query.trim(), selectedId, "console");
      setResult(r);
      setQueryPulse({ id: Date.now(), text: query.trim(), result: r });
      setEvents(await api.sessionEvents());
      setEncounter(await api.listEncounter());
      setScene(await api.listScene().catch(() => []));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        setResult(null);
        setError(
          "The API did not answer, so this is not a new ruling. The previous result was cleared. Check that the API is running, then try again."
        );
      } else {
        setError(msg);
      }
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
      setQueryPulse({ id: Date.now(), text: out.transcript, result: out.result });
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

  async function confirmSave() {
    const name = saveName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveGame(name);
      setSaveOpen(false);
      setSaveName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function openLoad() {
    setError(null);
    setLoadOpen(true);
    try {
      setSaves(await api.listSaves());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmLoad(name: string) {
    setBusy(true);
    setError(null);
    try {
      await api.loadGame(name);
      setLoadOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      patchOpenTarget(updated.id, {
        current_hp: updated.current_hp ?? updated.max_hp,
        max_hp: updated.max_hp,
        ac: updated.ac,
      });
      setDamageShown((prev) => {
        if (!(updated.id in prev)) return prev;
        const next = { ...prev };
        delete next[updated.id];
        return next;
      });
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
          <div className="view-toggle">
            <button
              type="button"
              className={`btn ghost ${viewMode === "console" ? "active-tab" : ""}`}
              onClick={() => setViewMode("console")}
            >
              Console
            </button>
            <button
              type="button"
              className={`btn ghost ${viewMode === "map" ? "active-tab" : ""}`}
              onClick={() => setViewMode("map")}
            >
              Map
            </button>
            <button
              type="button"
              className={`btn ghost ${viewMode === "log" ? "active-tab" : ""}`}
              onClick={() => {
                logPinned.current = true;
                setLogId(null);
                setLogTurn("");
                setLogLeaving(null);
                setViewMode("log");
                void api.sessionEvents().then(setEvents).catch(() => undefined);
              }}
            >
              Log
            </button>
          </div>
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
          <button className="btn ghost" title="Save into the application's savedata folder." onClick={() => setSaveOpen(true)}>
            Save
          </button>
          <button className="btn ghost" title="Load a save from the application's savedata folder." onClick={() => void openLoad()}>
            Load
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

      {saveOpen && (
        <div className="modal-backdrop" onClick={() => setSaveOpen(false)}>
          <form
            className="modal-panel"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void confirmSave();
            }}
          >
            <h2>Save session</h2>
            <label>
              Name
              <input value={saveName} autoFocus onChange={(event) => setSaveName(event.target.value)} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setSaveOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={busy || !saveName.trim()}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}
      {loadOpen && (
        <div className="modal-backdrop" onClick={() => setLoadOpen(false)}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <h2>Load session</h2>
            {saves.length === 0 ? (
              <p className="muted">No saves yet.</p>
            ) : (
              <ul className="save-list">
                {saves.map((row) => (
                  <li key={row.name}>
                    <button type="button" className="btn ghost" disabled={busy} onClick={() => void confirmLoad(row.name)}>
                      {row.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setLoadOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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

      <div className={viewMode === "map" ? "map-live" : "map-stashed"}>
        <MapErrorBoundary onError={(msg) => setError(msg)}>
          <MapPanel
            characters={characters}
            encounter={encounter}
            scene={scene}
            monsters={monsters}
            npcs={npcs}
            active={viewMode === "map"}
            selectedCharacterId={selectedId}
            queryPulse={queryPulse}
            markPulse={markPulse}
            ruling={mapRuling}
            onRuling={acceptRuling}
            onApply={(creature, amount) => void applyCreature(creature, amount)}
            onMiss={missCreature}
            damageShown={damageShown}
            applyBusy={busy}
            onError={(msg) => setError(msg)}
            onEncounterChange={async () => {
              setEncounter(await api.listEncounter());
            }}
            onSceneChange={async () => {
              setScene(await api.listScene());
            }}
            onCharactersChange={async () => {
              setCharacters(await api.listCharacters());
            }}
          />
        </MapErrorBoundary>
      </div>
      {viewMode === "log" && (
        <LogPage
          events={events}
          sessionName={activeSession?.name || "This session"}
          entryId={logId}
          pinned={logPinned.current}
          turn={logTurn}
          leaving={logLeaving}
          onTurn={(direction, nextId, stayOnNewest, shown) => {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            setLogLeaving(reduce ? null : shown);
            logPinned.current = stayOnNewest;
            setLogTurn(reduce ? "" : direction);
            setLogId(nextId);
          }}
          onLeaveDone={() => setLogLeaving(null)}
        />
      )}
      {viewMode === "console" && (
      <main className="layout">
        <aside className="panel stack">
          <div className="party-head">
            <h2>Party</h2>
            <span className="muted small">{characters.length}</span>
          </div>
          <div className="party-tools">
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
              const hp = c.current_hp ?? c.max_hp;
              const hpMax = Math.max(1, c.max_hp || 1);
              const hpPct = Math.max(0, Math.min(100, (hp / hpMax) * 100));
              const tone = hpTone(hp, c.max_hp || 1);
              const xp = c.xp_progress?.xp ?? c.xp ?? 0;
              const xpNext = c.xp_progress?.xp_next_threshold ?? 0;
              const xpInto = c.xp_progress?.xp_into_level ?? 0;
              const xpSpan = xpInto + (c.xp_progress?.xp_to_next ?? 0);
              const xpPct = xpSpan > 0 ? Math.max(0, Math.min(100, (xpInto / xpSpan) * 100)) : 0;
              return (
              <div
                key={c.id}
                className={`char-card ${c.id === selectedId ? "selected" : ""}`}
                onClick={() => {
                  setSelectedId(c.id);
                  if (c.id !== confirmRemoveId) setConfirmRemoveId(null);
                }}
              >
                <div className="party-hero">
                  <PartyAvatar
                    name={c.name}
                    imageUrl={c.image_url}
                    apiBase={apiBase}
                    onFile={(file) => {
                      void (async () => {
                        setBusy(true);
                        try {
                          await api.uploadCharacterImage(c.id, file);
                          setCharacters(await api.listCharacters());
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err));
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  />
                  <div className="party-id" style={{ minWidth: 0 }}>
                    <div className="party-name-row">
                      <strong>{c.name}</strong>
                      <span className="party-level">L{c.level}</span>
                    </div>
                    <small>
                      {c.class_level}
                      {c.species ? ` · ${c.species}` : ""}
                    </small>
                  </div>
                </div>
                <div className={`hp-meter tone-${tone}`}>
                  <div className="hp-meter-top">
                    <span>HP</span>
                    <span>
                      {hp}/{c.max_hp}
                      {c.temp_hp ? ` +${c.temp_hp}` : ""}
                      {damageShown[c.id] ? <span className="hp-loss"> −{damageShown[c.id]}</span> : null}
                    </span>
                  </div>
                  <div className="hp-meter-track">
                    <span style={{ width: `${hpPct}%` }} />
                  </div>
                </div>
                <div className="char-meta">
                  <span className="stat-chip">AC {c.ac}</span>
                  <span className="stat-chip">Init {c.initiative >= 0 ? `+${c.initiative}` : c.initiative}</span>
                  {c.xp_progress?.ready_to_level && <span className="level-ready-pill">Level up</span>}
                </div>
                <div className="xp-meter" title={`XP ${xp}`}>
                  <div className="hp-meter-top">
                    <span>XP</span>
                    <span>
                      {xp}
                      {xpNext > 0 ? ` / ${xpNext}` : ""}
                    </span>
                  </div>
                  <div className="xp-meter-track">
                    <span style={{ width: `${xpPct}%` }} />
                  </div>
                </div>
                {c.id === selectedId && selected && (
                  <div className="char-sheet">
                    {confirmRemoveId === c.id ? (
                      <div className="party-confirm" onClick={(e) => e.stopPropagation()}>
                        <span>Remove {c.name}?</span>
                        <button
                          type="button"
                          className="btn danger"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              await api.deleteCharacter(c.id);
                              setConfirmRemoveId(null);
                              setSelectedId(null);
                              setEditing(false);
                              await refresh();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : String(err));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Remove
                        </button>
                        <button type="button" className="btn ghost" onClick={() => setConfirmRemoveId(null)}>
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div className="party-actions">
                        <button
                          className="btn"
                          onClick={(e) => {
                            e.stopPropagation();
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
                          {editing ? "Cancel" : "Edit"}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBagFor(selected.id);
                          }}
                        >
                          Bag
                        </button>
                        <button
                          className="btn ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmRemoveId(c.id);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div className="party-facts" onClick={(e) => e.stopPropagation()}>
                      {selected.ac_unarmored != null && <span>Unarmored {selected.ac_unarmored}</span>}
                      {selected.hands_label && <span>{selected.hands_label}</span>}
                      {selected.carry_label && <span>{selected.carry_label}</span>}
                      {selected.size && <span>{selected.size}</span>}
                    </div>
                    {editing && (
                      <div className="edit-form" onClick={(e) => e.stopPropagation()}>
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
                    Size
                    <select
                      value={String(editDraft.size ?? selected?.size ?? "Medium")}
                      onChange={(e) => setEditDraft((d) => ({ ...d, size: e.target.value }))}
                    >
                      {CREATURE_SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
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
                  <button
                    className="btn primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      void saveEdits();
                    }}
                    disabled={busy}
                  >
                    Save changes
                  </button>
                </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
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
            <ResolveCard
              result={result}
              characters={characters}
              scene={scene}
              npcs={npcs}
              encounter={encounter}
              monsters={monsters}
              apiBase={apiBase}
            >
              {(result.check_type === "attack" || result.check_type === "save" || mapRuling?.heal) && (
                <HitEntry
                  result={result}
                  creatures={mapRuling?.blocked ? [] : mapRuling?.creatures || []}
                  heal={Boolean(mapRuling?.heal)}
                  busy={busy}
                  onApply={(creature, amount) => void applyCreature(creature, amount)}
                  onMiss={missCreature}
                />
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
            </ResolveCard>
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
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === "pictures"}
              className={`rail-tab ${rightTab === "pictures" ? "active" : ""}`}
              onClick={() => setRightTab("pictures")}
            >
              Pictures
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
                              {damageShown[e.id] ? <span className="hp-loss"> −{damageShown[e.id]}</span> : null}
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
                              {damageShown[e.id] ? <span className="hp-loss"> −{damageShown[e.id]}</span> : null}
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

          {rightTab === "pictures" && (
            <PicturesPanel
              characters={characters}
              monsters={monsters}
              npcs={npcs}
              onError={(msg) => setError(msg)}
              onRefresh={async () => {
                const [chars, mons, npcList] = await Promise.all([
                  api.listCharacters(),
                  api.listMonsters(),
                  api.listNpcs(),
                ]);
                setCharacters(chars);
                setMonsters(mons);
                setNpcs(npcList);
              }}
            />
          )}
        </aside>
      </main>
      )}

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
      {bagFor && characters.find((c) => c.id === bagFor) && (
        <InventoryModal
          character={characters.find((c) => c.id === bagFor)!}
          onClose={() => setBagFor(null)}
          onUpdated={(next) =>
            setCharacters((prev) => prev.map((ch) => (ch.id === next.id ? next : ch)))
          }
        />
      )}
    </div>
  );
}
