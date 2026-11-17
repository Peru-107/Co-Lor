import { detectEdges, gaussBlur, luminance, orientationField, OrientationField, toFloatRGB, traceChains } from './analyze';
import { blendPixel, paintStroke, setRegionY, StrokeStyle } from './core/brush';
import { compareImages, Quality } from './metrics';
import { createPaper, PaperSubstrate, RGB } from './core/paper';
import { clamp, createRng, humanizePolyline, Point2D, Rng, smoothstep } from './core/rng';
import { applyGrade } from './grade';
import { LayerSpec, Preset, PRESETS } from './presets';

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface RenderOptions {
  preset?: string | Preset;
  /** Partial overrides merged onto the preset. */
  overrides?: Partial<Preset>;
  seed?: number;
  onProgress?: (stage: string, fraction: number) => void;
  /** Called every few thousand strokes; return a promise to let a browser UI breathe. */
  tick?: () => Promise<void> | void;
  /** Per-pixel preferred stroke direction (radians) and how strongly to follow it (0..1). Scenes supply this. */
  flowHint?: { angle: Float32Array; weight: Float32Array };
  /** Pixel position of the main light (sun/moon) for the grade; default: brightest region. */
  light?: { x: number; y: number };
  /** Set when `src` is one horizontal band of a larger picture (see tiles.ts): keeps scale, grain and grade continuous. */
  region?: { y0: number; fullW: number; fullH: number };
  /** Pixel position of the subject; default: most detailed region. */
  focus?: { x: number; y: number };
  /** Linework from a scene (grass blades, birds, roots...) painted as real strokes on top of the colour layers. */
  overlay?: Array<{ pts: Point2D[]; width: number; color: RGB; opacity?: number }>;
}

/** Blend the image's own edge directions with a scene's intended stroke directions. */
function applyFlowHint(f: OrientationField, hint: { angle: Float32Array; weight: Float32Array }) {
  for (let i = 0; i < f.tx.length; i++) {
    const w = hint.weight[i];
    if (w <= 0) continue;
    let hx = Math.cos(hint.angle[i]), hy = Math.sin(hint.angle[i]);
    if (hx * f.tx[i] + hy * f.ty[i] < 0) { hx = -hx; hy = -hy; }
    const k = clamp(w * (1 - 0.55 * f.coh[i]) * 1.6, 0, 1);
    const tx = f.tx[i] * (1 - k) + hx * k, ty = f.ty[i] * (1 - k) + hy * k;
    const l = Math.hypot(tx, ty) || 1;
    f.tx[i] = tx / l;
    f.ty[i] = ty / l;
    f.coh[i] = Math.max(f.coh[i], w * 0.5);
  }
}

export interface RenderResult extends RGBAImage {
  data: Uint8ClampedArray;
  stats: { strokes: number; contourStrokes: number; hatchStrokes: number; ms: number; quality?: Quality };
}

const INK: RGB = [24, 21, 30];

function resolvePreset(o: RenderOptions): Preset {
  const base = typeof o.preset === 'object' ? o.preset : PRESETS[o.preset ?? 'pastel'];
  if (!base) throw new Error(`Unknown preset "${o.preset}". Options: ${Object.keys(PRESETS).join(', ')}`);
  return { ...base, ...(o.overrides ?? {}) } as Preset;
}

function argmax2D(buf: Float32Array, w: number): { x: number; y: number } {
  let best = -Infinity;
  let bi = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] > best) { best = buf[i]; bi = i; }
  return { x: bi % w, y: Math.floor(bi / w) };
}

/** Colour transform applied to the reference before painting (saturation / monochrome ink ramp). */
function prepareReference(rgb: Float32Array, n: number, p: Preset): Float32Array {
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    if (p.monochrome) {
      const t = Math.pow(L / 255, p.monochrome.gamma);
      const ink = p.monochrome.ink;
      const pap = p.paper.color;
      out[i * 3] = ink[0] + (pap[0] - ink[0]) * t;
      out[i * 3 + 1] = ink[1] + (pap[1] - ink[1]) * t;
      out[i * 3 + 2] = ink[2] + (pap[2] - ink[2]) * t;
    } else {
      out[i * 3] = clamp(L + (r - L) * p.saturation, 0, 255);
      out[i * 3 + 1] = clamp(L + (g - L) * p.saturation, 0, 255);
      out[i * 3 + 2] = clamp(L + (b - L) * p.saturation, 0, 255);
    }
  }
  return out;
}

