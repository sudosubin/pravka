import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { sumBy } from "es-toolkit";
import sharp from "sharp";

import type { Token } from "@/features/showcase/tokenize.ts";
import { ensureCjkFont } from "@/shared/source.ts";
import { VISUAL_PNG } from "@/shared/util/image.ts";

export interface CanvasLine {
  tokens: Token[];
  fontSpec?: string;
  cjkLang?: string;
  advance?: number;
}

export interface CanvasRenderOpts {
  defaultFont: string;
  cjkFont?: string;
  cjkLang?: string;
  bg: string;
  width: number;
  paddingX: number;
  paddingY: number;
  lineHeight: number;
  upscale: number;
  outputScale: number;
  horizontalGrid?: boolean;
  // Overrides the auto-calculated mid-gap offset when the layout has mixed line heights.
  // Absolute offset from (paddingY + n * lineHeight) to the desired grid line position.
  horizontalGridOffset?: number;
}

export function measureFontMetrics(fontStr: string): {
  ascent: number;
  descent: number;
} {
  const canvas = createCanvas(100, 50);
  const ctx = canvas.getContext("2d");
  ctx.font = fontStr;
  const m = ctx.measureText("Ag");
  return {
    ascent: m.actualBoundingBoxAscent,
    descent: m.actualBoundingBoxDescent,
  };
}

let registered = false;

export async function setupFonts(fontDir: string): Promise<void> {
  if (registered) return;
  for (const f of readdirSync(fontDir)) {
    if (f.endsWith(".ttf")) GlobalFonts.registerFromPath(join(fontDir, f));
  }
  // CJK fallback: explicit override, else the cached Source Han Mono download (skipped if offline).
  const cjk =
    process.env.PRAVKA_CJK_FONT ?? (await ensureCjkFont().catch(() => null));
  if (cjk && existsSync(cjk)) GlobalFonts.registerFromPath(cjk);
  registered = true;
}

export function blockLogicalHeight(
  lines: CanvasLine[],
  defaultLeading: number,
  paddingY: number,
): number {
  return paddingY * 2 + sumBy(lines, (l) => l.advance ?? defaultLeading);
}

// Unicode East Asian Width = W (Wide) or F (Fullwidth): terminals allocate exactly 2 columns for
// these code points (UAX #11). [lo, hi] inclusive ranges.
const EAW_RANGES = [
  [0x1100, 0x115f], //  Hangul Jamo
  [0x2e80, 0x303e], //  CJK Radicals … CJK Symbols & Punctuation
  [0x3041, 0x33ff], //  Hiragana … Enclosed CJK / CJK Compat
  [0x3400, 0x4dbf], //  CJK Ext-A
  [0x4e00, 0xa4cf], //  CJK Unified Ideographs, Yi
  [0xa960, 0xa97f], //  Hangul Jamo Ext-A
  [0xac00, 0xd7ff], //  Hangul Syllables + Jamo Ext-B
  [0xf900, 0xfaff], //  CJK Compat Ideographs
  [0xfe10, 0xfe6f], //  Vertical Forms, CJK Compat Forms, Small Forms
  [0xff01, 0xff60], //  Fullwidth ASCII
  [0xffe0, 0xffe6], //  Fullwidth signs
  [0x1b000, 0x1b2ff], // Kana Supplement / Extended
  [0x20000, 0x3fffd], // CJK Ext-B … beyond (SMP CJK planes)
] as const;

export function isEastAsianWide(cp: number): boolean {
  return EAW_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

interface RowBand {
  yTop: number;
  yBot: number;
  // Columns whose vertical line bisects a Wide (EAW) glyph on this row (its midpoint); skipped so a
  // CJK glyph isn't split. Boundary lines between glyphs and all non-Wide rows stay drawn.
  skipCols: Set<number>;
}

// gridYs are the horizontal grid lines (one below each row). When one-per-row-gap, skip bands are
// bounded by them so a broken vertical line resumes exactly on the horizontal; else use leading.
function collectRowBands(
  lines: CanvasLine[],
  paddingY: number,
  defaultLeading: number,
  logH: number,
  gridYs: number[],
): RowBand[] {
  const aligned = gridYs.length === lines.length - 1;
  const bands: RowBand[] = [];
  let yEdge = paddingY;
  lines.forEach((line, i) => {
    const leading = line.advance ?? defaultLeading;
    // Skip only the line bisecting each Wide (2-cell) glyph: a glyph at cell `cell` spans
    // [cell, cell+1], so its midpoint line is column cell+1. Boundary lines between glyphs stay.
    const skipCols = new Set<number>();
    let cell = 0;
    for (const token of line.tokens) {
      for (const char of token.text) {
        if (isEastAsianWide(char.codePointAt(0) ?? 0)) {
          skipCols.add(cell + 1);
          cell += 2;
        } else {
          cell += 1;
        }
      }
    }
    const yTop = aligned ? (i === 0 ? 0 : gridYs[i - 1]!) : yEdge;
    const yBot = aligned
      ? i === lines.length - 1
        ? logH
        : gridYs[i]!
      : yEdge + leading;
    bands.push({ yTop, yBot, skipCols });
    yEdge += leading;
  });
  if (!aligned && bands.length) {
    bands[0]!.yTop = 0;
    bands.at(-1)!.yBot = logH;
  }
  return bands;
}

// Luminance of a hex color (#rrggbb), 0-255.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r! * 299 + g! * 587 + b! * 114) / 1000;
}

