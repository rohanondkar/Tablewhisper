import { useEffect, useRef } from "react";

export type Rgb = [number, number, number];

export const HAND_KINDS = ["human", "elf", "small", "broad", "scale", "large", "tiefling", "paw", "talon", "metal"] as const;

export const TONES: { name: string; color: Rgb | null }[] = [
  { name: "As pictured", color: null },
  { name: "Pale", color: [236, 210, 186] },
  { name: "Fair", color: [224, 176, 138] },
  { name: "Olive", color: [196, 156, 108] },
  { name: "Tan", color: [176, 124, 80] },
  { name: "Brown", color: [130, 82, 48] },
  { name: "Deep", color: [78, 48, 32] },
  { name: "Ash", color: [168, 164, 170] },
  { name: "Green", color: [112, 146, 78] },
  { name: "Red", color: [176, 72, 58] },
  { name: "Blue", color: [86, 118, 168] },
  { name: "Gold", color: [196, 154, 64] },
];

const KIND_LABEL: Record<string, string> = {
  human: "Human hand",
  elf: "Elf hand",
  small: "Small hand",
  broad: "Dwarf hand",
  scale: "Scaled hand",
  large: "Large hand",
  tiefling: "Tiefling hand",
  paw: "Paw",
  talon: "Talon",
  metal: "Metal hand",
};

export function handKind(species: string): string {
  const s = (species || "").toLowerCase();
  if (/warforged|autognome/.test(s)) return "metal";
  if (/aarakocra|owlin|kenku/.test(s)) return "talon";
  if (/tabaxi|leonin|harengon|shifter/.test(s)) return "paw";
  if (/dragonborn|lizardfolk|kobold|yuan-ti|tortle|thri-kreen|thri kreen/.test(s)) return "scale";
  if (/tiefling/.test(s)) return "tiefling";
  if (/elf|eladrin|drow/.test(s)) return "elf";
  if (/dwarf|duergar/.test(s)) return "broad";
  if (/halfling|gnome|goblin|fairy|grung/.test(s)) return "small";
  if (/orc|goliath|bugbear|firbolg|minotaur|giff|centaur|loxodon|hobgoblin/.test(s)) return "large";
  return "human";
}

export function handLabel(species: string): string {
  return KIND_LABEL[handKind(species)] || "Human hand";
}

export function handArtKey(kind: string, gripping: boolean): string {
  if (kind === "human") return gripping ? "left-grip" : "left-hand";
  return gripping ? `${kind}-grip` : `${kind}-hand`;
}

export function holdPose(name: string, effect: string): "grip" | "open" {
  const n = name.toLowerCase();
  if (effect === "shield" || /\bshield\b/.test(n)) return "open";
  if (/blowgun/.test(n)) return "grip";
  if (/bow|crossbow|\bnet\b|\bsling\b/.test(n)) return "open";
  return "grip";
}

export function sameTone(a: Rgb | null | undefined, b: Rgb | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function asTone(value: number[] | null | undefined): Rgb | null {
  if (!value || value.length !== 3) return null;
  return [clamp(value[0]), clamp(value[1]), clamp(value[2])];
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

const images = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = images.get(src);
  if (hit) return hit;
  const pending = fetch(src)
    .then((res) => {
      if (!res.ok) throw new Error(src);
      return res.blob();
    })
    .then(
      (blob) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(src));
          };
          img.src = url;
        }),
    );
  images.set(src, pending);
  return pending;
}

function crop(img: HTMLImageElement): HTMLCanvasElement {
  const source = document.createElement("canvas");
  source.width = img.naturalWidth || img.width;
  source.height = img.naturalHeight || img.height;
  const ctx = source.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, source.width, source.height).data;
  let minX = source.width;
  let minY = source.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (data[(y * source.width + x) * 4 + 3] > 18) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const w = Math.max(1, maxX - minX + 1);
  const h = Math.max(1, maxY - minY + 1);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")?.drawImage(source, minX, minY, w, h, 0, 0, w, h);
  return out;
}

function safeCrop(img: HTMLImageElement): HTMLCanvasElement {
  try {
    return crop(img);
  } catch {
    const out = document.createElement("canvas");
    out.width = img.naturalWidth || img.width;
    out.height = img.naturalHeight || img.height;
    out.getContext("2d")?.drawImage(img, 0, 0);
    return out;
  }
}

const skinMasks = new Map<string, Uint8Array>();

function colorDist(r: number, g: number, b: number, r2: number, g2: number, b2: number): number {
  const dr = r - r2;
  const dg = g - g2;
  const db = b - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function warmPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 20 || r < 45 || g < 25) return false;
  if (!(r + 4 > g && g >= b - 8)) return false;
  return Math.max(r, g, b) - Math.min(r, g, b) >= 16;
}

