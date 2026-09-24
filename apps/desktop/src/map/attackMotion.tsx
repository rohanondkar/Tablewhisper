import { Shape } from "react-konva";

type Point = { x: number; y: number };

type Fan = {
  mid: number;
  half: number;
  reach: number;
  mouth: Point;
};

function along(from: Point, to: Point, t: number): Point {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function pointOn(origin: Point, angle: number, dist: number): Point {
  return { x: origin.x + Math.cos(angle) * dist, y: origin.y + Math.sin(angle) * dist };
}

function fanOf(from: Point, to: Point, spots: Point[], cell: number): Fan {
  const usable = spots.filter((spot) => Math.hypot(spot.x - from.x, spot.y - from.y) > 6);
  const samples = (usable.length ? usable : [to]).map((spot) => ({
    angle: Math.atan2(spot.y - from.y, spot.x - from.x),
    dist: Math.hypot(spot.x - from.x, spot.y - from.y),
  }));
  let sx = 0;
  let sy = 0;
  let reach = cell;
  for (const sample of samples) {
    sx += Math.cos(sample.angle);
    sy += Math.sin(sample.angle);
    reach = Math.max(reach, sample.dist);
  }
  const mid = Math.atan2(sy, sx);
  let half = 0.22;
  for (const sample of samples) {
    let delta = sample.angle - mid;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    half = Math.max(half, Math.abs(delta));
  }
  if (reach < cell * 0.45) {
    return { mid: -Math.PI / 2, half: Math.PI * 0.92, reach: cell * 1.25, mouth: from };
  }
  const mouthDist = Math.min(cell * 0.42, reach * 0.14);
  return {
    mid,
    half: Math.min(half + 0.12, 1.35),
    reach,
    mouth: pointOn(from, mid, mouthDist),
  };
}

function tongue(ctx: CanvasRenderingContext2D, origin: Point, angle: number, length: number, width: number, curl: number) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const px = -uy;
  const py = ux;
  const tip = {
    x: origin.x + ux * length + px * curl,
    y: origin.y + uy * length + py * curl - Math.min(22, length * 0.07),
  };
  const belly = 0.46;
  ctx.beginPath();
  ctx.moveTo(origin.x + px * width * 0.28, origin.y + py * width * 0.28);
  ctx.quadraticCurveTo(origin.x + ux * length * belly + px * width, origin.y + uy * length * belly + py * width, tip.x, tip.y);
  ctx.quadraticCurveTo(
    origin.x + ux * length * belly - px * width * 0.82,
    origin.y + uy * length * belly - py * width * 0.82,
    origin.x - px * width * 0.28,
    origin.y - py * width * 0.28
  );
  ctx.closePath();
  ctx.fill();
}

type Clock = { show: boolean; fly: number; boom: number };

function shotAims(from: Point, to: Point, centers: Point[], cell: number): Point[] {
  const aims = centers.filter((spot) => Math.hypot(spot.x - from.x, spot.y - from.y) > cell * 0.4);
  if (!aims.length) return [to];
  const mid = Math.atan2(to.y - from.y, to.x - from.x);
  const scored = aims.map((spot) => {
    let ang = Math.atan2(spot.y - from.y, spot.x - from.x) - mid;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    return { spot, ang, dist: Math.hypot(spot.x - from.x, spot.y - from.y) };
  });
  const half = scored.reduce((max, sample) => Math.max(max, Math.abs(sample.ang)), 0);
  if (half < 0.42 || scored.length === 1) {
    scored.sort((a, b) => b.dist - a.dist);
    return [scored[0].spot];
  }
  scored.sort((a, b) => a.ang - b.ang || a.dist - b.dist);
  const want = Math.min(20, scored.length);
  const picked: Point[] = [];
  for (let i = 0; i < want; i += 1) {
    const at = Math.round((i * (scored.length - 1)) / Math.max(1, want - 1));
    picked.push(scored[at].spot);
  }
  return picked;
}

function shotClock(progress: number, index: number, count: number, dist: number, cell: number): Clock {
  if (dist < cell * 0.35) return { show: true, fly: 1, boom: Math.min(1, progress) };
  const start = count <= 1 ? 0 : (index % 5) * 0.05;
  const end = Math.min(0.72, start + 0.46);
  if (progress < start) return { show: false, fly: 0, boom: 0 };
  if (progress < end) {
    const u = (progress - start) / (end - start);
    return { show: true, fly: 1 - (1 - u) ** 2, boom: 0 };
  }
  return { show: true, fly: 1, boom: Math.min(1, (progress - end) / Math.max(0.16, 1 - end)) };
}

function lob(from: Point, to: Point, t: number, lift: number): Point {
  const base = along(from, to, Math.min(1, Math.max(0, t)));
  return { x: base.x, y: base.y - Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) * lift };
}

function areaRadius(to: Point, centers: Point[], cell: number): number {
  let radius = cell * 0.72;
  for (const spot of centers) radius = Math.max(radius, Math.hypot(spot.x - to.x, spot.y - to.y) * 0.72);
  return Math.min(Math.max(radius, cell * 0.72), cell * 2.6);
}

