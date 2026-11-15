import { PaperSubstrate, RGB } from './paper';
import { clamp, hash2D, lerp, noise2D, Point2D, smoothstep } from './rng';

export interface StrokeStyle {
  /** Max pigment opacity. */
  opacity: number;
  /** 0 = smooth, 1 = pigment only sits on paper-tooth peaks (dry pastel). */
  grain: number;
  /** 0 = blunt ends, 1 = pointed ends. */
  taper: number;
  /** Hand tremor across the stroke, as a fraction of radius. */
  wobble: number;
  /** Bristle / chalk streaks along the stroke, 0..1. */
  streak: number;
  /** Tooth-driven colour shading inside the pigment. */
  toothShade: number;
}

export function blendPixel(pixels: Uint8ClampedArray, idx: number, r: number, g: number, b: number, a: number) {
  if (a <= 0.004) return;
  const p = idx * 4;
  if (a >= 0.996) {
    pixels[p] = r;
    pixels[p + 1] = g;
    pixels[p + 2] = b;
    return;
  }
  const inv = 1 - a;
  pixels[p] = r * a + pixels[p] * inv;
  pixels[p + 1] = g * a + pixels[p + 1] * inv;
  pixels[p + 2] = b * a + pixels[p + 2] * inv;
}

// Scratch buffers reused across strokes (coverage + lateral coordinate).
let cov = new Float32Array(1 << 16);
let lat = new Float32Array(1 << 16);

interface Sample {
  x: number;
  y: number;
  nx: number;
  ny: number;
  arc: number;
}

/** Densely samples a Catmull-Rom spline through the control points. */
function sampleSpline(pts: Point2D[], spacing: number): Sample[] {
  const out: Sample[] = [];
  const n = pts.length;
  let arc = 0;
  let px = pts[0].x;
  let py = pts[0].y;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(1, Math.ceil(segLen / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      arc += Math.hypot(x - px, y - py);
      px = x;
      py = y;
      out.push({ x, y, nx: 0, ny: 0, arc });
    }
  }
  const last = pts[n - 1];
  arc += Math.hypot(last.x - px, last.y - py);
  out.push({ x: last.x, y: last.y, nx: 0, ny: 0, arc });

  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    out[i].nx = -ty;
    out[i].ny = tx;
  }
  return out;
}

/**
 * One dry-media stroke. Unlike Jatayu's drawDryStickStroke (which alpha-blends every stamp and so
 * darkens where stamps overlap), this rasterises the stroke's coverage first (max of soft round stamps)
 * and composites once, so a stroke has even density. The paper tooth then decides where pigment lands.
 */
export function paintStroke(
  pixels: Uint8ClampedArray,
  paper: PaperSubstrate,
  pts: Point2D[],
  radius: number,
  color: RGB,
  seed: number,
  st: StrokeStyle
) {
  if (pts.length === 0 || radius < 0.4) return;
  if (pts.length === 1) pts = [{ x: pts[0].x - radius * 0.35, y: pts[0].y }, { x: pts[0].x + radius * 0.35, y: pts[0].y }];

  const { width: W, height: H, tooth } = paper;
  const samples = sampleSpline(pts, Math.max(0.5, radius * 0.28));
  const total = samples[samples.length - 1].arc || 1;
  const phase = hash2D(seed, 17, 71) * 100;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of samples) {
    if (s.x < minX) minX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.x > maxX) maxX = s.x;
    if (s.y > maxY) maxY = s.y;
  }
  const pad = radius * (1 + st.wobble) + 2;
  const x0 = Math.max(0, Math.floor(minX - pad));
  const y0 = Math.max(0, Math.floor(minY - pad));
  const x1 = Math.min(W - 1, Math.ceil(maxX + pad));
  const y1 = Math.min(H - 1, Math.ceil(maxY + pad));
  if (x1 < x0 || y1 < y0) return;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const n = bw * bh;
  if (cov.length < n) {
    cov = new Float32Array(n * 2);
    lat = new Float32Array(n * 2);
  }
  cov.fill(0, 0, n);

  for (const s of samples) {
    const t = s.arc / total;
    const env = Math.sin(t * Math.PI);
    const r = radius * lerp(1 - st.taper * 0.75, 1, Math.pow(env, 0.5));
    const press = lerp(0.62, 1, Math.pow(env, 0.35));
    const wob = st.wobble > 0 ? (noise2D(s.arc * 0.06, phase, 401) - 0.5) * 2 * st.wobble * radius * 0.5 : 0;
    const cx = s.x + s.nx * wob;
    const cy = s.y + s.ny * wob;
    const invR = 1 / Math.max(0.6, r);
    const sx0 = Math.max(x0, Math.floor(cx - r - 1));
    const sx1 = Math.min(x1, Math.ceil(cx + r + 1));
    const sy0 = Math.max(y0, Math.floor(cy - r - 1));
    const sy1 = Math.min(y1, Math.ceil(cy + r + 1));
    for (let y = sy0; y <= sy1; y++) {
      const dy = y - cy;
      const row = (y - y0) * bw - x0;
      for (let x = sx0; x <= sx1; x++) {
        const dx = x - cx;
        const d = Math.sqrt(dx * dx + dy * dy) * invR;
        if (d >= 1) continue;
        const f = smoothstep(1, 0.3, d) * press;
        const bi = row + x;
        if (f > cov[bi]) {
          cov[bi] = f;
          lat[bi] = (dx * s.nx + dy * s.ny) / radius;
        }
      }
    }
  }

  const [cr, cg, cb] = color;
  const streakFreq = Math.max(2, radius * 0.55);
  for (let y = y0; y <= y1; y++) {
    const row = (y - y0) * bw - x0;
    for (let x = x0; x <= x1; x++) {
      const bi = row + x;
      const c = cov[bi];
      if (c <= 0.01) continue;
      const idx = y * W + x;
      const h = tooth[idx];
      // Dry media: light pressure only reaches the tooth peaks, harder pressure fills the valleys.
      const reach = 1 - c * 0.55;
      const grainMod = lerp(1, smoothstep(reach - 0.3, reach + 0.12, h + hash2D(x, y, 419) * 0.14), st.grain);
      const streakMod = st.streak > 0 ? 1 - st.streak * smoothstep(0.38, 0.72, noise2D(lat[bi] * streakFreq, phase, 977)) : 1;
      const a = c * st.opacity * grainMod * streakMod;
      const sh = (h - 0.5) * st.toothShade;
      blendPixel(pixels, idx, clamp(cr + sh, 0, 255), clamp(cg + sh, 0, 255), clamp(cb + sh, 0, 255), a);
    }
  }
}
