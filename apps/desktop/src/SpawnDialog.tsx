import { useEffect, useMemo, useState } from "react";
import { api, mediaUrlSync, type MonsterTemplate, type NpcTemplate } from "./api";
import { PortraitFileButton } from "./PortraitEditor";

const CR_OPTIONS = [
  "0", "1/8", "1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
];

const CR_TO_XP: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700,
  "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000,
  "17": 18000, "18": 20000, "19": 22000, "20": 25000,
};

const RACES = ["Human", "Elf", "Dwarf", "Halfling", "Gnome", "Half-orc", "Tiefling"];
const GENDERS = ["Woman", "Man", "Nonbinary"];
const ETHNICITIES = [
  "African",
  "East Asian",
  "European",
  "Indigenous American",
  "Latino",
  "Middle Eastern",
  "South Asian",
  "Pacific Islander",
];

type Tune = { cr: string; xp: number; ac: number; hp: number };

function tuneFrom(row: { cr?: string; xp?: number; ac: number; hp: number }): Tune {
  const cr = String(row.cr || "0");
  return { cr, xp: row.xp ?? CR_TO_XP[cr] ?? 10, ac: row.ac, hp: row.hp };
}

function creatureType(type?: string): string {
  return (type || "").split(",")[0].split("(")[0].trim();
}

