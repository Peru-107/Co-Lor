import { RGB } from '../core/paper';
import { clamp, createRng, hash2D, lerp, noise2D, Rng, smoothstep } from '../core/rng';
import { mix, Ref, rgb, scaleRGB } from './ref';
import { drawLibrary } from '../library';
import { reflect, road, studio } from './staging';
import type { Part, SceneElement, Texture, TreeKind } from './types';

type El<T extends SceneElement['type']> = Extract<SceneElement, { type: T }>;

export const shade = (c: RGB, k: number, cool = 0): RGB => [c[0] * k * (1 - cool * 0.4), c[1] * k * (1 - cool * 0.15), c[2] * k * (1 + cool * 0.25)];
export const lighten = (c: RGB, k: number): RGB => mix(c, [255, 248, 230], k);

// ---------------------------------------------------------------- sculpted solids (the Jatayu technique)

export type PxPart =
  | { kind: 'cap'; ax: number; ay: number; bx: number; by: number; ra: number; rb: number }
  | { kind: 'ell'; cx: number; cy: number; rx: number; ry: number; ang: number };

export function partsToPx(ref: Ref, parts: Part[]): PxPart[] {
  return parts.map((p) =>
    'capsule' in p
      ? { kind: 'cap' as const, ax: ref.X(p.capsule[0]), ay: ref.Y(p.capsule[1]), bx: ref.X(p.capsule[2]), by: ref.Y(p.capsule[3]), ra: ref.S(p.capsule[4]), rb: ref.S(p.capsule[5]) }
      : { kind: 'ell' as const, cx: ref.X(p.ellipse[0]), cy: ref.Y(p.ellipse[1]), rx: ref.S(p.ellipse[2]), ry: ref.S(p.ellipse[3]), ang: p.ellipse[4] ?? 0 }
  );
}

function textureMod(tex: Texture, s: number, q: number, x: number, y: number, scale: number): number {
  switch (tex) {
    case 'bark': return (noise2D(s * 0.02 / scale, q * 0.5 / scale, 31) - 0.5) * 0.5;
    case 'fur': return (noise2D(s * 0.05 / scale, q * 0.9 / scale, 47) - 0.5) * 0.4;
    case 'cloth': return (noise2D(x * 0.012 / scale, y * 0.03 / scale, 53) - 0.5) * 0.35;
    case 'stone': return (noise2D(x * 0.05 / scale, y * 0.05 / scale, 61) - 0.5) * 0.3 - (hash2D(x >> 2, y >> 2, 7) > 0.97 ? 0.15 : 0);
    case 'scales':
    case 'feathers': {
      const cs = (tex === 'scales' ? 7 : 14) * scale;
      const row = Math.floor(s / cs);
      const fu = ((s / cs) % 1 + 1) % 1;
      const fv = (((q + (row % 2) * cs * 0.5) / cs) % 1 + 1) % 1;
      const rim = Math.hypot(fu - 0.3, (fv - 0.5) * 1.2);
      return -smoothstep(0.35, 0.55, rim) * 0.35 + 0.08;
    }
    default: return 0;
  }
}

/** Union of capsules/ellipses shaded as rounded 3D forms (normal from distance-to-axis, as in Jatayu's sculpt). */
export function sculpt(
  ref: Ref,
  parts: PxPart[],
  base: RGB,
  o: { shadow?: RGB; highlight?: RGB; texture?: Texture; depth?: number; edge?: number; alpha?: number; flowW?: number; clip?: (x: number, y: number) => boolean } = {}
) {
  const shadow = o.shadow ?? shade(base, 0.38, 0.6);
  const highlight = o.highlight ?? lighten(base, 0.45);
  const tex = o.texture ?? 'none';
  const scale = ref.h / 1080;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of parts) {
    if (p.kind === 'cap') {
      const r = Math.max(p.ra, p.rb);
      x0 = Math.min(x0, p.ax - r, p.bx - r); x1 = Math.max(x1, p.ax + r, p.bx + r);
      y0 = Math.min(y0, p.ay - r, p.by - r); y1 = Math.max(y1, p.ay + r, p.by + r);
    } else {
      const r = Math.max(p.rx, p.ry);
      x0 = Math.min(x0, p.cx - r); x1 = Math.max(x1, p.cx + r);
      y0 = Math.min(y0, p.cy - r); y1 = Math.max(y1, p.cy + r);
    }
  }
  const edge = o.edge ?? 0.08;
  ref.box(x0 - 1, y0 - 1, x1 + 1, y1 + 1, (x, y, i) => {
    if (o.clip && !o.clip(x, y)) return;
    let best = -1, nx = 0, ny = 0, flow = 0, s = 0, q = 0;
    for (const p of parts) {
      let ins: number, px: number, py: number, fl: number, ss: number, qq: number;
      if (p.kind === 'cap') {
        const vx = p.bx - p.ax, vy = p.by - p.ay;
        const len2 = vx * vx + vy * vy || 1;
        const t = clamp(((x - p.ax) * vx + (y - p.ay) * vy) / len2, 0, 1);
        const dx = x - (p.ax + vx * t), dy = y - (p.ay + vy * t);
        const r = lerp(p.ra, p.rb, t);
        const d = Math.hypot(dx, dy);
        ins = 1 - d / Math.max(0.5, r);
        px = dx / Math.max(0.5, r); py = dy / Math.max(0.5, r);
        fl = Math.atan2(vy, vx);
        const len = Math.sqrt(len2);
        ss = t * len; qq = (dx * -vy + dy * vx) / len;
      } else {
        const c = Math.cos(-p.ang), sn = Math.sin(-p.ang);
        const lx = (x - p.cx) * c - (y - p.cy) * sn, ly = (x - p.cx) * sn + (y - p.cy) * c;
        const u = lx / Math.max(0.5, p.rx), v = ly / Math.max(0.5, p.ry);
        const d = Math.hypot(u, v);
        ins = 1 - d;
        const c2 = Math.cos(p.ang), s2 = Math.sin(p.ang);
        px = u * c2 - v * s2; py = u * s2 + v * c2;
        fl = Math.atan2(py, px) + Math.PI / 2;
        ss = Math.atan2(v, u) * p.rx; qq = d * p.ry;
      }
      if (ins > best) { best = ins; nx = px; ny = py; flow = fl; s = ss; q = qq; }
    }
    if (best <= 0) return;
    const m = Math.min(1, Math.hypot(nx, ny));
    const nz = Math.sqrt(Math.max(0, 1 - m * m));
    let l = ref.lit(nx, ny, nz) + textureMod(tex, s, q, x, y, scale);
    l += (noise2D(x * 0.02 / scale, y * 0.02 / scale, 91) - 0.5) * 0.12;
    const a = smoothstep(0, edge, best) * (o.alpha ?? 1);
    ref.put(i, ref.tone(base, shadow, highlight, l), a, o.depth ?? 0, flow, o.flowW ?? 0.45);
  });
}

// ---------------------------------------------------------------- sky, clouds, terrain, water, mist