function ribbon(
  ctx: CanvasRenderingContext2D,
  origin: Point,
  angle: number,
  length: number,
  width: number,
  waves: number,
  phase: number,
  amp: number
) {
  const steps = 22;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const wave = Math.sin(t * Math.PI * waves + phase) * amp * Math.sin(t * Math.PI);
    const at = pointOn(origin, angle, t * length);
    const x = at.x + Math.cos(angle + Math.PI / 2) * wave;
    const y = at.y + Math.sin(angle + Math.PI / 2) * wave;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function lump(seed: number): number {
  const raw = Math.sin(seed * 12.9898) * 43758.5453;
  return raw - Math.floor(raw);
}

function glob(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, body: string, deep: string, shine: string) {
  const blobs: Array<[number, number, number]> = [
    [0, 0.05, 1],
    [-0.4, 0.12, 0.62],
    [0.36, 0.2, 0.55],
    [0.08, 0.5, 0.42],
    [-0.16, -0.28, 0.4],
    [0.24, -0.18, 0.32],
  ];
  ctx.fillStyle = deep;
  for (const [ox, oy, scale] of blobs) {
    ctx.beginPath();
    ctx.ellipse(x + ox * radius, y + oy * radius, radius * scale * 1.08, radius * scale * 1.2, ox * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = body;
  for (const [ox, oy, scale] of blobs) {
    ctx.beginPath();
    ctx.ellipse(x + ox * radius * 0.82, y + oy * radius * 0.78, radius * scale * 0.72, radius * scale * 0.84, ox, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.ellipse(x - radius * 0.28, y - radius * 0.32, radius * 0.22, radius * 0.13, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(x + radius * 0.18, y + radius * 0.02, radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.12, y + radius * 0.7);
  ctx.quadraticCurveTo(x + radius * 0.05, y + radius * 1.15, x + radius * 0.16, y + radius * 1.55);
  ctx.quadraticCurveTo(x + radius * 0.28, y + radius * 1.15, x + radius * 0.18, y + radius * 0.62);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + radius * 0.16, y + radius * 1.62, radius * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function splash(ctx: CanvasRenderingContext2D, at: Point, cell: number, boom: number, body: string, deep: string, shine: string) {
  const fade = Math.max(0.2, 1 - boom * 0.55);
  ctx.globalAlpha = fade;
  ctx.fillStyle = deep;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y + cell * 0.08, cell * (0.34 + boom * 0.5), cell * (0.12 + boom * 0.1), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y + cell * 0.06, cell * (0.26 + boom * 0.42), cell * (0.08 + boom * 0.08), 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 7; i += 1) {
    const bubble = lump(i + 4);
    ctx.globalAlpha = fade * 0.7;
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.arc(at.x + (bubble - 0.5) * cell * 0.5, at.y + cell * 0.04 + (i % 3) * 2, 2 + bubble * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2 + lump(i) * 0.3;
    const fly = boom * cell * (0.18 + lump(i + 2) * 0.55);
    const fall = boom * boom * cell * (0.15 + lump(i + 8) * 0.55);
    const x = at.x + Math.cos(angle) * fly;
    const y = at.y + Math.sin(angle) * fly * 0.45 + fall;
    const drop = 2.2 + lump(i + 1) * 5;
    ctx.globalAlpha = fade;
    ctx.fillStyle = i % 3 === 0 ? shine : i % 3 === 1 ? body : deep;
    ctx.beginPath();
    ctx.ellipse(x, y, drop * 0.55, drop * (1.1 + lump(i) * 0.8), angle, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 5; i += 1) {
    const x = at.x + (i - 2) * cell * 0.12;
    const len = cell * (0.18 + lump(i + 6) * 0.35) * boom;
    ctx.globalAlpha = fade;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(x, at.y + cell * 0.12 + len, 2.4, len, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function jagged(a: Point, b: Point, seed: number, phase: number): Point[] {
  const pts: Point[] = [];
  const steps = 14;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const jag = i === 0 || i === steps ? 0 : Math.sin(seed * 0.013 + i * 2.6 + phase) * (12 + (i % 3) * 7);
    pts.push({ x: a.x + dx * t + nx * jag, y: a.y + dy * t + ny * jag });
  }
  return pts;
}

function strokeBolt(ctx: CanvasRenderingContext2D, pts: Point[], cell: number) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#4aa3ff";
  ctx.lineWidth = Math.max(5, cell * 0.13);
  ctx.globalAlpha = 0.45;
  ctx.shadowColor = "#9fd4ff";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#f7fbff";
  ctx.lineWidth = Math.max(1.6, cell * 0.035);
  ctx.stroke();
  ctx.restore();
}

function muzzle(ctx: CanvasRenderingContext2D, at: Point, cell: number, fly: number, color: string) {
  if (fly <= 0 || fly >= 0.28) return;
  ctx.globalAlpha = 1 - fly / 0.28;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(at.x, at.y, cell * 0.14 * (1.15 - fly), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function flameCluster(
  ctx: CanvasRenderingContext2D,
  origin: Point,
  angle: number,
  length: number,
  width: number,
  phase: number,
  spirit: boolean
) {
  const layers: Array<[string, number, number]> = spirit
    ? [
        ["#ffe7a2", 1.05, 0.4],
        ["#fff6d4", 0.7, 0.75],
        ["#ffffff", 0.32, 1],
      ]
    : [
        ["#4a0c00", 1.2, 0.72],
        ["#b41e00", 0.95, 0.88],
        ["#ff5a00", 0.68, 0.95],
        ["#ffb03a", 0.4, 1],
        ["#fff4c2", 0.16, 1],
      ];
  for (let i = 0; i < layers.length; i += 1) {
    const [color, scale, alpha] = layers[i];
    ctx.fillStyle = color;
    ctx.globalAlpha = Number(alpha);
    const lean = Math.sin(phase * 0.8 + i * 1.3) * 0.16;
    const curl = Math.sin(phase + i * 1.7) * width * 0.45;
    tongue(ctx, origin, angle + lean, length * Number(scale), width * (0.45 + Number(scale) * 0.4), curl);
  }
}

function paintFireball(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  cell: number,
  fly: number,
  phase: number,
  spirit: boolean
) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || cell;
  const lift = Math.min(cell * 0.65, dist * 0.2);
  muzzle(ctx, from, cell, fly, spirit ? "#fff6d4" : "#ff8a1a");
  for (let i = 14; i >= 0; i -= 1) {
    const t = Math.max(0, fly - i * 0.035);
    const at = lob(from, to, t, lift);
    const behind = lob(from, to, Math.max(0, t - 0.03), lift);
    let angle = Math.atan2(at.y - behind.y, at.x - behind.x) + Math.PI;
    angle = angle * 0.72 + -Math.PI / 2 * 0.28;
    const scale = 1 - i * 0.06;
    const rise = -i * 1.1 + Math.sin(phase + i) * 3;
    flameCluster(
      ctx,
      { x: at.x, y: at.y + rise },
      angle,
      cell * 0.85 * scale,
      cell * 0.26 * scale,
      phase + i,
      spirit
    );
  }
  const head = lob(from, to, fly, lift);
  ctx.globalAlpha = 1;
  ctx.fillStyle = spirit ? "#ffffff" : "#fff6c8";
  ctx.beginPath();
  ctx.ellipse(head.x, head.y - cell * 0.04, cell * 0.07, cell * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i += 1) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = spirit ? "#fff" : "#ffd27a";
    const spark = lob(from, to, Math.max(0, fly - lump(i) * 0.2), lift);
    ctx.fillRect(spark.x + Math.sin(phase + i) * 6, spark.y - i * 2, 2.2, 2.2);
  }
  ctx.globalAlpha = 1;
}

function paintFireBurst(ctx: CanvasRenderingContext2D, at: Point, cell: number, boom: number, phase: number, spirit: boolean) {
  const fade = Math.max(0.2, 1 - boom * 0.5);
  const reach = cell * (0.35 + boom * 0.9);
  ctx.globalAlpha = fade * 0.45;
  ctx.fillStyle = spirit ? "#fff6d4" : "#ff6a00";
  ctx.beginPath();
  ctx.ellipse(at.x, at.y + cell * 0.04, reach * 0.55, reach * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 20; i += 1) {
    const upward = -Math.PI / 2 + (lump(i + 2) - 0.5) * 2.4;
    const length = reach * (0.45 + lump(i + 5) * 0.7) * (0.85 + 0.15 * Math.sin(phase + i));
    ctx.globalAlpha = fade;
    flameCluster(ctx, at, upward, length, cell * (0.12 + lump(i) * 0.1), phase + i * 0.6, spirit);
  }
  for (let i = 0; i < 14; i += 1) {
    ctx.globalAlpha = fade;
    ctx.fillStyle = spirit ? "#fff" : i % 2 ? "#ffb03a" : "#fff1b8";
    ctx.beginPath();
    ctx.arc(
      at.x + Math.sin(phase * 0.6 + i) * (6 + lump(i) * reach * 0.45),
      at.y - boom * cell * (0.2 + lump(i + 3) * 0.9),
      1.4 + lump(i + 1) * 2.2,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintWaterShot(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, fly: number, phase: number) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || cell;
  const lift = Math.min(cell * 0.28, dist * 0.1);
  const tailT = Math.max(0, fly - 0.32);
  const head = lob(from, to, fly, lift);
  const tail = lob(from, to, tailT, lift);
  const angle = Math.atan2(head.y - tail.y, head.x - tail.x);
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  muzzle(ctx, from, cell, fly, "#d7f3ff");
  const steps = 18;
  for (let pass = 0; pass < 3; pass += 1) {
    const color = pass === 0 ? "#0c3a66" : pass === 1 ? "#2f8fd0" : "#e7f6ff";
    const girth = pass === 0 ? 1 : pass === 1 ? 0.62 : 0.28;
    ctx.fillStyle = color;
    for (let i = 0; i <= steps; i += 1) {
      const t = tailT + ((fly - tailT) * i) / steps;
      const at = lob(from, to, t, lift);
      const wave = Math.sin(phase + i * 0.55) * cell * 0.05;
      const grow = 0.35 + (i / steps) * 0.75;
      const radius = cell * 0.11 * grow * girth;
      ctx.globalAlpha = pass === 2 ? 0.85 : 0.55 + (i / steps) * 0.4;
      ctx.beginPath();
      ctx.ellipse(at.x + nx * wave, at.y + ny * wave, radius * 1.35, radius * 0.72, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 10; i += 1) {
    const at = lob(from, to, Math.max(0, fly - lump(i) * 0.18), lift);
    const side = (lump(i + 3) - 0.5) * cell * 0.28;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = i % 2 ? "#f4fbff" : "#7ec8e8";
    ctx.beginPath();
    ctx.ellipse(at.x + nx * side, at.y + ny * side + i, 2.2 + lump(i) * 2, 3.4 + lump(i + 1) * 3, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(angle);
  ctx.fillStyle = "#f4fbff";
  ctx.beginPath();
  ctx.moveTo(cell * 0.28, 0);
  ctx.lineTo(-cell * 0.02, cell * 0.09);
  ctx.lineTo(-cell * 0.08, 0);
  ctx.lineTo(-cell * 0.02, -cell * 0.09);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintFrostBurst(ctx: CanvasRenderingContext2D, at: Point, cell: number, boom: number) {
  splash(ctx, at, cell, boom, "#7ec8e8", "#143e72", "#f4fbff");
  ctx.globalAlpha = Math.max(0.25, 1 - boom * 0.55);
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2 + lump(i) * 0.4;
    const dist = cell * (0.08 + boom * (0.2 + lump(i + 2) * 0.45));
    const length = 6 + lump(i + 4) * 14;
    ctx.save();
    ctx.translate(at.x + Math.cos(angle) * dist, at.y + Math.sin(angle) * dist * 0.6);
    ctx.rotate(angle + lump(i) * 0.5);
    ctx.fillStyle = i % 3 === 0 ? "#ffffff" : "#d7f3ff";
    ctx.beginPath();
    ctx.moveTo(length, 0);
    ctx.lineTo(0, 2 + lump(i) * 2);
    ctx.lineTo(-length * 0.35, 0);
    ctx.lineTo(0, -(2 + lump(i) * 2));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function paintAcidShot(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, fly: number, poison: boolean) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || cell;
  const lift = Math.min(cell * 1.05, dist * 0.34);
  const head = lob(from, to, fly, lift);
  const body = poison ? "#8fd45a" : "#d6f04a";
  const deep = poison ? "#1d3a16" : "#4e6808";
  const shine = poison ? "#e8ffc8" : "#f7ffb0";
  muzzle(ctx, from, cell, fly, shine);
  for (let drop = 13; drop >= 1; drop -= 1) {
    const at = lob(from, to, Math.max(0, fly - drop * 0.04), lift);
    const sag = drop * drop * 0.55;
    const radius = cell * (0.035 + lump(drop) * 0.045);
    ctx.globalAlpha = 0.35 + (10 - drop) * 0.05;
    glob(ctx, at.x + (lump(drop + 2) - 0.5) * 8, at.y + sag, radius, body, deep, shine);
  }
  ctx.globalAlpha = 1;
  glob(ctx, head.x, head.y, cell * (poison ? 0.2 : 0.24), body, deep, shine);
  const puffs = poison ? 7 : 3;
  for (let i = 0; i < puffs; i += 1) {
    ctx.globalAlpha = 0.22 + lump(i) * 0.15;
    ctx.fillStyle = poison ? "#6a4a88" : "#e4ff8a";
    ctx.beginPath();
    ctx.arc(
      head.x + (lump(i + 1) - 0.5) * cell * 0.35,
      head.y - cell * (0.12 + lump(i + 4) * 0.28),
      cell * (0.06 + lump(i + 6) * 0.06),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintBoltShot(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, fly: number, phase: number, seed: number) {
  const head = along(from, to, fly);
  const pts = jagged(from, head, seed, phase);
  strokeBolt(ctx, pts, cell);
  const angle = Math.atan2(head.y - from.y, head.x - from.x);
  for (let fork = 0; fork < 3; fork += 1) {
    const at = pts[Math.max(1, pts.length - 4 - fork)] || head;
    const tip = pointOn(at, angle + (fork % 2 ? 0.7 : -0.65) + fork * 0.1, cell * (0.35 + fork * 0.18));
    strokeBolt(ctx, jagged(at, tip, seed + 20 + fork * 9, phase + fork), cell * 0.55);
  }
  for (let i = 1; i < pts.length - 1; i += 2) {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#f7fbff";
    ctx.fillRect(pts[i].x - 1.2, pts[i].y - 1.2, 2.4, 2.4);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(head.x, head.y, cell * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#9fd4ff";
  ctx.beginPath();
  ctx.arc(head.x, head.y, cell * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintRingShot(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, fly: number, boom: number) {
  if (boom <= 0) {
    const head = along(from, to, fly);
    muzzle(ctx, from, cell, fly, "#f4fbff");
    ctx.strokeStyle = "#f7fbff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(head.x, head.y, cell * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(head.x, head.y, cell * 0.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  for (let i = 0; i < 5; i += 1) {
    ctx.globalAlpha = (1 - boom) * (1 - i * 0.15);
    ctx.strokeStyle = i === 0 ? "#ffffff" : "#d5e8ff";
    ctx.lineWidth = 5 - i * 0.6;
    ctx.beginPath();
    ctx.arc(to.x, to.y, cell * (0.12 + boom * (0.35 + i * 0.22)), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    const inner = cell * (0.1 + boom * 0.15);
    const outer = inner + cell * (0.15 + boom * 0.35);
    ctx.globalAlpha = 1 - boom;
    ctx.strokeStyle = "#f7fbff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(to.x + Math.cos(angle) * inner, to.y + Math.sin(angle) * inner);
    ctx.lineTo(to.x + Math.cos(angle) * outer, to.y + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintDart(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  cell: number,
  fly: number,
  body: string,
  core: string
) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || cell;
  const lift = Math.min(cell * 0.45, dist * 0.16);
  const head = lob(from, to, fly, lift);
  const prev = lob(from, to, Math.max(0, fly - 0.08), lift);
  const angle = Math.atan2(head.y - prev.y, head.x - prev.x);
  muzzle(ctx, from, cell, fly, core);
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(angle);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(cell * 0.26, 0);
  ctx.quadraticCurveTo(cell * 0.02, cell * 0.09, -cell * 0.2, cell * 0.07);
  ctx.quadraticCurveTo(-cell * 0.06, 0, -cell * 0.2, -cell * 0.07);
  ctx.quadraticCurveTo(cell * 0.02, -cell * 0.09, cell * 0.26, 0);
  ctx.fill();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(0, 0, cell * 0.07, cell * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintMote(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, body: string, core: string) {
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x - radius * 0.22, y - radius * 0.22, radius * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

function paintHealShot(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, fly: number, phase: number) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || cell;
  const lift = Math.min(cell * 0.85, dist * 0.28);
  const head = lob(from, to, fly, lift);
  muzzle(ctx, from, cell, fly, "#f3ffd0");
  for (let i = 8; i >= 1; i -= 1) {
    const at = lob(from, to, Math.max(0, fly - i * 0.045), lift);
    const side = Math.sin(phase * 0.4 + i) * cell * 0.08;
    ctx.globalAlpha = 0.25 + (8 - i) * 0.06;
    paintMote(ctx, at.x + side, at.y - i * 1.5, cell * (0.04 + lump(i) * 0.04), i % 2 ? "#7dce6a" : "#f0d878", "#f3ffd0");
  }
  ctx.globalAlpha = 1;
  const wobble = Math.sin(phase) * 1.5;
  paintMote(ctx, head.x + wobble, head.y, cell * 0.13, "#7dce6a", "#f3ffd0");
  ctx.fillStyle = "#f0d878";
  ctx.beginPath();
  ctx.arc(head.x + wobble, head.y, cell * 0.045, 0, Math.PI * 2);
  ctx.fill();
}

function paintHealBloom(ctx: CanvasRenderingContext2D, at: Point, cell: number, boom: number, phase: number) {
  const height = cell * (0.35 + boom * 1.25);
  const grad = ctx.createLinearGradient(at.x, at.y, at.x, at.y - height);
  grad.addColorStop(0, "rgba(240, 216, 120, 0)");
  grad.addColorStop(0.4, "rgba(126, 206, 106, 0.55)");
  grad.addColorStop(1, "rgba(255, 250, 220, 0)");
  ctx.globalAlpha = 0.85 * (1 - boom * 0.35);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y - height * 0.42, cell * 0.2, height * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 20; i += 1) {
    const t = (boom * 0.8 + i * 0.05) % 1;
    const drift = Math.sin(phase * 0.35 + i) * (4 + t * 22);
    ctx.globalAlpha = (1 - t) * 0.95;
    ctx.fillStyle = i % 3 === 0 ? "#f0d878" : i % 3 === 1 ? "#c6f5a8" : "#f7ffe4";
    ctx.beginPath();
    ctx.ellipse(at.x + drift, at.y - t * cell * 1.45, 1.6 + (i % 3), 2.4 + lump(i) * 3, drift * 0.02, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1 - boom;
  ctx.strokeStyle = "#f0d878";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y + 4, cell * (0.18 + boom * 0.42), cell * 0.11, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintNecroticShot(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, fly: number) {
  const head = along(from, to, fly);
  muzzle(ctx, from, cell, fly, "#c9a0d4");
  for (let i = 8; i >= 1; i -= 1) {
    const at = along(from, to, Math.max(0, fly - i * 0.05));
    const side = (lump(i) - 0.5) * cell * 0.16;
    ctx.globalAlpha = 0.18 + (8 - i) * 0.06;
    paintMote(ctx, at.x + side, at.y, cell * (0.05 + lump(i + 2) * 0.06), "#1a1020", i % 2 ? "#6b5a78" : "#c9a0d4");
  }
  ctx.globalAlpha = 1;
  paintMote(ctx, head.x, head.y, cell * 0.14, "#1a1020", "#c9a0d4");
}

function paintDrain(ctx: CanvasRenderingContext2D, at: Point, cell: number, progress: number, phase: number) {
  const count = 14;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + phase * 0.15;
    const outer = pointOn(at, angle, cell * (0.7 - progress * 0.2));
    ctx.strokeStyle = i % 2 ? "#6b5a78" : "#2a1830";
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    ribbon(ctx, outer, angle + Math.PI, cell * 0.55 * Math.max(0.3, progress), 3, 2, phase + i, 6);
  }
  ctx.globalAlpha = 1;
}

function paintElement(
  ctx: CanvasRenderingContext2D,
  kind: string,
  from: Point,
  to: Point,
  centers: Point[],
  cell: number,
  progress: number,
  phase: number,
  seed: number
) {
  const targets = shotAims(from, to, centers, cell);
  const single = targets.length === 1;
  targets.forEach((aim, index) => {
    const dist = Math.hypot(aim.x - from.x, aim.y - from.y);
    const clock = shotClock(progress, index, targets.length, dist, cell);
    if (!clock.show) return;
    const boomReach = single ? areaRadius(to, centers, cell) : cell * 1.08;
    if (clock.boom <= 0) {
      if (kind === "fire") paintFireball(ctx, from, aim, cell, clock.fly, phase + index, false);
      else if (kind === "radiant") paintFireball(ctx, from, aim, cell, clock.fly, phase + index, true);
      else if (kind === "light") {
        const head = along(from, aim, clock.fly);
        muzzle(ctx, from, cell, clock.fly, "#fff6d4");
        paintMote(ctx, head.x, head.y, cell * 0.12, "#f4efe2", "#ffffff");
      }
      else if (kind === "cold") paintWaterShot(ctx, from, aim, cell, clock.fly, phase + index);
      else if (kind === "acid") paintAcidShot(ctx, from, aim, cell, clock.fly, false);
      else if (kind === "poison") paintAcidShot(ctx, from, aim, cell, clock.fly, true);
      else if (kind === "lightning") paintBoltShot(ctx, from, aim, cell, clock.fly, phase, seed + index * 19);
      else if (kind === "thunder") paintRingShot(ctx, from, aim, cell, clock.fly, 0);
      else if (kind === "force") paintDart(ctx, from, aim, cell, clock.fly, "#6a4ad4", "#f4f0ff");
      else if (kind === "necrotic") paintNecroticShot(ctx, from, aim, cell, clock.fly);
      else if (kind === "heal") paintHealShot(ctx, from, aim, cell, clock.fly, phase);
      else if (kind === "psychic") paintDart(ctx, from, aim, cell, clock.fly, "#7a3ea8", "#f0c8ff");
      else paintDart(ctx, from, aim, cell, clock.fly, "#4a6ea8", "#e7f2ff");
      return;
    }
    if (kind === "fire") paintFireBurst(ctx, aim, boomReach, clock.boom, phase, false);
    else if (kind === "radiant") paintFireBurst(ctx, aim, boomReach, clock.boom, phase, true);
    else if (kind === "light") {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#16140f";
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, cell * (0.16 + clock.boom * 0.34), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7 * (1 - clock.boom * 0.25);
      ctx.strokeStyle = "#fff6d4";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, cell * (0.22 + clock.boom * 0.42), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    else if (kind === "cold") paintFrostBurst(ctx, aim, boomReach, clock.boom);
    else if (kind === "acid") splash(ctx, aim, boomReach, clock.boom, "#d6f04a", "#4e6808", "#f7ffb0");
    else if (kind === "poison") {
      splash(ctx, aim, boomReach, clock.boom, "#8fd45a", "#1d3a16", "#e8ffc8");
      for (let i = 0; i < 6; i += 1) {
        ctx.globalAlpha = (1 - clock.boom * 0.4) * 0.35;
        ctx.fillStyle = i % 2 ? "#6a4a88" : "#c6f5a0";
        ctx.beginPath();
        ctx.arc(
          aim.x + (lump(i) - 0.5) * cell * 0.4,
          aim.y - clock.boom * cell * (0.2 + lump(i + 1) * 0.5),
          cell * (0.08 + lump(i + 3) * 0.08),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (kind === "lightning") {
      paintBoltShot(ctx, from, aim, cell, 1, phase, seed + index * 19);
      ctx.globalAlpha = 1 - clock.boom;
      ctx.fillStyle = "#f7fbff";
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, cell * (0.1 + clock.boom * 0.35), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (kind === "thunder") paintRingShot(ctx, from, aim, cell, 1, clock.boom);
    else if (kind === "necrotic") paintDrain(ctx, aim, cell, clock.boom, phase);
    else if (kind === "heal") paintHealBloom(ctx, aim, cell, clock.boom, phase);
    else if (kind === "psychic") {
      for (let i = 0; i < 3; i += 1) {
        ctx.globalAlpha = 1 - clock.boom;
        ctx.strokeStyle = i % 2 ? "#f0c8ff" : "#b06ad4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(aim.x, aim.y, cell * (0.12 + clock.boom * (0.2 + i * 0.12)), cell * 0.08, phase + i, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 1 - clock.boom;
      ctx.strokeStyle = kind === "force" ? "#c9b6ff" : "#d5e8ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, cell * (0.12 + clock.boom * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });
}

function paintAir(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, surge: number, phase: number) {
  const aim = Math.atan2(to.y - from.y, to.x - from.x);
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || cell;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const t = Math.max(0.08, surge - i * 0.14);
    const at = along(from, to, Math.min(1, t));
    const radius = cell * (0.28 + i * 0.16) + Math.min(dist, cell * 3) * t * 0.2;
    ctx.strokeStyle = i === 0 ? "#ffffff" : "rgba(185, 224, 255, 0.75)";
    ctx.lineWidth = 11 - i * 3;
    ctx.globalAlpha = 0.9 - i * 0.18;
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, aim - 1.15 + Math.sin(phase + i) * 0.08, aim + 1.15);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintCrescent(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  cell: number,
  surge: number,
  width: number,
  color: string,
  sweep: number
) {
  const aim = Math.atan2(to.y - from.y, to.x - from.x);
  const radius = Math.max(cell * 0.85, Math.hypot(to.x - from.x, to.y - from.y) * 0.92);
  const start = aim - sweep * 0.55;
  const end = start + sweep * Math.max(0.2, surge);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = width + 12;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(from.x, from.y, radius, start, end);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(from.x, from.y, radius, start, end);
  ctx.stroke();
  ctx.strokeStyle = "#d7ecff";
  ctx.lineWidth = Math.max(2, width * 0.28);
  ctx.stroke();
}

function paintClaws(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, surge: number) {
  const aim = Math.atan2(to.y - from.y, to.x - from.x);
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || cell;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const radius = dist * (0.78 + i * 0.1);
    const offset = (i - 1) * 0.16;
    const start = aim - 0.7 + offset;
    const end = start + 1.15 * Math.max(0.25, surge);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(from.x, from.y, radius, start, end);
    ctx.stroke();
    ctx.strokeStyle = "#ffb0a0";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function rock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.35);
  ctx.lineTo(-r * 0.15, -r);
  ctx.lineTo(r * 0.8, -r * 0.25);
  ctx.lineTo(r * 0.45, r * 0.75);
  ctx.lineTo(-r * 0.65, r * 0.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function paintEarth(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, surge: number) {
  const colors = ["#5c4630", "#8d6b43", "#c4a574"];
  for (let i = 0; i < 3; i += 1) {
    const t = Math.min(1, surge * (0.75 + i * 0.12));
    const at = along(from, to, t);
    rock(ctx, at.x, at.y, cell * (0.18 + i * 0.06), surge * 5 + i, colors[i]);
  }
  if (surge > 0.62) {
    const ring = (surge - 0.62) / 0.38;
    ctx.strokeStyle = "#c4a574";
    ctx.globalAlpha = 1 - ring;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(to.x, to.y, cell * (0.2 + ring * 0.55), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function paintArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, surge: number, kind: "arrow" | "bolt" | "dart") {
  const head = along(from, to, Math.min(1, 0.08 + surge * 0.92));
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = kind === "dart" ? cell * 0.32 : kind === "bolt" ? cell * 0.55 : cell * 0.72;
  const tail = { x: head.x - Math.cos(ang) * len, y: head.y - Math.sin(ang) * len };
  ctx.strokeStyle = kind === "bolt" ? "#d8d8d8" : kind === "dart" ? "#f4f4f4" : "#c4a574";
  ctx.lineWidth = kind === "dart" ? 1.4 : 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(head.x, head.y);
  ctx.stroke();
  const px = -Math.sin(ang);
  const py = Math.cos(ang);
  const tip = { x: head.x + Math.cos(ang) * (kind === "dart" ? 6 : 9), y: head.y + Math.sin(ang) * (kind === "dart" ? 6 : 9) };
  ctx.fillStyle = "#f7f7f7";
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(head.x + px * 5, head.y + py * 5);
  ctx.lineTo(head.x - px * 5, head.y - py * 5);
  ctx.closePath();
  ctx.fill();
  if (kind === "arrow") {
    ctx.strokeStyle = "#efe6d2";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(tail.x + px * 7 - Math.cos(ang) * 4, tail.y + py * 7 - Math.sin(ang) * 4);
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(tail.x - px * 7 - Math.cos(ang) * 4, tail.y - py * 7 - Math.sin(ang) * 4);
    ctx.stroke();
  }
}

function paintMind(ctx: CanvasRenderingContext2D, at: Point, cell: number, progress: number) {
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.ellipse(
      at.x,
      at.y,
      cell * (0.16 + i * 0.1) * (0.55 + progress * 0.5),
      cell * (0.08 + i * 0.035),
      progress * 2.2 + i * 0.4,
      0,
      Math.PI * 2
    );
    ctx.strokeStyle = i % 2 ? "#f0c8ff" : "#b06ad4";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function paintJaws(ctx: CanvasRenderingContext2D, at: Point, cell: number, surge: number) {
  const open = (1 - surge) * cell * 0.42 + 6;
  ctx.strokeStyle = "#f4f1ea";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(at.x - cell * 0.42, at.y - open);
  ctx.quadraticCurveTo(at.x, at.y - open * 0.15, at.x + cell * 0.42, at.y - open);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(at.x - cell * 0.42, at.y + open);
  ctx.quadraticCurveTo(at.x, at.y + open * 0.15, at.x + cell * 0.42, at.y + open);
  ctx.stroke();
  for (let i = 0; i < 4; i += 1) {
    const x = at.x - cell * 0.26 + i * cell * 0.16;
    ctx.beginPath();
    ctx.moveTo(x - 3, at.y - open);
    ctx.lineTo(x, at.y - open + 11);
    ctx.lineTo(x + 3, at.y - open);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 3, at.y + open);
    ctx.lineTo(x, at.y + open - 11);
    ctx.lineTo(x + 3, at.y + open);
    ctx.fill();
  }
}

function paintLash(ctx: CanvasRenderingContext2D, from: Point, to: Point, cell: number, surge: number, phase: number, color: string, coils: boolean) {
  const tip = along(from, to, surge);
  const mid = along(from, tip, 0.55);
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = Math.sin(phase) * cell * 0.28;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = coils ? cell * 0.16 : cell * 0.1;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(mid.x + nx * bend, mid.y + ny * bend, tip.x, tip.y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (coils && surge > 0.45) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(to.x, to.y, cell * 0.28 * surge, phase, phase + Math.PI * 1.6);
    ctx.stroke();
  }
}

function CanvasFx({ paint, opacity }: { paint: (ctx: CanvasRenderingContext2D) => void; opacity: number }) {
  return (
    <Shape
      listening={false}
      opacity={opacity}
      perfectDrawEnabled={false}
      sceneFunc={(context, shape) => {
        const ctx = (context as unknown as { _context: CanvasRenderingContext2D })._context;
        ctx.save();
        paint(ctx);
        ctx.restore();
        context.beginPath();
        context.fillStrokeShape(shape);
      }}
    />
  );
}

export function MotionEffect({
  motion,
  progress,
  from,
  to,
  id,
  centers,
  cell,
}: {
  motion: string;
  progress: number;
  from: Point;
  to: Point;
  id: number;
  centers: Point[];
  cell: number;
}) {
  const surgeT = Math.min(1, progress / 0.3);
  const surge = 1 - (1 - surgeT) ** 3;
  const phase = progress * Math.PI * 9;
  const fade = progress < 0.9 ? 1 : Math.max(0, 1 - (progress - 0.9) / 0.1);
  const fan = fanOf(from, to, centers, cell);
  const seed = id % 997;

  let paint: (ctx: CanvasRenderingContext2D) => void = (ctx) => {
    paintAir(ctx, from, to, cell, surge, phase);
  };

  if (
    motion === "fire" ||
    motion === "radiant" ||
    motion === "light" ||
    motion === "cold" ||
    motion === "acid" ||
    motion === "poison" ||
    motion === "lightning" ||
    motion === "thunder" ||
    motion === "force" ||
    motion === "necrotic" ||
    motion === "heal" ||
    motion === "help" ||
    motion === "psychic" ||
    motion === "other"
  )
    paint = (ctx) => paintElement(ctx, motion === "help" ? "heal" : motion, from, to, centers, cell, progress, phase, seed);
  else if (motion === "movement" || motion === "dash") paint = (ctx) => paintAir(ctx, from, to, cell, surge, phase);
  else if (motion === "slash" || motion === "reach")
    paint = (ctx) => paintCrescent(ctx, from, to, cell, surge, motion === "reach" ? 12 : 9, "#f7fbff", motion === "reach" ? 1.7 : 1.35);
  else if (motion === "tail") paint = (ctx) => paintCrescent(ctx, from, to, cell, surge, 14, "#e6d2a8", 1.5);
  else if (motion === "claw") paint = (ctx) => paintClaws(ctx, from, to, cell, surge);
  else if (motion === "blunt" || motion === "slam" || motion === "shove" || motion === "sling")
    paint = (ctx) => paintEarth(ctx, from, to, cell, surge);
  else if (motion === "bow") paint = (ctx) => paintArrow(ctx, from, to, cell, surge, "arrow");
  else if (motion === "crossbow") paint = (ctx) => paintArrow(ctx, from, to, cell, surge, "bolt");
  else if (motion === "blowgun" || motion === "stab" || motion === "sting")
    paint = (ctx) => paintArrow(ctx, from, to, cell, surge, "dart");
  else if (motion === "thrown" || motion === "unarmed") paint = (ctx) => paintEarth(ctx, from, to, cell, surge);
  else if (motion === "social") paint = (ctx) => paintMind(ctx, to, cell, progress);
  else if (motion === "bite") paint = (ctx) => paintJaws(ctx, to, cell, surge);
  else if (motion === "tentacle" || motion === "charm")
    paint = (ctx) => paintLash(ctx, from, to, cell, surge, phase, motion === "charm" ? "#c9a0ff" : "#7ea85a", false);
  else if (motion === "constrict" || motion === "grapple")
    paint = (ctx) => paintLash(ctx, from, to, cell, surge, phase, motion === "grapple" ? "#e7c2a4" : "#6a9448", true);
  else if (motion === "gore") {
    paint = (ctx) => {
      paintArrow(ctx, { x: from.x - 8, y: from.y }, to, cell, surge, "dart");
      paintArrow(ctx, { x: from.x + 8, y: from.y }, to, cell, surge, "dart");
    };
  } else if (motion === "net" || motion === "web" || motion === "spread") {
    paint = (ctx) => {
      ctx.strokeStyle = motion === "web" ? "#f4f4f4" : "#e6d7b8";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 6; i += 1) {
        const angle = fan.mid + (i / 5 - 0.5) * Math.max(0.8, fan.half * 2);
        const tip = pointOn(from, angle, fan.reach * surge);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }
    };
  } else if (motion === "swallow") {
    paint = (ctx) => {
      ctx.fillStyle = "#1a100c";
      ctx.beginPath();
      ctx.ellipse(to.x, to.y, cell * (0.55 - surge * 0.15), cell * (0.32 - surge * 0.08), 0, 0, Math.PI * 2);
      ctx.fill();
      paintJaws(ctx, to, cell, surge);
    };
  } else if (motion === "ward" || motion === "dodge") {
    paint = (ctx) => {
      ctx.strokeStyle = "#e7eef8";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(to.x, to.y, cell * (0.32 + surge * 0.22), phase, phase + Math.PI * 1.7);
      ctx.stroke();
    };
  } else if (motion === "illusion" || motion === "hide" || motion === "transform" || motion === "conjure") {
    paint = (ctx) => {
      ctx.strokeStyle = motion === "conjure" ? "#cbb0ff" : "#d5e2f4";
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(to.x, to.y, cell * (0.2 + surge * 0.28), cell * 0.16, phase, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(to.x, to.y, cell * 0.34, cell * (0.12 + surge * 0.16), -phase, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
  } else if (motion === "divination" || motion === "search") {
    paint = (ctx) => {
      ctx.strokeStyle = "#9fd0ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(to.x, to.y, cell * 0.34 * (0.7 + surge * 0.3), cell * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath();
      ctx.arc(to.x, to.y, 5, 0, Math.PI * 2);
      ctx.fill();
    };
  }

  return <CanvasFx opacity={fade} paint={paint} />;
}
