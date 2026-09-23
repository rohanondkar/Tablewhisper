import { useMemo, useState } from "react";
import { api, mediaUrlSync, type Character, type MonsterTemplate, type NpcTemplate } from "../api";

const API_BASE = "http://127.0.0.1:8766";

type Props = {
  characters: Character[];
  monsters: MonsterTemplate[];
  npcs: NpcTemplate[];
  onRefresh: () => Promise<void> | void;
  onError: (msg: string) => void;
};

export default function PicturesPanel({
  characters,
  monsters,
  npcs,
  onRefresh,
  onError,
}: Props) {
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const q = filter.trim().toLowerCase();

  const charRows = useMemo(
    () => characters.filter((c) => !q || c.name.toLowerCase().includes(q)),
    [characters, q]
  );
  const monRows = useMemo(
    () => monsters.filter((m) => !q || m.name.toLowerCase().includes(q)).slice(0, 120),
    [monsters, q]
  );
  const npcRows = useMemo(
    () => npcs.filter((n) => !q || n.name.toLowerCase().includes(q)),
    [npcs, q]
  );

  async function upload(
    kind: "character" | "monster" | "npc",
    id: string,
    file: File
  ) {
    setBusy(true);
    try {
      if (kind === "character") await api.uploadCharacterImage(id, file);
      else if (kind === "monster") await api.uploadMonsterImage(id, file);
      else await api.uploadNpcImage(id, file);
      await onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rail-body pictures-panel" role="tabpanel">
      <p className="section-note">
        Token art for party, NPCs, and monsters. Used on the Map and in the encounter rail.
      </p>
      <input
        className="spawn-filter"
        placeholder="Search…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        disabled={busy}
      />

      <h3 className="pictures-heading">Characters</h3>
      <div className="pictures-grid">
        {charRows.map((c) => (
          <PictureCard
            key={c.id}
            name={c.name}
            sub={c.size || c.species}
            imageUrl={c.image_url}
            disabled={busy}
            onFile={(f) => void upload("character", c.id, f)}
          />
        ))}
        {charRows.length === 0 && <p className="muted small">No characters uploaded.</p>}
      </div>

      <h3 className="pictures-heading">NPCs</h3>
      <div className="pictures-grid">
        {npcRows.map((n) => (
          <PictureCard
            key={n.id}
            name={n.name}
            sub={n.size || n.role}
            imageUrl={n.image_url}
            disabled={busy}
            onFile={(f) => void upload("npc", n.id, f)}
          />
        ))}
      </div>

      <h3 className="pictures-heading">Monsters</h3>
      <div className="pictures-grid">
        {monRows.map((m) => (
          <PictureCard
            key={m.id}
            name={m.name}
            sub={m.size || (m.cr != null ? `CR ${m.cr}` : "")}
            imageUrl={m.image_url}
            disabled={busy}
            onFile={(f) => void upload("monster", m.id, f)}
          />
        ))}
      </div>
    </div>
  );
}

function PictureCard({
  name,
  sub,
  imageUrl,
  disabled,
  onFile,
}: {
  name: string;
  sub?: string;
  imageUrl?: string | null;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const src = imageUrl ? mediaUrlSync(imageUrl, API_BASE) : "";
  return (
    <div className="picture-card">
      <div className="picture-thumb">
        {src ? <img src={src} alt={name} /> : <span className="picture-placeholder">?</span>}
      </div>
      <div className="picture-meta">
        <strong>{name}</strong>
        {sub && <span className="muted small">{sub}</span>}
        <label className="btn ghost picture-upload-btn">
          {src ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
