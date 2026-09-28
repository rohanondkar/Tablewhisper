import { sfxVolume } from "./attackSounds";

const HIT_FILES = ["dice-hit1.mp3", "dice-hit2.mp3", "dice-hit3.mp3", "dice-hit4.mp3"] as const;
const MAX_HIT_VOICES = 3;

type ActiveClip = {
  audio: HTMLAudioElement;
  kind: "bed" | "hit" | "settle";
};

let active: ActiveClip[] = [];
let bounceTimer: number | null = null;
let bedFadeTimer: number | null = null;
let settleArmed = false;
let settlePlayed = false;
let bounceGeneration = 0;

function sfxUrl(file: string): string {
  return `${import.meta.env.BASE_URL}audio/sfx/${file}`;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clearBounceTimer() {
  if (bounceTimer != null) {
    window.clearTimeout(bounceTimer);
    bounceTimer = null;
  }
}

function clearBedFadeTimer() {
  if (bedFadeTimer != null) {
    window.clearTimeout(bedFadeTimer);
    bedFadeTimer = null;
  }
}

function dropClip(clip: ActiveClip) {
  active = active.filter((row) => row !== clip);
}

function fadeClip(clip: ActiveClip, fadeMs: number) {
  const audio = clip.audio;
  if (fadeMs <= 0) {
    audio.pause();
    dropClip(clip);
    return;
  }
  const start = audio.volume;
  const begun = performance.now();
  const tick = () => {
    if (!active.includes(clip)) return;
    const t = Math.min(1, (performance.now() - begun) / fadeMs);
    audio.volume = Math.max(0, start * (1 - t));
    if (t >= 1) {
      audio.pause();
      dropClip(clip);
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function fadeKind(kind: ActiveClip["kind"], fadeMs: number) {
  for (const clip of active.filter((row) => row.kind === kind)) {
    fadeClip(clip, fadeMs);
  }
}

function enforceHitVoiceLimit() {
  const hits = active.filter((row) => row.kind === "hit");
  while (hits.length > MAX_HIT_VOICES) {
    const oldest = hits.shift();
    if (!oldest) break;
    oldest.audio.pause();
    dropClip(oldest);
  }
}

function playClip(
  file: string,
  volumeScale: number,
  kind: ActiveClip["kind"],
  playbackRate = 1,
): HTMLAudioElement | null {
  const volume = sfxVolume() * volumeScale;
  if (volume <= 0) return null;
  const audio = new Audio(sfxUrl(file));
  audio.volume = Math.max(0, Math.min(1, volume));
  try {
    audio.playbackRate = Math.max(0.85, Math.min(1.15, playbackRate));
  } catch {
    /* some engines reject mid-load rate */
  }
  const clip: ActiveClip = { audio, kind };
  active.push(clip);
  if (kind === "hit") enforceHitVoiceLimit();
  const drop = () => dropClip(clip);
  audio.addEventListener("ended", drop);
  audio.addEventListener("error", drop);
  void audio.play().catch(() => drop());
  return audio;
}

function playHit(volumeScale: number) {
  const file = HIT_FILES[Math.floor(Math.random() * HIT_FILES.length)];
  playClip(file, volumeScale, "hit", rand(0.92, 1.08));
}

function scheduleBounceEnvelope(dieCount: number, generation: number) {
  clearBounceTimer();
  const count = Math.max(1, dieCount);
  // More dice → more contacts, still capped so it doesn't smear.
  const totalHits = Math.max(4, Math.min(14, 3 + count * 2));
  let fired = 0;
  const started = performance.now();
  // Envelope length scales lightly with die count (typical tray settle ~1–2s).
  const spanMs = 900 + Math.min(900, count * 120);

  const step = () => {
    if (generation !== bounceGeneration || settlePlayed) return;
    if (fired >= totalHits) {
      bounceTimer = null;
      return;
    }
    const progress = Math.min(1, (performance.now() - started) / spanMs);
    // Dense + loud early → sparse + soft late (rolling out on the table).
    const density = 1 - progress * 0.72;
    const delay = rand(55, 95) / density + rand(0, 40);
    const volume = (0.72 - progress * 0.45) * (0.85 + Math.min(0.25, count * 0.04));
    playHit(Math.max(0.18, volume));
    fired += 1;
    bounceTimer = window.setTimeout(step, delay);
  };

  // First table contact shortly after the throw leaves the hand.
  bounceTimer = window.setTimeout(step, rand(90, 160));
}

function fadeThrowBed(delayMs: number, fadeMs: number) {
  clearBedFadeTimer();
  bedFadeTimer = window.setTimeout(() => {
    bedFadeTimer = null;
    fadeKind("bed", fadeMs);
  }, delayMs);
}

export function stopDiceSounds(fadeMs = 180): void {
  bounceGeneration += 1;
  clearBounceTimer();
  clearBedFadeTimer();
  settleArmed = false;
  settlePlayed = false;
  const clips = active.slice();
  active = [];
  for (const clip of clips) {
    if (fadeMs <= 0) {
      clip.audio.pause();
      continue;
    }
    // Re-attach briefly so fadeClip can track; then fade.
    active.push(clip);
    fadeClip(clip, fadeMs);
  }
}

/** Throw bed + decaying table-bounce hits while physics dice are moving. */
export function startDiceRollSound(dieCount = 1): void {
  stopDiceSounds(0);
  settleArmed = true;
  settlePlayed = false;
  const generation = bounceGeneration;
  playClip("dice-roll.mp3", 0.72, "bed", rand(0.97, 1.03));
  // Hand throw fades as ground bounces take over.
  fadeThrowBed(rand(800, 1200), 350);
  scheduleBounceEnvelope(dieCount, generation);
}

/** Soft land click when an individual die finishes moving. */
export function noteDieLanded(): void {
  if (!settleArmed || settlePlayed) return;
  // Soften bounce cadence as dice start parking.
  playHit(rand(0.28, 0.42));
}

/**
 * Crossfade into the table settle cue when the whole roll stops.
 * Idempotent for a single roll.
 */
export function playDiceSettleSound(): void {
  if (settlePlayed) return;
  settlePlayed = true;
  settleArmed = false;
  bounceGeneration += 1;
  clearBounceTimer();
  clearBedFadeTimer();
  // Fade bounce/bed under the settle so it stitches instead of cutting.
  fadeKind("bed", 200);
  fadeKind("hit", 180);
  window.setTimeout(() => {
    playClip("dice-settle.mp3", 0.88, "settle", rand(0.96, 1.04));
  }, 55);
}