interface Ctx {
  w: number;
  h: number;
  pixels: Uint8ClampedArray;
  paper: PaperSubstrate;
  rng: Rng;
  preset: Preset;
}

function makeStroke(
  c: Ctx,
  x0: number,
  y0: number,
  R: number,
  ref: Float32Array,
  field: OrientationField,
  maxLen: number,
  minLen: number
): { pts: Point2D[]; color: RGB } {
  const { w, h, pixels, rng, preset } = c;
  const i0 = y0 * w + x0;
  const j = preset.colorJitter;
  const lj = (rng() - 0.5) * j;
  const color: RGB = [
    clamp(ref[i0 * 3] + lj + (rng() - 0.5) * j * 0.5, 0, 255),
    clamp(ref[i0 * 3 + 1] + lj + (rng() - 0.5) * j * 0.5, 0, 255),
    clamp(ref[i0 * 3 + 2] + lj + (rng() - 0.5) * j * 0.5, 0, 255),
  ];
  const pts: Point2D[] = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  let dx = 0;
  let dy = 0;
  for (let k = 1; k <= maxLen; k++) {
    const xi = clamp(Math.round(x), 0, w - 1);
    const yi = clamp(Math.round(y), 0, h - 1);
    const i = yi * w + xi;
    if (k > minLen) {
      const rr = ref[i * 3], rg = ref[i * 3 + 1], rb = ref[i * 3 + 2];
      const dCanvas = Math.hypot(rr - pixels[i * 4], rg - pixels[i * 4 + 1], rb - pixels[i * 4 + 2]);
      const dStroke = Math.hypot(rr - color[0], rg - color[1], rb - color[2]);
      if (dCanvas < dStroke) break;
    }
    let tx = field.tx[i];
    let ty = field.ty[i];
    if (field.coh[i] < 0.04) {
      if (k === 1) {
        const a = rng() * Math.PI * 2;
        tx = Math.cos(a);
        ty = Math.sin(a);
      } else {
        tx = dx;
        ty = dy;
      }
    }
    if (k > 1) {
      if (tx * dx + ty * dy < 0) { tx = -tx; ty = -ty; }
      tx = preset.curvature * tx + (1 - preset.curvature) * dx;
      ty = preset.curvature * ty + (1 - preset.curvature) * dy;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
    }
    x += tx * R;
    y += ty * R;
    if (x < 0 || y < 0 || x >= w || y >= h) break;
    dx = tx;
    dy = ty;
    pts.push({ x, y });
  }
  return { pts, color };
}

function shuffle<T>(a: T[], rng: Rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
}

/**
 * Turns any image into a stroke-by-stroke dry-media painting.
 *   1. Analyse: colour reference, stroke-direction field, focus point, light point.
 *   2. Paint coarse-to-fine layers: each layer places strokes only where the canvas still differs
 *      from a blurred reference (Hertzmann 1998 "Painterly Rendering with Curved Brush Strokes").
 *   3. Charcoal contours along real edges, optional hatching in the darks.
 *   4. Jatayu-style cinematic grade + paper emboss.
 */
