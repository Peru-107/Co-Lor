import type { Color, LightSpec, Ref } from './ref';

/**
 * Scene format. Positions: x is a fraction of the width, y a fraction of the height (0 = top).
 * Sizes (radius, height, width of a thing) are fractions of the image HEIGHT, so shapes keep their proportions.
 * depth: 0 = foreground, 1 = far away (fades into the haze colour).
 * Elements are painted in order, back to front.
 */
export interface Scene {
  title?: string;
  /** Output size; default 1920x1080. */
  width?: number;
  height?: number;
  seed?: number;
  light: LightSpec;
  haze?: { color: Color; amount: number };
  /** Where the eye should go (sharper detail, vignette centre). Default: auto. */
  focus?: [number, number];
  /** Medium preset for the brushes: pastel | charcoal | gouache | impressionist. */
  medium?: string;
  elements: SceneElement[];
}

export type Part =
  | { capsule: [number, number, number, number, number, number] } // ax, ay, bx, by, radiusA, radiusB
  | { ellipse: [number, number, number, number, number?] }; // cx, cy, rx, ry, angle (radians)

export type Texture = 'none' | 'bark' | 'fur' | 'scales' | 'feathers' | 'stone' | 'cloth';
export type TreeKind = 'broadleaf' | 'banyan' | 'pine' | 'cypress' | 'palm' | 'bare';
export type AnimalKind = 'elephant' | 'cow' | 'deer' | 'horse' | 'dog' | 'goat';
export type RoofKind = 'flat' | 'gable' | 'dome' | 'shikhara';

export type SceneElement =
  | { type: 'sky'; stops: Array<[number, Color]>; sun?: { x: number; y: number; r: number; color?: Color; glow?: Color; glowSize?: number }; moon?: { x: number; y: number; r: number; color?: Color }; stars?: number }
  | { type: 'clouds'; y0: number; y1: number; coverage?: number; scale?: number; stretch?: number; color?: Color; shadow?: Color; depth?: number; seed?: number }
  | { type: 'terrain'; kind?: 'mountain' | 'hill' | 'dune' | 'ground'; y: number; amp: number; color: Color; shadow?: Color; highlight?: Color; snow?: number; freq?: number; bottom?: number; depth?: number; seed?: number }
  | { type: 'water'; y: number; color: Color; deep?: Color; reflect?: number; ripple?: number; bottom?: number }
  | { type: 'tree'; x: number; y: number; size: number; kind?: TreeKind; leaf?: Color; trunk?: Color; lean?: number; depth?: number; seed?: number }
  | { type: 'forest'; x0: number; x1: number; y: number; y1?: number; count: number; size: [number, number]; kinds?: TreeKind[]; leaf?: Color; trunk?: Color; depth?: number; seed?: number }
  | { type: 'building'; x: number; y: number; w: number; h: number; roof?: RoofKind; color?: Color; roofColor?: Color; windows?: { rows: number; cols: number; color?: Color; lit?: boolean }; door?: boolean; depth?: number }
  | { type: 'birds'; x0: number; y0: number; x1: number; y1: number; count: number; size: number; color?: Color; depth?: number; seed?: number }
  | { type: 'figure'; x: number; y: number; size: number; skin?: Color; cloth?: Color; pose?: 'stand' | 'walk' | 'sit'; facing?: 1 | -1; depth?: number }
  | { type: 'boat'; x: number; y: number; size: number; color?: Color; sail?: Color; facing?: 1 | -1; depth?: number }
  | { type: 'grass'; x0?: number; x1?: number; y0: number; y1: number; density?: number; height?: number; color?: Color; color2?: Color; flowers?: Color[]; seed?: number }
  | { type: 'blob'; parts: Part[]; color: Color; shadow?: Color; highlight?: Color; texture?: Texture; depth?: number }
  | { type: 'polygon'; points: Array<[number, number]>; color: Color; color2?: Color; alpha?: number; depth?: number; flow?: number }
  | { type: 'glow'; x: number; y: number; r: number; color: Color; strength?: number }
  | { type: 'mist'; y0: number; y1: number; color?: Color; amount?: number }
  | { type: 'animal'; kind: AnimalKind; x: number; y: number; size: number; color?: Color; facing?: 1 | -1; graze?: boolean; depth?: number }
  | { type: 'rain'; density?: number; angle?: number; color?: Color; y1?: number }
  | { type: 'snowfall'; density?: number; color?: Color }
  | { type: 'lotus'; x0: number; x1: number; y0: number; y1: number; count: number; color?: Color; pad?: Color; seed?: number }
  | { type: 'lamps'; points: Array<[number, number]>; color?: Color; size?: number }
  /** Escape hatch for hand-written code (TypeScript scenes only, never from JSON). */
  | { type: 'custom'; draw: (ref: Ref) => void };
