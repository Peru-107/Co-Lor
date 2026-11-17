/** How close is a painting to its reference? All numbers compare RGBA pixels (canvas) with float RGB (reference, 0..255). */
export interface Quality {
  /** Mean absolute colour error, 0..255. */
  mae: number;
  /** Peak signal-to-noise ratio in dB (higher is closer; > 40 is visually identical). */
  psnr: number;
  /** Structural similarity on luminance, 0..1 (8x8 windows). Sensitive to lost edges and texture. */
  ssim: number;
  /** Share of pixels whose three channels are all within 4 levels of the reference. */
  within4: number;
  /** The headline number: the lower of (1 - mae/255) and ssim. 0.99 means 99%. */
  similarity: number;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export function compareImages(canvas: Uint8ClampedArray | Uint8Array, ref: Float32Array, w: number, h: number): Quality {
  const n = w * h;
  let abs = 0, sq = 0, close = 0;
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dr = canvas[i * 4] - ref[i * 3], dg = canvas[i * 4 + 1] - ref[i * 3 + 1], db = canvas[i * 4 + 2] - ref[i * 3 + 2];
    abs += Math.abs(dr) + Math.abs(dg) + Math.abs(db);
    sq += dr * dr + dg * dg + db * db;
    if (Math.abs(dr) <= 4 && Math.abs(dg) <= 4 && Math.abs(db) <= 4) close++;
    a[i] = lum(canvas[i * 4], canvas[i * 4 + 1], canvas[i * 4 + 2]);
    b[i] = lum(ref[i * 3], ref[i * 3 + 1], ref[i * 3 + 2]);
  }
  const mae = abs / (n * 3);
  const mse = sq / (n * 3);
  const psnr = mse < 1e-9 ? 99 : 10 * Math.log10((255 * 255) / mse);

  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2, K = 8, step = 4;
  let ssum = 0, scnt = 0;
  for (let y = 0; y + K <= h; y += step) {
    for (let x = 0; x + K <= w; x += step) {
      let ma = 0, mb = 0;
      for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) { const p = (y + j) * w + x + i; ma += a[p]; mb += b[p]; }
      ma /= K * K; mb /= K * K;
      let va = 0, vb = 0, cv = 0;
      for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
        const p = (y + j) * w + x + i;
        const da = a[p] - ma, db = b[p] - mb;
        va += da * da; vb += db * db; cv += da * db;
      }
      va /= K * K - 1; vb /= K * K - 1; cv /= K * K - 1;
      ssum += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      scnt++;
    }
  }
  const ssim = scnt ? ssum / scnt : 1;
  return { mae, psnr, ssim, within4: close / n, similarity: Math.min(1 - mae / 255, ssim) };
}
