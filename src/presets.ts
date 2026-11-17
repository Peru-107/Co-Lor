import { RGB } from './core/paper';

export interface LayerSpec {
  /** Brush radius in px at a 1920px long edge (scaled to the real image). */
  radius: number;
  /** Mean colour error (0..441) a grid cell needs before it gets a stroke. Lower = more faithful. */
  threshold: number;
  grain: number;
  opacity: number;
  /** Max stroke length in steps of one radius. */
  maxLen: number;
  minLen: number;
}

export interface Preset {
  name: string;
  paper: { color: RGB; cell: number; laidPeriod: number; shade: number };
  layers: LayerSpec[];
  /** Reference blur per layer = blurFactor * radius. */
  blurFactor: number;
  /** Grid spacing per layer = gridFactor * radius. */
  gridFactor: number;
  /** 1 = follow the field exactly, lower = smoother, stiffer strokes. */
  curvature: number;
  taper: number;
  wobble: number;
  streak: number;
  toothShade: number;
  colorJitter: number;
  saturation: number;
  /** Draw only shades of `ink` on paper. */
  monochrome?: { ink: RGB; gamma: number };
  /** Less detail far from the focus point (like Jatayu's focus on the face). 0 = uniform. */
  focus: number;
  /** Toned ground laid before the strokes (0 = bare paper shows in gaps). */
  wash?: number;
  contours: { enabled: boolean; strength: number; width: number; lowP: number; highP: number; minLen: number; inkMix: number };
  hatching: { enabled: boolean; levels: number[]; angles: number[]; spacing: number; length: number; width: number; opacity: number };
  grade: { contrast: number; warmth: number; coolShadows: number; vignette: number; emboss: number };
}

const PAPER = { color: [244, 237, 224] as RGB, cell: 3, laidPeriod: 4.5, shade: 9 };

/** Soft pastel on cotton paper with Jatayu's golden-hour grade. */
export const pastel: Preset = {
  name: 'pastel',
  paper: PAPER,
  layers: [
    { radius: 34, threshold: 0, grain: 0.95, opacity: 0.95, maxLen: 10, minLen: 2 },
    { radius: 17, threshold: 28, grain: 0.9, opacity: 0.92, maxLen: 10, minLen: 2 },
    { radius: 8.5, threshold: 22, grain: 0.8, opacity: 0.9, maxLen: 9, minLen: 2 },
    { radius: 4.2, threshold: 19, grain: 0.65, opacity: 0.88, maxLen: 8, minLen: 1 },
    { radius: 2.2, threshold: 19, grain: 0.45, opacity: 0.85, maxLen: 7, minLen: 1 },
  ],
  blurFactor: 0.5,
  gridFactor: 1.0,
  curvature: 0.7,
  taper: 0.55,
  wobble: 0.35,
  streak: 0.35,
  toothShade: 12,
  colorJitter: 10,
  saturation: 1.08,
  focus: 0.6,
  wash: 0.8,
  contours: { enabled: true, strength: 0.32, width: 1.1, lowP: 0.75, highP: 0.93, minLen: 18, inkMix: 0.35 },
  hatching: { enabled: false, levels: [], angles: [], spacing: 0, length: 0, width: 0, opacity: 0 },
  grade: { contrast: 0.085, warmth: 1, coolShadows: 1, vignette: 1, emboss: 0.05 },
};

/** Willow charcoal: monochrome, gritty, with hatching in the darks. */
export const charcoal: Preset = {
  ...pastel,
  name: 'charcoal',
  layers: [
    { radius: 30, threshold: 0, grain: 0.85, opacity: 0.75, maxLen: 9, minLen: 2 },
    { radius: 14, threshold: 22, grain: 0.75, opacity: 0.8, maxLen: 9, minLen: 2 },
    { radius: 7, threshold: 18, grain: 0.65, opacity: 0.85, maxLen: 8, minLen: 1 },
    { radius: 3.4, threshold: 16, grain: 0.5, opacity: 0.85, maxLen: 7, minLen: 1 },
  ],
  streak: 0.5,
  colorJitter: 6,
  saturation: 1,
  monochrome: { ink: [24, 21, 30], gamma: 1.15 },
  contours: { enabled: true, strength: 0.6, width: 1.3, lowP: 0.82, highP: 0.96, minLen: 30, inkMix: 0.85 },
  hatching: { enabled: true, levels: [0.36, 0.22, 0.1], angles: [0.78, -0.62, 0.15], spacing: 13, length: 30, width: 0.9, opacity: 0.32 },
  grade: { contrast: 0.12, warmth: 0.25, coolShadows: 0.3, vignette: 1.2, emboss: 0.08 },
};