export async function renderPainting(src: RGBAImage, opts: RenderOptions = {}): Promise<RenderResult> {
  const t0 = Date.now();
  const preset = resolvePreset(opts);
  const progress = opts.onProgress ?? (() => {});
  const tick = async () => { if (opts.tick) await opts.tick(); };
  const { width: w, height: h } = src;
  const n = w * h;
  const region = opts.region;
  const fullW = region?.fullW ?? w, fullH = region?.fullH ?? h;
  const scale = Math.max(fullW, fullH) / 1920;
  setRegionY(region?.y0 ?? 0);
  const rng = createRng(opts.seed ?? 7);

  progress('Analysing image', 0);
  const raw = toFloatRGB(src.data, w, h);
  const source = prepareReference(raw, n, preset);
  const lum = luminance(raw, n);
  await tick();

  const fineField = orientationField(lum, w, h, Math.max(1.5, 4 * scale));
  await tick();
  const coarseField = orientationField(lum, w, h, Math.max(3, 12 * scale));
  if (opts.flowHint) { applyFlowHint(fineField, opts.flowHint); applyFlowHint(coarseField, opts.flowHint); }
  await tick();

  // Focus = most detailed region (pulled 40% toward centre). Light = brightest broad region.
  const found = opts.focus && opts.light ? undefined : findFocusLight(lum, w, h, scale);
  const focus = opts.focus ?? found!.focus;
  const light = opts.light ?? found!.light;
  const diag = Math.hypot(fullW, fullH);
  await tick();

  progress('Laying paper', 0.05);
  const paper = createPaper(w, h, (opts.seed ?? 7) * 31 + 1997, {
    ...preset.paper,
    cell: preset.paper.cell * Math.max(0.6, scale),
    laidPeriod: preset.paper.laidPeriod * Math.max(0.6, scale),
  }, region?.y0 ?? 0);
  const pixels = new Uint8ClampedArray(paper.basePixels);
  const ctx: Ctx = { w, h, pixels, paper, rng, preset };

  const style = (grain: number, opacity: number): StrokeStyle => ({
    opacity,
    grain,
    taper: preset.taper,
    wobble: preset.wobble,
    streak: preset.streak,
    toothShade: preset.toothShade,
  });

  // Toned ground: a soft wash of the blurred subject, so gaps between strokes read as colour, not bare paper.
  if ((preset.wash ?? 0) > 0) {
    const wash = gaussBlur(source, w, h, 3, Math.max(2, preset.layers[0].radius * scale));
    const k = preset.wash ?? 0;
    for (let i = 0; i < n; i++) {
      const tooth = paper.tooth[i];
      const a = k * (0.75 + 0.25 * smoothstep(0.2, 0.8, tooth));
      pixels[i * 4] += (wash[i * 3] - pixels[i * 4]) * a;
      pixels[i * 4 + 1] += (wash[i * 3 + 1] - pixels[i * 4 + 1]) * a;
      pixels[i * 4 + 2] += (wash[i * 3 + 2] - pixels[i * 4 + 2]) * a;
    }
    await tick();
  }

  let strokes = 0;
  const L = preset.layers.length;
  const runLayer = async (layer: LayerSpec, li: number, label = `Painting layer ${li + 1}/${L}`) => {
    const R = Math.max(1.1, layer.radius * scale);
    progress(`${label} (brush ${R.toFixed(1)}px)`, 0.08 + (0.72 * li) / L);
    const ref = gaussBlur(source, w, h, 3, preset.blurFactor * R);
    const field = R >= 10 * scale ? coarseField : fineField;

    const diff = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      diff[i] = Math.hypot(ref[i * 3] - pixels[i * 4], ref[i * 3 + 1] - pixels[i * 4 + 1], ref[i * 3 + 2] - pixels[i * 4 + 2]);
    }

    const g = Math.max(1, Math.round(preset.gridFactor * R));
    const layerStrokes: Array<{ pts: Point2D[]; color: RGB }> = [];
    for (let gy = 0; gy < h; gy += g) {
      for (let gx = 0; gx < w; gx += g) {
        let sum = 0, cnt = 0, best = -1, bx = gx, by = gy;
        const ye = Math.min(h, gy + g), xe = Math.min(w, gx + g);
        for (let y = gy; y < ye; y++) for (let x = gx; x < xe; x++) {
          const d = diff[y * w + x];
          sum += d;
          cnt++;
          if (d > best) { best = d; bx = x; by = y; }
        }
        const fd = Math.hypot(gx - focus.x, gy - focus.y) / diag;
        const T = layer.threshold * (1 + preset.focus * fd * fd * 6 * (li / Math.max(1, L - 1)));
        if (li === 0 || sum / cnt > T) {
          layerStrokes.push(makeStroke(ctx, bx, by, R, ref, field, layer.maxLen, layer.minLen));
        }
      }
    }
    shuffle(layerStrokes, rng);
    const st = style(layer.grain, layer.opacity);
    for (let s = 0; s < layerStrokes.length; s++) {
      const k = layerStrokes[s];
      paintStroke(pixels, paper, k.pts, R, k.color, strokes + s, st);
      if ((s & 2047) === 2047) {
        progress(`${label} (brush ${R.toFixed(1)}px)`, 0.08 + (0.72 * (li + s / layerStrokes.length)) / L);
        await tick();
      }
    }
    strokes += layerStrokes.length;
    await tick();
  };
  for (let li = 0; li < L; li++) await runLayer(preset.layers[li], li);

  // Exact mode: measure against the reference and keep repainting finer until the target similarity is reached.
  let quality: Quality | undefined;
  if (preset.exact) {
    const ex = preset.exact;
    quality = compareImages(pixels, source, w, h);
    for (let pass = 0; pass < ex.passes && quality.similarity < ex.target; pass++) {
      const label = `Refining ${(quality.similarity * 100).toFixed(2)}% -> ${(ex.target * 100).toFixed(0)}% (pass ${pass + 1}/${ex.passes})`;
      await runLayer({ radius: 1, threshold: Math.max(0.5, 1.5 / (pass + 1)), grain: 0, opacity: 1, maxLen: 3, minLen: 1 }, L - 1, label);
      const before = quality.similarity;
      quality = compareImages(pixels, source, w, h);
      if (quality.similarity - before < 0.002) break; // strokes have stopped helping; the touch-up below finishes it
    }
    if (quality.similarity < ex.target) {
      // Still short: correct what is left with single-pixel dabs of the exact reference colour.
      progress('Touching up single pixels', 0.78);
      for (let i = 0; i < n; i++) {
        const r = source[i * 3], g = source[i * 3 + 1], b = source[i * 3 + 2];
        if (Math.abs(pixels[i * 4] - r) > 1.5 || Math.abs(pixels[i * 4 + 1] - g) > 1.5 || Math.abs(pixels[i * 4 + 2] - b) > 1.5) blendPixel(pixels, i, r, g, b, 1);
      }
      quality = compareImages(pixels, source, w, h);
    }
  }

  if (opts.overlay?.length) {
    progress('Painting linework', 0.8);
    const st = style(0.3, 0.92);
    st.streak = 0;
    st.taper = 0.7;
    st.wobble = 0.15;
    let k = 0;
    for (const m of opts.overlay) {
      st.opacity = m.opacity ?? 0.92;
      paintStroke(pixels, paper, m.pts, Math.max(0.5, m.width / 2), m.color, 500000 + k, st);
      if ((++k & 4095) === 0) await tick();
    }
  }

  let contourStrokes = 0;
  if (preset.contours.enabled) {
    progress('Drawing contours', 0.82);
    const cc = preset.contours;
    const mask = detectEdges(lum, w, h, Math.max(1, 1.4 * scale), cc.lowP, cc.highP);
    const chains = traceChains(mask, w, h, Math.round(cc.minLen * Math.max(0.6, scale)));
    const ref = gaussBlur(source, w, h, 3, 2 * Math.max(1, scale));
    const piece = Math.round(55 * Math.max(0.6, scale));
    const every = Math.max(2, Math.round(3 * scale));
    const st = style(0.5, cc.strength);
    st.taper = 0.85;
    st.streak = 0;
    st.wobble = 0.2;
    for (const chain of chains) {
      for (let s = 0; s < chain.length; s += piece) {
        if (rng() < 0.15) continue;
        const seg = chain.slice(s, s + piece + 2).filter((_, i, a) => i % every === 0 || i === a.length - 1);
        if (seg.length < 3) continue;
        const mid = seg[Math.floor(seg.length / 2)];
        const mi = (Math.round(mid.y) * w + Math.round(mid.x)) * 3;
        const fd = Math.hypot(mid.x - focus.x, mid.y - focus.y) / diag;
        const col: RGB = [
          ref[mi] * 0.35 * (1 - cc.inkMix) + INK[0] * cc.inkMix,
          ref[mi + 1] * 0.35 * (1 - cc.inkMix) + INK[1] * cc.inkMix,
          ref[mi + 2] * 0.35 * (1 - cc.inkMix) + INK[2] * cc.inkMix,
        ];
        st.opacity = cc.strength * clamp(1 - preset.focus * fd * 1.2, 0.35, 1);
        const pts = humanizePolyline(seg, rng, 0.8 * Math.max(0.6, scale), 3);
        paintStroke(pixels, paper, pts, cc.width * Math.max(0.7, scale), col, 90000 + contourStrokes, st);
        contourStrokes++;
      }
    }
    await tick();
  }

  let hatchStrokes = 0;
  if (preset.hatching.enabled) {
    progress('Hatching shadows', 0.9);
    const hc = preset.hatching;
    const lb = gaussBlur(lum, w, h, 1, 2 * Math.max(1, scale));
    const sp = hc.spacing * Math.max(0.6, scale);
    const len = hc.length * Math.max(0.6, scale);
    const ink = preset.monochrome?.ink ?? INK;
    const st = style(0.6, hc.opacity);
    st.taper = 0.9;
    st.streak = 0;
    for (let lv = 0; lv < hc.levels.length; lv++) {
      const level = hc.levels[lv] * 255;
      const a = hc.angles[lv % hc.angles.length];
      const dx = Math.cos(a), dy = Math.sin(a);
      for (let y = 0; y < h; y += sp) {
        for (let x = 0; x < w; x += sp) {
          const px = x + (rng() - 0.5) * sp;
          const py = y + (rng() - 0.5) * sp;
          const xi = clamp(Math.round(px), 0, w - 1), yi = clamp(Math.round(py), 0, h - 1);
          const v = lb[yi * w + xi];
          if (v >= level) continue;
          const l2 = len * (0.6 + rng() * 0.6) * 0.5;
          const pts = humanizePolyline(
            [{ x: px - dx * l2, y: py - dy * l2 }, { x: px + dx * l2, y: py + dy * l2 }],
            rng,
            0.6 * Math.max(0.6, scale),
            4
          );
          st.opacity = hc.opacity * clamp((level - v) / level + 0.3, 0, 1);
          paintStroke(pixels, paper, pts, hc.width * Math.max(0.7, scale), ink, 200000 + hatchStrokes, st);
          hatchStrokes++;
        }
      }
      await tick();
    }
  }

  progress('Grading', 0.96);
  applyGrade(pixels, paper, preset.grade, light, focus, region ? { width: fullW, height: fullH } : undefined);
  if (preset.exact) quality = compareImages(pixels, source, w, h); // final number, after grading
  progress('Done', 1);
  return { width: w, height: h, data: pixels, stats: { strokes, contourStrokes, hatchStrokes, ms: Date.now() - t0, quality } };
}

/** Default subject (most detailed region, pulled toward the centre) and main light (brightest broad region). */
export function findFocusLight(lum: Float32Array, w: number, h: number, scale: number) {
  const detail = gaussBlur(orientationGradient(lum, w, h, scale), w, h, 1, Math.max(w, h) * 0.06);
  const fPeak = argmax2D(detail, w);
  return {
    focus: { x: fPeak.x * 0.6 + w * 0.2, y: fPeak.y * 0.6 + h * 0.2 },
    light: argmax2D(gaussBlur(lum, w, h, 1, Math.max(w, h) * 0.1), w),
  };
}

/** Gradient magnitude on a lightly blurred luminance: a cheap "where is the detail" map. */
function orientationGradient(lum: Float32Array, w: number, h: number, scale: number): Float32Array {
  const b = gaussBlur(lum, w, h, 1, Math.max(1, 2 * scale));
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] = Math.hypot(b[i + 1] - b[i - 1], b[i + w] - b[i - w]);
    }
  }
  return out;
}

export { PRESETS } from './presets';
export type { Preset } from './presets';
