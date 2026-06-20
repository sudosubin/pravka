import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { sumBy } from "es-toolkit";

import type { Token } from "@/features/showcase/tokenize.ts";

export interface CanvasLine {
  tokens: Token[];
  fontSpec?: string;
  advance?: number;
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

const CJK_TTC =
  process.env.PRAVKA_CJK_FONT ??
  "vendor/noto-cjk/NotoSansMonoCJK-VF.otf.ttc";

let registered = false;

export function setupFonts(fontDir: string): void {
  if (registered) return;
  for (const f of readdirSync(fontDir)) {
    if (f.endsWith(".ttf")) GlobalFonts.registerFromPath(join(fontDir, f));
  }
  if (existsSync(CJK_TTC)) GlobalFonts.registerFromPath(CJK_TTC);
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
