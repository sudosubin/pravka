/**
 * OCR the fsd.it All_chars specimen into coverage.json (codepoint→pixel cell): cluster the
 * identical-bitmap "U+XXXX" row labels, seed digits from contiguous Latin runs, solve the rest by
 * "+0x10 per row". Needed because the chart omits codepoints PragmataPro lacks. Re-run on image change.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { maxBy, minBy, range } from "es-toolkit";

import {
  detectRows,
  loadCtx,
  rowClusters,
  rowGeometry,
  rowGlyphCenters,
} from "@/features/compare/calibrate-ocr.ts";
import { ensureSource, SOURCES } from "@/shared/source.ts";

const OUT_PATH = "src/shared/reference/coverage.json";

// Contiguous Latin runs (present and gap-free in the chart) seed the cluster→digit map.
const SEED_CPS: number[] = [
  ...range(0x20, 0x71, 0x10),
  ...range(0xa0, 0xf1, 0x10),
  ...range(0x100, 0x171, 0x10),
  ...range(0x180, 0x1f1, 0x10),
];

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
