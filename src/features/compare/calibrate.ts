/**
 * OCR the fsd.it All_chars specimen into coverage.json (codepoint→pixel cell): cluster the
 * identical-bitmap "U+XXXX" row labels, seed digits from contiguous Latin runs, solve the rest by
 * "+0x10 per row". Needed because the chart omits codepoints PragmataPro lacks. Re-run on image change.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { maxBy, minBy, range } from "es-toolkit";

import { REFERENCE_GEOMETRY } from "@/features/compare/geometry.ts";
import { ensureSource, SOURCES } from "@/shared/source.ts";

const OUT_PATH = "src/shared/reference/coverage.json";

const { labelX0, labelXEnd, normW, normH, clusterMaxHamming } =
  REFERENCE_GEOMETRY.calibrate;

interface Ctx {
  width: number;
  height: number;
  strip: (y0: number, h: number) => Uint8ClampedArray;
}

async function loadCtx(imgPath: string): Promise<Ctx> {
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
function detectRows(ctx: Ctx): [number, number][] {
  const { width: W, height: H } = ctx;
  const labelDark = new Int32Array(H);
  const CHUNK = 4000;
  for (let y0 = 0; y0 < H; y0 += CHUNK) {
    const h = Math.min(CHUNK, H - y0);
    const d = ctx.strip(y0, h);
    for (let yy = 0; yy < h; yy++) {
      let s = 0;
      for (let x = labelX0; x < labelXEnd; x++) {
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
function rowClusters(
  ctx: Ctx,
  a: number,
  b: number,
  centroids: { g: Uint8Array; sample: { a: number; x0: number; x1: number } }[],
): number[] {
  const W = ctx.width;
  const h = b - a + 1;
  const d = ctx.strip(a, h);
  const colDark = new Int32Array(labelXEnd);
  for (let x = 0; x < labelXEnd; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) {
      const i = (y * W + x) * 4;
      if ((d[i]! + d[i + 1]! + d[i + 2]!) / 3 < 128) s++;
    }
    colDark[x] = s;
  }
  const segs: [number, number][] = [];
  let st = -1;
  for (let x = labelX0 - 6; x < labelXEnd; x++) {
    if (colDark[x]! > 0) {
      if (st < 0) st = x;
    } else if (st >= 0) {
      if (x - st >= 2) segs.push([st, x - 1]);
      st = -1;
    }
  }
  if (st >= 0) segs.push([st, labelXEnd - 1]);

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
    if (best < 0 || bd > clusterMaxHamming) {
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
  const g = new Uint8Array(normW * normH);
  if (y1 < y0) return g;
  for (let gy = 0; gy < normH; gy++)
    for (let gx = 0; gx < normW; gx++) {
      const px = x0 + Math.round(((gx + 0.5) / normW) * (x1 - x0));
      const py = y0 + Math.round(((gy + 0.5) / normH) * (y1 - y0));
      const i = (py * W + px) * 4;
      g[gy * normW + gx] = (d[i]! + d[i + 1]! + d[i + 2]!) / 3 < 128 ? 1 : 0;
    }
  return g;
}

function hamming(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) s++;
  return s;
}

// Contiguous Latin runs (present and gap-free in the chart) seed the cluster→digit map.
const SEED_CPS: number[] = [
  ...range(0x20, 0x71, 0x10),
  ...range(0xa0, 0xf1, 0x10),
  ...range(0x100, 0x171, 0x10),
  ...range(0x180, 0x1f1, 0x10),
];

// Glyph-cluster center x-positions within a row (cells are wider in wide-glyph blocks,
// so column geometry is measured per row rather than assumed uniform).
function rowGlyphCenters(ctx: Ctx, yTop: number, yBot: number): number[] {
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
function rowGeometry(
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

/** Regenerate src/shared/reference/coverage.json from the (downloaded) All_chars specimen image. */
export async function calibrateCoverage(): Promise<string> {
  const imgPath = await ensureSource(SOURCES.allChars);
  const ctx = await loadCtx(imgPath);
  const rowBands = detectRows(ctx);

  const centroids: {
    g: Uint8Array;
    sample: { a: number; x0: number; x1: number };
  }[] = [];
  const rows = rowBands.map(([a, b]) => ({
    a,
    b,
    seg: rowClusters(ctx, a, b, centroids),
  }));

  // A label row has "+" as its second segment. Find the "+" cluster from the first
  // 6-segment rows (U + h h h h) whose Latin layout is known and gap-free.
  const sixSeg = rows.filter((r) => r.seg.length === 6);
  let seedStart = -1;
  const constAt = (w: typeof sixSeg, p: number) =>
    w.every((r) => r.seg[p] === w[0]!.seg[p]);
  for (let i = 0; i + 6 <= sixSeg.length; i++) {
    const w = sixSeg.slice(i, i + 6);
    if (
      [0, 1, 2, 3, 5].every((p) => constAt(w, p)) &&
      new Set(w.map((r) => r.seg[4])).size === 6
    ) {
      seedStart = i;
      break;
    }
  }
  if (seedStart < 0) throw new Error("could not locate Latin seed run");
  const plusCluster = sixSeg[seedStart]!.seg[1]!;

  const cl2d = new Map<number, number>();
  const setDigit = (cl: number, dg: number) => {
    const prev = cl2d.get(cl);
    if (prev !== undefined && prev !== dg)
      throw new Error(`cluster ${cl} conflict ${prev} vs ${dg}`);
    cl2d.set(cl, dg);
  };
  SEED_CPS.forEach((cp, k) => {
    const r = sixSeg[seedStart + k];
    if (!r) return;
    const ds = [(cp >> 12) & 0xf, (cp >> 8) & 0xf, (cp >> 4) & 0xf, cp & 0xf];
    r.seg.slice(2, 6).forEach((cl, i) => {
      setDigit(cl, ds[i]!);
    });
  });

  const isLabel = (seg: number[]) => seg.length >= 3 && seg[1] === plusCluster;
  const decodeHex = (hex: number[]): number | null => {
    let v = 0;
    for (const cl of hex) {
      const d = cl2d.get(cl);
      if (d === undefined) return null;
      v = v * 16 + d;
    }
    return v;
  };

  // Resolve remaining digit clusters using the ascending, step-0x10 ordering.
  let changed = true;
  for (let pass = 0; changed && pass < 40; pass++) {
    changed = false;
    let prev = -1;
    for (const r of rows) {
      if (!isLabel(r.seg)) continue;
      const hex = r.seg.slice(2);
      let v = decodeHex(hex);
      if (v === null) {
        const unknown = hex
          .map((cl, i) => (cl2d.has(cl) ? -1 : i))
          .filter((i) => i >= 0);
        if (unknown.length === 1) {
          const pos = unknown[0]!;
          for (let dg = 0; dg < 16; dg++) {
            const digs = hex.map((cl, i) => (i === pos ? dg : cl2d.get(cl)!));
            let val = 0;
            for (const d of digs) val = val * 16 + d;
            if (val > prev && (val & 0xf) === 0) {
              setDigit(hex[pos]!, dg);
              v = val;
              changed = true;
              break;
            }
          }
        }
      }
      if (v !== null) prev = v;
    }
  }

  // Emit strictly-increasing decoded rows; drop the rare undecodable/non-monotonic anomaly.
  // Each row carries its own column geometry (x0 = col0 center, cellW = pitch).
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const out: {
    cp: number;
    yTop: number;
    yBot: number;
    x0: number;
    cellW: number;
  }[] = [];
  let prev = -1;
  let dropped = 0;
  let lastCellW = 37.08;
  let lastX0 = 313;
  for (const r of rows) {
    if (!isLabel(r.seg)) continue;
    const cp = decodeHex(r.seg.slice(2));
    if (cp === null || cp <= prev) {
      dropped++;
      continue;
    }
    const geom = rowGeometry(rowGlyphCenters(ctx, r.a, r.b), lastCellW, lastX0);
    // Sparse rows can yield a degenerate pitch; fall back to the last good one.
    if (geom.cellW < 30 || geom.cellW > 200) geom.cellW = lastCellW;
    else lastCellW = geom.cellW;
    if (geom.x0 >= 300 && geom.x0 <= 360) lastX0 = geom.x0;
    else geom.x0 = lastX0;
    out.push({
      cp,
      yTop: r.a,
      yBot: r.b,
      x0: r1(geom.x0),
      cellW: r1(geom.cellW),
    });
    prev = cp;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    `${JSON.stringify(
      {
        source: {
          url: SOURCES.allChars.url,
          imageWidth: ctx.width,
          imageHeight: ctx.height,
        },
        geometry: { cols: 16 },
        rows: out,
      },
      null,
      0,
    )}\n`,
  );
  const minPitch = minBy(out, (r) => r.cellW)!.cellW;
  const maxPitch = maxBy(out, (r) => r.cellW)!.cellW;
  console.log(
    `Calibrated ${out.length} rows (dropped ${dropped}); cp ${out[0]!.cp.toString(16)}..${out.at(-1)!.cp.toString(16)}`,
  );
  console.log(`cellW range ${minPitch.toFixed(1)}..${maxPitch.toFixed(1)}`);
  console.log(`→ ${join(process.cwd(), OUT_PATH)}`);
  return OUT_PATH;
}
