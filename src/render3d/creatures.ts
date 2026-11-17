/**
 * Body-plan builder: creatures are assembled from a handful of parts (body, legs, neck, head, tail, wings, horns...)
 * that a `Plan` of numbers describes. A dragon, a lion and a unicorn are the same builder with different numbers,
 * so teaching it a new animal is a table entry, not new drawing code.
 *
 * Units: the model faces +x, stands on y = 0, and its body is about 1 unit long.
 */
import type { RGB } from '../core/paper';
import { basis, type Material, type Model, type Part, type V3 } from './sdf';

export interface Plan {
  kind: 'quad' | 'upright' | 'bird';
  /** Body half-height and leg length (hip height), in body lengths. */
  bodyR: number;
  legLen: number;
  legR: number;
  neck: number;
  neckRise: number; // radians above horizontal at the base of the neck
  head: number;
  snout: number;
  tail: number;
  tailR?: number;
  ears?: 'point' | 'round' | 'long' | 'none';
  horns?: number; // 0, 1 (unicorn) or 2
  wings?: 'bat' | 'feather' | 'none';
  mane?: boolean;
  spikes?: boolean;
  trunk?: boolean;
  stripes?: boolean;
  col: RGB;
  belly?: RGB;
  bump?: [number, number];
  spec?: number;
}

export interface BuildOptions {
  colours?: { main?: RGB; parts: Record<string, RGB> };
  /** Upright pose reading a newspaper (dragons, bears...). */
  reading?: boolean;
  /** Wings spread (true) or folded. */
  spread?: boolean;
}

