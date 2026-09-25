const SFX_KEY = "tablewhisper-sfx-volume";

let lastTravel = 0;

export function sfxVolume(): number {
  const saved = Number(localStorage.getItem(SFX_KEY));
  if (!Number.isFinite(saved)) return 0.7;
  return Math.max(0, Math.min(1, saved / 100));
}

const QUIET_ON_MISS = new Set(["heal.mp3", "dash.mp3", "dodge.mp3"]);

/** The fail clip for this action. Healing, Dash, and Dodge keep their own sound. */
export function missSound(
  hitFile: string,
  result: { check_type?: string; skill?: string | null; notes?: string | null; roll_line?: string | null },
): string {
  if (result.check_type === "skill" || result.check_type === "ability") {
    const blob = `${result.skill || ""} ${result.notes || ""} ${result.roll_line || ""}`.toLowerCase();
    if (/\bintimidat/.test(blob)) return "intimidate-miss.mp3";
    if (/\bseduc/.test(blob)) return "charm-miss.mp3";
    if (/persuasion|\bpersuad/.test(blob)) return "persuade-miss.mp3";
    if (/deception|\bdeceiv/.test(blob)) return "deceive-miss.mp3";
  }
  const file = hitFile || "";
  if (!file || QUIET_ON_MISS.has(file.toLowerCase())) return file;
  return file.replace(/\.mp3$/i, "-miss.mp3");
}

export function playAttackSound(travelId: number, file: string): void {
  if (!file || travelId === lastTravel) return;
  lastTravel = travelId;
  const volume = sfxVolume();
  if (volume <= 0) return;
  const src = `${import.meta.env.BASE_URL}audio/sfx/${file}`;
  const audio = new Audio(src);
  audio.volume = volume;
  void audio.play().catch(() => undefined);
}
