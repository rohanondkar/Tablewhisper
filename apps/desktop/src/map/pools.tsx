import { useEffect, useRef } from "react";
import { Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import type { MapPool, PoolKind } from "../api";

export const POOL_KINDS: PoolKind[] = ["water", "lava", "acid", "slime", "blood", "mana"];

const HEIGHT_FT: Record<string, number> = {
  Tiny: 2,
  Small: 3,
  Medium: 5,
  Large: 10,
  Huge: 15,
  Gargantuan: 20,
};

const PLACEHOLDER = document.createElement("canvas");

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function wrap(v: number, span: number): number {
  if (span <= 0) return 0;
  const m = v % span;
  return m < 0 ? m + span : m;
}

type Drift = { ox: number; oy: number; rad: number };

function driftOf(pool: MapPool, frame: number, pace: number): Drift {
  const rad = ((pool.current_deg || 0) * Math.PI) / 180;
  const speed = (0.35 + Math.min(4, pool.current_ft / 8)) * pace;
  return {
    rad,
    ox: Math.cos(rad) * frame * speed,
    oy: Math.sin(rad) * frame * speed,
  };
}

function stampMask(ctx: CanvasRenderingContext2D, mask: HTMLCanvasElement, w: number, h: number) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

function paintWater(ctx: CanvasRenderingContext2D, w: number, h: number, pool: MapPool, frame: number) {
  const d = driftOf(pool, frame, 1);
  ctx.fillStyle = "rgba(24, 104, 186, 0.5)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(8, 48, 110, 0.28)";
  for (let i = 0; i < 5; i += 1) {
    const x = wrap(i * 180 + d.ox * 0.6, w + 120) - 60;
    const y = wrap(i * 130 + d.oy * 0.4, h + 90) - 40;
    ctx.beginPath();
    ctx.ellipse(x, y, 70, 28, d.rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(186, 230, 255, 0.42)";
  ctx.lineWidth = 2;
  for (let band = 0; band < 7; band += 1) {
    ctx.beginPath();
    const base = wrap(band * (h / 6) + d.oy, h + 36) - 18;
    for (let x = 0; x <= w; x += 10) {
      const y = base + Math.sin((x + d.ox) * 0.035 + band) * (5 + (band % 3));
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(220, 245, 255, 0.55)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i += 1) {
    const life = (frame * 0.6 + i * 17) % 48;
    const x = wrap(i * 160 + d.ox, w);
    const y = wrap(i * 90 + d.oy * 0.5, h);
    ctx.globalAlpha = 1 - life / 48;
    ctx.beginPath();
    ctx.arc(x, y, 4 + life * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function rockChunk(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, seed: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const sides = 5 + Math.floor(hash(seed) * 3);
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    const r = size * (0.55 + hash(seed + i * 9) * 0.6);
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r * 0.78;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const tone = 22 + Math.floor(hash(seed + 4) * 28);
  ctx.fillStyle = `rgb(${tone + 16}, ${tone}, ${tone - 6})`;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * 0.14);
  ctx.strokeStyle = "rgba(255, 110, 20, 0.9)";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.25, 0);
  ctx.lineTo(size * 0.05, size * 0.2);
  ctx.lineTo(size * 0.28, -size * 0.08);
  ctx.strokeStyle = "rgba(255, 190, 50, 0.75)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function paintLava(ctx: CanvasRenderingContext2D, w: number, h: number, pool: MapPool, frame: number) {
  const d = driftOf(pool, frame, 0.45);
  const glow = 0.62 + 0.12 * Math.sin(frame * 0.07);
  ctx.fillStyle = `rgba(170, 36, 8, ${glow})`;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255, 170, 30, 0.55)";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  for (let band = 0; band < 5; band += 1) {
    ctx.beginPath();
    const base = wrap(band * (h / 4) + d.oy * 0.7, h + 40) - 20;
    for (let x = 0; x <= w; x += 14) {
      const y = base + Math.sin((x + d.ox) * 0.02 + band * 1.3) * 10;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255, 220, 80, 0.85)";
  for (let i = 0; i < 10; i += 1) {
    const rise = frame * (0.35 + hash(i) * 0.4);
    const x = wrap(hash(i + 2) * w + d.ox * 0.3, w);
    const y = wrap(h - rise + hash(i + 5) * h, h);
    const r = 1.2 + hash(i + 8) * 2.2;
    ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(frame * 0.1 + i));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 9; i += 1) {
    const size = 10 + hash(i + 3) * 16;
    const x = wrap(hash(i + 11) * (w + 80) + d.ox * 0.35, w + size * 3) - size;
    const y = wrap(hash(i + 17) * (h + 60) + d.oy * 0.35 + Math.sin(frame * 0.02 + i) * 5, h + size * 3) - size;
    rockChunk(ctx, x, y, size, frame * 0.008 * (i % 2 ? 1 : -1) + i, i * 13 + 4);
  }
}

function paintAcid(ctx: CanvasRenderingContext2D, w: number, h: number, pool: MapPool, frame: number) {
  const d = driftOf(pool, frame, 0.65);
  ctx.fillStyle = "rgba(132, 186, 28, 0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(210, 240, 70, 0.18)";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i += 1) {
    const rise = frame * (0.55 + hash(i) * 0.7);
    const r = 4 + hash(i + 3) * 11;
    const x = wrap(hash(i + 6) * w + d.ox * 0.45, w + 30) - 15;
    const y = wrap(h - rise + hash(i + 9) * h + d.oy * 0.2, h + r * 4) - r;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(230, 255, 140, 0.12)";
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(240, 255, 150, 0.75)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.3, Math.max(1.2, r * 0.22), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 210, 0.7)";
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255, 255, 180, 0.8)";
  for (let i = 0; i < 18; i += 1) {
    const rise = frame * (1.1 + hash(i + 20));
    const x = wrap(hash(i + 21) * w + d.ox * 0.2, w);
    const y = wrap(h - rise * 1.4 + hash(i + 22) * h, h);
    ctx.globalAlpha = hash(i + 23);
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

function paintSlime(ctx: CanvasRenderingContext2D, w: number, h: number, pool: MapPool, frame: number) {
  const d = driftOf(pool, frame, 0.22);
  ctx.fillStyle = "rgba(18, 92, 36, 0.68)";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i += 1) {
    const wobble = Math.sin(frame * 0.035 + i * 1.4) * 0.22;
    const x = wrap(hash(i + 2) * w + d.ox, w + 80) - 40;
    const y = wrap(hash(i + 8) * h + d.oy, h + 70) - 30;
    const rx = (26 + hash(i + 4) * 34) * (1 + wobble);
    const ry = (18 + hash(i + 5) * 26) * (1 - wobble * 0.6);
    ctx.fillStyle = i % 2 === 0 ? "rgba(70, 180, 60, 0.38)" : "rgba(8, 60, 22, 0.55)";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, d.rad + wobble, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.35, y + ry * 0.85, rx * 0.28, ry * 0.45, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(210, 255, 180, 0.35)";
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.25, y - ry * 0.28, rx * 0.28, ry * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clot(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, seed: number) {
  ctx.beginPath();
  const sides = 6;
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2;
    const r = size * (0.6 + hash(seed + i) * 0.5);
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r * 0.7;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(60, 4, 10, 0.72)";
  ctx.fill();
}

function paintBlood(ctx: CanvasRenderingContext2D, w: number, h: number, pool: MapPool, frame: number) {
  const d = driftOf(pool, frame, 0.32);
  ctx.fillStyle = "rgba(122, 10, 22, 0.7)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(190, 24, 36, 0.55)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i += 1) {
    const x = wrap(hash(i + 3) * w + d.ox, w + 40) - 20;
    const y = wrap(hash(i + 7) * h + d.oy, h + 30) - 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(d.rad) * 36, y + Math.sin(d.rad) * 18, x + Math.cos(d.rad) * 70, y + Math.sin(d.rad) * 28);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i += 1) {
    const size = 8 + hash(i + 12) * 14;
    const x = wrap(hash(i + 14) * w + d.ox * 0.4, w);
    const y = wrap(hash(i + 18) * h + d.oy * 0.4, h);
    clot(ctx, x, y, size, i * 5 + 2);
  }
  ctx.fillStyle = "rgba(90, 0, 12, 0.8)";
  for (let i = 0; i < 5; i += 1) {
    const fall = frame * (0.25 + hash(i) * 0.2);
    const x = wrap(hash(i + 30) * w, w);
    const y = wrap(hash(i + 31) * h + fall, h + 20);
    ctx.beginPath();
    ctx.ellipse(x, y, 3, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function spark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.28, -r * 0.28);
  ctx.lineTo(r, 0);
  ctx.lineTo(r * 0.28, r * 0.28);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.28, r * 0.28);
  ctx.lineTo(-r, 0);
  ctx.lineTo(-r * 0.28, -r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintMana(ctx: CanvasRenderingContext2D, w: number, h: number, pool: MapPool, frame: number) {
  const d = driftOf(pool, frame, 0.8);
  const pulse = 0.42 + 0.12 * Math.sin(frame * 0.06);
  ctx.fillStyle = `rgba(108, 36, 188, ${pulse})`;
  ctx.fillRect(0, 0, w, h);
  const colors = ["rgba(255, 255, 255, 0.95)", "rgba(120, 230, 255, 0.9)", "rgba(255, 120, 230, 0.9)"];
  for (let i = 0; i < 20; i += 1) {
    const wander = frame * (0.5 + hash(i) * 1.1);
    const x = wrap(hash(i + 2) * w + Math.cos(i + wander * 0.03) * 24 + d.ox * 0.5, w);
    const y = wrap(hash(i + 6) * h + Math.sin(i * 1.7 + wander * 0.04) * 18 + d.oy * 0.5, h);
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(frame * 0.12 + i));
    const r = (2 + hash(i + 9) * 4.5) * twinkle;
    spark(ctx, x, y, r, colors[i % 3]);
  }
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 4; i += 1) {
    const x = wrap(hash(i + 40) * w + d.ox * 0.2, w);
    const y = wrap(hash(i + 41) * h + d.oy * 0.2, h);
    const r = 16 + 8 * Math.sin(frame * 0.05 + i);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, Math.abs(r));
    grad.addColorStop(0, "rgba(210, 170, 255, 0.7)");
    grad.addColorStop(1, "rgba(210, 170, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, Math.abs(r), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintFrame(canvas: HTMLCanvasElement, mask: HTMLCanvasElement, pool: MapPool, frame: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (pool.kind === "lava") paintLava(ctx, w, h, pool, frame);
  else if (pool.kind === "acid") paintAcid(ctx, w, h, pool, frame);
  else if (pool.kind === "slime") paintSlime(ctx, w, h, pool, frame);
  else if (pool.kind === "blood") paintBlood(ctx, w, h, pool, frame);
  else if (pool.kind === "mana") paintMana(ctx, w, h, pool, frame);
  else paintWater(ctx, w, h, pool, frame);
  stampMask(ctx, mask, w, h);
}

export function poolNote(pool: MapPool, size: string, speedText: string): string {
  const height = HEIGHT_FT[size] ?? 5;
  const covered = pool.depth_ft >= height;
  const swim = /\bswim\b/i.test(speedText);
  const kind = pool.kind;
  const name = kind.charAt(0).toUpperCase() + kind.slice(1);
  const move = covered
    ? swim
      ? "Swimming. Its swim speed applies."
      : "Swimming. Each foot costs 1 extra foot."
    : "Wading. Each foot costs 1 extra foot.";
  const current = pool.current_ft > 0 ? ` The current pushes ${Math.round(pool.current_ft)} ft.` : "";
  const hazard = kind === "lava" || kind === "acid" || kind === "slime" ? ` ${name} is a hazard.` : "";
  return `${name}, ${pool.depth_ft} ft. ${move}${current}${hazard}`;
}

export function maskCovers(mask: HTMLCanvasElement, x: number, y: number, mapW: number, mapH: number): boolean {
  if (mapW <= 0 || mapH <= 0 || mask.width < 1) return false;
  const ctx = mask.getContext("2d");
  if (!ctx) return false;
  const px = Math.max(0, Math.min(mask.width - 1, Math.floor((x / mapW) * mask.width)));
  const py = Math.max(0, Math.min(mask.height - 1, Math.floor((y / mapH) * mask.height)));
  const pixel = ctx.getImageData(px, py, 1, 1).data;
  return pixel[3] > 40;
}

export function LiquidOverlay({
  pools,
  masks,
  width,
  height,
}: {
  pools: MapPool[];
  masks: Map<string, HTMLCanvasElement>;
  width: number;
  height: number;
}) {
  const layerRef = useRef<Konva.Layer>(null);
  const nodes = useRef<Record<string, Konva.Image | null>>({});
  const frames = useRef<Record<string, HTMLCanvasElement>>({});

  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const loop = () => {
      frame += 1;
      let drew = false;
      for (const pool of pools) {
        const mask = masks.get(pool.id);
        const node = nodes.current[pool.id];
        if (!mask || !node) continue;
        let canvas = frames.current[pool.id];
        if (!canvas) {
          canvas = document.createElement("canvas");
          frames.current[pool.id] = canvas;
        }
        if (canvas.width !== mask.width || canvas.height !== mask.height) {
          canvas.width = mask.width;
          canvas.height = mask.height;
        }
        paintFrame(canvas, mask, pool, frame);
        node.image(canvas);
        drew = true;
      }
      if (drew) layerRef.current?.getLayer()?.batchDraw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pools, masks, width, height]);

  return (
    <>
      {pools.map((pool) =>
        masks.get(pool.id) ? (
          <KonvaImage
            key={pool.id}
            ref={(node) => {
              nodes.current[pool.id] = node;
              layerRef.current = node?.getLayer() ?? null;
            }}
            image={PLACEHOLDER}
            x={0}
            y={0}
            width={width}
            height={height}
            listening={false}
          />
        ) : null
      )}
    </>
  );
}
