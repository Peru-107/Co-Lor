#!/usr/bin/env -S npx tsx
// Usage: npx tsx cli.mts <input image> <output.png> [--preset pastel|charcoal|gouache|impressionist] [--size 1920] [--seed 7]
import sharp from 'sharp';
import { renderPainting, PRESETS } from './src/paint.ts';

const args = process.argv.slice(2);
const flag = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [input, output] = positional;
if (!input || !output) {
  console.error(`Usage: npx tsx cli.mts <input> <output.png> [--preset ${Object.keys(PRESETS).join('|')}] [--size 1920] [--seed 7]`);
  process.exit(1);
}
const size = Number(flag('size', '1920'));
const preset = flag('preset', 'pastel');
const seed = Number(flag('seed', '7'));

const { data, info } = await sharp(input)
  .rotate()
  .resize({ width: size, height: size, fit: 'inside' })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

let last = '';
const res = await renderPainting(
  { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) },
  {
    preset,
    seed,
    overrides: flag('target', '') ? { exact: { target: Number(flag('target', '0.99')), passes: Number(flag('passes', '4')) } } : undefined,
    onProgress: (stage) => {
      if (stage !== last) console.log(stage);
      last = stage;
    },
  }
);
await sharp(Buffer.from(res.data.buffer), { raw: { width: res.width, height: res.height, channels: 4 } }).png().toFile(output);
console.log(`${output}: ${res.width}x${res.height}, ${res.stats.strokes} paint strokes, ${res.stats.contourStrokes} contours, ${res.stats.hatchStrokes} hatches, ${(res.stats.ms / 1000).toFixed(1)}s`);
const q = res.stats.quality;
if (q) console.log(`match with reference: ${(q.similarity * 100).toFixed(2)}%  (SSIM ${q.ssim.toFixed(4)}, mean error ${q.mae.toFixed(2)}/255, PSNR ${q.psnr.toFixed(1)} dB, ${(q.within4 * 100).toFixed(1)}% of pixels within 4 levels)`);
