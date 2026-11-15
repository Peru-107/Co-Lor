/**
 * Deterministic randomness and noise. Same seed -> same painting, every time.
 * (Original implementations: sfc32 generator, integer-mix hash, quintic value noise.)
 */
export type Rng = () => number;

export interface Point2D {
  x: number;
  y: number;
}

/** sfc32 ("small fast counter") seeded through splitmix32. Returns floats in [0, 1). */
export function createRng(seed: number): Rng {
  let z = (seed | 0) ^ 0x9e3779b9;
  const split = () => {
    z = (z + 0x9e3779b9) | 0;
    let t = z;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
  let a = split(), b = split(), c = split(), d = split();
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hermite step between two edges (edges may be given in either order). */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Integer lattice hash -> [0, 1). */
export function hash2D(x: number, y: number, seed = 0): number {
  let h = (x | 0) * 0x27d4eb2d + (y | 0) * 0x165667b1 + (seed | 0) * 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth value noise in [0, 1] with quintic interpolation. */
export function noise2D(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = fade(x - xi), v = fade(y - yi);
  const a = hash2D(xi, yi, seed), b = hash2D(xi + 1, yi, seed);
  const c = hash2D(xi, yi + 1, seed), d = hash2D(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Fractal sum of rotated noise octaves, normalised to [0, 1]. */
export function fbm2D(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0, amp = 1, norm = 0, px = x, py = y;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2D(px, py, seed + o * 131);
    norm += amp;
    amp *= 0.5;
    const nx = px * 1.6 - py * 1.2, ny = px * 1.2 + py * 1.6; // rotate + scale 2x to hide grid alignment
    px = nx + 17.3;
    py = ny + 9.1;
  }
  return sum / norm;
}

/** Resamples a polyline at a fixed step and adds slow, smooth sideways drift like an unsteady hand. */
export function humanizePolyline(points: Point2D[], rng: Rng, amp = 1.5, step = 4): Point2D[] {
  if (points.length < 2) return points.slice();
  const out: Point2D[] = [];
  const phase = rng() * 500;
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-3) continue;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const n = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      const d = dist + len * t;
      const off = ((noise2D(d * 0.02, phase, 3) - 0.5) * 1.5 + (noise2D(d * 0.09, phase + 50, 5) - 0.5) * 0.5) * amp;
      out.push({ x: a.x + (b.x - a.x) * t + nx * off, y: a.y + (b.y - a.y) * t + ny * off });
    }
    dist += len;
  }
  out.push({ ...points[points.length - 1] });
  return out;
}