/** Flat, opaque gouache: smooth, little paper showing, no outlines. */
export const gouache: Preset = {
  ...pastel,
  name: 'gouache',
  paper: { ...PAPER, shade: 5 },
  layers: pastel.layers.map((l) => ({ ...l, grain: l.grain * 0.25, opacity: 0.97 })),
  streak: 0.15,
  wobble: 0.2,
  toothShade: 5,
  colorJitter: 5,
  saturation: 1.15,
  contours: { ...pastel.contours, enabled: false },
  grade: { contrast: 0.07, warmth: 0.6, coolShadows: 0.6, vignette: 0.7, emboss: 0.02 },
};

/** Impressionist: big loose dabs, lots of colour jitter, little detail. */
export const impressionist: Preset = {
  ...pastel,
  name: 'impressionist',
  layers: [
    { radius: 30, threshold: 0, grain: 0.35, opacity: 0.95, maxLen: 4, minLen: 1 },
    { radius: 15, threshold: 34, grain: 0.3, opacity: 0.92, maxLen: 4, minLen: 1 },
    { radius: 7.5, threshold: 30, grain: 0.25, opacity: 0.9, maxLen: 4, minLen: 1 },
    { radius: 4, threshold: 28, grain: 0.2, opacity: 0.9, maxLen: 3, minLen: 1 },
  ],
  curvature: 0.4,
  taper: 0.3,
  streak: 0.45,
  colorJitter: 34,
  saturation: 1.25,
  focus: 0.3,
  contours: { ...pastel.contours, enabled: false },
  grade: { contrast: 0.06, warmth: 0.8, coolShadows: 0.8, vignette: 0.8, emboss: 0.04 },
};

/**
 * Faithful: a close copy of a reference photo. Small brushes everywhere (no focus falloff), a low error threshold so every
 * region that drifts from the photo gets repainted, tight colour (no jitter, no saturation boost), outlines on to keep
 * edges crisp, and a neutral grade (no warm/cool tint, no vignette). Still strokes on paper, just much more accurate.
 */
export const faithful: Preset = {
  ...pastel,
  name: 'faithful',
  layers: [
    { radius: 24, threshold: 0, grain: 0.5, opacity: 0.97, maxLen: 8, minLen: 2 },
    { radius: 11, threshold: 14, grain: 0.45, opacity: 0.96, maxLen: 8, minLen: 2 },
    { radius: 5.5, threshold: 10, grain: 0.35, opacity: 0.95, maxLen: 7, minLen: 1 },
    { radius: 2.8, threshold: 8, grain: 0.28, opacity: 0.95, maxLen: 6, minLen: 1 },
    { radius: 1.5, threshold: 7, grain: 0.2, opacity: 0.95, maxLen: 5, minLen: 1 },
  ],
  curvature: 0.8,
  streak: 0.2,
  wobble: 0.15,
  toothShade: 7,
  colorJitter: 2,
  saturation: 1,
  focus: 0,
  wash: 0.3,
  paper: { ...PAPER, shade: 6 },
  contours: { ...pastel.contours, strength: 0.22, inkMix: 0.2 },
  grade: { contrast: 0.02, warmth: 0, coolShadows: 0, vignette: 0, emboss: 0.02 },
};

export const PRESETS: Record<string, Preset> = { pastel, charcoal, gouache, impressionist, faithful };
export type PresetName = keyof typeof PRESETS;