export function sky(ref: Ref, e: El<'sky'>) {
  const stops = e.stops.map(([y, c]) => [y, rgb(c)] as [number, RGB]).sort((a, b) => a[0] - b[0]);
  const at = (t: number): RGB => {
    if (t <= stops[0][0]) return stops[0][1];
    for (let k = 1; k < stops.length; k++) if (t <= stops[k][0]) return mix(stops[k - 1][1], stops[k][1], (t - stops[k - 1][0]) / (stops[k][0] - stops[k - 1][0] || 1));
    return stops[stops.length - 1][1];
  };
  const sun = e.sun;
  const sx = sun ? ref.X(sun.x) : 0, sy = sun ? ref.Y(sun.y) : 0, sr = sun ? ref.S(sun.r) : 0;
  const glowR = sun ? ref.S(sun.glowSize ?? sun.r * 7) : 1;
  const sunC = rgb(sun?.color ?? '#fff6dc');
  const glowC = rgb(sun?.glow ?? '#ffd08a');
  if (sun) ref.sun = { x: sx, y: sy };
  const scale = ref.h / 1080;
  for (let y = 0; y < ref.h; y++) {
    const rowC = at(y / ref.h);
    for (let x = 0; x < ref.w; x++) {
      const i = y * ref.w + x;
      let c: RGB = [rowC[0] + (noise2D(x * 0.004 / scale, y * 0.012 / scale, 13) - 0.5) * 8, rowC[1] + (noise2D(x * 0.004 / scale, y * 0.012 / scale, 13) - 0.5) * 6, rowC[2]];
      if (sun) {
        const d = Math.hypot(x - sx, y - sy);
        c = mix(c, glowC, Math.exp(-((d / glowR) ** 2)) * 0.85);
        if (d < sr + 1.5) c = mix(c, sunC, clamp(sr + 1 - d, 0, 1));
      }
      ref.put(i, c, 1, 0, 0, 0.45);
    }
  }
  if (e.moon) {
    const mx = ref.X(e.moon.x), my = ref.Y(e.moon.y), mr = ref.S(e.moon.r);
    const mc = rgb(e.moon.color ?? '#f3ecd6');
    ref.sun = ref.sun ?? { x: mx, y: my };
    ref.box(mx - mr * 6, my - mr * 6, mx + mr * 6, my + mr * 6, (x, y, i) => {
      const d = Math.hypot(x - mx, y - my);
      ref.put(i, mc, Math.exp(-((d / (mr * 3.5)) ** 2)) * 0.25);
      if (d < mr + 1) {
        const crater = (noise2D(x * 0.06 / scale, y * 0.06 / scale, 5) - 0.5) * 0.35;
        ref.put(i, scaleRGB(mc, 0.92 + crater), clamp(mr + 0.5 - d, 0, 1));
      }
    });
  }
  if (e.stars) {
    const r = createRng(77);
    for (let k = 0; k < e.stars; k++) {
      const x = r() * ref.w, y = r() ** 1.6 * ref.h * 0.7;
      const s = (0.6 + r() * 1.4) * scale;
      ref.box(x - 3 * s, y - 3 * s, x + 3 * s, y + 3 * s, (px, py, i) => {
        const d = Math.hypot(px - x, py - y);
        ref.put(i, [255, 250, 235], clamp(1 - d / (s * 1.6), 0, 1) * (0.5 + r() * 0.5));
      });
    }
  }
}

export function clouds(ref: Ref, e: El<'clouds'>) {
  const scale = ref.h / 1080;
  const y0 = ref.Y(e.y0), y1 = ref.Y(e.y1);
  const cov = e.coverage ?? 0.5;
  const f = (e.scale ?? 1) * 0.0045 / scale;
  const st = e.stretch ?? 2.4;
  const seed = e.seed ?? 3;
  const color = rgb(e.color ?? '#fbf3e6');
  const shadow = rgb(e.shadow ?? '#9aa3b8');
  const th = 0.62 - cov * 0.28;
  const dens = (x: number, y: number) => {
    const env = Math.sin(clamp((y - y0) / (y1 - y0), 0, 1) * Math.PI);
    return (noise2D((x * f) / st, y * f, seed) * 0.6 + noise2D((x * f * 2.3) / st, y * f * 2.3, seed + 1) * 0.28 + noise2D((x * f * 5) / st, y * f * 5, seed + 2) * 0.12) * (0.55 + 0.45 * env) * (env > 0 ? 1 : 0);
  };
  const off = 18 * scale;
  ref.box(0, y0, ref.w - 1, y1, (x, y, i) => {
    const d = dens(x, y);
    const m = smoothstep(th, th + 0.1, d);
    if (m <= 0.01) return;
    const toward = dens(x + ref.L[0] * off, y + ref.L[1] * off);
    const l = clamp(0.55 + (d - toward) * 5 + (d - th) * 0.8, 0, 1);
    ref.put(i, ref.tone(color, shadow, lighten(color, 0.6), l), m * 0.96, e.depth ?? 0.3, 0, 0.35);
  });
}

export function terrain(ref: Ref, e: El<'terrain'>) {
  const scale = ref.h / 1080;
  const kind = e.kind ?? 'hill';
  const seed = e.seed ?? 11;
  const base = rgb(e.color);
  const shadow = e.shadow ? rgb(e.shadow) : shade(base, 0.45, 0.7);
  const highlight = e.highlight ? rgb(e.highlight) : lighten(base, 0.35);
  const amp = ref.S(e.amp);
  const fq = (e.freq ?? 1) / ref.w;
  const yb = ref.Y(e.y);
  const bottom = ref.Y(e.bottom ?? 1);
  const crestAt = (x: number) => {
    const u = x * fq;
    if (kind === 'mountain') {
      const r1 = 1 - Math.abs(noise2D(u * 3, 0.5, seed) * 2 - 1);
      const r2 = 1 - Math.abs(noise2D(u * 9, 1.5, seed + 1) * 2 - 1);
      return yb - amp * (r1 * 0.75 + r2 * 0.25 + noise2D(u * 30, 2.5, seed + 2) * 0.06);
    }
    if (kind === 'dune') return yb - amp * (0.5 + 0.5 * Math.sin(u * 9 + noise2D(u * 2, 0, seed) * 4));
    if (kind === 'ground') return yb - amp * noise2D(u * 4, 0, seed);
    return yb - amp * (noise2D(u * 2.5, 0.5, seed) * 0.8 + noise2D(u * 7, 0.5, seed + 1) * 0.2);
  };
  const crest = new Float32Array(ref.w);
  for (let x = 0; x < ref.w; x++) crest[x] = crestAt(x);
  const hF = (x: number, y: number) =>
    kind === 'mountain'
      ? 1 - Math.abs(noise2D(x * 0.006 / scale, y * 0.009 / scale, seed + 5) * 2 - 1) + noise2D(x * 0.03 / scale, y * 0.03 / scale, seed + 6) * 0.25
      : noise2D(x * 0.004 / scale, y * 0.01 / scale, seed + 5);
  const k = kind === 'mountain' ? 2.2 : 0.9;
  const snow = e.snow ?? 0;
  for (let x = 0; x < ref.w; x++) {
    const c0 = crest[x];
    const slope = (crest[Math.min(ref.w - 1, x + 2)] - crest[Math.max(0, x - 2)]) / 4;
    for (let y = Math.max(0, Math.floor(c0)); y <= Math.min(ref.h - 1, bottom); y++) {
      const i = y * ref.w + x;
      const a = clamp(y - c0 + 0.5, 0, 1);
      const gx = (hF(x + 1, y) - hF(x - 1, y)) * 0.5 / (0.004 / scale);
      const gy = (hF(x, y + 1) - hF(x, y - 1)) * 0.5 / (0.004 / scale);
      const dn = (y - c0) / Math.max(1, bottom - c0);
      const nearCrest = Math.exp(-(y - c0) / (amp * 0.12 + 2));
      let nx = -gx * k * 0.004 + slope * nearCrest * 0.8;
      let ny = -gy * k * 0.004 - (kind === 'ground' ? 0.9 : 0.35) * (1 - dn);
      const n = Math.hypot(nx, ny, 1);
      let l = ref.lit(nx / n, ny / n, 1 / n);
      l += (noise2D(x * 0.05 / scale, y * 0.05 / scale, seed + 9) - 0.5) * 0.08;
      let c = ref.tone(base, shadow, highlight, l);
      if (snow > 0) {
        const snowLine = ref.S(snow) * (0.6 + 0.8 * noise2D(x * 0.01 / scale, 0, seed + 3));
        const sn = smoothstep(snowLine, snowLine * 0.5, y - c0) * smoothstep(-0.2, 0.3, -ny / n + 0.2);
        c = mix(c, ref.tone([238, 241, 247], [150, 165, 196], [255, 255, 255], l), sn);
      }
      const valleyMist = kind === 'mountain' ? smoothstep(0.3, 1, dn) * 0.3 : 0;
      const ang = kind === 'mountain' ? Math.atan2(gy, gx) : kind === 'ground' ? 0 : Math.atan2(slope, 1);
      ref.put(i, c, a, clamp((e.depth ?? 0) + valleyMist, 0, 1), ang, kind === 'mountain' ? 0.35 : 0.4);
    }
  }
}

