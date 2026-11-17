/**
 * Parallel painting. The picture is cut into horizontal bands that overlap; each band is painted independently (on its
 * own worker thread) with the same global focus, light, paper and grade, then the bands are blended back together in
 * their overlaps. Brush strokes are local, so the seams disappear in the blend.
 *
 * This file is environment-free: node (src/parallel-node.ts) and the browser (web/app.ts) both use it.
 */
import { compareImages } from './metrics';
import { RenderOptions, RenderResult, RGBAImage } from './paint';
import { PRESETS } from './presets';

export interface Band {
  /** Rows of the picture this band is mainly responsible for. */
  y0: number;
  y1: number;
  /** Rows actually painted (own rows plus overlap into the neighbours). */
  ext0: number;
  ext1: number;
}

/** Cuts `h` rows into `n` bands with `margin` rows of overlap on each inside edge. */
export function planBands(h: number, n: number, margin: number): Band[] {
  n = Math.max(1, Math.min(n, Math.floor(h / Math.max(1, margin * 3))));
  const out: Band[] = [];
  for (let i = 0; i < n; i++) {
    const y0 = Math.round((h * i) / n), y1 = Math.round((h * (i + 1)) / n);
    out.push({ y0, y1, ext0: Math.max(0, y0 - margin), ext1: Math.min(h, y1 + margin) });
  }
  return out;
}

/** Overlap needed so strokes crossing a band edge are fully inside the neighbour: about one of the biggest brushes. */
export function bandMargin(w: number, h: number, opts: RenderOptions): number {
  const preset = typeof opts.preset === 'object' ? opts.preset : PRESETS[opts.preset ?? 'pastel'];
  const scale = Math.max(w, h) / 1920;
  const biggest = Math.max(...(preset?.layers ?? [{ radius: 34 }]).map((l) => l.radius));
  return Math.ceil(biggest * scale * 0.9 + 6);
}

/** Everything a worker needs to paint one band (plain data, safe to post between threads). */
export interface BandJob {
  src: RGBAImage;
  opts: RenderOptions;
}

/** Default subject/light for the whole picture are decided once here so every band agrees on them. */
export function makeBandJobs(
  src: RGBAImage,
  opts: RenderOptions,
  bands: Band[],
  globals: { focus: { x: number; y: number }; light: { x: number; y: number } }
): BandJob[] {
  const { width: w, height: h } = src;
  return bands.map((b) => {
    const rows = b.ext1 - b.ext0;
    const bandOpts: RenderOptions = {
      preset: opts.preset,
      overrides: opts.overrides,
      seed: opts.seed,
      region: { y0: b.ext0, fullW: w, fullH: h },
      focus: { x: globals.focus.x, y: globals.focus.y - b.ext0 },
      light: { x: globals.light.x, y: globals.light.y - b.ext0 },
    };
    if (opts.flowHint) {
      bandOpts.flowHint = {
        angle: opts.flowHint.angle.slice(b.ext0 * w, b.ext1 * w),
        weight: opts.flowHint.weight.slice(b.ext0 * w, b.ext1 * w),
      };
    }
    if (opts.overlay) {
      bandOpts.overlay = [];
      for (const m of opts.overlay) {
        let lo = Infinity, hi = -Infinity;
        for (const p of m.pts) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; }
        if (hi < b.ext0 - m.width || lo > b.ext1 + m.width) continue;
        bandOpts.overlay.push({ ...m, pts: m.pts.map((p) => ({ x: p.x, y: p.y - b.ext0 })) });
      }
    }
    const data = new Uint8ClampedArray(src.data.buffer.slice(src.data.byteOffset + b.ext0 * w * 4, src.data.byteOffset + b.ext1 * w * 4));
    return { src: { width: w, height: rows, data }, opts: bandOpts };
  });
}

/** Blend painted bands into one picture. Each band fades out over `ramp` rows toward its overlap edges. */
export function stitchBands(
  w: number,
  h: number,
  bands: Band[],
  painted: Uint8ClampedArray[],
  ramp: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    let wsum = 0;
    const wts: number[] = [];
    for (let k = 0; k < bands.length; k++) {
      const b = bands[k];
      let wt = 0;
      if (y >= b.ext0 && y < b.ext1) {
        const up = b.ext0 === 0 ? Infinity : y - b.ext0 + 0.5;
        const dn = b.ext1 === h ? Infinity : b.ext1 - y - 0.5;
        wt = Math.max(1e-3, Math.min(1, Math.min(up, dn) / ramp));
      }
      wts.push(wt);
      wsum += wt;
    }
    for (let k = 0; k < bands.length; k++) {
      const wt = wts[k] / wsum;
      if (wt <= 0) continue;
      const src = painted[k];
      const so = (y - bands[k].ext0) * w * 4;
      const oo = y * w * 4;
      for (let i = 0; i < w * 4; i++) out[oo + i] += src[so + i] * wt;
    }
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return out;
}

/** Combine per-band results into one RenderResult; exact mode re-measures the finished picture as a whole. */
export function mergeResults(
  src: RGBAImage,
  opts: RenderOptions,
  bands: Band[],
  results: RenderResult[],
  ramp: number,
  ms: number,
  toFloatRGB: (d: ArrayLike<number>, w: number, h: number) => Float32Array
): RenderResult {
  const { width: w, height: h } = src;
  const data = stitchBands(w, h, bands, results.map((r) => r.data as Uint8ClampedArray), ramp);
  const stats = {
    strokes: results.reduce((s, r) => s + r.stats.strokes, 0),
    contourStrokes: results.reduce((s, r) => s + r.stats.contourStrokes, 0),
    hatchStrokes: results.reduce((s, r) => s + r.stats.hatchStrokes, 0),
    ms,
    quality: undefined as RenderResult['stats']['quality'],
  };
  const preset = typeof opts.preset === 'object' ? opts.preset : PRESETS[opts.preset ?? 'pastel'];
  if (preset?.exact || opts.overrides?.exact) stats.quality = compareImages(data, toFloatRGB(src.data, w, h), w, h);
  return { width: w, height: h, data, stats };
}
