import type { CheckResult, MapToken } from "../api";

export type StoredEffect = {
  id: string;
  name: string;
  detail: string;
  from?: string;
  extra?: string;
};

export function readEffects(data?: Record<string, unknown> | null): StoredEffect[] {
  const raw = data?.effects;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as StoredEffect;
    if (!row.name) return [];
    return [row];
  });
}

export function upsertEffect(data: Record<string, unknown> | undefined, effect: StoredEffect): Record<string, unknown> {
  const from = effect.from || "";
  const kept = readEffects(data).filter((item) => !(item.name === effect.name && (item.from || "") === from));
  return { ...(data || {}), effects: [...kept, effect] };
}

export function dropEffect(data: Record<string, unknown> | undefined, id: string): Record<string, unknown> {
  return { ...(data || {}), effects: readEffects(data).filter((item) => item.id !== id) };
}

/** A later weapon hit from the same attacker picks up Hunter's Mark or Hex. */
export function attackWithRiders(result: CheckResult, actor: string, target: MapToken | null): CheckResult {
  if (result.check_type !== "attack" || !target) return result;
  const actorKey = actor.trim().toLowerCase();
  const extras = readEffects(target.data).filter(
    (item) => item.extra && (item.from || "").trim().toLowerCase() === actorKey,
  );
  if (!extras.length) return result;
  const dice = extras.map((item) => item.extra).join("+");
  const names = extras.map((item) => item.name).join(" and ");
  const line = `Also roll ${dice} from ${names} and add it to the damage.`;
  return {
    ...result,
    damage: result.damage ? `${result.damage}+${dice}` : dice,
    notes: result.notes ? `${result.notes} ${line}` : line,
    howto: result.howto ? `${result.howto}\n${line}` : line,
  };
}
