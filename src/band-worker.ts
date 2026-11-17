// Worker thread: paints one band of a picture (see tiles.ts and parallel-node.ts).
import { parentPort, workerData } from 'node:worker_threads';
import { renderPainting } from './paint';
import type { BandJob } from './tiles';

const job = workerData as BandJob;
const res = await renderPainting(job.src, {
  ...job.opts,
  onProgress: (_stage, frac) => parentPort!.postMessage({ type: 'progress', frac }),
});
parentPort!.postMessage({ type: 'done', data: res.data, stats: res.stats }, [res.data.buffer as ArrayBuffer]);