export function water(ref: Ref, e: El<'water'>) {
  const scale = ref.h / 1080;
  const wl = Math.round(ref.Y(e.y));
  const bottom = Math.min(ref.h - 1, Math.round(ref.Y(e.bottom ?? 1)));
  const col = rgb(e.color);
  const deep = rgb(e.deep ?? e.color);
  const refl = e.reflect ?? 0.7;
  const rip = (e.ripple ?? 1) * 10 * scale;
  const above = ref.rgb.slice(0, Math.max(1, wl) * ref.w * 3);
  const sun = ref.sun;
  for (let y = wl; y <= bottom; y++) {
    const t = (y - wl) / Math.max(1, bottom - wl);
    for (let x = 0; x < ref.w; x++) {
      const i = y * ref.w + x;
      const wob = (noise2D(x * 0.01 / scale, y * 0.25 / scale / (0.3 + t), 17) - 0.5) * rip * (0.4 + t * 1.6);
      const sx = clamp(Math.round(x + wob), 0, ref.w - 1);
      const sy = clamp(Math.round(wl - (y - wl) * 1.0 - 1), 0, wl - 1);
      const p = (sy * ref.w + sx) * 3;
      const r: RGB = wl > 0 ? [above[p], above[p + 1], above[p + 2]] : col;
      const band = noise2D(x * 0.004 / scale, y * 0.08 / scale / (0.25 + t), 23);
      let c = mix(mix(col, deep, t), shade(r, 0.88), refl * (1 - t * 0.45));
      c = mix(c, lighten(c, 0.25), smoothstep(0.62, 0.8, band) * 0.6);
      c = mix(c, shade(c, 0.8), smoothstep(0.38, 0.2, band) * 0.5);
      if (sun) {
        const spread = (0.06 + t * 0.12) * ref.w;
        const near = Math.exp(-(((x - sun.x) / spread) ** 2));
        if (near > 0.05 && hash2D(x >> 1, y, 29) > 0.985 - near * 0.06 && band > 0.45) c = mix(c, [255, 244, 210], near);
      }
      ref.put(i, c, 1, 0, 0, 0.9);
    }
  }
}

export function mist(ref: Ref, e: El<'mist'>) {
  const scale = ref.h / 1080;
  const y0 = ref.Y(e.y0), y1 = ref.Y(e.y1);
  const c = rgb(e.color ?? '#e8e4dc');
  const amt = e.amount ?? 0.5;
  ref.box(0, y0, ref.w - 1, y1, (x, y, i) => {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const env = Math.sin(t * Math.PI);
    ref.put(i, c, env * amt * (0.65 + 0.35 * noise2D(x * 0.003 / scale, y * 0.02 / scale, 41)), 0, 0, 0.3);
  });
}

// ---------------------------------------------------------------- vegetation

function canopy(ref: Ref, cx: number, cy: number, rx: number, ry: number, n: number, leaf: RGB, rng: Rng, depth: number, clumpR: [number, number]) {
  const scale = ref.h / 1080;
  const clumps: Array<{ x: number; y: number; r: number; z: number }> = [];
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 0.82;
    const r = Math.min(rx, ry) * lerp(clumpR[0], clumpR[1], rng());
    clumps.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, r, z: rng() });
  }
  clumps.sort((a, b) => a.y - b.y);
  const shadow = mix(shade(leaf, 0.32, 0.9), [20, 30, 34], 0.25);
  const hl = mix(lighten(leaf, 0.25), [222, 214, 120], 0.25);
  ref.box(cx - rx * 1.3, cy - ry * 1.4, cx + rx * 1.3, cy + ry * 1.4, (x, y, i) => {
    let best = -1, bx = 0, by = 0, bz = 0;
    for (const c of clumps) {
      const u = (x - c.x) / c.r, v = (y - c.y) / c.r;
      const ins = 1 - Math.hypot(u, v) + c.z * 0.06;
      if (ins > best) { best = ins; bx = u; by = v; bz = c.z; }
    }
    const brk = (noise2D(x * 0.07 / scale + y * 0.03 / scale, y * 0.07 / scale - x * 0.03 / scale, 71) * 0.6 + noise2D(x * 0.19 / scale, y * 0.17 / scale, 73) * 0.4 - 0.5) * 0.45;
    const a = smoothstep(0, 0.1, best + brk * 0.5);
    if (a <= 0.01) return;
    const m = Math.min(1, Math.hypot(bx, by));
    let l = ref.lit(bx, by, Math.sqrt(Math.max(0, 1 - m * m)));
    l = l * (0.7 + 0.3 * smoothstep(cy + ry, cy - ry, y)) + brk * 0.6 + (bz - 0.5) * 0.08;
    ref.put(i, ref.tone(leaf, shadow, hl, l), a, depth, Math.atan2(by, bx) + Math.PI / 2, 0.45);
  });
}

