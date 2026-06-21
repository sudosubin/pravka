import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";

import {
  blockRows,
  CELL_W,
  COLS,
  CROP_MARGIN,
  DISPLAY_SCALE,
  detectLabelRows,
  GRID_X0,
  IMAGE,
  inkBox,
  measureRowPitch,
  ROW_PITCH,
  SCAN_LEFT,
  scanGray,
} from "@/features/compare/block-scan.ts";
import { diffOverlayPng } from "@/shared/diff/diff.ts";
import { ensureSource, SOURCES } from "@/shared/source.ts";
import {
  drawGlyph,
  type Glyph,
  isMissingGlyph,
  loadFont,
} from "@/shared/util/font.ts";
import { VISUAL_PNG } from "@/shared/util/image.ts";

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
  const maxRows = (cpEnd - cpStart) / COLS + 1;
  const scanTop = Math.round(anchorY - ROW_PITCH);
  const scanH = Math.round((maxRows + 1) * ROW_PITCH);
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
  const bandTop = Math.round(rows[0]!.y - ROW_PITCH * 0.5);
  const bandH = Math.round(rows.at(-1)!.y + ROW_PITCH * 0.5) - bandTop;
  const S = DISPLAY_SCALE;

  // The band gray over the full generous x-range (origin SCAN_LEFT): used for ink detection and glyph
  // placement. Coordinates below are relative to SCAN_LEFT.
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
  const cropLeft = SCAN_LEFT + Math.max(0, leftInk - CROP_MARGIN);
  const cropRight = SCAN_LEFT + Math.min(band.w, rightInk + CROP_MARGIN + 1);
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
  const glyphFs = ROW_PITCH * S;
  const grid0 = GRID_X0 - SCAN_LEFT; // column-0 center, relative to the gray origin (SCAN_LEFT)
  const glyphLeft = Math.max(0, Math.round(grid0 - CELL_W)); // glyph area, past the label gutter

  for (const { cp, y } of rows) {
    const cy = y - bandTop;
    const y1 = Math.round(cy - ROW_PITCH / 2),
      y2 = Math.round(cy + ROW_PITCH / 2);
    const pitch = measureRowPitch(band, glyphLeft, y1, y2);
    for (let col = 0; col < COLS; col++) {
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
        (SCAN_LEFT + ink.cx - cropLeft) * S,
        ink.cy * S,
        glyphFs,
      );
    }
  }

  // Copy the reference label gutter so row labels match exactly and the diff isolates the glyphs.
  const gutterW = Math.max(
    1,
    Math.round((GRID_X0 - CELL_W / 2 - cropLeft) * S),
  );
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
