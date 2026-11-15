// Offline app: everything runs in this page (a Web Worker does the painting). No network, no AI.
export {};
declare const __WORKER_SRC__: string;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('out');
const ctx = canvas.getContext('2d')!;
const promptEl = $<HTMLTextAreaElement>('prompt');
const paintBtn = $<HTMLButtonElement>('paint');
const rerollBtn = $<HTMLButtonElement>('reroll');
const saveBtn = $<HTMLButtonElement>('save');
const sizeSel = $<HTMLSelectElement>('size');
const seedIn = $<HTMLInputElement>('seed');
const bar = $<HTMLElement>('bar');
const stageText = $<HTMLElement>('stagetext');
const stats = $<HTMLElement>('stats');
const understoodEl = $<HTMLElement>('understood');
const ignoredEl = $<HTMLElement>('ignored');
const fileInput = $<HTMLInputElement>('file');
const stage = $<HTMLElement>('stage');
const viewBtns = { paint: $<HTMLButtonElement>('view-paint'), under: $<HTMLButtonElement>('view-under') };
const modeBtns = { text: $<HTMLButtonElement>('mode-text'), photo: $<HTMLButtonElement>('mode-photo') };

let mode: 'text' | 'photo' = 'text';
let painted: ImageData | null = null;
let under: ImageData | null = null;
let photo: ImageBitmap | null = null;
let photoName = 'photo';
let busy = false;
let queued = false;

const worker = new Worker(URL.createObjectURL(new Blob([__WORKER_SRC__], { type: 'text/javascript' })));

const medium = () => (document.querySelector('input[name="medium"]:checked') as HTMLInputElement).value;
const dims = () => {
  const long = Number(sizeSel.value);
  return { width: long, height: Math.round((long * 9) / 16) };
};

function show(which: 'paint' | 'under') {
  const img = which === 'under' ? under : painted;
  if (img) {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.putImageData(img, 0, 0);
  }
  viewBtns.paint.setAttribute('aria-pressed', String(which === 'paint'));
  viewBtns.under.setAttribute('aria-pressed', String(which === 'under'));
}

function setMode(m: 'text' | 'photo') {
  mode = m;
  document.body.dataset.mode = m;
  modeBtns.text.setAttribute('aria-pressed', String(m === 'text'));
  modeBtns.photo.setAttribute('aria-pressed', String(m === 'photo'));
  viewBtns.under.textContent = m === 'text' ? 'Scene' : 'Original';
}

function chips(el: HTMLElement, words: string[], empty: string) {
  el.replaceChildren(...(words.length ? words.map((w) => Object.assign(document.createElement('span'), { className: 'chip', textContent: w })) : [Object.assign(document.createElement('span'), { className: 'none', textContent: empty })]));
}

function progress(s: string, f: number) {
  bar.style.width = `${Math.round(f * 100)}%`;
  stageText.textContent = s;
}

function run() {
  if (busy) { queued = true; return; }
  const seed = Number(seedIn.value) || 7;
  if (mode === 'text') {
    const text = promptEl.value.trim();
    if (!text) { stageText.textContent = 'Type a description first, for example "a temple by a lake at sunset".'; return; }
    busy = true;
    paintBtn.disabled = true;
    stats.textContent = '';
    progress('Reading your words', 0);
    worker.postMessage({ mode: 'text', text, seed, medium: medium(), ...dims() });
  } else {
    if (!photo) { stageText.textContent = 'Choose a photo first.'; return; }
    busy = true;
    paintBtn.disabled = true;
    const long = Number(sizeSel.value);
    const k = long / Math.max(photo.width, photo.height);
    const w = Math.round(photo.width * k), h = Math.round(photo.height * k);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const cx = c.getContext('2d')!;
    cx.drawImage(photo, 0, 0, w, h);
    under = cx.getImageData(0, 0, w, h);
    const data = new Uint8ClampedArray(under.data);
    progress('Preparing', 0);
    worker.postMessage({ mode: 'photo', width: w, height: h, data, seed, medium: medium() }, [data.buffer]);
  }
}

