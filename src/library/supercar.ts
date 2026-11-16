/**
 * Mid-engine supercar, side view. Built from notes/ferrari-spec.txt: wedge profile, wheel arches cut out of the body,
 * gloss paint as tone bands (sky reflection on top, sharp shoulder highlight, darker lower body, fender-arc highlights),
 * dark glass with a reflection streak, side intake behind the door, mirror, narrow headlight, circular taillight,
 * black splitter / skirts / diffuser with fins, multi-spoke dark wheels over ventilated discs and coloured calipers.
 * No badges or logos are drawn: the centre caps are plain.
 *
 * Units: u along the car (0 = rear bumper, 1 = nose), v up from the road, both in car lengths.
 */
import type { RGB } from '../core/paper';
import { clamp, noise2D, smoothstep } from '../core/rng';
import { shade } from '../scene/elements';
import { mix, Ref } from '../scene/ref';
import type { LibraryEntry } from './types';
import { frame, groundShadow, profile, readColours } from './util';

// Top of the body, rear to nose.
const TOP: Array<[number, number]> = [
  [0.0, 0.105], [0.004, 0.15], [0.014, 0.176], [0.035, 0.19], [0.1, 0.19], [0.2, 0.2], [0.3, 0.215], [0.37, 0.238],
  [0.43, 0.258], [0.5, 0.263], [0.555, 0.252], [0.6, 0.228], [0.66, 0.192], [0.7, 0.173], [0.76, 0.161], [0.84, 0.149],
  [0.9, 0.133], [0.95, 0.113], [0.985, 0.091], [1.0, 0.07],
];
const BOTTOM = 0.04;
const FRONT = { u: 0.8, v: 0.074, r: 0.072, arch: 0.088 };
const REAR = { u: 0.215, v: 0.076, r: 0.075, arch: 0.093 };
const vTop = profile(TOP);

function archArc(a: typeof FRONT, steps = 18): Array<[number, number]> {
  // From where the arch meets the sill on the front side, over the top, to the rear side.
  const th0 = Math.asin(clamp((BOTTOM - a.v) / a.arch, -1, 1));
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= steps; k++) {
    const th = th0 + (Math.PI - 2 * th0) * (k / steps);
    pts.push([a.u + a.arch * Math.cos(th), a.v + a.arch * Math.sin(th)]);
  }
  return pts;
}

function bodyOutline(): Array<[number, number]> {
  return [
    ...TOP,
    [0.998, 0.052], [0.985, BOTTOM],
    ...archArc(FRONT),
    ...archArc(REAR),
    [0.02, 0.046], [0.0, 0.07],
  ];
}

const inPoly = (pts: Array<[number, number]>, u: number, v: number) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ui, vi] = pts[i], [uj, vj] = pts[j];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) c = !c;
  }
  return c;
};

const WINDOW: Array<[number, number]> = [
  [0.395, 0.212], [0.44, 0.24], [0.5, 0.247], [0.553, 0.239], [0.585, 0.222], [0.642, 0.188], [0.6, 0.184], [0.5, 0.181], [0.43, 0.189],
];
const INTAKE: Array<[number, number]> = [[0.405, 0.168], [0.36, 0.173], [0.318, 0.158], [0.302, 0.126], [0.318, 0.111], [0.36, 0.119], [0.4, 0.148]];
const HEADLIGHT: Array<[number, number]> = [[0.905, 0.131], [0.955, 0.114], [0.986, 0.094], [0.976, 0.088], [0.945, 0.103], [0.908, 0.121]];