export function tree(ref: Ref, e: El<'tree'>) {
  const kind: TreeKind = e.kind ?? 'broadleaf';
  const rng = createRng(e.seed ?? Math.floor(e.x * 9973 + e.y * 7919));
  const bx = ref.X(e.x), by = ref.Y(e.y), H = ref.S(e.size);
  const leaf = rgb(e.leaf ?? (kind === 'pine' || kind === 'cypress' ? '#2f5a3e' : kind === 'palm' ? '#4f7a3a' : '#4d7a3c'));
  const bark = rgb(e.trunk ?? (kind === 'palm' ? '#8a7258' : '#5a4232'));
  const depth = e.depth ?? 0;
  const lean = (e.lean ?? (rng() - 0.5) * 0.1) * H;
  const trunk = (parts: PxPart[]) => sculpt(ref, parts, bark, { texture: 'bark', depth, flowW: 0.5 });

  if (kind === 'pine' || kind === 'cypress') {
    trunk([{ kind: 'cap', ax: bx, ay: by, bx: bx + lean * 0.3, by: by - H * 0.35, ra: H * 0.03, rb: H * 0.02 }]);
    if (kind === 'cypress') {
      const parts: PxPart[] = [];
      for (let k = 0; k < 7; k++) {
        const t = k / 6;
        parts.push({ kind: 'ell', cx: bx + lean * t + (rng() - 0.5) * H * 0.03, cy: by - H * (0.18 + t * 0.7), rx: H * 0.11 * (1 - t * 0.7), ry: H * 0.16, ang: 0 });
      }
      sculpt(ref, parts, leaf, { texture: 'fur', depth, shadow: shade(leaf, 0.3, 1), flowW: 0.5 });
      return;
    }
    const tiers = 7;
    for (let k = 0; k < tiers; k++) {
      const t = k / tiers;
      const top = by - H * (0.3 + 0.7 * (t + 1 / tiers)) - H * 0.04;
      const bot = by - H * (0.18 + 0.7 * t);
      const hw = H * 0.24 * (1 - t * 0.85);
      const cx = bx + lean * (1 - (by - bot) / H);
      const apex = cx + lean * 0.1;
      ref.fillPoly(
        [[apex, top], [cx + hw, bot], [cx + hw * 0.4, bot - H * 0.02], [cx, bot + H * 0.01], [cx - hw * 0.4, bot - H * 0.02], [cx - hw, bot]],
        (x, y, i) => {
          const u = (x - cx) / Math.max(1, hw);
          const l = ref.lit(u * 0.8, -0.3, 0.6) + (noise2D(x * 0.15, y * 0.04, 83) - 0.5) * 0.4 + ((y - top) / (bot - top)) * -0.15;
          ref.put(i, ref.tone(leaf, shade(leaf, 0.3, 1), lighten(leaf, 0.3), l), 1, depth, Math.atan2(bot - top, (x - apex) || 0.01), 0.45);
        }
      );
    }
    return;
  }

  if (kind === 'palm') {
    const tx = bx + lean * 2.5, ty = by - H * 0.85;
    const pts: PxPart[] = [];
    let px = bx, py = by;
    for (let k = 1; k <= 10; k++) {
      const t = k / 10;
      const nx = bx + (tx - bx) * t + Math.sin(t * Math.PI) * lean, ny = by + (ty - by) * t;
      pts.push({ kind: 'cap', ax: px, ay: py, bx: nx, by: ny, ra: H * lerp(0.035, 0.022, t - 0.1), rb: H * lerp(0.035, 0.022, t) });
      px = nx; py = ny;
    }
    trunk(pts);
    const fronds = 10;
    for (let k = 0; k < fronds; k++) {
      const a = -Math.PI / 2 + ((k / (fronds - 1)) - 0.5) * Math.PI * 1.5 + (rng() - 0.5) * 0.2;
      const len = H * (0.35 + rng() * 0.12);
      const droop = H * 0.28;
      const pts2: Array<[number, number]> = [];
      for (let s = 0; s <= 14; s++) {
        const t = s / 14;
        pts2.push([tx + Math.cos(a) * len * t, ty + Math.sin(a) * len * t + droop * t * t]);
      }
      const fc = shade(leaf, 0.75 + rng() * 0.4);
      ref.mark(pts2, H * 0.018, H * 0.004, shade(fc, 0.7), 1, depth);
      for (let s = 2; s < 14; s++) {
        const [qx, qy] = pts2[s];
        const t = s / 14;
        const ll = H * 0.09 * Math.sin(t * Math.PI) + H * 0.02;
        for (const side of [-1, 1]) {
          const pa = a + side * 1.2;
          ref.mark([[qx, qy], [qx + Math.cos(pa) * ll, qy + Math.sin(pa) * ll + ll * 0.6]], H * 0.012, H * 0.002, mix(fc, side < 0 ? shade(fc, 0.6) : lighten(fc, 0.15), 0.6), 1, depth);
        }
      }
    }
    return;
  }

  // Broadleaf, banyan, bare: trunk + branches, then a clumped canopy.
  const wide = kind === 'banyan';
  const crownY = by - H * (wide ? 0.62 : 0.66);
  const trunkTop: [number, number] = [bx + lean, crownY + H * 0.12];
  const tw = H * (wide ? 0.07 : 0.045);
  const parts: PxPart[] = [{ kind: 'cap', ax: bx, ay: by, bx: trunkTop[0], by: trunkTop[1], ra: tw, rb: tw * 0.7 }];
  if (wide) parts.push({ kind: 'cap', ax: bx - tw * 1.4, ay: by, bx: bx - tw * 0.3, by: by - H * 0.2, ra: tw * 0.9, rb: tw * 0.5 }, { kind: 'cap', ax: bx + tw * 1.5, ay: by, bx: bx + tw * 0.4, by: by - H * 0.22, ra: tw * 0.8, rb: tw * 0.5 });
  const nb = kind === 'bare' ? 7 : 5;
  for (let k = 0; k < nb; k++) {
    const a = -Math.PI / 2 + (rng() - 0.5) * (wide ? 2.6 : 1.8);
    const L = H * (wide ? 0.45 : 0.3) * (0.6 + rng() * 0.5);
    const sx = trunkTop[0], sy = trunkTop[1] + rng() * H * 0.05;
    const ex = sx + Math.cos(a) * L, ey = sy + Math.sin(a) * L * (wide ? 0.45 : 1);
    parts.push({ kind: 'cap', ax: sx, ay: sy, bx: ex, by: ey, ra: tw * 0.55, rb: tw * 0.15 });
    if (kind === 'bare') {
      for (let j = 0; j < 3; j++) {
        const a2 = a + (rng() - 0.5) * 1.4, L2 = L * 0.45;
        const t = 0.5 + rng() * 0.5;
        const qx = sx + (ex - sx) * t, qy = sy + (ey - sy) * t;
        parts.push({ kind: 'cap', ax: qx, ay: qy, bx: qx + Math.cos(a2) * L2, by: qy + Math.sin(a2) * L2, ra: tw * 0.18, rb: tw * 0.05 });
      }
    }
  }
  trunk(parts);
  if (kind === 'bare') return;
  if (wide) {
    for (let k = 0; k < 9; k++) {
      const rx = bx + (rng() - 0.5) * H * 0.95;
      const top = crownY + H * 0.12;
      ref.mark([[rx, top], [rx + (rng() - 0.5) * H * 0.015, (top + by) / 2], [rx + (rng() - 0.5) * H * 0.03, by + (rng() - 0.3) * H * 0.02]], H * 0.006, H * 0.003, mix(bark, leaf, 0.25), 0.75, depth);
    }
  }
  canopy(ref, bx + lean, crownY, H * (wide ? 0.62 : 0.36), H * (wide ? 0.27 : 0.34), wide ? 34 : 18, leaf, rng, depth, wide ? [0.28, 0.5] : [0.32, 0.55]);
}

