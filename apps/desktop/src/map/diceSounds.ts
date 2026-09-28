import { sfxVolume } from "./attackSounds";

const HIT_FILES = ["dice-hit1.mp3", "dice-hit2.mp3", "dice-hit3.mp3", "dice-hit4.mp3"] as const;

let active: HTMLAudioElement[] = [];
let hitTimer: number | null = null;

function sfxUrl(file: string): string {
  return `${import.meta.env.BASE_URL}audio/sfx/${file}`;
}

function playClip(file: string, volumeScale = 1): HTMLAudioElement | null {
  const volume = sfxVolume() * volumeScale;
  if (volume <= 0) return null;
  const audio = new Audio(sfxUrl(file));
  audio.volume = Math.max(0, Math.min(1, volume));
  active.push(audio);
  const drop = () => {
    active = active.filter((row) => row !== audio);
  };
  audio.addEventListener("ended", drop);
  audio.addEventListener("error", drop);
  void audio.play().catch(() => drop());
  return audio;
}

function clearHitTimer() {
  if (hitTimer != null) {
    window.clearInterval(hitTimer);
    hitTimer = null;
  }
}

export function stopDiceSounds(fadeMs = 180): void {
  clearHitTimer();
  const clips = active.splice(0);
  for (const audio of clips) {
    if (fadeMs <= 0) {
      audio.pause();
      continue;
    }
    const start = audio.volume;
    const begun = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - begun) / fadeMs);
      audio.volume = Math.max(0, start * (1 - t));
      if (t >= 1) {
        audio.pause();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/** Throw rattle + bouncing clacks while physics dice are in the air. */
export function startDiceRollSound(dieCount = 1): void {
  stopDiceSounds(0);
  playClip("dice-roll.mp3", 0.95);
  const bursts = Math.max(2, Math.min(6, dieCount + 1));
  let fired = 0;
  hitTimer = window.setInterval(() => {
    if (fired >= bursts) {
      clearHitTimer();
      return;
    }
    const file = HIT_FILES[Math.floor(Math.random() * HIT_FILES.length)];
    playClip(file, 0.55 + Math.random() * 0.35);
    fired += 1;
  }, 220 + Math.floor(Math.random() * 120));
}

/** Soft table settle when the dice stop. */
export function playDiceSettleSound(): void {
  stopDiceSounds(120);
  window.setTimeout(() => {
    playClip("dice-settle.mp3", 0.9);
  }, 80);
}