export async function renderCanvasLines(
  lines: CanvasLine[],
  opts: CanvasRenderOpts,
): Promise<Buffer> {
  const scale = opts.upscale * opts.outputScale;
  const logH = blockLogicalHeight(lines, opts.lineHeight, opts.paddingY);

  const canvas = createCanvas(opts.width * scale, logH * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, opts.width, logH);

  // --- Grid overlay: vertical columns (0.5em) + horizontal rows (lineHeight) ---
  ctx.font = opts.defaultFont;
  const halfEmWidth = ctx.measureText("A").width;
  const dark = luminance(opts.bg) > 128; // light background → dark grid lines
  const gridHalf = dark ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.07)";
  const gridFull = dark ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.14)";

  ctx.lineWidth = 0.5;

  // Horizontal grid line positions, in the mid-gap below each row. Computed first so the
  // vertical-line skip bands can be bounded by them (see collectRowBands).
  const m = ctx.measureText("Ag");
  const autoGapOffset =
    (opts.lineHeight + m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) /
    2;
  const gapOffset = opts.horizontalGridOffset ?? autoGapOffset;
  const gridYs: number[] = [];
  if (opts.horizontalGrid !== false) {
    for (
      let n = 0;
      opts.paddingY + (n + 1) * opts.lineHeight < logH - opts.paddingY;
      n++
    ) {
      gridYs.push(opts.paddingY + n * opts.lineHeight + gapOffset);
    }
  }

  // Vertical lines at every halfEmWidth. A line is broken only across the row bands where it
  // falls inside a Wide (CJK) text run; on every other row the column stays drawn.
  const rowBands = collectRowBands(
    lines,
    opts.paddingY,
    opts.lineHeight,
    logH,
    gridYs,
  );
  const drawSeg = (gx: number, yTop: number, yBot: number) => {
    ctx.beginPath();
    ctx.moveTo(gx, yTop);
    ctx.lineTo(gx, yBot);
    ctx.stroke();
  };
  let col = 0;
  for (
    let gx = opts.paddingX;
    gx <= opts.width - opts.paddingX + 0.5;
    gx += halfEmWidth, col++
  ) {
    ctx.strokeStyle = col % 2 === 0 ? gridFull : gridHalf;
    let segTop: number | null = null;
    for (const band of rowBands) {
      if (band.skipCols.has(col)) {
        if (segTop !== null) {
          drawSeg(gx, segTop, band.yTop);
          segTop = null;
        }
      } else if (segTop === null) {
        segTop = band.yTop;
      }
    }
    if (segTop !== null) drawSeg(gx, segTop, logH);
  }

  ctx.strokeStyle = gridFull;
  for (const gy of gridYs) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(opts.width, gy);
    ctx.stroke();
  }
  // ---

  ctx.textBaseline = "alphabetic";

  let baselineY = opts.paddingY;
  for (const line of lines) {
    const fontSpec = line.fontSpec ?? opts.defaultFont;
    ctx.font = fontSpec;

    // Use max(Latin, CJK) ascent so CJK glyphs don't bleed above the line.
    const latinAscent = ctx.measureText("Ag").actualBoundingBoxAscent;
    const cjkAscent = ctx.measureText("あ").actualBoundingBoxAscent;
    const ascent = Math.max(latinAscent, cjkAscent);
    baselineY += ascent;

    let x = opts.paddingX;
    for (const token of line.tokens) {
      if (!token.text) continue;
      ctx.font = fontSpec;
      ctx.fillStyle = token.color;
      const cjkLang = line.cjkLang ?? opts.cjkLang;
      for (const char of token.text) {
        const cp = char.codePointAt(0) ?? 0;
        const useCjkFont = opts.cjkFont && isEastAsianWide(cp);
        ctx.font = useCjkFont ? opts.cjkFont! : fontSpec;
        ctx.lang = useCjkFont ? (cjkLang ?? "inherit") : "inherit";
        ctx.fillText(char, x, baselineY);
        x += ctx.measureText(char).width;
      }
    }

    const leading = line.advance ?? opts.lineHeight;
    baselineY += leading - ascent;
  }

  const buf = canvas.toBuffer("image/png");
  const pipe =
    opts.upscale <= 1
      ? sharp(buf)
      : sharp(buf).resize(
          opts.width * opts.outputScale,
          logH * opts.outputScale,
          {
            kernel: "lanczos3",
          },
        );
  return pipe.png(VISUAL_PNG).toBuffer();
}
