import { RGB } from '../core/paper';
import { clamp, createRng, fbm2D, Rng, smoothstep } from '../core/rng';

/** Colours can be written as "#rrggbb" or [r, g, b]. */
export type Color = string | readonly [number, number, number];

export function rgb(c: Color): RGB {
  if (typeof c !== 'string') return c;
  const h = c.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function scaleRGB(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export interface LightSpec {
  /** Direction the light comes FROM, screen space: x right, y down, z toward viewer. */
  dir: [number, number, number];
  color?: Color;
  ambient?: number;
}

/**
 * The "underpainting" canvas a scene is drawn into: float RGB plus a per-pixel stroke-direction hint
 * (angle + weight) that later tells the brushes which way to run (grass up, water across, fur around a body).
 * Scene coordinates: x and y are fractions of width and height; sizes are fractions of height.
 */
export class Ref {
  readonly w: number;
  readonly h: number;
  readonly rgb: Float32Array;
  readonly flowA: Float32Array;
  readonly flowW: Float32Array;
  /** Which scene element last covered each pixel (for linework occlusion). */
  readonly owner: Int32Array;
  cur = 0;
  readonly L: [number, number, number];
  readonly lightColor: RGB;
  readonly ambient: number;
  haze: { color: RGB; amount: number };
  rng: Rng;
  sun: { x: number; y: number } | null = null;
  /** Linework the brushes repaint on top (see mark()). */
  overlay: Array<{ pts: Array<{ x: number; y: number }>; width: number; color: RGB; opacity?: number; owner?: number }> = [];

  constructor(w: number, h: number, light: LightSpec, haze: { color: Color; amount: number } | undefined, seed: number) {
    this.w = w;
    this.h = h;
    this.rgb = new Float32Array(w * h * 3).fill(255);
    this.flowA = new Float32Array(w * h);
    this.flowW = new Float32Array(w * h);
    this.owner = new Int32Array(w * h).fill(-1);
    const [lx, ly, lz] = light.dir;
    const l = Math.hypot(lx, ly, lz) || 1;
    this.L = [lx / l, ly / l, lz / l];
    this.lightColor = rgb(light.color ?? '#fff3dc');
    this.ambient = light.ambient ?? 0.28;
    this.haze = { color: rgb(haze?.color ?? '#c9d6e3'), amount: haze?.amount ?? 0 };
    this.rng = createRng(seed);
  }

  X(x: number) { return x * this.w; }
  Y(y: number) { return y * this.h; }
  S(s: number) { return s * this.h; }

  get(i: number): RGB {
    return [this.rgb[i * 3], this.rgb[i * 3 + 1], this.rgb[i * 3 + 2]];
  }

  /** Blend a colour into pixel i, with atmospheric haze by depth (0 near, 1 far) and an optional stroke direction. */
  put(i: number, c: RGB, a: number, depth = 0, flow?: number, flowWeight = 0.5) {
    if (a <= 0.003) return;
    let r = c[0], g = c[1], b = c[2];
    const t = depth * this.haze.amount;
    if (t > 0) {
      r += (this.haze.color[0] - r) * t;
      g += (this.haze.color[1] - g) * t;
      b += (this.haze.color[2] - b) * t;
    }
    const k = Math.min(1, a);
    const p = i * 3;
    this.rgb[p] += (r - this.rgb[p]) * k;
    this.rgb[p + 1] += (g - this.rgb[p + 1]) * k;
    this.rgb[p + 2] += (b - this.rgb[p + 2]) * k;
    if (k > 0.5) this.owner[i] = this.cur;
    if (flow !== undefined && k > 0.35) {
      this.flowA[i] = flow;
      this.flowW[i] = flowWeight * k;
    }
  }

  /** Lambert + ambient for a surface normal, 0..1. */
  lit(nx: number, ny: number, nz: number): number {
    return clamp(this.ambient + (1 - this.ambient) * Math.max(0, nx * this.L[0] + ny * this.L[1] + nz * this.L[2]), 0, 1);
  }

  /** Three-tone shading ramp used by every sculpted surface (shadow -> base -> highlight), tinted by the light colour. */
  tone(base: RGB, shadow: RGB, highlight: RGB, lit: number): RGB {
    let c = mix(shadow, base, smoothstep(0.05, 0.6, lit));
    c = mix(c, highlight, smoothstep(0.62, 1, lit));
    const warm = smoothstep(0.5, 1, lit) * 0.18;
    return mix(c, [c[0] * this.lightColor[0] / 255 * 1.08, c[1] * this.lightColor[1] / 255 * 1.08, c[2] * this.lightColor[2] / 255 * 1.08], warm);
  }

  /** Scanline polygon fill in pixel coordinates; shader returns [colour, alpha] or null to skip. */
  fillPoly(pts: Array<[number, number]>, shader: (x: number, y: number, i: number) => void) {
    if (pts.length < 3) return;
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
    const xs: number[] = [];
    for (let y = y0; y <= y1; y++) {
      xs.length = 0;
      const yc = y + 0.5;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi <= yc && yj > yc) || (yj <= yc && yi > yc)) xs.push(xi + ((yc - yi) / (yj - yi)) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) shader(x, y, y * this.w + x);
      }
    }
  }

  /** Visit pixels in a box (pixel coordinates, clamped). */
  box(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number, i: number) => void) {
    const xa = Math.max(0, Math.floor(x0)), xb = Math.min(this.w - 1, Math.ceil(x1));
    const ya = Math.max(0, Math.floor(y0)), yb = Math.min(this.h - 1, Math.ceil(y1));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) fn(x, y, y * this.w + x);
  }

  /** Thick tapered line through pixel points (round caps), solid colour. */
  line(pts: Array<[number, number]>, w0: number, w1: number, color: RGB, alpha = 1, depth = 0, flowWeight = 0.4) {
    if (pts.length < 2) return;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const seg = Math.hypot(bx - ax, by - ay);
      const ang = Math.atan2(by - ay, bx - ax);
      const steps = Math.max(1, Math.ceil(seg / Math.max(0.5, Math.min(w0, w1) * 0.35)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
        const r = (w0 + (w1 - w0) * ((acc + seg * t) / (total || 1))) * 0.5;
        this.box(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y, idx) => {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          const cov = clamp(r + 0.5 - d, 0, 1);
          if (cov > 0) this.put(idx, color, cov * alpha, depth, ang, flowWeight);
        });
      }
      acc += seg;
    }
  }

  /** Like line(), but also handed to the painter as a real dry-media stroke drawn over the colour layers. */
  mark(pts: Array<[number, number]>, w0: number, w1: number, color: RGB, alpha = 1, depth = 0) {
    this.line(pts, w0, w1, color, alpha, depth);
    const t = depth * this.haze.amount;
    const c: RGB = [color[0] + (this.haze.color[0] - color[0]) * t, color[1] + (this.haze.color[1] - color[1]) * t, color[2] + (this.haze.color[2] - color[2]) * t];
    this.overlay.push({ pts: pts.map(([x, y]) => ({ x, y })), width: (w0 + w1) / 2, color: c, opacity: alpha * 0.9, owner: this.cur });
  }

  noise(x: number, y: number, scale: number, seed: number, oct = 3) {
    return fbm2D(x * scale, y * scale, oct, seed);
  }
}
