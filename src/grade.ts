import { PaperSubstrate } from './core/paper';
import { clamp, smoothstep } from './core/rng';
import { Preset } from './presets';

/**
 * Final light-and-colour pass, like a photographer's grade:
 *   contrast  - gentle S-curve on brightness (keeps colour, deepens darks, lifts lights)
 *   warmth    - soft warm bloom spreading from the light source
 *   cool      - a hint of blue in the deepest shadows (warm light, cool shade)
 *   vignette  - darkens the edges, centred on the subject
 *   emboss    - paper tooth catches a little light everywhere
 */
export function applyGrade(
  pixels: Uint8ClampedArray,
  paper: PaperSubstrate,
  g: Preset['grade'],
  light: { x: number; y: number },
  focus: { x: number; y: number },
  /** Size of the whole picture when `pixels` is only one band of it (light and focus are in band coordinates). */
  whole?: { width: number; height: number }
) {
  const { width: W, height: H, tooth } = paper;
  const FW = whole?.width ?? W, FH = whole?.height ?? H;
  const diag = Math.hypot(FW, FH);
  const bloomR = diag * 0.33;
  const k = g.contrast * 3.2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = i * 4;
      let r = pixels[p], gr = pixels[p + 1], b = pixels[p + 2];
      const L = (0.2126 * r + 0.7152 * gr + 0.0722 * b) / 255;

      // S-curve: blend L toward smoothstep(L), applied as a ratio so hue is kept.
      const curved = L + (L * L * (3 - 2 * L) - L) * k;
      const ratio = L > 0.004 ? curved / L : 1;
      r *= ratio; gr *= ratio; b *= ratio;

      const dl = Math.hypot(x - light.x, y - light.y) / bloomR;
      const bloom = g.warmth / (1 + dl * dl * 2.5) * 0.9;
      r += bloom * 11; gr += bloom * 6; b -= bloom * 2;

      const shadow = smoothstep(0.28, 0.03, L) * g.coolShadows;
      r -= shadow * 3; b += shadow * 7;

      const dx = (x - focus.x) / (FW * 0.62), dy = (y - focus.y) / (FH * 0.68);
      const vig = 1 - smoothstep(0.55, 1.6, Math.sqrt(dx * dx + dy * dy)) * 0.3 * g.vignette;
      const emb = 1 + (tooth[i] - 0.5) * g.emboss;
      const m = vig * emb;
      pixels[p] = clamp(r * m, 0, 255);
      pixels[p + 1] = clamp(gr * m, 0, 255);
      pixels[p + 2] = clamp(b * m, 0, 255);
    }
  }
}