function drawWheel(ref: Ref, P: (u: number, v: number) => [number, number], L: number, f: 1 | -1, w: typeof FRONT, finish: RGB, caliper: RGB, depth: number) {
  const [cx, cy] = P(w.u, w.v);
  const r = w.r * L;
  const rim = r * 0.74, disc = r * 0.6, hub = r * 0.12;
  const rubber: RGB = [30, 30, 33];
  const metal = mix(finish, [210, 212, 216], 0.12);
  ref.box(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y, i) => {
    const dx = (x + 0.5 - cx) * f, dy = y + 0.5 - cy;
    const d = Math.hypot(dx, dy);
    if (d > r + 0.5) return;
    const a = clamp(r + 0.5 - d, 0, 1);
    const th = Math.atan2(dy, dx);
    const tang = Math.atan2(dy, dx * f) + Math.PI / 2;
    let c: RGB;
    if (d > rim + r * 0.035) {
      // Tyre: low sidewall, lit from above, a faint ring of tread at the very edge.
      const k = (d - rim) / (r - rim);
      const up = -dy / d;
      c = mix(rubber, [70, 70, 74], clamp(0.25 + up * 0.35 - Math.abs(k - 0.45) * 0.6, 0, 1));
      if (k > 0.9) c = mix(c, [16, 16, 18], 0.6);
    } else if (d > rim) {
      c = mix(metal, [235, 236, 240], clamp(0.35 - dy / d * 0.45, 0, 1)); // polished rim lip
    } else {
      // Ten spokes in five pairs; each is lit on its upper edge.
      let spoke = 0;
      for (let k = 0; k < 5; k++) {
        for (const off of [-0.11, 0.11]) {
          let dt = th - (k * 2 * Math.PI) / 5 - off - 0.3;
          dt = Math.atan2(Math.sin(dt), Math.cos(dt));
          const half = r * (0.05 - 0.018 * (d / rim));
          const across = dt * d;
          if (Math.abs(across) < half && d > hub * 0.8) spoke = Math.max(spoke, 1 - Math.abs(across) / half);
        }
      }
      if (d < hub) {
        c = mix(finish, [255, 255, 255], 0.15 - dy / r);
        if (d < hub * 0.45) c = caliper; // small plain centre cap
      } else if (spoke > 0) {
        c = mix(shade(metal, 0.7), mix(metal, [230, 232, 236], 0.4), smoothstep(0, 1, spoke) * (0.6 - dy / d * 0.4));
      } else {
        // Behind the spokes: caliper over the upper rear of the disc, ventilated disc, dark barrel.
        const calAng = Math.atan2(Math.sin(th + 2.2), Math.cos(th + 2.2)); // centred on the upper rear (-2.2 rad)
        if (d > disc * 0.58 && d < disc * 1.05 && Math.abs(calAng) < 0.55) c = mix(caliper, shade(caliper, 0.6), clamp((d - disc * 0.6) / (disc * 0.5), 0, 1) * 0.5);
        else if (d < disc) {
          const rings = 0.5 + 0.5 * Math.cos(d * 1.2);
          const holes = (Math.sin(th * 24) > 0.85 && d > disc * 0.55) ? 0.55 : 1;
          c = mix([78, 76, 74], [150, 148, 144], rings * 0.6 * holes);
        } else c = [20, 20, 22];
      }
    }
    ref.put(i, c, a, depth, tang, 0.65);
  });
}

