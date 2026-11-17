/**
 * A small CPU ray-marcher for solid objects built from signed-distance primitives (ellipsoids, round cones, boxes).
 * Primitives in a group are blended with a smooth union, so a body, a neck and a head melt into one skin.
 * Lighting: one key light with soft shadows, ambient occlusion, sky/ground bounce, specular and fresnel.
 * It draws into the painter's underpainting `Ref`, so everything downstream (strokes, media, grade) still applies.
 */
import type { RGB } from '../core/paper';
import { clamp, hash2D, smoothstep } from '../core/rng';
import type { Ref } from '../scene/ref';

export type V3 = [number, number, number];

export interface Material {
  col: RGB;
  /** Specular strength 0..1 and sharpness. */
  spec?: number;
  shin?: number;
  /** Surface bump: amplitude (0..1) and frequency (cycles per object length): scales, bark, fabric. */
  bump?: [number, number];
  /** Self-lit colour added on top (eyes, lantern glass). */
  emit?: number;
}

export type Part =
  | { k: 'ell'; c: V3; r: V3; R?: number[]; g: number; m: number }
  | { k: 'cone'; a: V3; b: V3; ra: number; rb: number; g: number; m: number }
  | { k: 'box'; c: V3; h: V3; round: number; R?: number[]; g: number; m: number };

export interface Model {
  parts: Part[];
  mats: Material[];
  /** Smooth-union radius per group (world units). 0 = hard union. */
  groupK: number[];
  /** Characteristic length of the model (world units): sets pixel scale and epsilons. */
  length: number;
}

// ---- compiled form: flat typed arrays for speed ----
interface Compiled {
  n: number;
  kind: Uint8Array;
  g: Int32Array;
  m: Int32Array;
  d: Float64Array; // 24 doubles per part
  groups: Array<{ idx: number[]; k: number; c: V3; r: number }>;
}
const S = 24;

/** Rotation with columns = world directions of the local x, y, z axes. Pass unit vectors; they are orthonormalised. */
export function basis(fwd: V3, up: V3 = [0, 1, 0]): number[] {
  const n = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const x = n(fwd);
  let z = cross(x, up);
  if (Math.hypot(...z) < 1e-6) z = cross(x, [1, 0, 0]);
  z = n(z);
  const y = cross(z, x);
  // row-major matrix whose rows are the local axes expressed in world space; used as q = M * (p - c)
  return [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
}

export function compile(model: Model): Compiled {
  const n = model.parts.length;
  const kind = new Uint8Array(n), g = new Int32Array(n), m = new Int32Array(n), d = new Float64Array(n * S);
  const groups: Compiled['groups'] = model.groupK.map((k) => ({ idx: [], k, c: [0, 0, 0] as V3, r: 0 }));
  model.parts.forEach((p, i) => {
    g[i] = p.g; m[i] = p.m; groups[p.g].idx.push(i);
    const o = i * S;
    const R = p.k === 'cone' ? null : p.R ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (p.k === 'ell') {
      kind[i] = 0;
      d.set([...p.c, ...p.r, ...R!], o);
    } else if (p.k === 'box') {
      kind[i] = 2;
      d.set([...p.c, ...p.h, p.round, ...R!], o);
    } else {
      kind[i] = 1;
      const ba: V3 = [p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]];
      const l2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
      const rr = p.ra - p.rb;
      d.set([...p.a, ...ba, l2, rr, l2 - rr * rr, 1 / Math.max(l2, 1e-12), p.ra, p.rb], o);
    }
  });
  // bounding sphere per part (slots 16..19): lets the map skip parts too far away to change the blended distance
  model.parts.forEach((p, i) => {
    let c: V3, r: number;
    if (p.k === 'ell') { c = p.c; r = Math.max(...p.r); }
    else if (p.k === 'box') { c = p.c; r = Math.hypot(...p.h) + p.round; }
    else { c = [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2]; r = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) / 2 + Math.max(p.ra, p.rb); }
    d.set([c[0], c[1], c[2], r], i * S + 16);
  });
  // bounding sphere per group
  for (const grp of groups) {
    if (!grp.idx.length) continue;
    const pts: Array<[V3, number]> = [];
    for (const i of grp.idx) {
      const p = model.parts[i];
      if (p.k === 'ell') pts.push([p.c, Math.max(...p.r)]);
      else if (p.k === 'box') pts.push([p.c, Math.hypot(...p.h) + p.round]);
      else { pts.push([p.a, p.ra]); pts.push([p.b, p.rb]); }
    }
    const c: V3 = [0, 0, 0];
    for (const [q] of pts) { c[0] += q[0] / pts.length; c[1] += q[1] / pts.length; c[2] += q[2] / pts.length; }
    let r = 0;
    for (const [q, rad] of pts) r = Math.max(r, Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) + rad);
    grp.c = c; grp.r = r + grp.k;
  }
  return { n, kind, g, m, d, groups };
}

