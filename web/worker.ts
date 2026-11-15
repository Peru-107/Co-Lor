import { renderPainting } from '../src/paint';
import { textToScene } from '../src/scene/parse';
import { renderScene } from '../src/scene/render';

const post = (m: any, t?: Transferable[]) => (self as any).postMessage(m, t ?? []);

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  const onProgress = (stage: string, frac: number) => post({ type: 'progress', stage, frac });
  try {
    if (m.mode === 'text') {
      const scene = textToScene(m.text, m.seed);
      post({ type: 'parsed', understood: scene.understood, ignored: scene.ignored, medium: scene.medium });
      const res = await renderScene(scene, { width: m.width, height: m.height, medium: m.medium === 'auto' ? undefined : m.medium, seed: m.seed, onProgress });
      const p = res.painting, u = res.underpainting;
      post({ type: 'done', width: p.width, height: p.height, data: p.data, under: u.data, stats: p.stats }, [p.data.buffer, u.data.buffer]);
    } else {
      const res = await renderPainting({ width: m.width, height: m.height, data: m.data }, { preset: m.medium === 'auto' ? 'pastel' : m.medium, seed: m.seed, onProgress });
      post({ type: 'done', width: res.width, height: res.height, data: res.data, stats: res.stats }, [res.data.buffer]);
    }
  } catch (err) {
    post({ type: 'error', message: String((err as Error)?.message ?? err) });
  }
};