const t0 = { v: 0 };
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'progress') progress(m.stage, m.frac);
  else if (m.type === 'parsed') {
    chips(understoodEl, m.understood, 'nothing yet: try words like lake, temple, sunset');
    chips(ignoredEl, m.ignored, 'none');
    t0.v = performance.now();
  } else if (m.type === 'done') {
    painted = new ImageData(new Uint8ClampedArray(m.data), m.width, m.height);
    if (m.under) under = new ImageData(new Uint8ClampedArray(m.under), m.width, m.height);
    show('paint');
    stats.textContent = `${m.width}×${m.height} · ${m.stats.strokes.toLocaleString()} brush strokes · ${(m.stats.ms / 1000).toFixed(1)}s`;
    progress('Done', 1);
    finish();
  } else if (m.type === 'error') {
    stageText.textContent = `Something went wrong: ${m.message}`;
    finish();
  }
};
function finish() {
  busy = false;
  paintBtn.disabled = false;
  saveBtn.disabled = !painted;
  if (queued) { queued = false; run(); }
}

paintBtn.addEventListener('click', run);
rerollBtn.addEventListener('click', () => { seedIn.value = String(Math.floor(Math.random() * 99999)); run(); });
promptEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); });
document.querySelectorAll<HTMLButtonElement>('.example').forEach((b) => b.addEventListener('click', () => { setMode('text'); promptEl.value = b.textContent ?? ''; run(); }));
viewBtns.paint.addEventListener('click', () => show('paint'));
viewBtns.under.addEventListener('click', () => show('under'));
modeBtns.text.addEventListener('click', () => setMode('text'));
modeBtns.photo.addEventListener('click', () => setMode('photo'));
async function loadPhoto(f: File) {
  if (!f.type.startsWith('image/')) { stageText.textContent = 'That file is not an image. Try a JPG, PNG or WebP.'; return; }
  try { photo = await createImageBitmap(f); } catch { stageText.textContent = "This browser can't read that image. Try a JPG or PNG."; return; }
  photoName = f.name.replace(/\.[^.]+$/, '');
  setMode('photo');
  run();
}
fileInput.addEventListener('change', () => fileInput.files?.[0] && loadPhoto(fileInput.files[0]));
stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('over'); });
stage.addEventListener('dragleave', () => stage.classList.remove('over'));
stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('over'); const f = e.dataTransfer?.files?.[0]; if (f) loadPhoto(f); });
saveBtn.addEventListener('click', () => {
  if (!painted) return;
  const c = Object.assign(document.createElement('canvas'), { width: painted.width, height: painted.height });
  c.getContext('2d')!.putImageData(painted, 0, 0);
  const name = mode === 'text' ? promptEl.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50) || 'painting' : photoName;
  c.toBlob(async (b) => {
    if (!b) return;
    const filename = `${name}-${medium()}.png`;
    // Inside claude.ai the page must ask the host to save; everywhere else a normal download works.
    const host = (window as any).claude;
    const downloads = host ? await host.use('downloads').catch(() => null) : null;
    if (downloads) {
      try { await downloads.save({ filename, data: b }); } catch (err: any) { if (err?.code !== 'declined') stageText.textContent = "Saving isn't available here right now."; }
      return;
    }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
});

// Open in a working state: the bundled example, already painted; its scene view is rendered on demand.
const ex = $<HTMLImageElement>('example-out');
const exU = $<HTMLImageElement>('example-under');
const boot = () => {
  const grab = (img: HTMLImageElement) => {
    const c = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
    const cx = c.getContext('2d')!;
    cx.drawImage(img, 0, 0);
    return cx.getImageData(0, 0, c.width, c.height);
  };
  painted = grab(ex);
  under = grab(exU);
  show('paint');
  saveBtn.disabled = false;
  stageText.textContent = 'Example painting. Change the words and press Paint.';
};
setMode('text');
Promise.all([ex.decode(), exU.decode()]).then(boot, boot);