export function forest(ref: Ref, e: El<'forest'>) {
  const rng = createRng(e.seed ?? 5);
  const kinds = e.kinds ?? ['broadleaf'];
  const items = Array.from({ length: e.count }, () => ({
    x: lerp(e.x0, e.x1, rng()),
    y: lerp(e.y, e.y1 ?? e.y, rng()),
    size: lerp(e.size[0], e.size[1], rng()),
    kind: kinds[Math.floor(rng() * kinds.length)],
    seed: Math.floor(rng() * 1e6),
  })).sort((a, b) => a.y - b.y);
  for (const t of items) tree(ref, { type: 'tree', x: t.x, y: t.y, size: t.size, kind: t.kind, leaf: e.leaf, trunk: e.trunk, depth: e.depth, seed: t.seed });
}

export function grass(ref: Ref, e: El<'grass'>) {
  const rng = createRng(e.seed ?? 19);
  const x0 = ref.X(e.x0 ?? 0), x1 = ref.X(e.x1 ?? 1), y0 = ref.Y(e.y0), y1 = ref.Y(e.y1);
  const c1 = rgb(e.color ?? '#6d8a3f'), c2 = rgb(e.color2 ?? '#b6a456');
  const area = ((x1 - x0) * (y1 - y0)) / (ref.h * ref.h);
  const n = Math.floor((e.density ?? 1) * area * 9000);
  const hmax = ref.S(e.height ?? 0.06);
  const blades: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) blades.push([lerp(x0, x1, rng()), lerp(y0, y1, rng())]);
  blades.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of blades) {
    const p = 0.3 + 0.7 * (y - y0) / Math.max(1, y1 - y0);
    const h = hmax * p * (0.5 + rng() * 0.6);
    const lean = (rng() - 0.35) * h * 0.5;
    const c = mix(c1, c2, rng());
    ref.mark([[x, y], [x + lean * 0.3, y - h * 0.55], [x + lean, y - h]], Math.max(1, h * 0.07), 0.6, ref.tone(c, shade(c, 0.45, 0.6), lighten(c, 0.3), 0.4 + rng() * 0.5), 1, 0);
    if (e.flowers?.length && rng() < 0.05) {
      const fc = rgb(e.flowers[Math.floor(rng() * e.flowers.length)]);
      const fr = Math.max(1.2, h * 0.08);
      ref.box(x + lean - fr, y - h - fr, x + lean + fr, y - h + fr, (px, py, i) => ref.put(i, fc, clamp(fr - Math.hypot(px - x - lean, py - y + h), 0, 1)));
    }
  }
}

// ---------------------------------------------------------------- built things, creatures, people

export function building(ref: Ref, e: El<'building'>) {
  const x0 = ref.X(e.x), yb = ref.Y(e.y), w = ref.S(e.w), h = ref.S(e.h);
  const wall = rgb(e.color ?? '#d8c3a0');
  const roofC = rgb(e.roofColor ?? '#9a4b33');
  const depth = e.depth ?? 0;
  const dp = w * 0.3;
  const sideOnRight = true;
  const top = yb - h;
  const scale = ref.h / 1080;
  const wallLit = (nx: number, nz: number, x: number, y: number) => ref.lit(nx, 0, nz) + (noise2D(x * 0.04 / scale, y * 0.04 / scale, 101) - 0.5) * 0.1;
  const tone = (c: RGB, l: number) => ref.tone(c, shade(c, 0.45, 0.6), lighten(c, 0.3), l);
  // side face
  if (sideOnRight) {
    ref.fillPoly([[x0 + w, yb], [x0 + w + dp, yb - dp * 0.45], [x0 + w + dp, top - dp * 0.45], [x0 + w, top]], (x, y, i) => ref.put(i, tone(wall, wallLit(0.85, 0.5, x, y)), 1, depth, Math.PI / 2, 0.4));
  }
  ref.fillPoly([[x0, yb], [x0 + w, yb], [x0 + w, top], [x0, top]], (x, y, i) => ref.put(i, tone(wall, wallLit(0, 1, x, y) - 0.05 * ((yb - y) / h - 0.5)), 1, depth, Math.PI / 2, 0.4));
  if (e.windows) {
    const { rows, cols } = e.windows;
    const wc = rgb(e.windows.color ?? (e.windows.lit ? '#ffcf73' : '#3b3436'));
    const cw = w / cols, rh = (h * 0.8) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wx = x0 + c * cw + cw * 0.3, wy = top + h * 0.1 + r * rh + rh * 0.25;
      ref.fillPoly([[wx, wy], [wx + cw * 0.4, wy], [wx + cw * 0.4, wy + rh * 0.5], [wx, wy + rh * 0.5]], (x, y, i) => ref.put(i, wc, 1, depth));
      if (e.windows.lit) glow(ref, { type: 'glow', x: (wx + cw * 0.2) / ref.w, y: (wy + rh * 0.25) / ref.h, r: (cw * 0.6) / ref.h, color: wc, strength: 0.35 });
    }
  }
  if (e.door) {
    const dw = Math.min(w * 0.22, h * 0.25), dh = Math.min(h * 0.4, dw * 1.9), dx = x0 + w / 2 - dw / 2;
    ref.fillPoly([[dx, yb], [dx + dw, yb], [dx + dw, yb - dh + dw / 2], [dx + dw / 2, yb - dh], [dx, yb - dh + dw / 2]], (x, y, i) => ref.put(i, shade(wall, 0.25, 0.6), 1, depth));
  }
  const roof = e.roof ?? 'flat';
  if (roof === 'flat') {
    ref.fillPoly([[x0 - w * 0.02, top], [x0 + w * 1.02, top], [x0 + w * 1.02 + dp, top - dp * 0.45], [x0 - w * 0.02 + dp, top - dp * 0.45]], (x, y, i) => ref.put(i, tone(wall, ref.lit(0, -1, 0.4)), 1, depth));
    ref.fillPoly([[x0 - w * 0.02, top + h * 0.04], [x0 + w * 1.02, top + h * 0.04], [x0 + w * 1.02, top], [x0 - w * 0.02, top]], (x, y, i) => ref.put(i, shade(wall, 0.8), 1, depth));
  } else if (roof === 'gable') {
    const ah = w * 0.42;
    ref.fillPoly([[x0 + w / 2, top - ah], [x0 + w + dp * 0.02, top], [x0 + w + dp, top - dp * 0.45], [x0 + w / 2 + dp, top - ah - dp * 0.45]], (x, y, i) => ref.put(i, tone(roofC, ref.lit(0.5, -0.6, 0.6) + (noise2D(x * 0.2, y * 0.6, 9) - 0.5) * 0.15), 1, depth, -0.6, 0.4));
    ref.fillPoly([[x0 - w * 0.04, top + 2], [x0 + w * 1.04, top + 2], [x0 + w / 2, top - ah]], (x, y, i) => ref.put(i, tone(wall, wallLit(0, 1, x, y) - 0.08), 1, depth));
    ref.line([[x0 - w * 0.05, top + 2], [x0 + w / 2, top - ah - 2], [x0 + w * 1.05, top + 2]], w * 0.05, w * 0.05, shade(roofC, 0.8), 1, depth);
  } else if (roof === 'dome') {
    const r = w * 0.42;
    sculpt(ref, [{ kind: 'ell', cx: x0 + w / 2, cy: top, rx: r, ry: r * 1.05, ang: 0 }], roofC, { depth, texture: 'stone', clip: (_x, y) => y <= top });
    ref.line([[x0 + w / 2, top - r * 1.05], [x0 + w / 2, top - r * 1.45]], w * 0.03, w * 0.012, [214, 170, 80], 1, depth);
  } else if (roof === 'shikhara') {
    const th = h * 1.6;
    const cx = x0 + w / 2 + dp * 0.3;
    const prof = (t: number) => w * 0.48 * (1 - Math.pow(t, 1.7) * 0.72);
    const poly: Array<[number, number]> = [];
    for (let k = 0; k <= 20; k++) poly.push([cx - prof(k / 20), top - th * (k / 20)]);
    for (let k = 20; k >= 0; k--) poly.push([cx + prof(k / 20), top - th * (k / 20)]);
    ref.fillPoly(poly, (x, y, i) => {
      const t = (top - y) / th;
      const u = (x - cx) / Math.max(1, prof(t));
      const rib = Math.cos(u * Math.PI * 3.5) * 0.12;
      const band = ((y / (h * 0.06)) % 1 + 1) % 1 < 0.18 ? -0.18 : 0;
      const l = ref.lit(u * 0.9, -0.35 * t, Math.sqrt(Math.max(0, 1 - u * u * 0.81))) + rib + band + (noise2D(x * 0.08 / scale, y * 0.08 / scale, 7) - 0.5) * 0.1;
      ref.put(i, tone(roofC, l), 1, depth, Math.PI / 2, 0.45);
    });
    const ay = top - th;
    sculpt(ref, [{ kind: 'ell', cx, cy: ay, rx: prof(1) * 1.35, ry: w * 0.05, ang: 0 }], roofC, { depth, texture: 'stone' });
    sculpt(ref, [{ kind: 'ell', cx, cy: ay - w * 0.1, rx: w * 0.045, ry: w * 0.07, ang: 0 }], [210, 160, 70], { depth });
    ref.line([[cx, ay - w * 0.15], [cx, ay - w * 0.45]], w * 0.012, w * 0.008, [70, 50, 40], 1, depth);
    ref.fillPoly([[cx, ay - w * 0.45], [cx + w * 0.22, ay - w * 0.4], [cx, ay - w * 0.33]], (x, y, i) => ref.put(i, [214, 92, 40], 1, depth));
  }
}

