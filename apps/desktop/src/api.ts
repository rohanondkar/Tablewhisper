export type AbilityId =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export interface SkillEntry {
  name: string;
  ability: AbilityId;
  modifier: number;
  proficient: boolean;
  expertise: boolean;
}

export interface Character {
  id: string;
  name: string;
  player_name: string;
  class_level: string;
  level: number;
  species: string;
  background: string;
  proficiency_bonus: number;
  abilities: Record<AbilityId, { score: number; modifier: number }>;
  saves: Record<AbilityId, { modifier: number; proficient: boolean }>;
  skills: Record<string, SkillEntry>;
  ac: number;
  initiative: number;
  max_hp: number;
  current_hp: number | null;
  temp_hp: number | null;
  speed: string;
  passive_perception: number;
  attacks: Array<{ name: string; attack_bonus: string; damage: string; notes: string }>;
  features: string;
  proficiencies: string;
  source_pdf: string | null;
  pdf_hash: string | null;
  updated_at: string;
}

export interface CheckResult {
  character: string | null;
  character_id: string | null;
  check_type: string;
  ability: AbilityId | null;
  skill: string | null;
  dice: string;
  modifier: number | null;
  suggested_dc: number | null;
  dc_label: string | null;
  notes: string;
  roll_line: string;
  confidence: number;
  source: "rules" | "ollama" | "hybrid";
  reasoning: string;
  weapon?: string | null;
  damage?: string | null;
  target?: {
    id: string | null;
    label: string;
    ac: number;
    current_hp: number;
    max_hp: number;
    monster_id: string;
    virtual?: boolean;
  } | null;
  target_ac?: number | null;
  to_hit_needed?: number | null;
  howto?: string | null;
}

export interface SessionInfo {
  id: string;
  name: string;
  created_at: string;
  active: boolean;
  event_count: number;
  enemy_count: number;
}

export interface MonsterTemplate {
  id: string;
  name: string;
  ac: number;
  hp: number;
  cr?: string;
  type?: string;
  notes?: string;
  aliases?: string[];
  image_url?: string;
}

export interface EncounterEnemy {
  id: string;
  label: string;
  monster_id: string;
  name: string;
  ac: number;
  max_hp: number;
  current_hp: number;
  image_url?: string;
}

export interface SessionEvent {
  id: string;
  session_id: string;
  created_at: string;
  query: string;
  result: CheckResult;
}

export interface RulesetSummary {
  id: string;
  name: string;
  version: string;
  system: string;
  description: string;
  active: boolean;
}

export interface StatusInfo {
  api: string;
  ollama: { available: boolean; model: string | null; models: string[] };
  whisper: { available: boolean; model: string };
  audio: {
    capturing: boolean;
    wasapi_capturing?: boolean;
    buffer_seconds: number;
    device: string | null;
    source?: "discord" | "wasapi" | "idle" | string;
    discord_fresh?: boolean;
  };
  active_ruleset: string;
  active_session_id: string | null;
}

const fallbackBase = "http://127.0.0.1:8766";

export async function mediaUrl(path: string | undefined | null): Promise<string> {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = await apiBase();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function mediaUrlSync(path: string | undefined | null, apiBaseStr: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${apiBaseStr}${path.startsWith("/") ? path : `/${path}`}`;
}

async function apiBase(): Promise<string> {
  if (window.dmDesktop?.getApiBase) {
    try {
      return await window.dmDesktop.getApiBase();
    } catch {
      return fallbackBase;
    }
  }
  return fallbackBase;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await apiBase();
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => request<StatusInfo>("/status"),
  listCharacters: () => request<Character[]>("/characters"),
  getCharacter: (id: string) => request<Character>(`/characters/${id}`),
  deleteCharacter: (id: string) =>
    request<{ ok: boolean }>(`/characters/${id}`, { method: "DELETE" }),
  updateCharacter: (id: string, patch: Partial<Character>) =>
    request<Character>(`/characters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  uploadCharacter: async (file: File, replaceId?: string) => {
    const base = await apiBase();
    const form = new FormData();
    form.append("file", file);
    if (replaceId) form.append("replace_id", replaceId);
    const res = await fetch(`${base}/characters/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ character: Character; diff?: Record<string, unknown> }>;
  },
  query: (text: string, characterId?: string | null) =>
    request<CheckResult>("/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, character_id: characterId || null }),
    }),
  capture: () =>
    request<{ transcript: string; result: CheckResult }>("/voice/capture", {
      method: "POST",
    }),
  listRulesets: () => request<RulesetSummary[]>("/rulesets"),
  setRuleset: (id: string) =>
    request<{ ok: boolean; active: string }>(`/rulesets/${id}/activate`, { method: "POST" }),
  sessionEvents: () => request<SessionEvent[]>("/sessions/active/events"),
  listSessions: () => request<SessionInfo[]>("/sessions"),
  newSession: (name?: string) =>
    request<SessionInfo>("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || null }),
    }),
  activateSession: (id: string) =>
    request<SessionInfo>(`/sessions/${id}/activate`, { method: "POST" }),
  renameSession: (id: string, name: string) =>
    request<SessionInfo>(`/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  deleteSession: (id: string) =>
    request<{ ok: boolean }>(`/sessions/${id}`, { method: "DELETE" }),
  audioStart: () => request<{ ok: boolean }>("/voice/start", { method: "POST" }),
  audioStop: () => request<{ ok: boolean }>("/voice/stop", { method: "POST" }),
  shutdown: () =>
    request<{ ok: boolean }>("/shutdown", { method: "POST" }).catch(() => ({ ok: true })),
  settings: () => request<Record<string, unknown>>("/settings"),
  updateSettings: (patch: Record<string, unknown>) =>
    request<Record<string, unknown>>("/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  listMonsters: () => request<MonsterTemplate[]>("/monsters"),
  listEncounter: () => request<EncounterEnemy[]>("/encounter"),
  spawnEnemy: (monsterId: string, count = 1, label?: string) =>
    request<EncounterEnemy[]>("/encounter/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monster_id: monsterId, count, label: label || null }),
    }),
  clearEncounter: () => request<{ ok: boolean }>("/encounter", { method: "DELETE" }),
  removeEnemy: (id: string) =>
    request<{ ok: boolean }>(`/encounter/${id}`, { method: "DELETE" }),
  damageEnemy: (id: string, damage: number) =>
    request<EncounterEnemy>(`/encounter/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_hp: 0, damage }),
    }),
  setEnemyHp: (id: string, currentHp: number) =>
    request<EncounterEnemy>(`/encounter/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_hp: currentHp }),
    }),
  addCustomMonster: async (fields: {
    name: string;
    ac: number;
    hp: number;
    image?: File | null;
  }) => {
    const base = await apiBase();
    const form = new FormData();
    form.append("name", fields.name);
    form.append("ac", String(fields.ac));
    form.append("hp", String(fields.hp));
    if (fields.image) form.append("image", fields.image);
    const res = await fetch(`${base}/monsters/custom`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<MonsterTemplate>;
  },
};
