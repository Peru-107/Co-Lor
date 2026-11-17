/** Node: paint a picture on several worker threads at once. Same result shape as renderPainting. */
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { findFocusLight, RenderOptions, RenderResult, RGBAImage } from './paint';
import { luminance, toFloatRGB } from './analyze';
import { bandMargin, makeBandJobs, mergeResults, planBands } from './tiles';

export async function renderPaintingParallel(src: RGBAImage, opts: RenderOptions = {}, threads = os.availableParallelism()): Promise<RenderResult> {
  const t0 = Date.now();
  const { width: w, height: h } = src;
  const margin = bandMargin(w, h, opts);
  const bands = planBands(h, threads, margin);
  const report = opts.onProgress ?? (() => {});
  if (bands.length < 2) {
    const { renderPainting } = await import('./paint');
    return renderPainting(src, opts);
  }
  report('Analysing image', 0);
  const scale = Math.max(w, h) / 1920;
  const found = opts.focus && opts.light ? undefined : findFocusLight(luminance(toFloatRGB(src.data, w, h), w * h), w, h, scale);
  const globals = { focus: opts.focus ?? found!.focus, light: opts.light ?? found!.light };
  const jobs = makeBandJobs(src, opts, bands, globals);
  if (process.env.PAINTER_TIMING) console.log("analysis done", Date.now() - t0, "ms");

  const fracs = jobs.map(() => 0);
  const results = await Promise.all(
    jobs.map(
      (job, i) =>
        new Promise<RenderResult>((resolve, reject) => {
          const worker = new Worker(new URL('./band-worker.ts', import.meta.url), { workerData: job });
          worker.on('message', (m) => {
            if (m.type === 'progress') {
              fracs[i] = m.frac;
              report(`Painting on ${jobs.length} threads`, fracs.reduce((a, b) => a + b, 0) / jobs.length);
            } else if (m.type === 'done') {
              resolve({ width: w, height: job.src.height, data: m.data, stats: m.stats });
            }
          });
          worker.on('error', reject);
          worker.on('exit', (c) => { if (c !== 0) reject(new Error(`band worker exited with code ${c}`)); });
        })
    )
  );
  if (process.env.PAINTER_TIMING) console.log("workers done", Date.now() - t0, "ms");
  report("Joining bands", 0.97);
  const res = mergeResults(src, opts, bands, results, Math.round(margin * 1.2), Date.now() - t0, toFloatRGB);
  report('Done', 1);
  return res;
}