class B {
  parts: Part[] = [];
  mats: Material[] = [];
  groupK: number[] = [];
  mat(m: Material) { this.mats.push(m); return this.mats.length - 1; }
  group(k: number) { this.groupK.push(k); return this.groupK.length - 1; }
  ell(c: V3, r: V3, g: number, m: number, dir?: V3, up?: V3) { this.parts.push({ k: 'ell', c, r, R: dir ? basis(dir, up) : undefined, g, m }); }
  cone(a: V3, b: V3, ra: number, rb: number, g: number, m: number) { this.parts.push({ k: 'cone', a, b, ra, rb, g, m }); }
  box(c: V3, h: V3, round: number, g: number, m: number, dir?: V3, up?: V3) { this.parts.push({ k: 'box', c, h, round, R: dir ? basis(dir, up) : undefined, g, m }); }
  /** A tube through points with a radius at each. */
  chain(pts: V3[], radii: number[], g: number, m: number) { for (let i = 0; i < pts.length - 1; i++) this.cone(pts[i], pts[i + 1], radii[i], radii[i + 1], g, m); }
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export function buildCreature(plan: Plan, o: BuildOptions = {}): Model {
  // proportion pass: real animals are chunkier than the numbers in the table suggest
  const p: Plan = { ...plan, bodyR: plan.bodyR * 1.25, legR: plan.legR * 1.4, head: plan.head * 1.3 };
  const b = new B();
  const col = o.colours?.main ?? p.col;
  const belly = o.colours?.parts.belly ?? p.belly ?? mix(col, [236, 226, 200], 0.55);
  const hornCol = o.colours?.parts.horn ?? [214, 200, 170];
  const wingCol = o.colours?.parts.wing ?? shade(col, 0.82);
  const eyeCol = o.colours?.parts.eye ?? [226, 168, 24];
  const skin = b.mat({ col, spec: p.spec ?? 0.25, shin: 28, bump: p.bump });
  const under = b.mat({ col: belly, spec: 0.15, shin: 20, bump: p.bump });
  const horn = b.mat({ col: hornCol, spec: 0.5, shin: 40 });
  const claw = b.mat({ col: shade(hornCol, 0.7), spec: 0.5, shin: 40 });
  const eye = b.mat({ col: eyeCol, spec: 0.9, shin: 90, emit: 0.25 });
  const pupil = b.mat({ col: [12, 10, 10], spec: 0.9, shin: 120 });
  const wingM = b.mat({ col: wingCol, spec: 0.2, shin: 18, bump: [0.1, 14] });
  const flesh = b.mat({ col: mix(col, [200, 120, 100], 0.4), spec: 0.2, shin: 18 });

  const gBody = b.group(0.17);
  const gLimb = b.group(0.09);
  const gHead = b.group(0.08);
  const gHard = b.group(0);
  const gWing = b.group(0.02);

  const h = p.legLen;
  const R = p.bodyR;
  const upright = p.kind === 'upright';

  // ---------- body ----------
  const bodyY = h + R * 0.6;
  let neckBase: V3, rump: V3, shoulder: V3;
  if (!upright) {
    b.ell([0, bodyY, 0], [0.5, R, R * 0.9], gBody, skin);
    b.ell([0.3, bodyY + R * 0.04, 0], [0.28, R * 1.05, R * 0.95], gBody, skin);
    b.ell([-0.3, bodyY, 0], [0.27, R * 0.98, R * 0.95], gBody, skin);
    b.ell([0.05, bodyY - R * 0.45, 0], [0.4, R * 0.55, R * 0.8], gBody, under); // belly
    neckBase = [0.4, bodyY + R * 0.5, 0];
    rump = [-0.5, bodyY + R * 0.1, 0];
    shoulder = [0.3, bodyY + R * 0.1, 0];
  } else {
    const top = h + 0.62;
    b.ell([0, h + 0.38, 0], [0.24, 0.4, 0.22], gBody, skin);
    b.ell([0.03, h + 0.62, 0], [0.22, 0.26, 0.21], gBody, skin);
    b.ell([0.12, h + 0.36, 0], [0.12, 0.34, 0.17], gBody, under); // belly plate
    neckBase = [0.06, top + 0.1, 0];
    rump = [-0.2, h + 0.15, 0];
    shoulder = [0.1, h + 0.62, 0];
  }

  // ---------- legs ----------
  const paw = (c: V3, front: number) => {
    b.ell([c[0] + 0.04 * front, p.legR * 0.55, c[2]], [p.legR * 1.9, p.legR * 0.65, p.legR * 1.15], gLimb, skin);
    for (const dz of [-0.55, 0, 0.55]) b.cone([c[0] + 0.1 * front, p.legR * 0.35, c[2] + dz * p.legR], [c[0] + 0.15 * front + p.legR * 0.8, p.legR * 0.22, c[2] + dz * p.legR * 1.1], p.legR * 0.22, p.legR * 0.06, gHard, claw);
  };
  if (!upright) {
    for (const z of [-1, 1]) {
      const zz = z * R * 0.62;
      // foreleg
      b.chain([[0.3, bodyY + R * 0.25, zz], [0.28, h * 0.58, zz * 1.05], [0.31, h * 0.2, zz]], [p.legR * 1.7, p.legR * 1.15, p.legR * 0.85], gLimb, skin);
      paw([0.31, 0, zz], 1);
      // hind leg: big thigh, hock bent backward
      b.ell([-0.3, bodyY - R * 0.15, zz * 1.1], [0.17, R * 0.95, R * 0.45], gLimb, skin, [0.3, -0.4, 0]);
      b.chain([[-0.28, bodyY - R * 0.3, zz], [-0.18, h * 0.5, zz], [-0.33, h * 0.17, zz]], [p.legR * 1.5, p.legR * 1.0, p.legR * 0.8], gLimb, skin);
      paw([-0.33, 0, zz], 1);
    }
  } else {
    for (const z of [-1, 1]) {
      const zz = z * 0.13;
      b.chain([[-0.02, h + 0.2, zz], [0.02, h * 0.55, zz], [0.0, h * 0.12, zz]], [p.legR * 2.1, p.legR * 1.5, p.legR * 1.1], gLimb, skin);
      paw([0.0, 0, zz], 1);
    }
  }

  // ---------- neck and head ----------
  const headSize = p.head;
  const neckPts: V3[] = [];
  const neckRadii: number[] = [];
  const N = 5;
  let cur: V3 = neckBase;
  const upAngleStart = upright ? Math.max(p.neckRise, 1.15) : p.neckRise;
  const upAngleEnd = upright ? (o.reading ? -0.1 : 0.25) : Math.max(0.1, p.neckRise * 0.25);
  neckPts.push(cur);
  neckRadii.push(R * 0.75);
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const ang = upAngleStart + (upAngleEnd - upAngleStart) * Math.pow(t, 1.4);
    const seg = p.neck / N;
    cur = add(cur, [Math.cos(ang) * seg, Math.sin(ang) * seg, 0]);
    neckPts.push(cur);
    neckRadii.push(R * (0.75 - 0.35 * t) + 0.005);
  }
  b.chain(neckPts, neckRadii, gBody, skin);
  if (p.neck > 0.05) {
    // throat plate
    const tp = neckPts.map((q, i) => add(q, [0.02, -neckRadii[i] * 0.55, 0]));
    b.chain(tp, neckRadii.map((r) => r * 0.6), gBody, under);
  }
  const headC = add(cur, [headSize * 0.5, upright && o.reading ? headSize * 0.1 : 0, 0]);
  const headDir: V3 = upright && o.reading ? [1, -0.45, 0] : [1, 0.05, 0];
  b.ell(headC, [headSize, headSize * 0.62, headSize * 0.58], gHead, skin, headDir);
  const snoutTip = add(headC, [headSize * 0.5 + p.snout, -headSize * (upright && o.reading ? 0.45 : 0.12) - (p.trunk ? 0 : 0), 0]);
  if (p.trunk) {
    // elephant trunk: a tube hanging down and curling forward
    const base = add(headC, [headSize * 0.7, -headSize * 0.1, 0]);
    const pts: V3[] = [base, add(base, [0.1, -0.2, 0]), add(base, [0.16, -0.5, 0]), add(base, [0.3, -0.7, 0]), add(base, [0.45, -0.72, 0])];
    b.chain(pts, [headSize * 0.42, headSize * 0.34, headSize * 0.26, headSize * 0.2, headSize * 0.14], gHead, skin);
  } else if (p.snout > 0) {
    b.cone(add(headC, [headSize * 0.35, -headSize * 0.02, 0]), snoutTip, headSize * 0.42, headSize * 0.3, gHead, skin);
    // lower jaw
    b.cone(add(headC, [headSize * 0.1, -headSize * 0.32, 0]), add(snoutTip, [-0.02, -headSize * 0.32, 0]), headSize * 0.28, headSize * 0.18, gHead, under);
    // nostrils
    for (const z of [-1, 1]) b.ell(add(snoutTip, [-0.005, headSize * 0.18, z * headSize * 0.15]), [headSize * 0.07, headSize * 0.05, headSize * 0.05], gHard, pupil);
  }
  // eyes
  for (const z of [-1, 1]) {
    const ec = add(headC, [headSize * 0.32, headSize * 0.22, z * headSize * 0.46]);
    b.ell(ec, [headSize * 0.13, headSize * 0.11, headSize * 0.09], gHard, eye);
    b.ell(add(ec, [headSize * 0.04, 0, z * headSize * 0.05]), [headSize * 0.05, headSize * 0.09, headSize * 0.05], gHard, pupil);
    // brow ridge
    b.cone(add(ec, [-headSize * 0.2, headSize * 0.12, 0]), add(ec, [headSize * 0.22, headSize * 0.16, 0]), headSize * 0.09, headSize * 0.06, gHead, skin);
  }
  // horns
  const nh = p.horns ?? 0;
  if (nh === 1) {
    b.cone(add(headC, [headSize * 0.35, headSize * 0.45, 0]), add(headC, [headSize * 0.35 + 0.22, headSize * 0.45 + 0.2, 0]), headSize * 0.1, headSize * 0.012, gHard, horn);
  } else if (nh >= 2) {
    for (const z of [-1, 1]) {
      const a = add(headC, [-headSize * 0.1, headSize * 0.42, z * headSize * 0.28]);
      b.cone(a, add(a, [-headSize * 1.5, headSize * 0.9, z * headSize * 0.35]), headSize * 0.14, headSize * 0.02, gHard, horn);
      const a2 = add(headC, [-headSize * 0.35, headSize * 0.3, z * headSize * 0.5]);
      b.cone(a2, add(a2, [-headSize * 0.55, headSize * 0.1, z * headSize * 0.55]), headSize * 0.09, headSize * 0.02, gHard, horn);
    }
  }
  // ears
  if (p.ears && p.ears !== 'none') {
    for (const z of [-1, 1]) {
      const a = add(headC, [-headSize * 0.25, headSize * 0.42, z * headSize * 0.32]);
      const len = p.ears === 'long' ? headSize * 1.1 : p.ears === 'round' ? headSize * 0.4 : headSize * 0.7;
      b.cone(a, add(a, [-len * 0.15, len, z * len * 0.25]), headSize * (p.ears === 'round' ? 0.26 : 0.19), headSize * (p.ears === 'round' ? 0.2 : 0.04), gHead, skin);
    }
  }
  // mane
  if (p.mane) {
    for (let i = 0; i < neckPts.length - 1; i++) {
      const q = neckPts[i];
      b.ell(add(q, [-0.04, neckRadii[i] * 0.75, 0]), [0.09, neckRadii[i] * 0.55, neckRadii[i] * 0.45], gBody, b.mat({ col: shade(col, 0.55), spec: 0.1, shin: 10, bump: [0.35, 30] }));
    }
    b.ell(add(headC, [-headSize * 0.5, headSize * 0.5, 0]), [headSize * 0.4, headSize * 0.5, headSize * 0.5], gBody, skin);
  }

