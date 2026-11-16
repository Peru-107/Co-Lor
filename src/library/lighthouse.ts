/** Banded lighthouse on rocks with a keeper's cottage; the lantern glows and throws a beam at dusk and night. */
import type { RGB } from '../core/paper';
import { clamp, createRng, noise2D, smoothstep } from '../core/rng';
import { lighten, sculpt, shade, type PxPart } from '../scene/elements';
import { mix, Ref } from '../scene/ref';
import type { LibraryEntry } from './types';
import { readColours } from './util';

function draw(ref: Ref, at: { x: number; y: number; size: number; facing: 1 | -1; depth: number }, o: Record<string, any>) {
  const H = at.size, cx = at.x, base = at.y, depth = at.depth;
  const white: RGB = [236, 232, 222];
  const band: RGB = o.band;
  const scale = ref.h / 1080;
  const rng = createRng(Math.floor(cx * 7 + base));

  // Rocks it stands on.
  const rocks: PxPart[] = [];
  for (let k = 0; k < 7; k++) {
    const rx = cx + (rng() - 0.5) * H * 0.42, r = H * (0.05 + rng() * 0.06);
    rocks.push({ kind: 'ell', cx: rx, cy: base + r * 0.2, rx: r * 1.4, ry: r, ang: (rng() - 0.5) * 0.4 });
  }
  sculpt(ref, rocks, [92, 86, 82], { texture: 'stone', depth });

  // Keeper's cottage beside the tower.
  const kw = H * 0.2, kh = H * 0.11;
  const kx0 = at.facing > 0 ? cx + H * 0.1 : cx - H * 0.1 - kw;
  ref.fillPoly([[kx0, base], [kx0 + kw, base], [kx0 + kw, base - kh], [kx0, base - kh]], (_x, _y, i) => ref.put(i, ref.tone(white, shade(white, 0.5, 0.6), lighten(white, 0.3), ref.lit(0, 0, 1) - 0.08), 1, depth, Math.PI / 2, 0.4));
  ref.fillPoly([[kx0 - kw * 0.06, base - kh], [kx0 + kw * 1.06, base - kh], [kx0 + kw / 2, base - kh - kw * 0.32]], (_x, _y, i) => ref.put(i, ref.tone(band, shade(band, 0.45, 0.5), lighten(band, 0.3), ref.lit(0.3, -0.7, 0.6)), 1, depth, -0.5, 0.4));
  for (const wx of [0.25, 0.65]) ref.fillPoly([[kx0 + kw * wx, base - kh * 0.35], [kx0 + kw * (wx + 0.12), base - kh * 0.35], [kx0 + kw * (wx + 0.12), base - kh * 0.7], [kx0 + kw * wx, base - kh * 0.7]], (_x, _y, i) => ref.put(i, o.lit ? [255, 205, 120] : [50, 48, 54], 1, depth));

  // Tower: tapered cylinder with painted bands and small windows.
  const th = H * 0.72, r0 = H * 0.085, r1 = H * 0.055;
  const rad = (y: number) => r0 + (r1 - r0) * ((base - y) / th);
  ref.fillPoly([[cx - r0, base], [cx + r0, base], [cx + r1, base - th], [cx - r1, base - th]], (x, y, i) => {
    const t = (base - y) / th;
    const nx = clamp((x + 0.5 - cx) / rad(y), -1, 1);
    const l = ref.lit(nx, 0, Math.sqrt(1 - nx * nx)) + (noise2D(x * 0.05 / scale, y * 0.05 / scale, 3) - 0.5) * 0.08;
    const c = Math.floor(t * 6) % 2 === 1 ? band : white;
    ref.put(i, ref.tone(c, shade(c, 0.45, 0.6), lighten(c, 0.35), l), 1, depth, Math.PI / 2, 0.55);
  });
  for (const t of [0.25, 0.48, 0.7]) {
    const wy = base - th * t, ww = H * 0.014;
    ref.fillPoly([[cx - ww, wy], [cx + ww, wy], [cx + ww, wy - ww * 2.4], [cx - ww, wy - ww * 2.4]], (_x, _y, i) => ref.put(i, o.lit ? [255, 210, 130] : [40, 38, 44], 1, depth));
  }

  // Gallery, lantern room, dome.
  const gy = base - th;
  ref.fillPoly([[cx - r1 * 1.5, gy + H * 0.012], [cx + r1 * 1.5, gy + H * 0.012], [cx + r1 * 1.5, gy - H * 0.008], [cx - r1 * 1.5, gy - H * 0.008]], (_x, _y, i) => ref.put(i, [36, 34, 38], 1, depth));
  ref.mark([[cx - r1 * 1.5, gy - H * 0.04], [cx + r1 * 1.5, gy - H * 0.04]], H * 0.005, H * 0.005, [30, 28, 32], 1, depth);
  for (let k = 0; k <= 6; k++) { const px = cx - r1 * 1.5 + (k / 6) * r1 * 3; ref.mark([[px, gy - H * 0.008], [px, gy - H * 0.04]], H * 0.004, H * 0.004, [30, 28, 32], 1, depth); }
  const lw = r1 * 0.85, lh = H * 0.1, ly = gy - H * 0.008;
  const lamp: RGB = o.lit ? [255, 236, 170] : [176, 196, 206];
  ref.fillPoly([[cx - lw, ly], [cx + lw, ly], [cx + lw, ly - lh], [cx - lw, ly - lh]], (x, _y, i) => {
    const nx = (x + 0.5 - cx) / lw;
    const c = o.lit ? mix([255, 255, 240], lamp, Math.abs(nx)) : mix(lamp, [90, 104, 116], smoothstep(-0.2, 1, nx));
    ref.put(i, c, 1, depth, Math.PI / 2, 0.4);
  });
  for (const nx of [-0.5, 0, 0.5]) ref.mark([[cx + nx * lw, ly], [cx + nx * lw, ly - lh]], H * 0.004, H * 0.004, [40, 38, 42], 1, depth);
  sculpt(ref, [{ kind: 'ell', cx, cy: ly - lh, rx: lw * 1.15, ry: H * 0.05, ang: 0 }], [40, 36, 40], { depth, clip: (_x, y) => y <= ly - lh + 1 });
  ref.mark([[cx, ly - lh - H * 0.05], [cx, ly - lh - H * 0.09]], H * 0.006, H * 0.003, [30, 28, 32], 1, depth);

  if (o.lit) {
    const lyc = ly - lh / 2;
    // Beam: a long soft wedge toward the open sea, plus the lamp's halo.
    const dir = -at.facing, len = H * 2.4, spread = 0.09;
    ref.box(Math.min(cx, cx + dir * len), lyc - len * spread * 1.8, Math.max(cx, cx + dir * len), lyc + len * spread * 1.8, (x, y, i) => {
      const dx = (x - cx) * dir, dy = y - lyc;
      if (dx <= 0) return;
      const a = Math.exp(-((dy / (dx * spread + H * 0.02)) ** 2)) * Math.exp(-dx / len) * 0.4;
      if (a > 0.01) ref.put(i, [255, 238, 190], a, 0);
    });
    ref.box(cx - H * 0.25, lyc - H * 0.25, cx + H * 0.25, lyc + H * 0.25, (x, y, i) => {
      const d = Math.hypot(x - cx, y - lyc) / (H * 0.08);
      ref.put(i, [255, 236, 180], Math.exp(-d * d) * 0.7);
    });
  }
}

export const lighthouse: LibraryEntry = {
  name: 'lighthouse',
  words: ['lighthouse', 'beacon'],
  absorbs: ['lantern', 'lamp', 'beam'],
  defaults: { band: [176, 40, 36] },
  extract(text) {
    const { main } = readColours(text, { _: ['boat', 'boats', 'sky', 'sea', 'rocks', 'rock', 'roof', 'door'] });
    return main ? { band: main } : {};
  },
  placement: { size: 0.5, prefers: ['water'], height: 1.15, plural: 2 },
  draw,
};
