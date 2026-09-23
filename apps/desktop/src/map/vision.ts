/** Visibility polygon via raycasting against wall segments (closed doors block). */

export type Pt = { x: number; y: number };
export type Seg = { a: Pt; b: Pt };

export function wallsToSegments(
  walls: Array<{
    points: number[];
    door: boolean;
    door_open: boolean;
    block_sight: boolean;
  }>
): Seg[] {
  const segs: Seg[] = [];
  for (const w of walls) {
    if (!w.block_sight) continue;
    if (w.door && w.door_open) continue;
    const pts = w.points;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      segs.push({
        a: { x: pts[i], y: pts[i + 1] },
        b: { x: pts[i + 2], y: pts[i + 3] },
      });
    }
  }
  return segs;
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function rayIntersect(origin: Pt, angle: number, maxR: number, seg: Seg): Pt | null {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const x1 = origin.x;
  const y1 = origin.y;
  const x2 = origin.x + dx * maxR;
  const y2 = origin.y + dy * maxR;
  const x3 = seg.a.x;
  const y3 = seg.a.y;
  const x4 = seg.b.x;
  const y4 = seg.b.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }
  return null;
}

function closestHit(origin: Pt, angle: number, maxR: number, segs: Seg[]): Pt {
  let best: Pt = {
    x: origin.x + Math.cos(angle) * maxR,
    y: origin.y + Math.sin(angle) * maxR,
  };
  let bestD = maxR;
  for (const seg of segs) {
    const hit = rayIntersect(origin, angle, maxR, seg);
    if (!hit) continue;
    const d = dist(origin, hit);
    if (d < bestD) {
      bestD = d;
      best = hit;
    }
  }
  return best;
}

/** Returns flat [x,y,...] polygon for Konva Line. */
export function visibilityPolygon(
  origin: Pt,
  radiusPx: number,
  segs: Seg[],
  rayCount = 72
): number[] {
  if (radiusPx <= 0) return [];
  const angles: number[] = [];
  for (let i = 0; i < rayCount; i++) {
    angles.push((i / rayCount) * Math.PI * 2);
  }
  for (const seg of segs) {
    for (const p of [seg.a, seg.b]) {
      const base = Math.atan2(p.y - origin.y, p.x - origin.x);
      angles.push(base - 0.0001, base, base + 0.0001);
    }
  }
  angles.sort((a, b) => a - b);
  const pts: Pt[] = [];
  for (const ang of angles) {
    pts.push(closestHit(origin, ang, radiusPx, segs));
  }
  const flat: number[] = [];
  for (const p of pts) {
    flat.push(p.x, p.y);
  }
  return flat;
}

export function feetToPx(feet: number, gridSizePx: number, feetPerSquare: number): number {
  if (feetPerSquare <= 0) return 0;
  return (feet / feetPerSquare) * gridSizePx;
}
