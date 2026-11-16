import type { RGB } from '../core/paper';
import type { Ref } from '../scene/ref';

/** Colour words any entry can read. Values are saturated "paint" colours; scenes tint them to the light later. */
export const COLOURS: Record<string, RGB> = {
  red: [178, 16, 24], rosso: [178, 16, 24], crimson: [150, 14, 30], scarlet: [200, 30, 28], maroon: [110, 18, 26], burgundy: [100, 20, 34],
  orange: [224, 96, 26], arancio: [224, 96, 26], yellow: [232, 185, 15], giallo: [232, 185, 15], gold: [201, 162, 74], golden: [201, 162, 74],
  green: [31, 107, 58], verde: [31, 107, 58], lime: [120, 190, 40], teal: [20, 120, 120],
  blue: [31, 79, 168], blu: [31, 79, 168], azure: [60, 130, 210], navy: [20, 34, 80], cyan: [40, 170, 200],
  purple: [91, 45, 130], violet: [110, 60, 150], pink: [224, 106, 154], magenta: [190, 40, 130],
  black: [27, 27, 30], nero: [27, 27, 30], white: [233, 233, 230], bianco: [233, 233, 230], cream: [236, 226, 200],
  silver: [158, 163, 168], grey: [128, 132, 138], gray: [128, 132, 138], grigio: [128, 132, 138], graphite: [70, 72, 78],
  brown: [100, 66, 40], bronze: [140, 100, 50], copper: [170, 100, 60], beige: [210, 190, 160],
};
/** Named paint shades that beat single words ("rosso corsa" is a red, whatever else the text says). */
const NAMED: Array<[RegExp, RGB, number]> = [
  [/rosso corsa|racing red|ferrari red/, [176, 14, 22], 6],
  [/british racing green/, [22, 74, 44], 6],
  [/giallo modena/, [236, 190, 10], 6],
  [/blu tour de france|french blue/, [30, 70, 160], 6],
];

/**
 * Finds the colour of the object itself versus colours attached to its parts. A colour word followed within four
 * words by a part noun ("bright yellow high-performance brake calipers") belongs to that part; the rest vote for the
 * main colour. Returns the winning main colour and the colour found for each part key.
 */
export function readColours(text: string, parts: Record<string, string[]>): { main?: RGB; parts: Record<string, RGB> } {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const partOf = new Map<string, string>();
  for (const [key, nouns] of Object.entries(parts)) for (const n of nouns) partOf.set(n, key);
  const votes = new Map<string, { c: RGB; n: number }>();
  const vote = (name: string, c: RGB, n: number) => { const v = votes.get(name) ?? { c, n: 0 }; v.n += n; votes.set(name, v); };
  for (const [re, c, n] of NAMED) { const hits = text.match(new RegExp(re, 'g')); if (hits) vote(re.source, c, n * hits.length); }
  const found: Record<string, RGB> = {};
  for (let i = 0; i < words.length; i++) {
    const c = COLOURS[words[i]];
    if (!c) continue;
    // Look ahead for the noun this colour describes; stop at another colour or a clause word.
    let owner: string | undefined;
    for (let k = 1; k <= 4 && i + k < words.length; k++) {
      const w = words[i + k];
      const key = partOf.get(w) ?? partOf.get(w.replace(/s$/, ''));
      if (key) { owner = key; break; }
      if (COLOURS[w] || ['and', 'or', 'with', 'while', 'the', 'a', 'an'].includes(w)) break;
    }
    // Parts listed under "_" are ignored (emblems, logos...); other parts keep the first colour found.
    if (owner) { if (owner !== '_' && !found[owner]) found[owner] = c; continue; }
    vote(words[i], c, 1);
  }
  let main: RGB | undefined, best = 0;
  for (const v of votes.values()) if (v.n > best) { best = v.n; main = v.c; }
  return { main, parts: found };
}

/** Maps (u, v) object units to pixels: u along the object (0 = back, 1 = front), v up from the base, both in units of size. */
export function frame(at: { x: number; y: number; size: number; facing: 1 | -1 }) {
  const { x, y, size: L, facing: f } = at;
  return {
    P: (u: number, v: number): [number, number] => [x + f * (u - 0.5) * L, y - v * L],
    /** Pixel centre back to (u, v). */
    UV: (px: number, py: number): [number, number] => [0.5 + (px + 0.5 - x) / (f * L), (y - (py + 0.5)) / L],
    poly: (pts: Array<[number, number]>) => pts.map(([u, v]) => [x + f * (u - 0.5) * L, y - v * L] as [number, number]),
  };
}

/** Linear interpolation through (u, v) points sorted by u. */
export function profile(pts: Array<[number, number]>) {
  return (u: number) => {
    if (u <= pts[0][0]) return pts[0][1];
    for (let k = 1; k < pts.length; k++) if (u <= pts[k][0]) {
      const [u0, v0] = pts[k - 1], [u1, v1] = pts[k];
      return v0 + (v1 - v0) * ((u - u0) / (u1 - u0 || 1));
    }
    return pts[pts.length - 1][1];
  };
}

/** Soft dark ellipse on the ground under an object. */
export function groundShadow(ref: Ref, cx: number, cy: number, rx: number, ry: number, strength: number, depth = 0) {
  ref.box(cx - rx * 1.4, cy - ry * 3, cx + rx * 1.4, cy + ry * 3, (x, y, i) => {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    const a = Math.exp(-d * d * 1.6) * strength;
    if (a > 0.01) ref.put(i, [14, 12, 14], a, depth, 0, 0.3);
  });
}