function partDist(C: Compiled, i: number, x: number, y: number, z: number): number {
  const d = C.d, o = i * S;
  const k = C.kind[i];
  if (k === 1) {
    const ax = d[o], ay = d[o + 1], az = d[o + 2], bx = d[o + 3], by = d[o + 4], bz = d[o + 5];
    const l2 = d[o + 6], rr = d[o + 7], a2 = d[o + 8], il2 = d[o + 9], r1 = d[o + 10], r2 = d[o + 11];
    const px = x - ax, py = y - ay, pz = z - az;
    if (a2 <= 1e-9) { // one end swallows the other: just the bigger sphere
      const big = r1 >= r2 ? 0 : 1;
      const cx = big ? ax + bx : ax, cy = big ? ay + by : ay, cz = big ? az + bz : az;
      return Math.hypot(x - cx, y - cy, z - cz) - Math.max(r1, r2);
    }
    const yy = px * bx + py * by + pz * bz;
    const zz = yy - l2;
    const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = yy * yy * l2, z2 = zz * zz * l2;
    const kk = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > kk) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < kk) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  }
  const dx = x - d[o], dy = y - d[o + 1], dz = z - d[o + 2];
  const R = k === 0 ? o + 6 : o + 7;
  const qx = d[R] * dx + d[R + 1] * dy + d[R + 2] * dz;
  const qy = d[R + 3] * dx + d[R + 4] * dy + d[R + 5] * dz;
  const qz = d[R + 6] * dx + d[R + 7] * dy + d[R + 8] * dz;
  if (k === 0) {
    const rx = d[o + 3], ry = d[o + 4], rz = d[o + 5];
    const k0 = Math.hypot(qx / rx, qy / ry, qz / rz);
    const k1 = Math.hypot(qx / (rx * rx), qy / (ry * ry), qz / (rz * rz));
    return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  }
  const bx = Math.abs(qx) - d[o + 3], by = Math.abs(qy) - d[o + 4], bz = Math.abs(qz) - d[o + 5];
  const ox = Math.max(bx, 0), oy = Math.max(by, 0), oz = Math.max(bz, 0);
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(bx, by, bz), 0) - d[o + 6];
}

function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const m = Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  // Blend only near the surface: far from it, many similar distances would otherwise add up and swell the whole shape.
  const fade = Math.min(1, Math.max(0, 1 - m / (2 * k)));
  return m - h * h * k * 0.25 * fade;
}

export function mapModel(C: Compiled, x: number, y: number, z: number): number {
  let best = 1e9;
  for (const grp of C.groups) {
    if (!grp.idx.length) continue;
    const lb = Math.hypot(x - grp.c[0], y - grp.c[1], z - grp.c[2]) - grp.r;
    if (lb > best && lb > 0) { if (lb < best) best = lb; continue; } // far from this group: a lower bound is enough
    let d = 1e9;
    const dd = C.d;
    for (const i of grp.idx) {
      if (d < 1e9) {
        const o = i * S + 16;
        const lb = Math.hypot(x - dd[o], y - dd[o + 1], z - dd[o + 2]) - dd[o + 3];
        if (lb > d + grp.k) continue; // cannot change the blended distance
      }
      const pd = partDist(C, i, x, y, z);
      d = d === 1e9 ? pd : smin(d, pd, grp.k);
    }
    if (d < best) best = d;
  }
  return best;
}

/** Material at a surface point: parts within a small band of the surface are blended by closeness. */
function surface(C: Compiled, M: Material[], x: number, y: number, z: number, band: number) {
  let wsum = 0, r = 0, g = 0, b = 0, spec = 0, shin = 0, bumpA = 0, bumpF = 0, emit = 0;
  const ds: number[] = new Array(C.n);
  let dmin = 1e9;
  for (let i = 0; i < C.n; i++) { ds[i] = partDist(C, i, x, y, z); if (ds[i] < dmin) dmin = ds[i]; }
  for (let i = 0; i < C.n; i++) {
    const w = Math.exp(-(ds[i] - dmin) / band);
    if (w < 0.01) continue;
    const m = M[C.m[i]];
    wsum += w; r += m.col[0] * w; g += m.col[1] * w; b += m.col[2] * w;
    spec += (m.spec ?? 0.2) * w; shin += (m.shin ?? 24) * w; bumpA += (m.bump?.[0] ?? 0) * w; bumpF += (m.bump?.[1] ?? 0) * w; emit += (m.emit ?? 0) * w;
  }
  const k = 1 / (wsum || 1);
  return { col: [r * k, g * k, b * k] as V3, spec: spec * k, shin: shin * k, bumpA: bumpA * k, bumpF: bumpF * k, emit: emit * k };
}

