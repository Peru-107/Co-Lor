/** Tower windmill with a cap and four lattice sails. Size = height to the top of the cap. */
import type { RGB } from '../core/paper';
import { clamp, noise2D } from '../core/rng';
import { lighten, sculpt, shade } from '../scene/elements';
import { mix, Ref } from '../scene/ref';
import type { LibraryEntry } from './types';
import { groundShadow, readColours } from './util';

function draw(ref: Ref, at: { x: number; y: number; size: number; facing: 1 | -1; depth: number }, o: Record<string, any>) {
  const H = at.size, cx = at.x, base = at.y, depth = at.depth;
  const body: RGB = o.color;
  const scale = ref.h / 1080;
  groundShadow(ref, cx, base, H * 0.22, H * 0.02, 0.5, depth);
  const bh = H * 0.72, r0 = H * 0.15, r1 = H * 0.095;
  const rad = (y: number) => r0 + (r1 - r0) * ((base - y) / bh);
  ref.fillPoly([[cx - r0, base], [cx + r0, base], [cx + r1, base - bh], [cx - r1, base - bh]], (x, y, i) => {
    const nx = clamp((x + 0.5 - cx) / rad(y), -1, 1);
    const plank = Math.sin((y / (H * 0.018)) * Math.PI) > 0.85 ? -0.08 : 0;
    const l = ref.lit(nx, 0, Math.sqrt(1 - nx * nx)) + plank + (noise2D(x * 0.05 / scale, y * 0.03 / scale, 9) - 0.5) * 0.1;
    ref.put(i, ref.tone(body, shade(body, 0.42, 0.6), lighten(body, 0.3), l), 1, depth, Math.PI / 2, 0.55);
  });
  // Stage (balcony), door, upper window.
  const sy = base - bh * 0.32;
  ref.fillPoly([[cx - r0 * 1.25, sy], [cx + r0 * 1.25, sy], [cx + r0 * 1.25, sy - H * 0.015], [cx - r0 * 1.25, sy - H * 0.015]], (_x, _y, i) => ref.put(i, [52, 40, 32], 1, depth));
  const dw = H * 0.045;
  ref.fillPoly([[cx - dw, base], [cx + dw, base], [cx + dw, base - H * 0.12], [cx, base - H * 0.14], [cx - dw, base - H * 0.12]], (_x, _y, i) => ref.put(i, o.lit ? [255, 200, 120] : [44, 34, 30], 1, depth));
  ref.fillPoly([[cx - dw * 0.7, sy - H * 0.08], [cx + dw * 0.7, sy - H * 0.08], [cx + dw * 0.7, sy - H * 0.13], [cx - dw * 0.7, sy - H * 0.13]], (_x, _y, i) => ref.put(i, o.lit ? [255, 205, 130] : [44, 36, 34], 1, depth));
  // Cap.
  const capY = base - bh;
  sculpt(ref, [{ kind: 'ell', cx, cy: capY, rx: r1 * 1.3, ry: H * 0.09, ang: 0 }], o.cap, { depth, texture: 'bark', clip: (_x, y) => y <= capY + 1 });
  // Sails: four arms from the hub, each with a lattice of canvas on one side.
  const hx = cx + at.facing * r1 * 0.9, hy = capY - H * 0.035, R = H * 0.55;
  const a0 = o.angle ?? 0.4;
  const canvas: RGB = o.sail;
  for (let k = 0; k < 4; k++) {
    const a = a0 + (k * Math.PI) / 2;
    const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
    const w = H * 0.085;
    const p0 = 0.18, p1 = 1;
    const quad: Array<[number, number]> = [
      [hx + ux * R * p0, hy + uy * R * p0], [hx + ux * R * p1, hy + uy * R * p1],
      [hx + ux * R * p1 + px * w, hy + uy * R * p1 + py * w], [hx + ux * R * p0 + px * w, hy + uy * R * p0 + py * w],
    ];
    ref.fillPoly(quad, (x, y, i) => {
      const along = ((x - hx) * ux + (y - hy) * uy) / R, across = ((x - hx) * px + (y - hy) * py) / w;
      const grid = Math.abs(((along * 9) % 1) - 0.5) > 0.44 || Math.abs(((across * 3) % 1) - 0.5) > 0.42;
      ref.put(i, grid ? [70, 54, 40] : mix(canvas, shade(canvas, 0.7), 0.3 - across * 0.3), grid ? 1 : 0.92, depth, a, 0.6);
    });
    ref.mark([[hx, hy], [hx + ux * R, hy + uy * R]], H * 0.014, H * 0.007, [58, 44, 34], 1, depth);
  }
  sculpt(ref, [{ kind: 'ell', cx: hx, cy: hy, rx: H * 0.025, ry: H * 0.025, ang: 0 }], [60, 46, 36], { depth });
}

export const windmill: LibraryEntry = {
  name: 'windmill',
  words: ['windmill', 'mill'],
  absorbs: ['sail', 'sails', 'blade', 'blades'],
  defaults: { color: [150, 112, 78], cap: [86, 62, 44], sail: [228, 216, 192] },
  extract(text) {
    const { main } = readColours(text, { _: ['sky', 'field', 'fields', 'flower', 'flowers', 'tulip', 'tulips', 'roof', 'door'] });
    return main ? { color: main } : {};
  },
  placement: { size: 0.5, prefers: ['land'], height: 1.3, plural: 3 },
  draw,
};