function draw(ref: Ref, at: { x: number; y: number; size: number; facing: 1 | -1; depth: number }, o: Record<string, any>) {
  const { P, UV, poly } = frame(at);
  const L = at.size, f = at.facing, depth = at.depth;
  const paint: RGB = o.paint;
  const env: RGB = o.env ?? [170, 176, 190];
  const finish: RGB = o.wheel;
  const caliper: RGB = o.caliper;
  const lum = (paint[0] * 0.3 + paint[1] * 0.59 + paint[2] * 0.11) / 255;
  const deep = shade(paint, lum > 0.6 ? 0.55 : 0.42, 0.25);
  const hi = mix(paint, [255, 250, 245], lum > 0.6 ? 0.35 : 0.5);
  const peak = mix(paint, [255, 255, 255], 0.85);
  const scale = ref.h / 1080;

  groundShadow(ref, at.x, at.y + L * 0.004, L * 0.52, L * 0.03, 0.75, depth);
  for (const w of [FRONT, REAR]) groundShadow(ref, P(w.u, 0)[0], at.y, w.r * L * 1.1, L * 0.008, 0.9, depth);

  // Dark wheel-arch openings, then wheels, then the body (arches are cut out of it).
  for (const w of [FRONT, REAR]) {
    const [cx, cy] = P(w.u, w.v);
    ref.box(cx - w.arch * L, cy - w.arch * L, cx + w.arch * L, cy + w.arch * L, (x, y, i) => {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / (w.arch * L);
      if (d < 1 && y < at.y - BOTTOM * L * 0.3) ref.put(i, [14, 11, 12], clamp((1 - d) * w.arch * L, 0, 1), depth);
    });
  }
  drawWheel(ref, P, L, f, REAR, finish, caliper, depth);
  drawWheel(ref, P, L, f, FRONT, finish, caliper, depth);

  const outline = bodyOutline();
  ref.fillPoly(poly(outline), (x, y, i) => {
    const [u, v] = UV(x, y);
    const top = vTop(u);
    const s = clamp((v - BOTTOM) / (top - BOTTOM), 0, 1);
    // Base shading: tucked-under sill is dark, flank mid-tone, shoulder catches a sharp line of light.
    let c = mix(deep, paint, smoothstep(0.0, 0.42, s));
    c = mix(c, shade(paint, 0.8), smoothstep(0.42, 0.5, s) * (1 - smoothstep(0.5, 0.56, s)) * 0.7);
    const shoulder = Math.exp(-(((s - 0.58) / 0.025) ** 2));
    c = mix(c, peak, shoulder * 0.5);
    // Upper surfaces roll over and mirror the surroundings.
    const roll = smoothstep(0.62, 0.95, s);
    c = mix(c, mix(hi, env, 0.45), roll * 0.55);
    c = mix(c, shade(paint, 0.5), smoothstep(0.965, 1, s) * 0.6); // dark edge where the surface turns away
    // Long studio highlight down the flank.
    c = mix(c, hi, Math.exp(-(((s - 0.32) / 0.06) ** 2)) * 0.22 * smoothstep(0.1, 0.4, u) * (1 - smoothstep(0.85, 0.98, u)));
    // Muscular rear haunch and front fender bulge.
    c = mix(c, hi, Math.exp(-(((u - 0.2) / 0.1) ** 2 + ((s - 0.66) / 0.14) ** 2)) * 0.45);
    c = mix(c, hi, Math.exp(-(((u - 0.81) / 0.07) ** 2 + ((s - 0.7) / 0.18) ** 2)) * 0.3);
    // Fender arcs: thin highlight just above each arch, dark lip right at its edge.
    for (const w of [FRONT, REAR]) {
      const d = Math.hypot(u - w.u, v - w.v);
      if (v > w.v - 0.01) {
        c = mix(c, peak, Math.exp(-(((d - w.arch - 0.018) / 0.008) ** 2)) * 0.3);
        c = mix(c, [20, 10, 12], smoothstep(w.arch + 0.008, w.arch, d) * 0.85);
      }
    }
    // Front bumper tucks under; rear face is in shadow.
    c = mix(c, deep, smoothstep(0.975, 1.0, u) * 0.4 + smoothstep(0.03, 0.0, u) * 0.5);
    const grain = 1 + (noise2D(x * 0.03 / scale, y * 0.08 / scale, 5) - 0.5) * 0.04;
    c = [c[0] * grain, c[1] * grain, c[2] * grain];
    const slope = Math.atan2(-(vTop(u + 0.01) - vTop(u - 0.01)), 0.02 * f);
    ref.put(i, c, 1, depth, s > 0.6 ? slope : 0, 0.75);
  });

  // Side glass: dark, lighter toward the top, one diagonal reflection streak and the horizon reflected low down.
  ref.fillPoly(poly(WINDOW), (x, y, i) => {
    const [u, v] = UV(x, y);
    let c: RGB = mix([18, 20, 26], [62, 68, 82], smoothstep(0.18, 0.25, v));
    c = mix(c, env, 0.18);
    const streak = (u - 0.47) * 1 + (v - 0.215) * 1.3;
    c = mix(c, [210, 218, 230], Math.exp(-((streak / 0.012) ** 2)) * 0.55 + Math.exp(-(((streak - 0.035) / 0.005) ** 2)) * 0.35);
    c = mix(c, mix(env, [255, 255, 255], 0.2), smoothstep(0.192, 0.184, v) * 0.35);
    ref.put(i, c, 1, depth, 0, 0.6);
  });
  ref.mark(poly([...WINDOW, WINDOW[0]]), L * 0.005, L * 0.005, [16, 16, 18], 1, depth);
  ref.mark(poly([[0.585, 0.224], [0.617, 0.19]]), L * 0.006, L * 0.005, [16, 16, 18], 1, depth); // A-pillar

  // Engine-cover glass behind the cabin, with louvres.
  ref.fillPoly(poly([[0.25, 0.203], [0.36, 0.23], [0.372, 0.226], [0.262, 0.199]]), (_x, _y, i) => ref.put(i, [24, 22, 26], 1, depth, 0, 0.5));

  // Side intake: deep recess with a lit upper lip and a dark mesh.
  ref.fillPoly(poly(INTAKE), (x, y, i) => {
    const [u, v] = UV(x, y);
    const k = smoothstep(0.112, 0.17, v);
    let c: RGB = mix([12, 10, 12], [44, 34, 36], (1 - k) * 0.6 + (u - 0.3) * 1.5);
    if (Math.sin((u * 600)) > 0.7 && Math.sin(v * 600) > 0.2) c = mix(c, [60, 60, 64], 0.35);
    ref.put(i, c, 1, depth, 0, 0.5);
  });
  ref.mark(poly([[0.405, 0.168], [0.36, 0.174], [0.318, 0.159]]), L * 0.006, L * 0.003, peak, 0.9, depth);
  ref.mark(poly([[0.302, 0.126], [0.318, 0.111], [0.36, 0.119], [0.4, 0.148]]), L * 0.005, L * 0.003, deep, 0.9, depth);

  // Door shut line, flush handle, mirror.
  ref.mark(poly([[0.64, 0.187], [0.651, 0.12], [0.642, 0.058]]), L * 0.003, L * 0.003, shade(paint, 0.3), 0.9, depth);
  ref.mark(poly([[0.405, 0.168], [0.41, 0.1], [0.405, 0.058]]), L * 0.003, L * 0.003, shade(paint, 0.3), 0.9, depth);
  ref.mark(poly([[0.47, 0.163], [0.505, 0.164]]), L * 0.004, L * 0.004, shade(paint, 0.35), 0.9, depth);
  ref.line(poly([[0.592, 0.186], [0.6, 0.204]]), L * 0.008, L * 0.006, [20, 20, 22], 1, depth);
  ref.fillPoly(poly([[0.578, 0.205], [0.6, 0.218], [0.628, 0.214], [0.632, 0.204], [0.6, 0.198]]), (x, y, i) => {
    const [, v] = UV(x, y);
    ref.put(i, v > 0.207 ? mix(paint, hi, smoothstep(0.207, 0.216, v)) : [22, 20, 22], 1, depth, 0, 0.6);
  });

  // Headlight: dark housing under a clear lens with a bright LED strip.
  ref.fillPoly(poly(HEADLIGHT), (x, y, i) => {
    const [u] = UV(x, y);
    ref.put(i, mix([30, 32, 38], [150, 160, 175], smoothstep(0.9, 0.98, u) * 0.6), 1, depth, 0, 0.5);
  });
  ref.mark(poly([[0.912, 0.124], [0.95, 0.111], [0.978, 0.095]]), L * 0.004, L * 0.003, o.lit ? [255, 250, 230] : [235, 240, 248], 1, depth);
  if (o.lit) { const [hx, hy] = P(0.99, 0.1); glowAt(ref, hx, hy, L * 0.06, [255, 245, 220], 0.5); }

  // Front: low intake opening, black splitter with an upturned end.
  ref.fillPoly(poly([[0.93, 0.064], [0.988, 0.06], [0.996, 0.05], [0.94, 0.052]]), (_x, _y, i) => ref.put(i, [16, 14, 16], 1, depth));
  const carbon = (x: number, y: number) => mix([18, 18, 20], [44, 44, 48], ((Math.floor(x / (3 * scale)) + Math.floor(y / (3 * scale))) % 2) * 0.5);
  ref.fillPoly(poly([[0.86, 0.042], [1.008, 0.042], [1.012, 0.03], [0.88, 0.028]]), (x, y, i) => ref.put(i, carbon(x, y), 1, depth, 0, 0.6));

  // Side skirt between the arches.
  ref.fillPoly(poly([[0.305, 0.056], [0.716, 0.053], [0.716, 0.031], [0.305, 0.033]]), (x, y, i) => {
    const [, v] = UV(x, y);
    ref.put(i, mix(carbon(x, y), [80, 80, 86], smoothstep(0.048, 0.055, v) * 0.6), 1, depth, 0, 0.6);
  });

  // Rear: diffuser with fins, circular taillight, spoiler lip.
  ref.fillPoly(poly([[0.004, 0.078], [0.06, 0.062], [0.128, 0.046], [0.128, 0.028], [0.02, 0.034], [-0.006, 0.052]]), (x, y, i) => ref.put(i, carbon(x, y), 1, depth, Math.PI / 2, 0.5));
  for (const fu of [0.02, 0.045, 0.07, 0.095]) ref.mark(poly([[fu, 0.03], [fu + 0.004, 0.064 - fu * 0.2]]), L * 0.004, L * 0.003, [70, 70, 76], 1, depth);
  const [tx, ty] = P(0.006, 0.148);
  ref.box(tx - L * 0.02, ty - L * 0.02, tx + L * 0.02, ty + L * 0.02, (x, y, i) => {
    const d = Math.hypot((x + 0.5 - tx) / (L * 0.007), (y + 0.5 - ty) / (L * 0.014));
    if (d < 1) ref.put(i, d > 0.55 ? [235, 50, 40] : [60, 14, 14], clamp((1 - d) * 6, 0, 1), depth);
  });
  if (o.lit) glowAt(ref, tx, ty, L * 0.05, [255, 60, 40], 0.45);
  ref.mark(poly([[0.004, 0.176], [0.03, 0.193], [0.07, 0.192]]), L * 0.005, L * 0.004, [20, 20, 22], 1, depth);
}