  // ---------- tail ----------
  {
    const tailPts: V3[] = [];
    const tr: number[] = [];
    const n = 7;
    const sw = p.tail > 0.7 ? 0.35 : 0.12;
    let q: V3 = rump;
    tailPts.push(q); tr.push((p.tailR ?? R * 0.6));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const dx = -p.tail / n;
      const dy = upright ? -h * 0.13 + Math.sin(t * 2.4) * 0.05 : -0.15 * (p.tail / n) * 3 * (1 - t) + Math.sin(t * 3.0) * 0.03 + (t > 0.6 ? 0.03 : 0);
      const dz = Math.sin(t * 3.2) * sw * (p.tail / n);
      q = add(q, [dx, dy, dz]);
      q[1] = Math.max(q[1], 0.03);
      tailPts.push(q);
      tr.push((p.tailR ?? R * 0.6) * (1 - t) + 0.006);
    }
    b.chain(tailPts, tr, gBody, skin);
    if (p.spikes) {
      // tail tip blade
      const e = tailPts[tailPts.length - 1];
      b.ell(add(e, [-0.05, 0.02, 0]), [0.09, 0.07, 0.012], gHard, horn);
    }
  }

  // ---------- spikes along the back ----------
  if (p.spikes) {
    const start = upright ? [shoulder, add(neckPts[1], [0, 0, 0])] : [add(neckBase, [0, R * 0.1, 0])];
    const spine: V3[] = [...neckPts.slice(1, -1), add(neckBase, [0, 0, 0])];
    for (let i = 0; i < spine.length; i++) {
      const s = spine[i];
      b.cone(add(s, [0, neckRadii[i + 1] * 0.7, 0]), add(s, [-0.03, neckRadii[i + 1] * 0.7 + 0.07 - i * 0.004, 0]), 0.025, 0.004, gHard, horn);
    }
    if (!upright) {
      for (let i = 0; i < 6; i++) {
        const x = 0.3 - i * 0.14;
        const y = bodyY + R * (1.0 - Math.abs(x) * 0.1);
        b.cone([x, y - 0.02, 0], [x - 0.04, y + 0.07, 0], 0.03, 0.005, gHard, horn);
      }
    }
    void start;
  }

  // ---------- stripes (tiger) ----------
  if (p.stripes) {
    const st = b.mat({ col: [24, 20, 18], spec: 0.1, shin: 10 });
    for (let i = 0; i < 9; i++) {
      const x = -0.4 + i * 0.1;
      b.ell([x, bodyY + R * 0.52, 0], [0.018, R * 0.62, R * 0.55], gHard, st);
    }
  }

  // ---------- wings ----------
  if (p.wings && p.wings !== 'none') {
    const spread = o.spread ?? true;
    for (const z of [-1, 1]) {
      const at: V3 = upright ? [0.0, h + 0.78, z * 0.12] : [0.2, bodyY + R * 0.9, z * R * 0.55];
      if (p.wings === 'bat') {
        const lift = (spread ? 0.62 : 0.25);
        const elbow = add(at, [-0.12, 0.28 * lift, z * 0.3 * lift]);
        const wrist = add(elbow, [0.1, 0.42 * lift, z * 0.4 * lift]);
        b.chain([at, elbow, wrist], [0.05, 0.04, 0.03], gWing, skin);
        const tips: V3[] = [
          add(wrist, [-0.45, 0.2 * lift, z * 0.5 * lift]),
          add(wrist, [-0.62, -0.02 * lift, z * 0.38 * lift]),
          add(wrist, [-0.62, -0.28 * lift, z * 0.22 * lift]),
          add(wrist, [-0.45, -0.52 * lift, z * 0.1 * lift]),
        ];
        tips.forEach((t, i) => b.cone(wrist, t, 0.022 - i * 0.002, 0.006, gWing, skin));
        const anchor = add(at, [-0.14, -0.14 * lift, z * 0.02]);
        const tri = (A: V3, Bp: V3, Cp: V3) => {
          const c = mul(add(add(A, Bp), Cp), 1 / 3);
          const e1 = sub(Bp, A), e2 = sub(Cp, A);
          const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
          b.box(c, [l1 * 0.42, l2 * 0.38, 0.006], 0.004, gWing, wingM, e1, e2);
        };
        tri(wrist, tips[0], tips[1]);
        tri(wrist, tips[1], tips[2]);
        tri(wrist, tips[2], tips[3]);
        tri(wrist, tips[3], anchor);
        tri(at, wrist, anchor);
      } else {
        // feathered wing: folded along the body, or raised
        const lift = spread ? 1 : 0.2;
        const tip = add(at, [-0.5, 0.35 * lift - 0.1, z * (0.55 * lift + 0.1)]);
        b.ell(lerp3(at, tip, 0.5), [0.3, 0.025, 0.1], gWing, wingM, sub(tip, at), [0, 1, 0]);
      }
    }
  }

  // ---------- arms and newspaper (reading pose) ----------
  if (upright && o.reading) {
    const paperM = b.mat({ col: [230, 224, 206], spec: 0.05, shin: 8, bump: [0.05, 30] });
    const ink = b.mat({ col: [40, 38, 36], spec: 0.05, shin: 8 });
    const pc: V3 = [0.5, h + 0.46, 0];
    const nrm = (z: number): V3 => [1, 0.12, z * 0.4]; // paper normal: faces the reader, leaning back a little
    for (const z of [-1, 1]) {
      const hand: V3 = [pc[0] - 0.02, pc[1] - 0.1, z * 0.3];
      b.chain([[0.08, h + 0.66, z * 0.2], [0.26, h + 0.5, z * 0.3], hand], [0.06, 0.045, 0.04], gLimb, skin);
      b.ell(hand, [0.045, 0.05, 0.045], gLimb, skin);
      for (const dy of [-0.025, 0, 0.025]) b.cone(add(hand, [0.02, dy, 0]), add(hand, [0.08, dy * 1.3, z * 0.0]), 0.012, 0.007, gHard, claw);
      // each page: a thin board, slightly angled to make a fold down the middle
      const page = add(pc, [0.01 * z, 0.0, z * 0.19]);
      b.box(page, [0.012, 0.3, 0.19], 0.004, gHard, paperM, nrm(z));
      // headline and columns
      b.box(add(page, [0.016, 0.2, 0]), [0.003, 0.034, 0.15], 0.001, gHard, ink, nrm(z));
      for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) {
        b.box(add(page, [0.016, 0.1 - r * 0.075, -0.115 + c * 0.115]), [0.003, 0.025, 0.045], 0.001, gHard, ink, nrm(z));
      }
    }
    void flesh;
  }

  // model length for framing: the longest horizontal extent
  let minx = 1e9, maxx = -1e9, maxy = 0;
  for (const q of b.parts) {
    const pts: Array<[V3, number]> = q.k === 'cone' ? [[q.a, q.ra], [q.b, q.rb]] : q.k === 'ell' ? [[q.c, Math.max(...q.r)]] : [[q.c, Math.max(...q.h)]];
    for (const [c, r] of pts) { minx = Math.min(minx, c[0] - r); maxx = Math.max(maxx, c[0] + r); maxy = Math.max(maxy, c[1] + r); }
  }
  const length = Math.max(maxx - minx, maxy) * 1.02;
  return { parts: b.parts, mats: b.mats, groupK: b.groupK, length };
}