export function birds(ref: Ref, e: El<'birds'>) {
  const rng = createRng(e.seed ?? 23);
  const c = rgb(e.color ?? '#2e2a2e');
  for (let k = 0; k < e.count; k++) {
    const x = ref.X(lerp(e.x0, e.x1, rng())), y = ref.Y(lerp(e.y0, e.y1, rng()));
    const s = ref.S(e.size) * (0.45 + rng() * 0.8);
    const flap = rng();
    const tilt = (rng() - 0.5) * 0.4;
    for (const side of [-1, 1]) {
      const pts: Array<[number, number]> = [];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8;
        const wx = side * s * t;
        const wy = -Math.sin(t * Math.PI * 0.9) * s * (0.12 + flap * 0.28) + t * t * s * (0.05 + flap * 0.15);
        pts.push([x + wx * Math.cos(tilt) - wy * Math.sin(tilt), y + wx * Math.sin(tilt) + wy * Math.cos(tilt)]);
      }
      ref.mark(pts, Math.max(1, s * 0.11), Math.max(0.6, s * 0.03), c, 1, e.depth ?? 0.2);
    }
  }
}

export function figure(ref: Ref, e: El<'figure'>) {
  const x = ref.X(e.x), y = ref.Y(e.y), h = ref.S(e.size);
  const f = e.facing ?? 1;
  const skin = rgb(e.skin ?? '#a8735a');
  const cloth = rgb(e.cloth ?? '#8c3b3b');
  const depth = e.depth ?? 0;
  const pose = e.pose ?? 'stand';
  const hipY = y - h * (pose === 'sit' ? 0.22 : 0.48);
  const legs: PxPart[] =
    pose === 'walk'
      ? [{ kind: 'cap', ax: x, ay: hipY, bx: x + f * h * 0.12, by: y - h * 0.02, ra: h * 0.05, rb: h * 0.032 }, { kind: 'cap', ax: x, ay: hipY, bx: x - f * h * 0.1, by: y, ra: h * 0.05, rb: h * 0.032 }]
      : pose === 'sit'
        ? [{ kind: 'cap', ax: x, ay: hipY, bx: x + f * h * 0.22, by: hipY + h * 0.02, ra: h * 0.055, rb: h * 0.045 }, { kind: 'cap', ax: x + f * h * 0.22, ay: hipY + h * 0.02, bx: x + f * h * 0.24, by: y, ra: h * 0.045, rb: h * 0.032 }]
        : [{ kind: 'cap', ax: x - h * 0.03, ay: hipY, bx: x - h * 0.035, by: y, ra: h * 0.05, rb: h * 0.032 }, { kind: 'cap', ax: x + h * 0.03, ay: hipY, bx: x + h * 0.035, by: y, ra: h * 0.05, rb: h * 0.032 }];
  sculpt(ref, legs, shade(cloth, 0.8), { texture: 'cloth', depth });
  const shoulderY = hipY - h * 0.32;
  sculpt(ref, [{ kind: 'cap', ax: x, ay: hipY + h * 0.02, bx: x, by: shoulderY, ra: h * 0.085, rb: h * 0.095 }], cloth, { texture: 'cloth', depth });
  const swing = pose === 'walk' ? 0.09 : 0.01;
  sculpt(ref, [
    { kind: 'cap', ax: x - h * 0.07, ay: shoulderY + h * 0.03, bx: x - h * 0.085 - f * h * swing, by: shoulderY + h * 0.3, ra: h * 0.03, rb: h * 0.024 },
    { kind: 'cap', ax: x + h * 0.07, ay: shoulderY + h * 0.03, bx: x + h * 0.085 + f * h * swing, by: shoulderY + h * 0.3, ra: h * 0.03, rb: h * 0.024 },
  ], shade(cloth, 0.92), { texture: 'cloth', depth });
  sculpt(ref, [{ kind: 'cap', ax: x, ay: shoulderY, bx: x, by: shoulderY - h * 0.06, ra: h * 0.03, rb: h * 0.03 }, { kind: 'ell', cx: x + f * h * 0.01, cy: shoulderY - h * 0.11, rx: h * 0.058, ry: h * 0.07, ang: 0 }], skin, { depth });
  sculpt(ref, [{ kind: 'ell', cx: x - f * h * 0.01, cy: shoulderY - h * 0.14, rx: h * 0.06, ry: h * 0.045, ang: 0 }], [36, 28, 26], { depth, texture: 'fur' });
}

