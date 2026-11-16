import type { Ref } from '../scene/ref';

export type Setting = 'studio' | 'road' | 'land' | 'water' | 'sky';

/** Facts about the scene an entry may want while drawing (lit windows at night, what the sky looks like...). */
export interface DrawEnv {
  time: 'dawn' | 'day' | 'golden' | 'dusk' | 'night';
  /** Rough colour of the surroundings, for glossy reflections. */
  env: readonly [number, number, number];
  /** True at dusk and night: lamps, lanterns and windows glow. */
  lit: boolean;
}

/**
 * A library entry is one drawable thing the painter knows. Adding a file to src/library and listing it in
 * index.ts teaches the whole system (parser, scenes, app) a new object; the engine never changes.
 */
export interface LibraryEntry {
  name: string;
  /** Single words that trigger it (lowercase, singular). */
  words: string[];
  /** Multi-word triggers, e.g. "sports car". */
  phrases?: string[];
  /**
   * Words that describe parts of this object rather than separate things (a car's "horse" badge, a lighthouse's
   * "lamp"). When the entry is mentioned, these words are understood as part of it and never become their own objects.
   */
  absorbs?: string[];
  /** Reads options (colours, finishes...) from the full lowercase text. */
  extract?: (text: string) => Record<string, any>;
  defaults: Record<string, any>;
  placement: {
    /** Size when it is the subject, as a fraction of image height (its main dimension). */
    size: number;
    /** Settings it looks best in, first = default when the text names none. */
    prefers: Setting[];
    /** How far the object's own drawing extends above its base, in units of size (for framing). */
    height: number;
    /** Count used for a bare plural ("windmills"). Default 3. */
    plural?: number;
  };
  /** Draw at (x, y) = centre of its base in pixels, size in pixels, facing 1 = right, -1 = left. */
  draw(ref: Ref, at: { x: number; y: number; size: number; facing: 1 | -1; depth: number }, opts: Record<string, any> & Partial<DrawEnv>): void;
}
