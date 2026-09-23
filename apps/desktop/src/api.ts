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
  size?: string;
  size_sq?: number;
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
  image_url?: string;
  xp?: number;
  milestones?: string[];
  xp_progress?: {
    xp: number;
    level_from_xp: number;
    xp_into_level: number;
    xp_to_next: number;
    xp_next_threshold: number;
    ready_to_level: boolean;
  };
}

export interface CharacterChange {
  label: string;
  from: string;
  to: string;
}

export interface CharacterPreview {
  replace_id: string;
  current_name: string;
  parsed_name: string;
  name_mismatch: boolean;
  changes: CharacterChange[];
}

export interface CheckParticipant {
  id?: string | null;
  label: string;
  role: string;
  kind?: string;
  image_url?: string | null;
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
    npc_id?: string | null;
    kind?: string;
    image_url?: string | null;
    virtual?: boolean;
  } | null;
  participants?: CheckParticipant[];
  target_ac?: number | null;
  to_hit_needed?: number | null;
  howto?: string | null;
  /** False when the action cannot be attempted (missing gear, etc.). */
  possible?: boolean;
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
  xp?: number;
  size?: string;
  size_sq?: number;
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
  cr?: string;
  xp?: number;
  size?: string;
  size_sq?: number;
  image_url?: string;
}

export interface NpcTemplate {
  id: string;
  name: string;
  ac: number;
  hp: number;
  cr?: string;
  xp?: number;
  size?: string;
  size_sq?: number;
  role?: string;
  attitude?: string;
  aliases?: string[];
  notes?: string;
  social?: Record<string, number | string | undefined>;
  image_url?: string;
}

export interface SceneNpc {
  id: string;
  label: string;
  npc_id: string;
  name: string;
  ac: number;
  max_hp: number;
  current_hp: number;
  attitude: string;
  cr?: string;
  xp?: number;
  size?: string;
  size_sq?: number;
  image_url?: string;
}

export interface XpAwardResult {
  ok: boolean;
  kind: string;
  total_xp: number;
  milestone_id: string;
  milestone_label: string;
  label?: string;
  cr?: string | null;
  awards: Array<{
    id: string;
    name?: string;
    xp_before: number;
    xp_after: number;
    xp_gained: number;
    leveled: boolean;
    duplicate?: boolean;
  }>;
  characters: Character[];
}

export interface BattleMap {
  id: string;
  session_id: string;
  name: string;
  background_path?: string | null;
  background_url?: string | null;
  fog_url?: string | null;
  width: number;
  height: number;
  grid_size_px: number;
  grid_offset_x: number;
  grid_offset_y: number;
  feet_per_square: number;
  show_grid_overlay: boolean;
  active: boolean;
  created_at: string;
}

export interface MapToken {
  id: string;
  map_id: string;
  kind: string;
  ref_id: string | null;
  label: string;
  x: number;
  y: number;
  rotation: number;
  size: string;
  size_sq: number;
  vision_ft: number;
  light_bright_ft: number;
  light_dim_ft: number;
  show_vision: boolean;
  image_url?: string | null;
  data?: Record<string, unknown>;
}

export interface MapWall {
  id: string;
  map_id: string;
  points: number[];
  door: boolean;
  door_open: boolean;
  block_movement: boolean;
  block_sight: boolean;
}

export interface MapLight {
  id: string;
  map_id: string;
  x: number;
  y: number;
  bright_ft: number;
  dim_ft: number;
}

export interface MapPortal {
  id: string;
  map_id: string;
  x: number;
  y: number;
  radius: number;
  target_map_id: string;
  target_x: number;
  target_y: number;
  label: string;
}

