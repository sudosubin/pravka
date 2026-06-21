import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";
import { REFERENCE_GEOMETRY } from "@/features/compare/geometry.ts";
import { diffOverlayPng } from "@/shared/diff/diff.ts";
import { ensureSource, SOURCES } from "@/shared/source.ts";
import {
  drawGlyph,
  type Glyph,
  isMissingGlyph,
  loadFont,
} from "@/shared/util/font.ts";
import { VISUAL_PNG } from "@/shared/util/image.ts";

/**
 * Reference is the Mono half of All_chars_Mono_comparison: a uniform grid, so columns use a fixed
 * pitch (each block anchored by its first row's y). A few symbol rows (Misc U+26A0+, Dingbats
 * U+2700+) stay uneven, so pitch is measured per row and glyphs dropped on the reference's ink.
 */
const IMAGE = SOURCES.monoComparison.path;
const {
  gridX0,
  cellW,
  rowPitch,
  cols,
  displayScale,
  minInkPixels,
  scanLeft,
  scanW,
  cropMargin,
  labelX1,
  labelX2,
} = REFERENCE_GEOMETRY.blocks;

export const DOC_BLOCKS: {
  id: string;
  cpStart: number;
  cpEnd: number;
  title: string;
  anchorY: number;
}[] = [
  {
    id: "general-punctuation",
    cpStart: 0x2000,
    cpEnd: 0x206f,
    title: "General Punctuation",
    anchorY: 6856,
  },
  {
    id: "superscripts-subscripts",
    cpStart: 0x2070,
    cpEnd: 0x209f,
    title: "Superscripts and Subscripts",
    anchorY: 7170,
  },
  {
    id: "letterlike-symbols",
    cpStart: 0x2100,
    cpEnd: 0x214f,
    title: "Letterlike Symbols",
    anchorY: 7601,
  },
  {
    id: "arrows",
    cpStart: 0x2190,
    cpEnd: 0x21ff,
    title: "Arrows",
    anchorY: 8032,
  },
  {
    id: "math-operators",
    cpStart: 0x2200,
    cpEnd: 0x22ff,
    title: "Mathematical Operators",
    anchorY: 8346,
  },
  {
    id: "box-drawing",
    cpStart: 0x2500,
    cpEnd: 0x257f,
    title: "Box Drawing",
    anchorY: 10070,
  },
  {
    id: "block-elements",
    cpStart: 0x2580,
    cpEnd: 0x259f,
    title: "Block Elements",
    anchorY: 10423,
  },
  {
    id: "geometric-shapes",
    cpStart: 0x25a0,
    cpEnd: 0x25ff,
    title: "Geometric Shapes",
    anchorY: 10540,
  },
  {
    id: "misc-symbols",
    cpStart: 0x2600,
    cpEnd: 0x26ff,
    title: "Miscellaneous Symbols",
    anchorY: 10815,
  },
  {
    id: "dingbats",
    cpStart: 0x2700,
    cpEnd: 0x27bf,
    title: "Dingbats",
    anchorY: 11403,
  },
];

const median = (xs: number[], fallback: number): number =>
  xs.length
    ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
    : fallback;

interface Gray {
  d: Buffer;
  w: number;
  h: number;
}

/** Grayscale the Mono specimen at the fixed scan x-window, `top`..`top+height`. */
async function scanGray(top: number, height: number): Promise<Gray> {
  const r = await sharp(IMAGE)
    .extract({ left: scanLeft, top, width: scanW, height })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { d: r.data, w: r.info.width, h: r.info.height };
}

/** Center y (absolute, `baseTop`-relative input) of each "U+XXXX" row label; section titles excluded. */
function detectLabelRows(g: Gray, baseTop: number): number[] {
  const lx1 = labelX1 - scanLeft,
    lx2 = labelX2 - scanLeft;
  const ys: number[] = [];
  let runStart = -1;
  for (let y = 0; y <= g.h; y++) {
    let ink = 0;
    if (y < g.h)
      for (let x = lx1; x < lx2; x++) if (g.d[y * g.w + x]! < 128) ink++;
    if (ink >= 3 && y < g.h) {
      if (runStart < 0) runStart = y;
    } else if (runStart >= 0) {
      if (y - runStart >= 10) ys.push(baseTop + (runStart + y - 1) / 2);
      runStart = -1;
    }
  }
  return ys;
}