export function boat(ref: Ref, e: El<'boat'>) {
  const x = ref.X(e.x), y = ref.Y(e.y), s = ref.S(e.size);
  const f = e.facing ?? 1;
  const hull = rgb(e.color ?? '#5b3b2a');
  const depth = e.depth ?? 0;
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push([x + (t - 0.5) * s, y - s * 0.06 + Math.sin(t * Math.PI) * s * 0.12 - (t > 0.85 && f > 0 ? (t - 0.85) * s * 0.6 : 0) - (t < 0.15 && f < 0 ? (0.15 - t) * s * 0.6 : 0)]); }
  pts.push([x + s * 0.5, y - s * 0.12 - (f > 0 ? s * 0.09 : 0)], [x - s * 0.5, y - s * 0.12 - (f < 0 ? s * 0.09 : 0)]);
  ref.fillPoly(pts.slice(0, 17).concat([[x + s * 0.55, y - s * 0.16], [x - s * 0.55, y - s * 0.16]]).reverse(), (px, py, i) => ref.put(i, ref.tone(hull, shade(hull, 0.4, 0.6), lighten(hull, 0.3), ref.lit(0, (py - y) / s * 4, 0.6)), 1, depth, 0, 0.5));
  if (e.sail) {
    const sc = rgb(e.sail);
    ref.line([[x, y - s * 0.14], [x, y - s * 0.95]], s * 0.02, s * 0.015, shade(hull, 0.8), 1, depth);
    ref.fillPoly([[x + f * s * 0.02, y - s * 0.92], [x + f * s * 0.4, y - s * 0.2], [x + f * s * 0.02, y - s * 0.22]], (px, py, i) => ref.put(i, ref.tone(sc, shade(sc, 0.55, 0.5), lighten(sc, 0.4), ref.lit(f * 0.5, 0, 0.8) + ((px - x) / s) * f * 0.4), 1, depth, -Math.PI / 2, 0.4));
  }
}

// ---------------------------------------------------------------- generic

export function blob(ref: Ref, e: El<'blob'>) {
  const c = rgb(e.color);
  sculpt(ref, partsToPx(ref, e.parts), c, { shadow: e.shadow ? rgb(e.shadow) : undefined, highlight: e.highlight ? rgb(e.highlight) : undefined, texture: e.texture, depth: e.depth });
}

export function polygon(ref: Ref, e: El<'polygon'>) {
  const pts = e.points.map(([x, y]) => [ref.X(x), ref.Y(y)] as [number, number]);
  const c1 = rgb(e.color), c2 = rgb(e.color2 ?? e.color);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  ref.fillPoly(pts, (x, y, i) => ref.put(i, mix(c1, c2, (y - y0) / Math.max(1, y1 - y0)), e.alpha ?? 1, e.depth ?? 0, e.flow, e.flow === undefined ? 0 : 0.5));
}

export function glow(ref: Ref, e: El<'glow'>) {
  const x = ref.X(e.x), y = ref.Y(e.y), r = ref.S(e.r);
  const c = rgb(e.color);
  const k = e.strength ?? 0.6;
  ref.box(x - r * 2, y - r * 2, x + r * 2, y + r * 2, (px, py, i) => {
    const d = Math.hypot(px - x, py - y) / r;
    ref.put(i, c, Math.exp(-d * d * 2) * k);
  });
}

// ---------------------------------------------------------------- animals, weather, details

/** Quadruped built from sculpted capsules/ellipses; proportions per kind. */
export function animal(ref: Ref, e: El<'animal'>) {
  const x = ref.X(e.x), y = ref.Y(e.y), s = ref.S(e.size); // size = shoulder height
  const f = e.facing ?? 1;
  const P: Record<string, { body: [number, number]; leg: number; legW: number; neck: number; head: [number, number]; color: string; tex: Texture }> = {
    elephant: { body: [0.62, 0.42], leg: 0.48, legW: 0.11, neck: 0.05, head: [0.2, 0.22], color: '#7d7672', tex: 'stone' },
    cow: { body: [0.6, 0.3], leg: 0.48, legW: 0.06, neck: 0.18, head: [0.12, 0.09], color: '#e8e1d4', tex: 'fur' },
    deer: { body: [0.5, 0.24], leg: 0.6, legW: 0.035, neck: 0.3, head: [0.09, 0.07], color: '#9a6a43', tex: 'fur' },
    horse: { body: [0.6, 0.28], leg: 0.58, legW: 0.05, neck: 0.36, head: [0.13, 0.07], color: '#6b4a32', tex: 'fur' },
    dog: { body: [0.55, 0.26], leg: 0.48, legW: 0.06, neck: 0.18, head: [0.13, 0.11], color: '#a87b52', tex: 'fur' },
    goat: { body: [0.5, 0.26], leg: 0.5, legW: 0.045, neck: 0.18, head: [0.1, 0.08], color: '#d9d2c4', tex: 'fur' },
  };
  const p = P[e.kind] ?? P.cow;
  const c = rgb(e.color ?? p.color);
  const depth = e.depth ?? 0;
  const bodyY = y - s * p.leg - s * p.body[1] * 0.35;
  const bw = s * p.body[0], bh = s * p.body[1];
  const parts: PxPart[] = [];
  const far = shade(c, 0.78);
  // far legs first (darker), then body + near legs
  const legX = [-0.32, 0.3];
  const legs = (near: boolean): PxPart[] => legX.map((lx) => ({ kind: 'cap' as const, ax: x + f * bw * lx + (near ? 0 : f * s * 0.05), ay: bodyY, bx: x + f * bw * lx + (near ? 0 : f * s * 0.05) + f * s * 0.02, by: y, ra: s * p.legW * 1.2, rb: s * p.legW * (e.kind === 'elephant' ? 1.05 : 0.7) }));
  sculpt(ref, legs(false), far, { texture: p.tex, depth });
  parts.push({ kind: 'ell', cx: x, cy: bodyY, rx: bw * 0.55, ry: bh * 0.55, ang: 0 }, ...legs(true));
  const neckBase = { x: x + f * bw * 0.42, y: bodyY - bh * 0.15 };
  let head = { x: neckBase.x + f * s * p.neck * 0.6, y: neckBase.y - s * p.neck * 0.8 };
  if (e.kind === 'elephant') head = { x: x + f * bw * 0.55, y: bodyY - bh * 0.32 };
  if (e.kind === 'cow' || e.kind === 'goat') head = { x: neckBase.x + f * s * p.neck, y: neckBase.y - s * p.neck * 0.15 };
  if (e.graze && e.kind !== 'elephant') head = { x: neckBase.x + f * s * p.neck * 0.7, y: y - s * 0.12 };
  if (e.kind !== 'elephant') parts.push({ kind: 'cap', ax: neckBase.x, ay: neckBase.y, bx: head.x, by: head.y, ra: s * 0.09, rb: s * 0.06 });
  parts.push({ kind: 'ell', cx: head.x + f * s * p.head[0] * 0.35, cy: head.y, rx: s * p.head[0], ry: s * p.head[1], ang: f * (e.kind === 'horse' ? 0.9 : 0.25) });
  // tail
  parts.push({ kind: 'cap', ax: x - f * bw * 0.52, ay: bodyY - bh * 0.15, bx: x - f * bw * 0.6, by: bodyY + bh * 0.5, ra: s * 0.015, rb: s * 0.01 });
  sculpt(ref, parts, c, { texture: p.tex, depth });
  if (e.kind === 'cow' && !e.color) {
    const r2 = createRng(Math.floor(x * 31 + y));
    const spots: PxPart[] = [];
    for (let k = 0; k < 3; k++) spots.push({ kind: 'ell', cx: x + (r2() - 0.5) * bw * 0.7, cy: bodyY + (r2() - 0.5) * bh * 0.5, rx: bw * (0.08 + r2() * 0.08), ry: bh * (0.15 + r2() * 0.15), ang: r2() * 3 });
    sculpt(ref, spots, [74, 60, 52], { texture: 'fur', depth, clip: (px, py) => Math.hypot((px - x) / (bw * 0.55), (py - bodyY) / (bh * 0.55)) < 0.95 });
  }
  if (e.kind === 'elephant') {
    sculpt(ref, [{ kind: 'ell', cx: head.x - f * s * 0.08, cy: head.y + s * 0.02, rx: s * 0.13, ry: s * 0.19, ang: 0 }], shade(c, 0.88), { texture: 'stone', depth });
    const tr: PxPart[] = [];
    let tx = head.x + f * s * 0.2, ty = head.y + s * 0.05;
    for (let k = 1; k <= 6; k++) {
      const nx = tx + f * s * 0.03 * Math.cos(k * 0.3), ny = ty + s * 0.075;
      tr.push({ kind: 'cap', ax: tx, ay: ty, bx: nx, by: ny, ra: s * (0.07 - k * 0.008), rb: s * (0.065 - k * 0.008) });
      tx = nx; ty = ny;
    }
    sculpt(ref, tr, c, { texture: 'stone', depth });
    ref.line([[head.x + f * s * 0.17, head.y + s * 0.1], [head.x + f * s * 0.3, head.y + s * 0.16]], s * 0.03, s * 0.012, [240, 232, 214], 1, depth);
  }
  if (e.kind === 'cow' || e.kind === 'goat') {
    for (const side of [-1, 1]) ref.mark([[head.x + f * s * 0.02 + side * s * 0.03, head.y - s * p.head[1] * 0.8], [head.x - f * s * 0.02 + side * s * 0.07, head.y - s * p.head[1] * 1.8]], s * 0.022, s * 0.008, [214, 200, 170], 1, depth);
  }
  if (e.kind === 'deer') {
    for (const side of [-1, 1]) {
      const bx0 = head.x + side * s * 0.02, by0 = head.y - s * 0.06;
      ref.mark([[bx0, by0], [bx0 + side * s * 0.05, by0 - s * 0.14], [bx0 + side * s * 0.1, by0 - s * 0.22]], s * 0.014, s * 0.006, [120, 92, 66], 1, depth);
      ref.mark([[bx0 + side * s * 0.05, by0 - s * 0.12], [bx0 + side * s * 0.0, by0 - s * 0.2]], s * 0.01, s * 0.005, [120, 92, 66], 1, depth);
    }
  }
  if (e.kind === 'horse') ref.mark([[neckBase.x - f * s * 0.02, neckBase.y - s * 0.02], [head.x - f * s * 0.05, head.y - s * 0.06]], s * 0.05, s * 0.02, shade(c, 0.5), 1, depth);
  // eye
  const ex = head.x + f * s * p.head[0] * 0.55, ey = head.y - s * p.head[1] * 0.25;
  ref.box(ex - 3, ey - 3, ex + 3, ey + 3, (px, py, i) => ref.put(i, [25, 20, 20], clamp(s * 0.012 - Math.hypot(px - ex, py - ey) + 0.5, 0, 1), depth));
}