function glowAt(ref: Ref, x: number, y: number, r: number, c: RGB, k: number) {
  ref.box(x - r * 2, y - r * 2, x + r * 2, y + r * 2, (px, py, i) => {
    const d = Math.hypot(px - x, py - y) / r;
    ref.put(i, c, Math.exp(-d * d * 2) * k);
  });
}

const PARTS = {
  caliper: ['caliper', 'calipers', 'brake', 'brakes'],
  wheel: ['wheel', 'wheels', 'rim', 'rims', 'alloy', 'alloys'],
  _: ['emblem', 'emblems', 'shield', 'badge', 'badges', 'logo', 'horse', 'cap', 'caps', 'carbon', 'fibre', 'fiber', 'trim', 'mesh', 'glass',
    'window', 'windows', 'tyre', 'tyres', 'tire', 'tires', 'interior', 'seat', 'seats', 'stripe', 'stripes', 'border', 'housing', 'housings',
    'splitter', 'diffuser', 'skirt', 'skirts', 'grille', 'components', 'lens', 'light', 'lights', 'taillight', 'headlight', 'ring', 'section',
    'sections', 'material', 'materials', 'roof', 'mirror', 'mirrors', 'finishes', 'metallic', 'lower', 'underneath'],
};

export const supercar: LibraryEntry = {
  name: 'supercar',
  words: ['car', 'supercar', 'hypercar', 'ferrari', 'lamborghini', 'porsche', 'mclaren', 'coupe', 'racecar', 'roadster', 'automobile', 'vehicle'],
  phrases: ['sports car', 'race car', 'racing car'],
  absorbs: ['horse', 'prancing', 'emblem', 'shield', 'badge', 'wheel', 'tyre', 'tire', 'caliper', 'bonnet', 'hood', 'bumper', 'headlight', 'taillight', 'spoiler', 'diffuser', 'door', 'mirror', 'windshield', 'windscreen', 'cabin', 'engine', 'exhaust'],
  defaults: { paint: [176, 14, 22], caliper: [236, 196, 20], wheel: [40, 40, 44] },
  extract(text) {
    const { main, parts } = readColours(text, PARTS);
    const o: Record<string, any> = {};
    if (main) o.paint = main;
    if (parts.caliper) o.caliper = parts.caliper;
    if (parts.wheel) o.wheel = parts.wheel;
    if (/\b(silver|chrome|polished) (alloy |forged )?(wheel|rim)/.test(text)) o.wheel = [170, 174, 180];
    if (/\bgold(en)? (alloy |forged )?(wheel|rim)/.test(text)) o.wheel = [190, 150, 70];
    return o;
  },
  placement: { size: 0.62, prefers: ['road', 'studio', 'land'], height: 0.27, plural: 2 },
  draw,
};
