// Builds docs/index.html: one self-contained file (app + inlined worker + example). Open it by double-clicking,
// or serve the docs/ folder with GitHub Pages. Needs examples/example.png and example.under.png (npm run example).
import { build } from 'esbuild';
import fs from 'fs';

const opts = { bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' };
const worker = (await build({ ...opts, entryPoints: ['web/worker.ts'] })).outputFiles[0].text;
const app = (await build({ ...opts, entryPoints: ['web/app.ts'], define: { __WORKER_SRC__: JSON.stringify(worker) } })).outputFiles[0].text;
const uri = (p) => `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
const html = fs
  .readFileSync('web/template.html', 'utf8')
  .replace('__EXAMPLE_OUT__', uri('examples/example.jpg'))
  .replace('__EXAMPLE_UNDER__', uri('examples/example.under.jpg'))
  .replace('__APP_JS__', () => app.replace(/<\/script/gi, '<\\/script'));
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/index.html', html);
console.log('docs/index.html', Math.round(html.length / 1024), 'KB');