export function rain(ref: Ref, e: El<'rain'>) {
  const rng = createRng(61);
  const n = Math.floor((e.density ?? 1) * 1400);
  const a = e.angle ?? 0.25;
  const c = rgb(e.color ?? '#c9d2dc');
  const y1 = ref.Y(e.y1 ?? 1);
  for (let k = 0; k < n; k++) {
    const x = rng() * ref.w * 1.2 - ref.w * 0.1, y = rng() * y1;
    const L = ref.S(0.03 + rng() * 0.05);
    ref.mark([[x, y], [x + Math.sin(a) * L, y + Math.cos(a) * L]], ref.S(0.0015), ref.S(0.0008), c, 0.35 + rng() * 0.3, 0);
  }
}

export function snowfall(ref: Ref, e: El<'snowfall'>) {
  const rng = createRng(67);
  const n = Math.floor((e.density ?? 1) * 1800);
  const c = rgb(e.color ?? '#ffffff');
  for (let k = 0; k < n; k++) {
    const x = rng() * ref.w, y = rng() * ref.h, r = ref.S(0.0015 + rng() * 0.004);
    ref.box(x - r - 1, y - r - 1, x + r + 1, y + r + 1, (px, py, i) => ref.put(i, c, clamp(r - Math.hypot(px - x, py - y) + 0.5, 0, 1) * 0.9));
  }
}

export function lotus(ref: Ref, e: El<'lotus'>) {
  const rng = createRng(e.seed ?? 71);
  const pad = rgb(e.pad ?? '#4d6e3a');
  const fl = rgb(e.color ?? '#e58aa6');
  const items = Array.from({ length: e.count }, () => ({ x: lerp(e.x0, e.x1, rng()), y: lerp(e.y0, e.y1, rng()) })).sort((a, b) => a.y - b.y);
  for (const it of items) {
    const p = (it.y - e.y0) / Math.max(0.001, e.y1 - e.y0);
    const r = 0.012 + p * 0.025;
    sculpt(ref, [{ kind: 'ell', cx: ref.X(it.x), cy: ref.Y(it.y), rx: ref.S(r), ry: ref.S(r * 0.35), ang: 0 }], pad, { texture: 'none' });
    if (rng() < 0.45) {
      const fx = ref.X(it.x + (rng() - 0.5) * 0.01), fy = ref.Y(it.y) - ref.S(r * 0.4);
      const petals: PxPart[] = [];
      for (let k = -2; k <= 2; k++) petals.push({ kind: 'ell', cx: fx + k * ref.S(r * 0.18), cy: fy - ref.S(r * 0.25) * (1 - Math.abs(k) * 0.3), rx: ref.S(r * 0.14), ry: ref.S(r * 0.38), ang: k * 0.35 });
      sculpt(ref, petals, fl, { highlight: [255, 236, 240] });
    }
  }
}

export function lamps(ref: Ref, e: El<'lamps'>) {
  const c = rgb(e.color ?? '#ffb347');
  for (const [x, y] of e.points) {
    glow(ref, { type: 'glow', x, y, r: e.size ?? 0.05, color: c, strength: 0.55 });
    const px = ref.X(x), py = ref.Y(y), r = ref.S((e.size ?? 0.05) * 0.12);
    ref.box(px - r - 1, py - r - 1, px + r + 1, py + r + 1, (qx, qy, i) => ref.put(i, [255, 238, 190], clamp(r - Math.hypot(qx - px, qy - py) + 0.5, 0, 1)));
  }
}

export const ELEMENTS: Record<string, (ref: Ref, e: any) => void> = {
  sky, clouds, terrain, water, mist, tree, forest, grass, building, birds, figure, boat, blob, polygon, glow, animal, rain, snowfall, lotus, lamps, studio, road, reflect,
  library: (ref, e) => drawLibrary(ref, e),
  custom: (ref, e) => e.draw(ref),
};
