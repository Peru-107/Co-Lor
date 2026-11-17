/**
 * The object library. To teach the painter a new thing: write src/library/<name>.ts exporting a LibraryEntry and add it
 * to ENTRIES below. The parser picks up its words, phrases and options; scenes can use { type: 'library', name }.
 */
import type { RGB } from '../core/paper';
import { rgb, type Ref } from '../scene/ref';
import { lighthouse } from './lighthouse';
import type { LibraryEntry } from './types';
import { supercar } from './supercar';
import { windmill } from './windmill';
import { CREATURE_ENTRIES } from './creatures';

export const ENTRIES: LibraryEntry[] = [supercar, lighthouse, windmill, ...CREATURE_ENTRIES];
export const LIBRARY: Record<string, LibraryEntry> = Object.fromEntries(ENTRIES.map((e) => [e.name, e]));

/** Strings like "#b01018" in options become [r, g, b] so hand-written scenes can use either. */
function normalise(o: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === 'string' && /^#[0-9a-f]{3,6}$/i.test(v) ? rgb(v) : v;
  return out;
}

/** Average colour of the upper part of the picture so far: what glossy surfaces will reflect. */
function surroundings(ref: Ref): RGB {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.floor(ref.h * 0.05); y < ref.h * 0.35; y += 4) for (let x = 0; x < ref.w; x += 8) { const p = (y * ref.w + x) * 3; r += ref.rgb[p]; g += ref.rgb[p + 1]; b += ref.rgb[p + 2]; n++; }
  return [r / n, g / n, b / n];
}

/** Scene element { type: 'library' } handler. */
export function drawLibrary(ref: Ref, e: { name: string; x: number; y: number; size: number; facing?: 1 | -1; depth?: number; options?: Record<string, any> }) {
  const entry = LIBRARY[e.name];
  if (!entry) throw new Error(`Unknown library object "${e.name}". Known: ${Object.keys(LIBRARY).join(', ')}`);
  const opts = { env: surroundings(ref), ...entry.defaults, ...normalise(e.options ?? {}) };
  entry.draw(ref, { x: ref.X(e.x), y: ref.Y(e.y), size: ref.S(e.size), facing: e.facing ?? 1, depth: e.depth ?? 0 }, opts);
}