const C = (r: number, g: number, b: number): RGB => [r, g, b];

/** Species table. Add a line to teach the painter a new animal. */
export const SPECIES: Record<string, { words: string[]; plan: Plan; upright?: boolean }> = {
  dragon: {
    words: ['dragon', 'drake', 'wyvern'],
    plan: { kind: 'quad', bodyR: 0.19, legLen: 0.3, legR: 0.055, neck: 0.55, neckRise: 0.85, head: 0.15, snout: 0.15, tail: 1.2, tailR: 0.13, horns: 2, wings: 'bat', spikes: true, col: C(46, 120, 70), belly: C(214, 190, 120), bump: [0.35, 55], spec: 0.35 },
    upright: true,
  },
  unicorn: { words: ['unicorn'], plan: { kind: 'quad', bodyR: 0.17, legLen: 0.62, legR: 0.04, neck: 0.42, neckRise: 0.95, head: 0.13, snout: 0.16, tail: 0.5, tailR: 0.06, horns: 1, ears: 'point', mane: true, col: C(238, 236, 232), bump: [0.04, 40], spec: 0.35 } },
  lion: { words: ['lion', 'lioness'], plan: { kind: 'quad', bodyR: 0.17, legLen: 0.36, legR: 0.06, neck: 0.22, neckRise: 0.5, head: 0.15, snout: 0.09, tail: 0.75, tailR: 0.04, ears: 'round', mane: true, col: C(196, 148, 74), bump: [0.1, 80] } },
  tiger: { words: ['tiger'], plan: { kind: 'quad', bodyR: 0.17, legLen: 0.36, legR: 0.06, neck: 0.2, neckRise: 0.45, head: 0.15, snout: 0.09, tail: 0.8, tailR: 0.045, ears: 'round', stripes: true, col: C(214, 120, 40), belly: C(240, 230, 210), bump: [0.08, 80] } },
  wolf: { words: ['wolf', 'fox', 'coyote'], plan: { kind: 'quad', bodyR: 0.15, legLen: 0.5, legR: 0.04, neck: 0.22, neckRise: 0.45, head: 0.12, snout: 0.15, tail: 0.55, tailR: 0.055, ears: 'point', col: C(120, 118, 116), belly: C(200, 196, 188), bump: [0.12, 90] } },
  cat: { words: ['cat', 'kitten', 'tabby'], plan: { kind: 'quad', bodyR: 0.14, legLen: 0.3, legR: 0.045, neck: 0.15, neckRise: 0.5, head: 0.14, snout: 0.05, tail: 0.8, tailR: 0.04, ears: 'point', col: C(204, 140, 84), belly: C(238, 226, 206), bump: [0.08, 90] } },
  bear: { words: ['bear', 'grizzly'], plan: { kind: 'quad', bodyR: 0.27, legLen: 0.3, legR: 0.09, neck: 0.12, neckRise: 0.3, head: 0.17, snout: 0.1, tail: 0.1, tailR: 0.06, ears: 'round', col: C(94, 62, 40), bump: [0.12, 70] } },
  giraffe: { words: ['giraffe'], plan: { kind: 'quad', bodyR: 0.17, legLen: 0.95, legR: 0.04, neck: 1.0, neckRise: 1.2, head: 0.11, snout: 0.1, tail: 0.5, tailR: 0.025, ears: 'point', horns: 2, col: C(214, 170, 84), belly: C(240, 226, 190), bump: [0.12, 8] } },
  pig: { words: ['pig', 'boar', 'hog'], plan: { kind: 'quad', bodyR: 0.22, legLen: 0.2, legR: 0.05, neck: 0.08, neckRise: 0.2, head: 0.16, snout: 0.08, tail: 0.1, tailR: 0.02, ears: 'round', col: C(232, 168, 160), bump: [0.04, 70] } },
  griffin: { words: ['griffin', 'gryphon'], plan: { kind: 'quad', bodyR: 0.17, legLen: 0.4, legR: 0.055, neck: 0.3, neckRise: 0.8, head: 0.13, snout: 0.12, tail: 0.6, tailR: 0.05, wings: 'feather', ears: 'point', col: C(188, 140, 70), belly: C(226, 200, 150), bump: [0.1, 80] } },
};

/** The same species table with pose helpers; everything else (placement, colour words) lives in library/creatures.ts. */
export function speciesBuild(key: string, opts: BuildOptions) {
  const s = SPECIES[key];
  const reading = !!opts.reading && !!s.upright;
  const plan: Plan = reading ? { ...s.plan, kind: 'upright', legLen: 0.34, legR: 0.07, bodyR: 0.2, neck: 0.32, neckRise: 1.2, head: 0.17, tail: 0.9 } : s.plan;
  return buildCreature(plan, { ...opts, reading });
}