export function SpawnDialog({
  kind,
  monsters,
  npcs,
  apiBase,
  onClose,
  onSpawned,
  onCatalogChange,
  onError,
}: {
  kind: "monster" | "npc";
  monsters: MonsterTemplate[];
  npcs: NpcTemplate[];
  apiBase: string;
  onClose: () => void;
  onSpawned: (kind: "monster" | "npc") => Promise<void>;
  onCatalogChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [race, setRace] = useState("");
  const [gender, setGender] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [monsterType, setMonsterType] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [name, setName] = useState("");
  const [tune, setTune] = useState<Tune>({ cr: "0", xp: 10, ac: 10, hp: 10 });
  const [busy, setBusy] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMonster, setCustomMonster] = useState({ name: "", ac: 13, hp: 15, image: null as File | null });
  const [customNpc, setCustomNpc] = useState({
    name: "",
    ac: 12,
    hp: 12,
    attitude: "indifferent",
    role: "",
    image: null as File | null,
  });

  const roles = useMemo(
    () => [...new Set(npcs.map((n) => n.role).filter(Boolean) as string[])].sort(),
    [npcs]
  );
  const types = useMemo(
    () => [...new Set(monsters.map((m) => creatureType(m.type)).filter(Boolean))].sort(),
    [monsters]
  );

  const shownMonsters = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monsters.filter((m) => {
      if (monsterType && creatureType(m.type).toLowerCase() !== monsterType.toLowerCase()) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.type || "").toLowerCase().includes(q) ||
        String(m.cr || "").toLowerCase().includes(q)
      );
    });
  }, [monsters, query, monsterType]);

  const shownNpcs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return npcs.filter((n) => {
      if (role && n.role !== role) return false;
      if (race && n.race !== race) return false;
      if (gender && n.gender !== gender) return false;
      if (ethnicity && !(race && race !== "Human")) {
        if (n.race !== "Human" || n.ethnicity !== ethnicity) return false;
      }
      if (!q) return true;
      return (
        n.name.toLowerCase().includes(q) ||
        (n.role || "").toLowerCase().includes(q) ||
        (n.race || "").toLowerCase().includes(q) ||
        (n.aliases || []).some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [npcs, query, role, race, gender, ethnicity]);

  const pickedMonster = shownMonsters.find((m) => m.id === pickedId) || shownMonsters[0] || null;
  const pickedNpc = shownNpcs.find((n) => n.id === pickedId) || shownNpcs[0] || null;
  const picked = kind === "monster" ? pickedMonster : pickedNpc;

  useEffect(() => {
    if (!picked) return;
    setTune(tuneFrom(picked));
    setName("");
  }, [picked?.id]);

  async function spawn() {
    if (!picked) return;
    const typed = name.trim();
    setBusy(true);
    try {
      const overrides = { cr: tune.cr, xp: tune.xp, ac: tune.ac, hp: tune.hp };
      if (kind === "monster") await api.spawnEnemy(picked.id, 1, typed || undefined, overrides);
      else await api.spawnNpc(picked.id, 1, typed || undefined, overrides);
      await onSpawned(kind);
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel spawn-panel"
        role="dialog"
        aria-modal="true"
        aria-label={kind === "monster" ? "Add foe" : "Add scene NPC"}
      >
        <div className="modal-header">
          <h2>{kind === "monster" ? "Add foe" : "Add NPC"}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="spawn-filters">
          <input
            className="btn spawn-filter"
            placeholder={kind === "monster" ? "Filter monsters…" : "Filter people…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {kind === "monster" ? (
            <select className="btn" value={monsterType} onChange={(e) => setMonsterType(e.target.value)}>
              <option value="">Any type</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <>
              <select className="btn" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">Any role</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select className="btn" value={race} onChange={(e) => setRace(e.target.value)}>
                <option value="">Any race</option>
                {RACES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select className="btn" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Any gender</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select className="btn" value={ethnicity} onChange={(e) => setEthnicity(e.target.value)}>
                <option value="">Any ethnicity</option>
                {ETHNICITIES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="portrait-grid">
          {kind === "monster"
            ? shownMonsters.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`portrait-card ${pickedMonster?.id === m.id ? "selected" : ""}`}
                  onClick={() => setPickedId(m.id)}
                >
                  {m.image_url && (
                    <img src={mediaUrlSync(m.image_url, apiBase)} alt="" />
                  )}
                  <strong>{m.name}</strong>
                  <span>
                    CR {m.cr || "?"} · AC {m.ac}
                  </span>
                </button>
              ))
            : shownNpcs.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`portrait-card ${pickedNpc?.id === n.id ? "selected" : ""}`}
                  onClick={() => setPickedId(n.id)}
                >
                  {n.image_url && (
                    <img key={n.id} src={mediaUrlSync(n.image_url, apiBase)} alt="" />
                  )}
                  <strong>{n.name}</strong>
                  <span>
                    {n.role || "NPC"} · {n.race || ""}
                  </span>
                </button>
              ))}
        </div>
        <div className="spawn-dock">
          <label className="spawn-name">
            Name
            <input
              value={name}
              placeholder={
                kind === "npc" || (kind === "monster" && pickedMonster?.personal_name)
                  ? "A name is chosen if you leave this blank"
                  : picked?.name || ""
              }
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="spawn-tune-grid">
            <label>
              CR
              <select
                className="btn"
                value={tune.cr}
                onChange={(e) => {
                  const cr = e.target.value;
                  setTune((t) => ({ ...t, cr, xp: CR_TO_XP[cr] ?? t.xp }));
                }}
              >
                {!CR_OPTIONS.includes(tune.cr) && <option value={tune.cr}>{tune.cr}</option>}
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
                value={tune.xp}
                onChange={(e) => setTune((t) => ({ ...t, xp: Number(e.target.value) || 0 }))}
              />
            </label>
            <label>
              AC
              <input
                type="number"
                value={tune.ac}
                onChange={(e) => setTune((t) => ({ ...t, ac: Number(e.target.value) || 0 }))}
              />
            </label>
            <label>
              HP
              <input
                type="number"
                min={1}
                value={tune.hp}
                onChange={(e) =>
                  setTune((t) => ({ ...t, hp: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
            </label>
          </div>
          <button className="btn primary" disabled={busy || !picked} onClick={() => void spawn()}>
            Spawn
          </button>
          <button type="button" className="btn ghost" onClick={() => setCustomOpen((v) => !v)}>
            {customOpen ? "Hide custom" : kind === "monster" ? "Custom monster…" : "Custom NPC…"}
          </button>
          {customOpen && kind === "monster" && (
            <div className="edit-form">
              <label>
                Name
                <input
                  value={customMonster.name}
                  onChange={(e) => setCustomMonster((c) => ({ ...c, name: e.target.value }))}
                />
              </label>
              <label>
                AC
                <input
                  type="number"
                  value={customMonster.ac}
                  onChange={(e) => setCustomMonster((c) => ({ ...c, ac: Number(e.target.value) }))}
                />
              </label>
              <label>
                HP
                <input
                  type="number"
                  value={customMonster.hp}
                  onChange={(e) => setCustomMonster((c) => ({ ...c, hp: Number(e.target.value) }))}
                />
              </label>
              <label className="btn file-btn">
                {customMonster.image ? "Portrait ready" : "Portrait image"}
                <PortraitFileButton onFile={(file) => setCustomMonster((c) => ({ ...c, image: file }))} />
              </label>
              <button
                className="btn"
                disabled={busy || !customMonster.name.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.addCustomMonster({
                      name: customMonster.name.trim(),
                      ac: customMonster.ac,
                      hp: customMonster.hp,
                      image: customMonster.image,
                    });
                    await onCatalogChange();
                    onClose();
                  } catch (e) {
                    onError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save to bestiary
              </button>
            </div>
          )}
          {customOpen && kind === "npc" && (
            <div className="edit-form">
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
                />
              </label>
              <label>
                Attitude
                <select
                  className="btn"
                  value={customNpc.attitude}
                  onChange={(e) => setCustomNpc((c) => ({ ...c, attitude: e.target.value }))}
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
                  onChange={(e) => setCustomNpc((c) => ({ ...c, ac: Number(e.target.value) }))}
                />
              </label>
              <label>
                HP
                <input
                  type="number"
                  value={customNpc.hp}
                  onChange={(e) => setCustomNpc((c) => ({ ...c, hp: Number(e.target.value) }))}
                />
              </label>
              <label className="btn file-btn">
                {customNpc.image ? "Portrait ready" : "Portrait image"}
                <PortraitFileButton onFile={(file) => setCustomNpc((c) => ({ ...c, image: file }))} />
              </label>
              <button
                className="btn"
                disabled={busy || !customNpc.name.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.addCustomNpc({
                      name: customNpc.name.trim(),
                      ac: customNpc.ac,
                      hp: customNpc.hp,
                      attitude: customNpc.attitude,
                      role: customNpc.role.trim(),
                      image: customNpc.image,
                    });
                    await onCatalogChange();
                    onClose();
                  } catch (e) {
                    onError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save to scene catalog
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