function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number, c: number) => hash2D(xi + a + zi * 57 + c * 57, yi + b, 311 + c);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), sx), l(h(0, 1, 0), h(1, 1, 0), sx), sy), l(l(h(0, 0, 1), h(1, 0, 1), sx), l(h(0, 1, 1), h(1, 1, 1), sx), sy), sz);
}

export interface View {
  /** Pixel position of the model's origin (the centre of its feet on the ground). */
  x: number; y: number;
  /** Pixels per world unit. */
  ppu: number;
  facing: 1 | -1;
  /** Camera azimuth (radians, 0 = pure side view; positive shows the front) and elevation (radians above the horizon). */
  az?: number;
  el?: number;
  depth?: number;
  /** Colour of what the surfaces mirror and are lit by. */
  env: readonly [number, number, number];
  /** Strength of the cast shadow on the ground, 0..1. */
  shadow?: number;
  /** Ray grid resolution as a fraction of full size (default: about 640 px across). */
  quality?: number;
  /** Clip box in pixels (default: whole image). */
  clip?: { x0: number; y0: number; x1: number; y1: number };
}

/** Ray-march `model` into the Ref. Pixels the model does not cover keep what is already there (except its shadow). */
export function renderModel(ref: Ref, model: Model, view: View) {
  const C = compile(model);
  const L = model.length;
  const az = view.az ?? 0.45, el = view.el ?? 0.12;
  const f = view.facing;
  // camera basis
  const D = L * 6;
  const cam: V3 = [Math.sin(az) * D * Math.cos(el), Math.sin(el) * D, f * Math.cos(az) * D * Math.cos(el)];
  const fwd: V3 = [-cam[0] / D, -cam[1] / D, -cam[2] / D];
  const upW: V3 = [0, 1, 0];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const right = norm(cross(fwd, upW));
  const up = cross(right, fwd);
  const focal = D * view.ppu; // pixels at distance D per world unit

  // light: scene light is given in screen space (x right, y down, z toward viewer)
  const [lx, ly, lz] = ref.L;
  const light = norm([right[0] * lx - up[0] * ly - fwd[0] * lz, right[1] * lx - up[1] * ly - fwd[1] * lz, right[2] * lx - up[2] * ly - fwd[2] * lz]);
  const lcol = ref.lightColor;
  const amb = ref.ambient;
  const env = view.env;

  // bounding sphere of the whole model for ray culling
  const bc: V3 = [0, L * 0.35, 0], br = L * 1.15;
  const eps0 = L * 0.0006;
  const band = L * 0.03;
  const pxWorld = 1 / view.ppu;

  const x0 = Math.max(0, Math.floor(view.x - L * view.ppu * 1.3)), x1 = Math.min(ref.w - 1, Math.ceil(view.x + L * view.ppu * 1.3));
  const y0 = Math.max(0, Math.floor(view.y - L * view.ppu * 1.2)), y1 = Math.min(ref.h - 1, Math.ceil(view.y + L * view.ppu * 0.5));
  const cx0 = view.clip?.x0 ?? 0, cx1 = view.clip?.x1 ?? ref.w - 1, cy0 = view.clip?.y0 ?? 0, cy1 = view.clip?.y1 ?? ref.h - 1;

  const softShadow = (px: number, py: number, pz: number, tmax: number): number => {
    let res = 1, t = eps0 * 8;
    for (let s = 0; s < 16 && t < tmax; s++) {
      const h = mapModel(C, px + light[0] * t, py + light[1] * t, pz + light[2] * t);
      if (h < eps0) return 0;
      res = Math.min(res, (7 * h) / t);
      t += Math.max(h, L * 0.01);
    }
    return clamp(res, 0, 1);
  };

  const shade = (px: number, py: number, pz: number, rd: V3, flowOut?: { a: number }) => {
    const e = eps0 * 2;
    const nx0 = mapModel(C, px + e, py - e, pz - e), nx1 = mapModel(C, px - e, py - e, pz + e), nx2 = mapModel(C, px - e, py + e, pz - e), nx3 = mapModel(C, px + e, py + e, pz + e);
    let n = norm([nx0 - nx1 - nx2 + nx3, -nx0 - nx1 + nx2 + nx3, -nx0 + nx1 - nx2 + nx3]);
    const sf = surface(C, model.mats, px, py, pz, band);
    if (sf.bumpA > 0.001) {
      const fq = sf.bumpF / L;
      const g0 = vnoise(px * fq, py * fq, pz * fq);
      const gx = vnoise(px * fq + 0.4, py * fq, pz * fq) - g0, gy = vnoise(px * fq, py * fq + 0.4, pz * fq) - g0, gz = vnoise(px * fq, py * fq, pz * fq + 0.4) - g0;
      n = norm([n[0] - gx * sf.bumpA * 1.8, n[1] - gy * sf.bumpA * 1.8, n[2] - gz * sf.bumpA * 1.8]);
    }
    const ndl = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
    const sh = ndl > 0 ? softShadow(px + n[0] * eps0 * 4, py + n[1] * eps0 * 4, pz + n[2] * eps0 * 4, L * 3) : 0;
    // ambient occlusion: how much of the hemisphere is blocked nearby
    let occ = 0;
    for (let s = 1; s <= 3; s++) {
      const h = (s * L * 0.05);
      occ += (h - mapModel(C, px + n[0] * h, py + n[1] * h, pz + n[2] * h)) / (1 << s);
    }
    const ao = clamp(1 - occ * 2.2, 0.15, 1);
    // ground contact darkening
    const gdark = smoothstep(0, L * 0.12, py) * 0.4 + 0.6;
    const sky = n[1] * 0.5 + 0.5;
    const hemi: V3 = [
      env[0] * sky + 70 * (1 - sky) * 0.8, env[1] * sky + 62 * (1 - sky) * 0.8, env[2] * sky + 50 * (1 - sky) * 0.8,
    ];
    const hv: V3 = [light[0] - rd[0], light[1] - rd[1], light[2] - rd[2]];
    const hn = norm(hv);
    const ndh = Math.max(0, n[0] * hn[0] + n[1] * hn[1] + n[2] * hn[2]);
    const spec = Math.pow(ndh, sf.shin) * sf.spec * sh * (ndl > 0 ? 1 : 0);
    const fres = Math.pow(1 - Math.max(0, -(n[0] * rd[0] + n[1] * rd[1] + n[2] * rd[2])), 4) * (0.06 + sf.spec * 0.5);
    const out: V3 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const diff = (lcol[c] / 255) * ndl * sh * 1.0;
      const ambient = (hemi[c] / 255) * (amb + 0.34) * ao * gdark;
      out[c] = sf.col[c] * (diff + ambient) + 255 * spec * (lcol[c] / 255) + env[c] * fres * ao + sf.emit * sf.col[c];
    }
    for (let c = 0; c < 3; c++) out[c] = clamp(out[c], 0, 255);
    if (flowOut) {
      // brushes follow the form: perpendicular to the screen-space normal
      const sx = n[0] * right[0] + n[1] * right[1] + n[2] * right[2], sy = -(n[0] * up[0] + n[1] * up[1] + n[2] * up[2]);
      flowOut.a = Math.atan2(sx, sy) + Math.PI / 2;
    }
    return out;
  };

  // Rays are cast on a coarser grid (about 640 px across) and upsampled: the brushes repaint it anyway, and it makes a
  // creature cost seconds instead of minutes at full resolution.
  const bx0 = Math.max(x0, cx0), bx1 = Math.min(x1, cx1), by0 = Math.max(y0, cy0), by1 = Math.min(y1, cy1);
  if (bx1 < bx0 || by1 < by0) return;
  const sc = view.quality ?? Math.min(1, 520 / (bx1 - bx0 + 1));
  const gw = Math.max(2, Math.ceil((bx1 - bx0 + 1) * sc)), gh = Math.max(2, Math.ceil((by1 - by0 + 1) * sc));
  const buf = new Float32Array(gw * gh * 4); // premultiplied r, g, b, alpha
  const flowBuf = new Float32Array(gw * gh);
  const flow = { a: 0 };
  const pxw = 1 / (view.ppu * sc);
  const put = (k: number, c: V3, a: number) => { buf[k * 4] = c[0] * a; buf[k * 4 + 1] = c[1] * a; buf[k * 4 + 2] = c[2] * a; buf[k * 4 + 3] = a; flowBuf[k] = flow.a; };
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const fx = bx0 + (gx + 0.5) / sc, fy = by0 + (gy + 0.5) / sc;
      const sx = fx - view.x, sy = view.y - fy;
      const dx = right[0] * sx + up[0] * sy + fwd[0] * focal, dy = right[1] * sx + up[1] * sy + fwd[1] * focal, dz = right[2] * sx + up[2] * sy + fwd[2] * focal;
      const dl = Math.hypot(dx, dy, dz);
      const rd: V3 = [dx / dl, dy / dl, dz / dl];
      const ox = cam[0] - bc[0], oy = cam[1] - bc[1], oz = cam[2] - bc[2];
      const bq = ox * rd[0] + oy * rd[1] + oz * rd[2];
      const disc = bq * bq - (ox * ox + oy * oy + oz * oz - br * br);
      const k = gy * gw + gx;
      let hit = false, t = 0, dmin = 1e9, tmin = 0;
      if (disc > 0) {
        const sq = Math.sqrt(disc);
        t = Math.max(0, -bq - sq);
        const tEnd = -bq + sq;
        for (let st = 0; st < 56 && t < tEnd; st++) {
          const d = mapModel(C, cam[0] + rd[0] * t, cam[1] + rd[1] * t, cam[2] + rd[2] * t);
          if (d < dmin) { dmin = d; tmin = t; }
          if (d < eps0 * Math.max(1, t / D)) { hit = true; break; }
          t += d * 0.9;
        }
      }
      if (hit) {
        put(k, shade(cam[0] + rd[0] * t, cam[1] + rd[1] * t, cam[2] + rd[2] * t, rd, flow), 1);
      } else if (disc > 0 && dmin < pxw * (tmin / D) * 0.9) {
        const a = clamp(1 - dmin / (pxw * (tmin / D) * 0.9), 0, 1) * 0.85;
        if (a > 0.03) put(k, shade(cam[0] + rd[0] * tmin, cam[1] + rd[1] * tmin, cam[2] + rd[2] * tmin, rd, flow), a);
      } else if (rd[1] < -0.02 && (view.shadow ?? 0.55) > 0) {
        const tg = -cam[1] / rd[1];
        if (tg > 0) {
          const gx2 = cam[0] + rd[0] * tg, gz = cam[2] + rd[2] * tg;
          const r2 = (gx2 * gx2 + gz * gz) / (L * L * 1.4);
          if (r2 < 1.2) {
            const sh = light[1] > 0.05 ? softShadow(gx2, 0.0005 * L, gz, L * 4) : 1;
            const near = mapModel(C, gx2, 0.0005 * L, gz);
            const occ = Math.exp(-Math.max(0, near) / (L * 0.05)) * 0.5;
            const a = clamp((1 - sh) * 0.7 + occ, 0, 1) * (view.shadow ?? 0.55) * clamp(1.4 - r2, 0, 1);
            flow.a = 0;
            if (a > 0.02) put(k, [18, 15, 20], a);
          }
        }
      }
    }
  }
  // composite: bilinear upsample of the premultiplied buffer
  for (let py = by0; py <= by1; py++) {
    const v = (py + 0.5 - by0) * sc - 0.5;
    const j0 = clamp(Math.floor(v), 0, gh - 1), j1 = Math.min(gh - 1, j0 + 1), fv = clamp(v - j0, 0, 1);
    for (let px = bx0; px <= bx1; px++) {
      const u = (px + 0.5 - bx0) * sc - 0.5;
      const i0 = clamp(Math.floor(u), 0, gw - 1), i1 = Math.min(gw - 1, i0 + 1), fu = clamp(u - i0, 0, 1);
      let r = 0, g = 0, b = 0, a = 0;
      for (let q = 0; q < 4; q++) {
        const kk = (q & 2 ? j1 : j0) * gw + (q & 1 ? i1 : i0);
        const wgt = (q & 1 ? fu : 1 - fu) * (q & 2 ? fv : 1 - fv);
        r += buf[kk * 4] * wgt; g += buf[kk * 4 + 1] * wgt; b += buf[kk * 4 + 2] * wgt; a += buf[kk * 4 + 3] * wgt;
      }
      if (a < 0.02) continue;
      const nn = clamp(Math.round(v + 0.0001), 0, gh - 1) * gw + clamp(Math.round(u), 0, gw - 1);
      ref.put(py * ref.w + px, [r / a, g / a, b / a], a, view.depth ?? 0, flowBuf[nn], 0.55);
    }
  }
}
