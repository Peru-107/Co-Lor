/** Image analysis: blur, luminance, gradients, orientation field, edges. All buffers are Float32, 0..255. */

function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const radii: number[] = [];
  for (let i = 0; i < n; i++) radii.push(((i < m ? wl : wu) - 1) / 2);
  return radii;
}

function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, c: number, r: number) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let k = 0; k < c; k++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[(row + Math.min(w - 1, Math.max(0, i))) * c + k];
      for (let x = 0; x < w; x++) {
        dst[(row + x) * c + k] = acc * inv;
        acc += src[(row + Math.min(w - 1, x + r + 1)) * c + k] - src[(row + Math.max(0, x - r)) * c + k];
      }
    }
  }
}

function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, c: number, r: number) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    for (let k = 0; k < c; k++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[(Math.min(h - 1, Math.max(0, i)) * w + x) * c + k];
      for (let y = 0; y < h; y++) {
        dst[(y * w + x) * c + k] = acc * inv;
        acc += src[(Math.min(h - 1, y + r + 1) * w + x) * c + k] - src[(Math.max(0, y - r) * w + x) * c + k];
      }
    }
  }
}

/** Gaussian blur approximated by three box blurs: O(N) whatever the sigma. */
export function gaussBlur(src: Float32Array, w: number, h: number, c: number, sigma: number): Float32Array {
  const out = new Float32Array(src);
  if (sigma < 0.5) return out;
  const tmp = new Float32Array(src.length);
  for (const r of boxesForGauss(sigma)) {
    if (r < 1) continue;
    boxH(out, tmp, w, h, c, r);
    boxV(tmp, out, w, h, c, r);
  }
  return out;
}

/** RGBA bytes -> float RGB, compositing transparency over white. */
export function toFloatRGB(src: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const a = src[i * 4 + 3] / 255;
    out[i * 3] = src[i * 4] * a + 255 * (1 - a);
    out[i * 3 + 1] = src[i * 4 + 1] * a + 255 * (1 - a);
    out[i * 3 + 2] = src[i * 4 + 2] * a + 255 * (1 - a);
  }
  return out;
}

export function luminance(rgb: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  return out;
}

export function sobel(l: Float32Array, w: number, h: number) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const ym = Math.max(0, y - 1) * w;
    const y0 = y * w;
    const yp = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(w - 1, x + 1);
      const sx = l[ym + xp] + 2 * l[y0 + xp] + l[yp + xp] - l[ym + xm] - 2 * l[y0 + xm] - l[yp + xm];
      const sy = l[yp + xm] + 2 * l[yp + x] + l[yp + xp] - l[ym + xm] - 2 * l[ym + x] - l[ym + xp];
      const i = y0 + x;
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.hypot(sx, sy);
    }
  }
  return { gx, gy, mag };
}

export interface OrientationField {
  /** Unit tangent (direction along edges / isophotes) per pixel. */
  tx: Float32Array;
  ty: Float32Array;
  /** 0 = flat / no dominant direction, 1 = strongly directional. */
  coh: Float32Array;
}

/** Smoothed structure tensor -> stroke direction field. Strokes follow edges instead of crossing them. */
export function orientationField(lum: Float32Array, w: number, h: number, sigma: number): OrientationField {
  const { gx, gy } = sobel(gaussBlur(lum, w, h, 1, 1.0), w, h);
  const n = w * h;
  const J = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    J[i * 3] = gx[i] * gx[i];
    J[i * 3 + 1] = gx[i] * gy[i];
    J[i * 3 + 2] = gy[i] * gy[i];
  }
  const S = gaussBlur(J, w, h, 3, sigma);
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const coh = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = S[i * 3];
    const b = S[i * 3 + 1];
    const d = S[i * 3 + 2];
    const theta = 0.5 * Math.atan2(2 * b, a - d); // dominant gradient direction
    tx[i] = -Math.sin(theta);
    ty[i] = Math.cos(theta);
    const tr = a + d;
    const disc = Math.sqrt((a - d) * (a - d) + 4 * b * b);
    coh[i] = tr > 1e-3 ? disc / tr : 0;
  }
  return { tx, ty, coh };
}

function percentile(values: Float32Array, p: number): number {
  const step = Math.max(1, Math.floor(values.length / 200000));
  const s: number[] = [];
  for (let i = 0; i < values.length; i += step) if (values[i] > 0) s.push(values[i]);
  if (!s.length) return 0;
  s.sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

/** Canny-style edges: non-max suppression + hysteresis. Thresholds are percentiles of gradient magnitude. */
export function detectEdges(lum: Float32Array, w: number, h: number, sigma: number, lowP: number, highP: number): Uint8Array {
  const { gx, gy, mag } = sobel(gaussBlur(lum, w, h, 1, sigma), w, h);
  const thin = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m === 0) continue;
      let ang = (Math.atan2(gy[i], gx[i]) * 180) / Math.PI;
      if (ang < 0) ang += 180;
      let a: number, b: number;
      if (ang < 22.5 || ang >= 157.5) { a = mag[i - 1]; b = mag[i + 1]; }
      else if (ang < 67.5) { a = mag[i - w - 1]; b = mag[i + w + 1]; }
      else if (ang < 112.5) { a = mag[i - w]; b = mag[i + w]; }
      else { a = mag[i - w + 1]; b = mag[i + w - 1]; }
      if (m >= a && m >= b) thin[i] = m;
    }
  }
  const hi = percentile(thin, highP);
  const lo = percentile(thin, lowP);
  const out = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) if (thin[i] >= hi && hi > 0) { out[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!out[j] && thin[j] >= lo) { out[j] = 1; stack.push(j); }
    }
  }
  return out;
}

/** Walks an edge mask into polylines (pixel chains). */
export function traceChains(mask: Uint8Array, w: number, h: number, minLen: number): Array<Array<{ x: number; y: number }>> {
  const seen = new Uint8Array(w * h);
  const chains: Array<Array<{ x: number; y: number }>> = [];
  const walk = (start: number) => {
    const pts: Array<{ x: number; y: number }> = [];
    let cur = start;
    for (;;) {
      const x = cur % w;
      const y = (cur - x) / w;
      let next = -1;
      for (let dy = -1; dy <= 1 && next < 0; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && !seen[j]) { next = j; break; }
      }
      if (next < 0) break;
      seen[next] = 1;
      pts.push({ x: next % w, y: Math.floor(next / w) });
      cur = next;
    }
    return pts;
  };
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    seen[i] = 1;
    const fwd = walk(i);
    const back = walk(i).reverse();
    const chain = [...back, { x: i % w, y: Math.floor(i / w) }, ...fwd];
    if (chain.length >= minLen) chains.push(chain);
  }
  return chains;
}
