const SFX_KEY = "tablewhisper-sfx-volume";

let lastTravel = 0;

export function sfxVolume(): number {
  const saved = Number(localStorage.getItem(SFX_KEY));
  if (!Number.isFinite(saved)) return 0.7;
  return Math.max(0, Math.min(1, saved / 100));
}

export function playAttackSound(travelId: number, file: string): void {
  if (!file || travelId === lastTravel) return;
  lastTravel = travelId;
  const volume = sfxVolume();
  if (volume <= 0) return;
  const audio = new Audio(`${import.meta.env.BASE_URL}audio/sfx/${file}`);
  audio.volume = volume;
  void audio.play().catch(() => undefined);
}