/**
 * Block rows mapped to codepoints. Rows are contiguous, so cp is index-based from cpStart (pitch
 * drifts down the image, so don't infer it from y). Stops at the first section-break gap so a short
 * block (e.g. Misc ending at U+26C0) doesn't pull in the next section.
 */
function blockRows(
  labelYs: number[],
  anchorY: number,
  cpStart: number,
  cpEnd: number,
): { cp: number; y: number }[] {
  const startIdx = labelYs.findIndex((y) => y > anchorY - rowPitch * 0.6);
  const out: { cp: number; y: number }[] = [];
  if (startIdx < 0) return out;
  for (let i = startIdx; i < labelYs.length; i++) {
    if (i > startIdx && labelYs[i]! - labelYs[i - 1]! > rowPitch * 1.5) break;
    const cp = cpStart + (i - startIdx) * cols;
    if (cp > cpEnd) break;
    out.push({ cp, y: labelYs[i]! });
  }
  return out;
}

/** Ink bounding-box center inside a window of `g` (coords relative to its origin); null = no glyph. */
function inkBox(
  g: Gray,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { cx: number; cy: number } | null {
  let t = -1,
    b = -1,
    l = -1,
    r = -1,
    ink = 0;
  for (let y = Math.max(0, y1); y < Math.min(g.h, y2); y++)
    for (let x = Math.max(0, x1); x < Math.min(g.w, x2); x++)
      if (g.d[y * g.w + x]! < 128) {
        ink++;
        if (t < 0) t = y;
        b = y;
        if (l < 0 || x < l) l = x;
        if (x > r) r = x;
      }
  if (ink < minInkPixels) return null;
  return { cx: (l + r) / 2, cy: (t + b) / 2 };
}

/** Column pitch of one row, from the spacing of its glyph clusters (single-cell gaps only). */
function measureRowPitch(
  g: Gray,
  glyphLeft: number,
  y1: number,
  y2: number,
): number {
  const prof = new Float64Array(g.w);
  for (let x = glyphLeft; x < g.w; x++) {
    let c = 0;
    for (let y = Math.max(0, y1); y < Math.min(g.h, y2); y++)
      if (g.d[y * g.w + x]! < 128) c++;
    prof[x] = c;
  }
  const centers: number[] = [];
  let s = -1;
  for (let x = glyphLeft; x <= g.w; x++) {
    if (x < g.w && prof[x]! > 0) {
      if (s < 0) s = x;
    } else if (s >= 0) {
      let w = 0,
        sum = 0;
      for (let xx = s; xx < x; xx++) {
        w += prof[xx]!;
        sum += prof[xx]! * xx;
      }
      if (w >= minInkPixels) centers.push(sum / w);
      s = -1;
    }
  }
  const gaps: number[] = [];
  for (let i = 1; i < centers.length; i++)
    gaps.push(centers[i]! - centers[i - 1]!);
  return median(
    gaps.filter((gap) => gap >= cellW * 0.6 && gap <= cellW * 1.5),
    cellW,
  );
}

/** Draw a glyph so its ink bounding-box center lands at (cx, cy), aligning to the reference glyph. */
function drawGlyphInkCentered(
  ctx: SKRSContext2D,
  glyph: Glyph,
  cx: number,
  cy: number,
  fontSize: number,
): void {
  const bb = glyph.getPath(0, 0, fontSize).getBoundingBox();
  if (!(bb.x2 > bb.x1) || !(bb.y2 > bb.y1)) return;
  drawGlyph(
    ctx,
    glyph,
    cx - (bb.x1 + bb.x2) / 2,
    cy - (bb.y1 + bb.y2) / 2,
    fontSize,
    "#000000",
  );
}

export async function renderBlockPanels(opts: {
  cpStart: number;
  cpEnd: number;
  anchorY: number;
  fontPath: string;
  outDir: string;
}): Promise<void> {
  await ensureSource(SOURCES.monoComparison);
  const { cpStart, cpEnd, anchorY, fontPath, outDir } = opts;
  mkdirSync(outDir, { recursive: true });
  const font = loadFont(fontPath);

  // Locate the block's rows from the always-present "U+XXXX" labels.
  const maxRows = (cpEnd - cpStart) / cols + 1;
  const scanTop = Math.round(anchorY - rowPitch);
  const scanH = Math.round((maxRows + 1) * rowPitch);
  const rows = blockRows(
    detectLabelRows(await scanGray(scanTop, scanH), scanTop),
    anchorY,
    cpStart,
    cpEnd,
  );
  if (rows.length === 0)
    throw new Error(
      `No rows detected for U+${cpStart.toString(16)} at y=${anchorY}`,
    );

  // Vertical band, tight to the detected rows (≈0.5 pitch margin clears the glyphs but stops short of
  // the adjacent section titles).
  const bandTop = Math.round(rows[0]!.y - rowPitch * 0.5);
  const bandH = Math.round(rows.at(-1)!.y + rowPitch * 0.5) - bandTop;
  const S = displayScale;

  // The band gray over the full generous x-range (origin scanLeft): used for ink detection and glyph
  // placement. Coordinates below are relative to scanLeft.
  const band = await scanGray(bandTop, bandH);

  // Horizontal crop follows the actual ink with a symmetric margin, so wide/overflowing glyphs in any
  // section (e.g. Dingbats, Misc Symbols) are never clipped and the gutter isn't a huge empty band.
  let leftInk = band.w,
    rightInk = 0;
  for (let y = 0; y < band.h; y++) {
    for (let x = 0; x < band.w; x++)
      if (band.d[y * band.w + x]! < 128) {
        if (x < leftInk) leftInk = x;
        break;
      }
    for (let x = band.w - 1; x >= 0; x--)
      if (band.d[y * band.w + x]! < 128) {
        if (x > rightInk) rightInk = x;
        break;
      }
  }
  const cropLeft = scanLeft + Math.max(0, leftInk - cropMargin);
  const cropRight = scanLeft + Math.min(band.w, rightInk + cropMargin + 1);
  const bandW = cropRight - cropLeft;
  const outW = bandW * S;
  const outH = bandH * S;

  // PragmataPro panel: the raw Mono slice, only resized.
  const refPng = await sharp(IMAGE)
    .extract({ left: cropLeft, top: bandTop, width: bandW, height: bandH })
    .flatten({ background: "#ffffff" })
    .resize(outW, outH, { kernel: "lanczos3" })
    .png(VISUAL_PNG)
    .toBuffer();

  // Pravka panel: walk all 16 columns at each row's measured pitch (gating on ink so blanks skip),
  // dropping each glyph onto the reference glyph's actual ink center.
  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  const glyphFs = rowPitch * S;
  const grid0 = gridX0 - scanLeft; // column-0 center, relative to the gray origin (scanLeft)
  const glyphLeft = Math.max(0, Math.round(grid0 - cellW)); // glyph area, past the label gutter

  for (const { cp, y } of rows) {
    const cy = y - bandTop;
    const y1 = Math.round(cy - rowPitch / 2),
      y2 = Math.round(cy + rowPitch / 2);
    const pitch = measureRowPitch(band, glyphLeft, y1, y2);
    for (let col = 0; col < cols; col++) {
      const cpc = cp + col;
      if (cpc > cpEnd) break;
      const cellCx = grid0 + col * pitch;
      const ink = inkBox(
        band,
        Math.round(cellCx - pitch / 2),
        y1,
        Math.round(cellCx + pitch / 2),
        y2,
      );
      if (!ink) continue;
      const glyph = font.charToGlyph(String.fromCodePoint(cpc));
      if (isMissingGlyph(glyph)) continue;
      drawGlyphInkCentered(
        ctx,
        glyph,
        (scanLeft + ink.cx - cropLeft) * S,
        ink.cy * S,
        glyphFs,
      );
    }
  }

  // Copy the reference label gutter so row labels match exactly and the diff isolates the glyphs.
  const gutterW = Math.max(1, Math.round((gridX0 - cellW / 2 - cropLeft) * S));
  const gutter = await sharp(refPng)
    .extract({ left: 0, top: 0, width: gutterW, height: outH })
    .png()
    .toBuffer();
  const pravkaPng = await sharp(canvas.toBuffer("image/png"))
    .composite([{ input: gutter, left: 0, top: 0 }])
    .png(VISUAL_PNG)
    .toBuffer();

  const diffPng = await diffOverlayPng(refPng, pravkaPng);

  writeFileSync(join(outDir, "pragmatapro.png"), refPng);
  writeFileSync(join(outDir, "pravka.png"), pravkaPng);
  writeFileSync(join(outDir, "diff.png"), diffPng);
}
