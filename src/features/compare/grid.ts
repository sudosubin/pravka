import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { sumBy } from "es-toolkit";
import sharp from "sharp";
import type { GridSpec } from "@/features/compare/types.ts";
import { cpLabel } from "@/shared/render/snapshot.ts";
import {
  drawGlyph,
  drawTextLeft,
  type Font,
  glyphAdvance,
  isMissingGlyph,
} from "@/shared/util/font.ts";

function drawGlyphInCell(
  ctx: SKRSContext2D,
  font: Font,
  cp: number,
  cellX: number,
  cellW: number,
  baselineY: number,
  fontSize: number,
  color: string,
): void {
  const glyph = font.charToGlyph(String.fromCodePoint(cp));
  if (isMissingGlyph(glyph)) return;
  const x =
    cellX + Math.round((cellW - glyphAdvance(font, glyph, fontSize)) / 2);
  drawGlyph(ctx, glyph, x, baselineY, fontSize, color);
}

function gapBefore(
  cp: number,
  gaps: { beforeCp: number; pixels: number }[],
): number {
  return sumBy(gaps, (g) => (g.beforeCp <= cp ? g.pixels : 0));
}

export async function renderGrid(font: Font, spec: GridSpec): Promise<Buffer> {
  const k = Math.max(1, spec.upscale ?? 1);
  const s = Math.max(1, spec.outputScale ?? 1);
  const scale = k * s;
  const outW = spec.width * s;
  const outH = spec.height * s;
  const W = spec.width * scale;
  const H = spec.height * scale;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = spec.bg;
  ctx.fillRect(0, 0, W, H);

  const gaps = spec.sectionGaps ?? [];
  const skips = spec.skipCps ?? [];
  const skipped = (cp: number) =>
    skips.some((r) => cp >= r.start && cp <= r.end);

  const cps: number[] = [];
  for (let cp = spec.cpStart; cp <= spec.cpEnd; cp++)
    if (!skipped(cp)) cps.push(cp);
  const rows = Math.ceil(cps.length / spec.cols);

  if (spec.showRowLabel) {
    const fs = (spec.rowLabelFontSize ?? spec.fontSize) * scale;
    const stride = spec.rowLabelStride ?? 1;
    const x = (spec.rowLabelX ?? Math.max(0, spec.gridX - 64)) * scale;
    for (let row = 0; row < rows; row++) {
      if (row % stride !== 0) continue;
      const firstCp = cps[row * spec.cols];
      if (firstCp == null) continue;
      const baseline =
        (spec.gridY +
          row * spec.cellH +
          spec.glyphBaselineFromTop +
          gapBefore(firstCp, gaps)) *
        scale;
      drawTextLeft(ctx, font, cpLabel(firstCp), x, baseline, fs, spec.fg);
    }
  }

  const cellFs = spec.fontSize * scale;
  for (let row = 0; row < rows; row++) {
    const firstCp = cps[row * spec.cols];
    if (firstCp == null) break;
    const extra = gapBefore(firstCp, gaps);
    for (let col = 0; col < spec.cols; col++) {
      const cp = cps[row * spec.cols + col];
      if (cp == null) break;
      const cellX = (spec.gridX + col * spec.cellW) * scale;
      const baseline =
        (spec.gridY + row * spec.cellH + extra + spec.glyphBaselineFromTop) *
        scale;
      drawGlyphInCell(
        ctx,
        font,
        cp,
        cellX,
        spec.cellW * scale,
        baseline,
        cellFs,
        spec.fg,
      );
    }
  }

  const buf = canvas.toBuffer("image/png");
  if (k === 1) return buf;
  return sharp(buf)
    .resize(outW, outH, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