function woodCore(r: number, g: number, b: number): boolean {
  if (r < 70) return false;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return b / r < 0.46 && g / r < 0.7 && r - b > 50 && spread > 40 && r > g && g + 8 > b;
}

function obviousSkin(r: number, g: number, b: number): boolean {
  if (r < 40) return false;
  return b / r > 0.62 && g / r > 0.76;
}

type Shaft = { mx: number; my: number; dx: number; dy: number; radius: number };

function shaftFit(data: Uint8ClampedArray, width: number, height: number): Shaft | null {
  const pts: number[] = [];
  const yMax = Math.floor(height * 0.5);
  for (let y = 0; y < yMax; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 20) continue;
      if (!woodCore(data[i], data[i + 1], data[i + 2])) continue;
      pts.push(x, y);
    }
  }
  const count = pts.length / 2;
  if (count < 60) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < pts.length; i += 2) {
    mx += pts[i];
    my += pts[i + 1];
  }
  mx /= count;
  my /= count;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const dx = pts[i] - mx;
    const dy = pts[i + 1] - my;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  const dists: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    dists.push(Math.abs((pts[i] - mx) * dy - (pts[i + 1] - my) * dx));
  }
  dists.sort((a, b) => a - b);
  const radius = Math.max(5, dists[Math.floor(dists.length * 0.6)] * 1.35);
  return { mx, my, dx, dy, radius };
}

function onShaft(x: number, y: number, shaft: Shaft): boolean {
  return Math.abs((x - shaft.mx) * shaft.dy - (y - shaft.my) * shaft.dx) <= shaft.radius;
}

function stripShaft(mask: Uint8Array, data: Uint8ClampedArray, width: number, height: number, shaft: Shaft | null) {
  if (!shaft) return;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index] || !onShaft(x, y, shaft)) continue;
      const i = index * 4;
      if (obviousSkin(data[i], data[i + 1], data[i + 2])) continue;
      mask[index] = 0;
    }
  }
}

function skinMask(img: HTMLImageElement, data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const cached = skinMasks.get(img.src);
  if (cached && cached.length === width * height) return cached;
  const mask = new Uint8Array(width * height);
  const seeds: number[] = [];
  let sr = 0;
  let sg = 0;
  let sb = 0;
  const y0 = Math.floor(height * 0.78);
  for (let y = y0; y < height; y += 1) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if (!warmPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
      seeds.push(y * width + x);
      sr += data[i];
      sg += data[i + 1];
      sb += data[i + 2];
    }
  }
  if (!seeds.length) {
    skinMasks.set(img.src, mask);
    return mask;
  }
  const protoR = sr / seeds.length;
  const protoG = sg / seeds.length;
  const protoB = sb / seeds.length;
  const queue = seeds;
  for (const index of queue) mask[index] = 1;
  let head = 0;
  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = (index - x) / width;
    const pi = index * 4;
    const r = data[pi];
    const g = data[pi + 1];
    const b = data[pi + 2];
    const steps = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of steps) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (mask[next]) continue;
      const ni = next * 4;
      const nr = data[ni];
      const ng = data[ni + 1];
      const nb = data[ni + 2];
      if (data[ni + 3] < 20) continue;
      if (Math.max(nr, ng, nb) - Math.min(nr, ng, nb) < 18) continue;
      if (colorDist(r, g, b, nr, ng, nb) > 64) continue;
      if (colorDist(nr, ng, nb, protoR, protoG, protoB) > 240) continue;
      mask[next] = 1;
      queue.push(next);
    }
  }
  const cut = clipAboveFist(mask, width, height);
  const shaft = shaftFit(data, width, height);
  stripShaft(mask, data, width, height, shaft);
  growHand(mask, data, width, height, cut, shaft);
  stripShaft(mask, data, width, height, shaft);
  skinMasks.set(img.src, mask);
  return mask;
}

function clipAboveFist(mask: Uint8Array, width: number, height: number): number {
  const widths = new Uint32Array(height);
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) widths[(index / width) | 0] += 1;
  }
  const yStart = Math.floor(height * 0.36);
  let palmY = yStart;
  let palmW = 0;
  for (let y = yStart; y < height; y += 1) {
    if (widths[y] > palmW) {
      palmW = widths[y];
      palmY = y;
    }
  }
  if (palmW < 12) return 0;
  const minW = palmW * 0.5;
  let cut = 0;
  for (let y = palmY; y >= 0; y -= 1) {
    if (widths[y] < minW) {
      cut = y;
      break;
    }
  }
  for (let y = 0; y < cut; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) mask[row + x] = 0;
  }
  return cut;
}

