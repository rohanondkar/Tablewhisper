import { useMemo, useState, type ReactNode } from "react";
import {
  mediaUrlSync,
  type Character,
  type CheckParticipant,
  type CheckResult,
  type EncounterEnemy,
  type MonsterTemplate,
  type NpcTemplate,
  type SceneNpc,
} from "../api";

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

function roleLabel(role: string): string {
  if (role === "rolling") return "Rolling";
  if (role === "target") return "Target";
  return "Subject";
}

function catalogPortrait(
  person: CheckParticipant & { templateId?: string | null },
  characters: Character[],
  scene: SceneNpc[],
  npcs: NpcTemplate[],
  encounter: EncounterEnemy[],
  monsters: MonsterTemplate[]
): string | null {
  if (person.image_url) return person.image_url;
  const name = person.label.toLowerCase();
  const ids = [person.id, person.templateId].filter((id): id is string => Boolean(id));
  const hasId = (id: string | null | undefined) => Boolean(id && ids.includes(id));
  return (
    characters.find((c) => hasId(c.id) || c.name.toLowerCase() === name)?.image_url ||
    scene.find(
      (s) => hasId(s.id) || hasId(s.npc_id) || s.label.toLowerCase() === name || s.name.toLowerCase() === name
    )?.image_url ||
    npcs.find((n) => hasId(n.id) || n.name.toLowerCase() === name)?.image_url ||
    encounter.find((e) => hasId(e.id) || hasId(e.monster_id) || e.label.toLowerCase() === name)?.image_url ||
    monsters.find((m) => hasId(m.id) || m.name.toLowerCase() === name)?.image_url ||
    null
  );
}

function InvolvedFace({ label, imageUrl, apiBase }: { label: string; imageUrl?: string | null; apiBase: string }) {
  const [broken, setBroken] = useState(false);
  const src = imageUrl && !broken ? mediaUrlSync(imageUrl, apiBase) : "";
  if (!src) return <div className="avatar initials involved-face">{initialsFor(label)}</div>;
  return <img className="involved-face" src={src} alt={label} onError={() => setBroken(true)} />;
}

export default function ResolveCard({
  result,
  characters,
  scene,
  npcs,
  encounter,
  monsters,
  apiBase,
  children,
}: {
  result: CheckResult;
  characters: Character[];
  scene: SceneNpc[];
  npcs: NpcTemplate[];
  encounter: EncounterEnemy[];
  monsters: MonsterTemplate[];
  apiBase: string;
  children?: ReactNode;
}) {
  const involved = useMemo(() => {
    const raw: Array<CheckParticipant & { templateId?: string | null }> =
      result.participants && result.participants.length > 0
        ? result.participants
        : [
            ...(result.character
              ? [
                  {
                    id: result.character_id,
                    label: result.character,
                    role: "rolling",
                    kind: "character",
                    image_url: null,
                  },
                ]
              : []),
            ...(result.target
              ? [
                  {
                    id: result.target.id,
                    label: result.target.label,
                    role: result.check_type === "attack" ? "target" : "subject",
                    kind: result.target.kind,
                    image_url: result.target.image_url,
                    templateId: result.target.npc_id || result.target.monster_id,
                  },
                ]
              : []),
          ];
    return raw.map((person) => ({
      ...person,
      image_url: catalogPortrait(person, characters, scene, npcs, encounter, monsters),
    }));
  }, [result, characters, scene, npcs, encounter, monsters]);
  const impossible = result.check_type === "impossible" || result.possible === false;

  return (
    <div className={impossible ? "result-card result-card--impossible" : "result-card"}>
      <div className="muted">
        {result.source} · confidence {Math.round(result.confidence * 100)}%
      </div>
      {impossible && <div className="impossible-banner">Not possible</div>}
      <div className="roll-line">{result.roll_line}</div>
      {result.factors && result.factors.length > 0 && (
        <ul className="factor-list">
          {result.factors.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      )}
      {involved.length > 0 && (
        <div className="involved-row">
          {involved.map((person) => (
            <div className="involved-card" key={`${person.kind || "p"}-${person.id || person.label}`}>
              <InvolvedFace label={person.label} imageUrl={person.image_url} apiBase={apiBase} />
              <div>
                <strong>
                  {roleLabel(person.role)}: {person.label}
                </strong>
                {person.role !== "rolling" && result.target?.label === person.label && (
                  <div className="muted" style={{ fontSize: "0.9rem" }}>
                    {result.check_type === "attack" ? (
                      <>
                        AC {result.target.ac} · HP {result.target.current_hp}/{result.target.max_hp}
                        {result.to_hit_needed != null ? ` · need ${result.to_hit_needed}+ on d20` : ""}
                      </>
                    ) : (
                      <>
                        {result.suggested_dc != null
                          ? `DC ${result.suggested_dc}${result.dc_label ? ` (${result.dc_label})` : ""}`
                          : "No fixed DC"}
                        {result.target.current_hp != null
                          ? ` · HP ${result.target.current_hp}/${result.target.max_hp}`
                          : ""}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="result-grid">
        <div>
          <span>Character</span>
          <div>
            {involved
              .filter((person) => person.role === "rolling")
              .map((person) => person.label)
              .join(", ") || result.character || "—"}
          </div>
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
            {result.modifier != null ? ` ${result.modifier >= 0 ? "+" : ""}${result.modifier}` : ""}
            {result.extra_dice ? ` ${result.extra_dice}` : ""}
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
              <div>{result.to_hit_needed != null ? `${result.to_hit_needed}+` : "—"}</div>
            </div>
            <div>
              <span>Damage if hit</span>
              <div>{result.damage || "—"}</div>
            </div>
            <div>
              <span>Target HP</span>
              <div>{result.target ? `${result.target.current_hp}/${result.target.max_hp}` : "—"}</div>
            </div>
          </>
        ) : impossible ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <span>Ruling</span>
            <div>No roll — action cannot be attempted as stated</div>
          </div>
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
      {children}
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
    </div>
  );
}
