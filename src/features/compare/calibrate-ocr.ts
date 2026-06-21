import { createCanvas, loadImage } from "@napi-rs/canvas";

import { REFERENCE_GEOMETRY } from "@/features/compare/geometry.ts";

// Label column geometry (where "U+XXXX" sits) and OCR sampling.
const {
  labelX0: LABEL_X0,
  labelXEnd: LABEL_XEND,
  normW: NORM_W,
  normH: NORM_H,
  clusterMaxHamming: CLUSTER_MAX_HAMMING,
} = REFERENCE_GEOMETRY.calibrate;

export interface Ctx {
  width: number;
  height: number;
  strip: (y0: number, h: number) => Uint8ClampedArray;
}

export async function loadCtx(imgPath: string): Promise<Ctx> {
  const img = await loadImage(imgPath);
  const W = img.width;
  const H = img.height;
  const strip = (y0: number, h: number): Uint8ClampedArray => {
    const c = createCanvas(W, h);
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, y0, W, h, 0, 0, W, h);
    return cx.getImageData(0, 0, W, h).data;
  };
  return { width: W, height: H, strip };
}

// Rows that contain label text, detected by darkness in the label column.
export function detectRows(ctx: Ctx): [number, number][] {
  const { width: W, height: H } = ctx;
  const labelDark = new Int32Array(H);
  const CHUNK = 4000;
  for (let y0 = 0; y0 < H; y0 += CHUNK) {
    const h = Math.min(CHUNK, H - y0);
    const d = ctx.strip(y0, h);
    for (let yy = 0; yy < h; yy++) {
      let s = 0;
      for (let x = LABEL_X0; x < LABEL_XEND; x++) {
        const i = (yy * W + x) * 4;
        if ((d[i]! + d[i + 1]! + d[i + 2]!) / 3 < 128) s++;
      }
      labelDark[y0 + yy] = s;
    }
  }
  const rows: [number, number][] = [];
  let st = -1;
  for (let y = 0; y < H; y++) {
    if (labelDark[y]! > 2) {
      if (st < 0) st = y;
    } else if (st >= 0) {
      if (y - 1 - st >= 8) rows.push([st, y - 1]);
      st = -1;
    }
  }
  if (st >= 0) rows.push([st, H - 1]);
  return rows;
}

// Segment a row's label into character bitmaps and assign each to a cluster index.
export function rowClusters(
  ctx: Ctx,
  a: number,
  b: number,
  centroids: { g: Uint8Array; sample: { a: number; x0: number; x1: number } }[],
): number[] {
  const W = ctx.width;
  const h = b - a + 1;
  const d = ctx.strip(a, h);
  const colDark = new Int32Array(LABEL_XEND);
  for (let x = 0; x < LABEL_XEND; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * W + x) * 4;
      if ((d[i]! + d[i + 1]! + d[i + 2]!) / 3 < 128) s++;
    }
    colDark[x] = s;
  }
  const segs: [number, number][] = [];
  let st = -1;
  for (let x = LABEL_X0 - 6; x < LABEL_XEND; x++) {
    if (colDark[x]! > 0) {
      if (st < 0) st = x;
    } else if (st >= 0) {
      if (x - st >= 2) segs.push([st, x - 1]);
      st = -1;
    }
  }
  if (st >= 0) segs.push([st, LABEL_XEND - 1]);

  const out: number[] = [];
  for (const [x0, x1] of segs) {
    const g = normGlyph(d, W, h, x0, x1);
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      const dd = hamming(centroids[i]!.g, g);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    if (best < 0 || bd > CLUSTER_MAX_HAMMING) {
      centroids.push({ g, sample: { a, x0, x1 } });
      best = centroids.length - 1;
    }
    out.push(best);
  }
  return out;
}

function normGlyph(
  d: Uint8ClampedArray,
  W: number,
  h: number,
  x0: number,
  x1: number,
): Uint8Array {
  let y0 = h;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      if ((d[i]! + d[i + 1]! + d[i + 2]!) / 3 < 128) {
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  const g = new Uint8Array(NORM_W * NORM_H);
  if (y1 < y0) return g;
  for (let gy = 0; gy < NORM_H; gy++)
    for (let gx = 0; gx < NORM_W; gx++) {
      const px = x0 + Math.round(((gx + 0.5) / NORM_W) * (x1 - x0));
      const py = y0 + Math.round(((gy + 0.5) / NORM_H) * (y1 - y0));
      const i = (py * W + px) * 4;
      g[gy * NORM_W + gx] = (d[i]! + d[i + 1]! + d[i + 2]!) / 3 < 128 ? 1 : 0;
    }
  return g;
}

function hamming(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) s++;
  return s;
}

// Glyph-cluster center x-positions within a row (cells are wider in wide-glyph blocks,
// so column geometry is measured per row rather than assumed uniform).
export function rowGlyphCenters(
  ctx: Ctx,
  yTop: number,
  yBot: number,
): number[] {
  const W = ctx.width;
  const h = yBot - yTop + 1;
  const d = ctx.strip(yTop, h);
  const col = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * W + x) * 4;
      if ((d[i]! + d[i + 1]! + d[i + 2]!) / 3 < 128) s++;
    }
    col[x] = s;
  }
  const bands: [number, number][] = [];
  let st = -1;
  for (let x = 290; x < W; x++) {
    if (col[x]! > 0) {
      if (st < 0) st = x;
    } else if (st >= 0) {
      if (x - st >= 2) bands.push([st, x - 1]);
      st = -1;
    }
  }
  if (st >= 0) bands.push([st, W - 1]);
  const merged: [number, number][] = [];
  for (const bnd of bands) {
    const last = merged[merged.length - 1];
    if (last && bnd[0] - last[1] < 10) last[1] = bnd[1];
    else merged.push([...bnd]);
  }
  return merged.map(([a, b]) => {
    let sw = 0;
    let sx = 0;
    for (let x = a; x <= b; x++) {
      sw += col[x]!;
      sx += col[x]! * x;
    }
    return sx / sw;
  });
}

const median = (xs: number[]): number =>
  xs.toSorted((a, b) => a - b)[xs.length >> 1]!;

// Per-row column geometry: col0 center and cell pitch, from the row's glyph spacing.
// cellW is the median adjacent-center gap (most cells in symbol blocks are consecutive).
export function rowGeometry(
  centers: number[],
  fallbackCellW: number,
  fallbackX0: number,
): { x0: number; cellW: number } {
  if (centers.length < 2)
    return { x0: centers[0] ?? fallbackX0, cellW: fallbackCellW };
  const gaps: number[] = [];
  for (let i = 1; i < centers.length; i++)
    gaps.push(centers[i]! - centers[i - 1]!);
  const minGap = Math.min(...gaps);
  // Keep only ~1-cell gaps (drop multi-cell jumps over blank cells).
  const oneCell = gaps.filter((g) => g <= minGap * 1.5);
  return { x0: centers[0]!, cellW: median(oneCell) };
}
