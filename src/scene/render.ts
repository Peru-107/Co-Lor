import { renderPainting, RenderResult } from '../paint';
import { ELEMENTS } from './elements';
import { Ref } from './ref';
import type { Scene } from './types';

export interface SceneRender {
  /** The procedural underpainting (what code drew before the brushes). */
  underpainting: { width: number; height: number; data: Uint8ClampedArray };
  painting: RenderResult;
}

/** Draws the scene's shapes into an underpainting (RGBA + stroke-direction hints). */
export function drawScene(scene: Scene, size?: { width?: number; height?: number }) {
  const w = size?.width ?? scene.width ?? 1920;
  const h = size?.height ?? scene.height ?? 1080;
  const ref = new Ref(w, h, scene.light, scene.haze, scene.seed ?? 7);
  for (const [idx, el] of scene.elements.entries()) {
    ref.cur = idx;
    const fn = ELEMENTS[el.type];
    if (!fn) throw new Error(`Unknown element type "${el.type}"`);
    fn(ref, el);
  }
  // Linework occlusion: keep only the parts of each mark still visible in the final underpainting
  // (where the pixel under it still has the mark's colour); anything drawn later on top hides it.
  const visible: typeof ref.overlay = [];
  for (const m of ref.overlay) {
    let run: Array<{ x: number; y: number }> = [];
    const flush = () => { if (run.length >= 2) visible.push({ ...m, pts: run }); run = []; };
    const dense: Array<{ x: number; y: number }> = [];
    for (let k = 0; k < m.pts.length; k++) {
      if (k === 0) { dense.push(m.pts[0]); continue; }
      const a = m.pts[k - 1], b = m.pts[k];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
      for (let s2 = 1; s2 <= steps; s2++) dense.push({ x: a.x + (b.x - a.x) * (s2 / steps), y: a.y + (b.y - a.y) * (s2 / steps) });
    }
    for (const p of dense) {
      const xi = Math.round(p.x), yi = Math.round(p.y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) { flush(); continue; }
      // Visible if this element still owns the pixel or a neighbour (thin marks may not own their centre).
      let own = false;
      for (let dy = -1; dy <= 1 && !own; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = xi + dx, yy = yi + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && ref.owner[yy * w + xx] === m.owner) { own = true; break; }
      }
      if (own) run.push(p); else flush();
    }
    flush();
  }
  ref.overlay = visible;

  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = ref.rgb[i * 3];
    data[i * 4 + 1] = ref.rgb[i * 3 + 1];
    data[i * 4 + 2] = ref.rgb[i * 3 + 2];
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data, ref };
}

/** Text-free path: scene -> underpainting -> dry-media painting. */
export async function renderScene(
  scene: Scene,
  opts: { width?: number; height?: number; medium?: string; seed?: number; onProgress?: (s: string, f: number) => void; tick?: () => Promise<void> | void; paint?: typeof renderPainting } = {}
): Promise<SceneRender> {
  opts.onProgress?.('Drawing scene', 0);
  const { width, height, data, ref } = drawScene(scene, opts);
  await opts.tick?.();
  const focus = scene.focus ? { x: scene.focus[0] * width, y: scene.focus[1] * height } : undefined;
  const painting = await (opts.paint ?? renderPainting)(
    { width, height, data },
    {
      preset: opts.medium ?? scene.medium ?? 'pastel',
      seed: opts.seed ?? scene.seed ?? 7,
      flowHint: { angle: ref.flowA, weight: ref.flowW },
      overlay: ref.overlay,
      light: ref.sun ?? undefined,
      focus,
      onProgress: (s, f) => opts.onProgress?.(s, 0.05 + f * 0.95),
      tick: opts.tick,
    }
  );
  return { underpainting: { width, height, data }, painting };
}
