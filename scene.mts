#!/usr/bin/env -S npx tsx
// Usage: npx tsx scene.mts <scene.ts|scene.json> <out.png> [--medium pastel|charcoal|gouache|impressionist] [--width 1920 --height 1080] [--seed 7]
//        npx tsx scene.mts --text "a temple by a lake at sunset" <out.png>   (built-in word parser)
//        npx tsx scene.mts --text-file notes/ferrari-spec.txt <out.png>      (long descriptions)
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { renderScene } from './src/scene/render.ts';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

let scene: any;
let out: string;
const text = flag('text') ?? (flag('text-file') ? fs.readFileSync(flag('text-file')!, 'utf8') : undefined);
if (text) {
  const { textToScene } = await import('./src/scene/parse.ts');
  scene = textToScene(text, Number(flag('seed') ?? 7));
  out = pos[0];
} else {
  const file = pos[0];
  out = pos[1];
  scene = file.endsWith('.json') ? JSON.parse(fs.readFileSync(file, 'utf8')) : (await import(pathToFileURL(path.resolve(file)).href)).default;
}
if (!out) { console.error('Usage: npx tsx scene.mts <scene.ts|.json> <out.png>  |  --text "..." <out.png>'); process.exit(1); }

let last = '';
const res = await renderScene(scene, {
  width: flag('width') ? Number(flag('width')) : undefined,
  height: flag('height') ? Number(flag('height')) : undefined,
  medium: flag('medium'),
  seed: flag('seed') ? Number(flag('seed')) : undefined,
  onProgress: (s) => { if (s !== last) console.log(s); last = s; },
});
const save = (img: { width: number; height: number; data: Uint8ClampedArray }, file: string) =>
  sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toFile(file);
await save(res.underpainting, out.replace(/\.png$/, '') + '.under.png');
await save(res.painting, out);
if (text) fs.writeFileSync(out.replace(/\.png$/, '') + '.scene.json', JSON.stringify(scene, null, 2));
console.log(`${out}: ${res.painting.stats.strokes} strokes, ${(res.painting.stats.ms / 1000).toFixed(1)}s`);