function growHand(mask: Uint8Array, data: Uint8ClampedArray, width: number, height: number, cut: number, shaft: Shaft | null) {
  for (let pass = 0; pass < 3; pass += 1) {
    const extra: number[] = [];
    for (let y = cut; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (mask[index]) continue;
        const i = index * 4;
        if (data[i + 3] < 20) continue;
        if (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]) < 18) continue;
        if (shaft && onShaft(x, y, shaft) && !obviousSkin(data[i], data[i + 1], data[i + 2])) continue;
        const touch =
          (x > 0 && mask[index - 1]) ||
          (x + 1 < width && mask[index + 1]) ||
          (y > cut && mask[index - width]) ||
          (y + 1 < height && mask[index + width]);
        if (touch) extra.push(index);
      }
    }
    for (const index of extra) mask[index] = 1;
  }
}

function skinTint(img: HTMLImageElement, tone: Rgb | null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);
  if (!tone) return canvas;
  let frame: ImageData;
  try {
    frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return canvas;
  }
  const d = frame.data;
  const mask = skinMask(img, d, canvas.width, canvas.height);
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let index = 0; index < mask.length; index += 4) {
    if (!mask[index]) continue;
    const i = index * 4;
    sr += d[i];
    sg += d[i + 1];
    sb += d[i + 2];
    n += 1;
  }
  if (!n) return canvas;
  const base = (sr * 0.3 + sg * 0.59 + sb * 0.11) / n || 1;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const i = index * 4;
    const luma = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const scale = luma / base;
    d[i] = clamp(tone[0] * scale);
    d[i + 1] = clamp(tone[1] * scale);
    d[i + 2] = clamp(tone[2] * scale);
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

function tint(img: HTMLImageElement, tone: Rgb | null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);
  if (!tone) return canvas;
  let frame: ImageData;
  try {
    frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return canvas;
  }
  const d = frame.data;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 3] < 24) continue;
    sr += d[i];
    sg += d[i + 1];
    sb += d[i + 2];
    n += 1;
  }
  const base = (sr * 0.3 + sg * 0.59 + sb * 0.11) / (n || 1) || 1;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const luma = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const scale = luma / base;
    d[i] = clamp(tone[0] * scale);
    d[i + 1] = clamp(tone[1] * scale);
    d[i + 2] = clamp(tone[2] * scale);
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

function paintWeapon(ctx: CanvasRenderingContext2D, weapon: HTMLCanvasElement, name: string, shield: boolean) {
  const n = name.toLowerCase();
  const bow = /bow|crossbow/.test(n) && !/blowgun/.test(n);
  const thick = /club|maul|hammer|axe|mace|flail|staff|greatclub|morningstar|spear|javelin|pike|trident|lance|glaive|halberd|blowgun|whip/.test(n);
  const boxW = shield ? ctx.canvas.width * 0.78 : bow ? ctx.canvas.width * 0.55 : ctx.canvas.width * (thick ? 0.38 : 0.22);
  const boxH = shield ? ctx.canvas.height * 0.72 : ctx.canvas.height * 0.96;
  const scale = Math.min(boxW / weapon.width, boxH / weapon.height);
  const w = weapon.width * scale;
  const h = weapon.height * scale;
  const x = shield ? (ctx.canvas.width - w) / 2 : ctx.canvas.width * 0.52 - w / 2;
  const y = shield ? ctx.canvas.height * 0.04 : 0;
  ctx.save();
  if (bow) {
    ctx.translate(ctx.canvas.width * 0.5, ctx.canvas.height * 0.4);
    ctx.rotate(0.12);
    ctx.drawImage(weapon, -w / 2, -h / 2, w, h);
  } else {
    ctx.drawImage(weapon, x, y, w, h);
  }
  ctx.restore();
}

export default function HeldHand({
  handUrl,
  weaponUrl,
  weaponName,
  tone,
  mirror,
  shield,
  skinOnly,
}: {
  handUrl: string;
  weaponUrl: string;
  weaponName: string;
  tone: Rgb | null;
  mirror: boolean;
  shield: boolean;
  skinOnly?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !handUrl) return;
    let cancel = false;
    const draw = async () => {
      try {
        const hand = await loadImage(handUrl);
        if (cancel) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height * 0.62);
        if (mirror) ctx.scale(-1, 1);
        if (skinOnly) ctx.rotate(0.28);
        ctx.translate(-canvas.width / 2, -canvas.height * 0.62);
        const colored = skinOnly ? skinTint(hand, tone) : tint(hand, tone);
        const scale = Math.min(canvas.width / colored.width, canvas.height / colored.height);
        const dw = colored.width * scale;
        const dh = colored.height * scale;
        ctx.drawImage(colored, (canvas.width - dw) / 2, canvas.height - dh, dw, dh);
        ctx.restore();
      } catch {
        /* keep the last frame if a picture is still loading */
      }
    };
    void draw();
    return () => {
      cancel = true;
    };
  }, [handUrl, weaponUrl, weaponName, tone, mirror, shield, skinOnly]);

  return <canvas ref={ref} className="held-hand" width={440} height={520} />;
}