export interface MapState {
  map: BattleMap;
  tokens: MapToken[];
  walls: MapWall[];
  lights: MapLight[];
  portals: MapPortal[];
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
    return res.json() as Promise<{
      character: Character;
      diff?: Record<string, unknown>;
      changes?: CharacterChange[];
    }>;
  },
  previewCharacter: async (file: File, replaceId: string) => {
    const base = await apiBase();
    const form = new FormData();
    form.append("file", file);
    form.append("replace_id", replaceId);
    const res = await fetch(`${base}/characters/preview`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<CharacterPreview>;
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
  spawnEnemy: (
    monsterId: string,
    count = 1,
    label?: string,
    overrides?: { cr?: string; xp?: number; ac?: number; hp?: number }
  ) =>
    request<EncounterEnemy[]>("/encounter/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monster_id: monsterId,
        count,
        label: label || null,
        cr: overrides?.cr ?? null,
        xp: overrides?.xp ?? null,
        ac: overrides?.ac ?? null,
        hp: overrides?.hp ?? null,
      }),
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
  listNpcs: () => request<NpcTemplate[]>("/npcs"),
  listScene: () => request<SceneNpc[]>("/scene"),
  spawnNpc: (
    npcId: string,
    count = 1,
    label?: string,
    overrides?: { cr?: string; xp?: number; ac?: number; hp?: number }
  ) =>
    request<SceneNpc[]>("/scene/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        npc_id: npcId,
        count,
        label: label || null,
        cr: overrides?.cr ?? null,
        xp: overrides?.xp ?? null,
        ac: overrides?.ac ?? null,
        hp: overrides?.hp ?? null,
      }),
    }),
  clearScene: () => request<{ ok: boolean }>("/scene", { method: "DELETE" }),
  removeSceneNpc: (id: string) =>
    request<{ ok: boolean }>(`/scene/${id}`, { method: "DELETE" }),
  setSceneNpcHp: (id: string, currentHp: number) =>
    request<SceneNpc>(`/scene/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_hp: currentHp }),
    }),
  setSceneNpcAttitude: (id: string, attitude: string) =>
    request<SceneNpc>(`/scene/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attitude }),
    }),
  addCustomNpc: async (fields: {
    name: string;
    ac: number;
    hp: number;
    attitude?: string;
    role?: string;
    image?: File | null;
  }) => {
    const base = await apiBase();
    const form = new FormData();
    form.append("name", fields.name);
    form.append("ac", String(fields.ac));
    form.append("hp", String(fields.hp));
    form.append("attitude", fields.attitude || "indifferent");
    form.append("role", fields.role || "");
    if (fields.image) form.append("image", fields.image);
    const res = await fetch(`${base}/npcs/custom`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<NpcTemplate>;
  },
  uploadCharacterImage: async (charId: string, file: File) => {
    const base = await apiBase();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${base}/characters/${charId}/image`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<Character>;
  },
  uploadMonsterImage: async (monsterId: string, file: File) => {
    const base = await apiBase();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${base}/monsters/${monsterId}/image`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<MonsterTemplate>;
  },
  uploadNpcImage: async (npcId: string, file: File) => {
    const base = await apiBase();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${base}/npcs/${npcId}/image`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<NpcTemplate>;
  },
  awardXp: (body: {
    kind: "defeat" | "milestone";
    character_ids: string[];
    xp?: number;
    creature_id?: string;
    label?: string;
    cr?: string;
    milestone_id?: string;
    milestone_label?: string;
    note?: string;
  }) =>
    request<XpAwardResult>("/xp/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  listMaps: () => request<BattleMap[]>("/maps"),
  createMap: (name?: string) =>
    request<BattleMap>("/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "Map" }),
    }),
  getActiveMapState: () => request<MapState>("/maps/active"),
  getMapState: (id: string) => request<MapState>(`/maps/${id}`),
  activateMap: (id: string) =>
    request<MapState>(`/maps/${id}/activate`, { method: "POST" }),
  patchMap: (id: string, patch: Partial<BattleMap>) =>
    request<BattleMap>(`/maps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deleteMap: (id: string) =>
    request<{ ok: boolean }>(`/maps/${id}`, { method: "DELETE" }),
  uploadMapBackground: async (
    mapId: string,
    file: File,
    dims?: { width?: number; height?: number }
  ) => {
    const base = await apiBase();
    const form = new FormData();
    form.append("file", file);
    if (dims?.width != null) form.append("width", String(dims.width));
    if (dims?.height != null) form.append("height", String(dims.height));
    const res = await fetch(`${base}/maps/${mapId}/background`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<BattleMap>;
  },
  syncMapTokens: (mapId: string) =>
    request<MapToken[]>(`/maps/${mapId}/tokens/sync`, { method: "POST" }),
  addMapToken: (mapId: string, body: Partial<MapToken>) =>
    request<MapToken>(`/maps/${mapId}/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  patchMapToken: (tokenId: string, patch: Partial<MapToken>) =>
    request<MapToken>(`/maps/tokens/${tokenId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deleteMapToken: (tokenId: string) =>
    request<{ ok: boolean }>(`/maps/tokens/${tokenId}`, { method: "DELETE" }),
  addMapWall: (mapId: string, body: Partial<MapWall>) =>
    request<MapWall>(`/maps/${mapId}/walls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  patchMapWall: (wallId: string, patch: Partial<MapWall>) =>
    request<MapWall>(`/maps/walls/${wallId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deleteMapWall: (wallId: string) =>
    request<{ ok: boolean }>(`/maps/walls/${wallId}`, { method: "DELETE" }),
  addMapLight: (mapId: string, body: Partial<MapLight>) =>
    request<MapLight>(`/maps/${mapId}/lights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  patchMapLight: (lightId: string, patch: Partial<MapLight>) =>
    request<MapLight>(`/maps/lights/${lightId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deleteMapLight: (lightId: string) =>
    request<{ ok: boolean }>(`/maps/lights/${lightId}`, { method: "DELETE" }),
  uploadFog: async (mapId: string, blob: Blob) => {
    const base = await apiBase();
    const form = new FormData();
    form.append("file", blob, "fog.png");
    const res = await fetch(`${base}/maps/${mapId}/fog`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<BattleMap>;
  },
  resetFog: (mapId: string) =>
    request<BattleMap>(`/maps/${mapId}/fog/reset`, { method: "POST" }),
  addMapPortal: (mapId: string, body: Partial<MapPortal> & { target_map_id: string }) =>
    request<MapPortal>(`/maps/${mapId}/portals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  patchMapPortal: (portalId: string, patch: Partial<MapPortal>) =>
    request<MapPortal>(`/maps/portals/${portalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deleteMapPortal: (portalId: string) =>
    request<{ ok: boolean }>(`/maps/portals/${portalId}`, { method: "DELETE" }),
  traversePortal: (portalId: string, tokenIds: string[]) =>
    request<{ map: BattleMap; tokens: MapToken[] }>(`/maps/portals/${portalId}/traverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token_ids: tokenIds }),
    }),
};
