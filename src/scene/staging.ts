/** Staging for objects: a photo-studio backdrop, a road, and a reflection that mirrors only one element's pixels. */
import type { RGB } from '../core/paper';
import { clamp, hash2D, noise2D, smoothstep } from '../core/rng';
import { lighten, shade } from './elements';
import { mix, Ref, rgb } from './ref';
import type { SceneElement } from './types';

type El<T extends SceneElement['type']> = Extract<SceneElement, { type: T }>;

export function studio(ref: Ref, e: El<'studio'>) {
  const scale = ref.h / 1080;
  const wall = rgb(e.color ?? '#b4bcc6');
  const floor = rgb(e.floor ?? '#868c93');
  const glow = rgb(e.glow ?? '#fff6e6');
  const yh = ref.Y(e.y);
  const seam = ref.h * 0.05;
  // Softbox: a big soft light up and to the side, which lights the wall and leaves a sheen on the floor.
  const lx = ref.w * (ref.L[0] < 0 ? 0.3 : 0.7), ly = ref.h * 0.12;
  for (let y = 0; y < ref.h; y++) {
    const t = smoothstep(yh - seam, yh + seam, y);
    for (let x = 0; x < ref.w; x++) {
      const i = y * ref.w + x;
      const dx = (x - ref.w * 0.5) / ref.w, dy = (y - yh) / ref.h;
      const vign = 1 - clamp(dx * dx * 1.5 + Math.max(0, -dy) * 0.25, 0, 1) * 0.35;
      // Wall: bright toward the light, falling off to the corners.
      const wd = Math.hypot((x - lx) / ref.w, (y - ly) / ref.h * 1.3);
      let w = mix(shade(wall, 0.78, 0.3), lighten(wall, 0.25), Math.exp(-wd * wd * 6));
      // Floor: darker in front, lighter where it meets the wall, and a soft reflected softbox.
      const fd = clamp((y - yh) / (ref.h - yh), 0, 1);
      let f = mix(lighten(floor, 0.12), shade(floor, 0.7, 0.2), Math.pow(fd, 0.8));
      const sheen = Math.exp(-((((x - lx) / ref.w) / 0.22) ** 2 + ((fd - 0.18) / 0.3) ** 2));
      f = mix(f, glow, sheen * 0.22);
      let c = mix(w, f, t);
      c = [c[0] * vign, c[1] * vign, c[2] * vign];
      const n = (noise2D(x * 0.006 / scale, y * 0.01 / scale, 41) - 0.5) * 6 + (hash2D(x, y, 3) - 0.5) * 2;
      ref.put(i, [c[0] + n, c[1] + n, c[2] + n], 1, 0, 0, 0.95);
    }
  }
}

export function road(ref: Ref, e: El<'road'>) {
  const scale = ref.h / 1080;
  const y0 = Math.round(ref.Y(e.y0)), y1 = Math.min(ref.h - 1, Math.round(ref.Y(e.y1)));
  const asphalt = rgb(e.color ?? '#4a4b50');
  const paintC = rgb(e.line ?? '#e8e3d2');
  const mid = Math.round((y0 + y1) / 2);
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    for (let x = 0; x < ref.w; x++) {
      const i = y * ref.w + x;
      const g = noise2D(x * 0.05 / scale, y * 0.4 / scale, 61) * 0.5 + noise2D(x * 0.4 / scale, y * 0.4 / scale, 62) * 0.5;
      let c = mix(lighten(asphalt, 0.08), shade(asphalt, 0.8, 0.2), t);
      c = shade(c, 0.92 + g * 0.16);
      if (hash2D(x, y, 11) > 0.992) c = lighten(c, 0.35); // loose chippings
      // Wear: a darker band where the tyres run.
      c = mix(c, shade(c, 0.85), Math.exp(-(((t - 0.62) / 0.12) ** 2)) * 0.5);
      ref.put(i, c, 1, 0, 0, 0.5);
    }
  }
  // Edge lines, kerb at the far side, and a dashed centre line.
  const lw = Math.max(2, ref.h * 0.006);
  ref.line([[0, y0 + lw * 2], [ref.w, y0 + lw * 2]], lw, lw, paintC, 0.9);
  ref.line([[0, y1 - lw * 2], [ref.w, y1 - lw * 2]], lw * 1.4, lw * 1.4, paintC, 0.9);
  ref.line([[0, y0 - 1], [ref.w, y0 - 1]], lw * 2, lw * 2, shade(asphalt, 1.5), 0.8);
  const dash = ref.w * 0.07, gap = ref.w * 0.05;
  for (let x = -dash * 0.3; x < ref.w; x += dash + gap) ref.line([[x, mid], [x + dash, mid]], lw * 0.9, lw * 0.9, paintC, 0.8);
}

export function reflect(ref: Ref, e: El<'reflect'>) {
  const yb = Math.round(ref.Y(e.y));
  const len = Math.round(ref.S(e.length ?? 0.16));
  const k = e.strength ?? 0.55;
  const src = ref.rgb.slice();
  for (let d = 1; d <= len && yb + d < ref.h; d++) {
    const fade = Math.pow(1 - d / len, 1.6);
    const sy = yb - d;
    if (sy < 0) break;
    for (let x = 0; x < ref.w; x++) {
      // A little horizontal wobble so it reads as a polished floor, not a flipped copy.
      const sx = clamp(Math.round(x + (noise2D(x * 0.02, d * 0.3, 77) - 0.5) * 3), 0, ref.w - 1);
      if (ref.owner[sy * ref.w + sx] !== e.of) continue;
      const p = (sy * ref.w + sx) * 3;
      const c: RGB = [src[p] * 0.92, src[p + 1] * 0.92, src[p + 2] * 0.95];
      const i = (yb + d) * ref.w + x;
      const a = k * fade;
      const q = i * 3;
      ref.rgb[q] += (c[0] - ref.rgb[q]) * a;
      ref.rgb[q + 1] += (c[1] - ref.rgb[q + 1]) * a;
      ref.rgb[q + 2] += (c[2] - ref.rgb[q + 2]) * a;
    }
  }
}
