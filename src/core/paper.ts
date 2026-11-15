import { clamp, hash2D, noise2D } from './rng';

export type RGB = readonly [number, number, number];

export interface PaperSubstrate {
  width: number;
  height: number;
  /** Paper tooth heightmap in [0, 1]; every brush reads it, so pigment catches on the peaks first. */
  tooth: Float32Array;
  /** Bare paper colour (RGBA). */
  basePixels: Uint8ClampedArray;
}

export interface PaperOptions {
  color: RGB;
  /** Grain cell size in px. */
  cell: number;
  /** Spacing of the horizontal laid lines, px. */
  laidPeriod: number;
  /** How strongly the tooth shades the bare paper. */
  shade: number;
}

/**
 * Cold-pressed cotton paper: two octaves of grain (fibre clumps + finer tooth), a per-pixel speck,
 * faint horizontal laid lines from the mould, and widely spaced vertical chain lines.
 */
export function createPaper(width: number, height: number, seed: number, o: PaperOptions): PaperSubstrate {
  const n = width * height;
  const tooth = new Float32Array(n);
  const basePixels = new Uint8ClampedArray(n * 4);
  const inv = 1 / o.cell;
  const chainGap = o.laidPeriod * 18;
  for (let y = 0; y < height; y++) {
    const laid = Math.sin((y / o.laidPeriod) * Math.PI);
    const laidTerm = laid * laid * 0.08;
    for (let x = 0; x < width; x++) {
      const clump = noise2D(x * inv * 0.45, y * inv * 0.45, seed);
      const fine = noise2D(x * inv * 1.3 + y * inv * 0.4, y * inv * 1.3 - x * inv * 0.4, seed + 7);
      const speck = hash2D(x, y, seed + 13);
      const cx = ((x % chainGap) + chainGap) % chainGap - chainGap / 2;
      const chain = Math.exp(-(cx * cx) / (o.laidPeriod * 0.6)) * 0.05;
      const h = clamp(clump * 0.42 + fine * 0.28 + speck * 0.22 + laidTerm + chain, 0, 1);
      const i = y * width + x;
      tooth[i] = h;
      const s = (h - 0.5) * o.shade;
      basePixels[i * 4] = clamp(o.color[0] + s, 0, 255);
      basePixels[i * 4 + 1] = clamp(o.color[1] + s, 0, 255);
      basePixels[i * 4 + 2] = clamp(o.color[2] + s * 1.1, 0, 255);
      basePixels[i * 4 + 3] = 255;
    }
  }
  return { width, height, tooth, basePixels };
}
