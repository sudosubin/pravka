import sharp from "sharp";

import { SOURCES } from "@/shared/source.ts";

/**
 * Reference is the Mono half of All_chars_Mono_comparison: a uniform grid, so columns use a fixed
 * pitch (each block anchored by its first row's y). A few symbol rows (Misc U+26A0+, Dingbats
 * U+2700+) stay uneven, so pitch is measured per row and glyphs dropped on the reference's ink.
 */
export const IMAGE = SOURCES.monoComparison.path;
export const GRID_X0 = 1710; // column 0 glyph center (px)
export const CELL_W = 35; // nominal column pitch (px)
export const ROW_PITCH = 39.2; // nominal row pitch (px)
export const COLS = 16;
export const DISPLAY_SCALE = 2;
export const MIN_INK_PIXELS = 3;
export const SCAN_LEFT = 1500; // fixed left origin for all pixel scans (absolute px)
export const SCAN_W = 880; // scan width: covers the label gutter through the widest symbol row's glyphs
export const CROP_MARGIN = 26; // left/right whitespace kept around the actual ink, so nothing is clipped
const LABEL_X1 = 1552; // scan just the "U+" prefix of each row label, narrow enough to exclude the
const LABEL_X2 = 1612; // indented "▼ Section" titles, so a section break shows as a clean row gap

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

export interface Gray {
  d: Buffer;
  w: number;
  h: number;
}

/** Grayscale the Mono specimen at the fixed scan x-window, `top`..`top+height`. */
export async function scanGray(top: number, height: number): Promise<Gray> {
  const r = await sharp(IMAGE)
    .extract({ left: SCAN_LEFT, top, width: SCAN_W, height })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { d: r.data, w: r.info.width, h: r.info.height };
}

/** Center y (absolute, `baseTop`-relative input) of each "U+XXXX" row label; section titles excluded. */
export function detectLabelRows(g: Gray, baseTop: number): number[] {
  const lx1 = LABEL_X1 - SCAN_LEFT,
    lx2 = LABEL_X2 - SCAN_LEFT;
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
export function blockRows(
  labelYs: number[],
  anchorY: number,
  cpStart: number,
  cpEnd: number,
): { cp: number; y: number }[] {
  const startIdx = labelYs.findIndex((y) => y > anchorY - ROW_PITCH * 0.6);
  const out: { cp: number; y: number }[] = [];
  if (startIdx < 0) return out;
  for (let i = startIdx; i < labelYs.length; i++) {
    if (i > startIdx && labelYs[i]! - labelYs[i - 1]! > ROW_PITCH * 1.5) break;
    const cp = cpStart + (i - startIdx) * COLS;
    if (cp > cpEnd) break;
    out.push({ cp, y: labelYs[i]! });
  }
  return out;
}

/** Ink bounding-box center inside a window of `g` (coords relative to its origin); null = no glyph. */
export function inkBox(
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
  if (ink < MIN_INK_PIXELS) return null;
  return { cx: (l + r) / 2, cy: (t + b) / 2 };
}

/** Column pitch of one row, from the spacing of its glyph clusters (single-cell gaps only). */
export function measureRowPitch(
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
      if (w >= MIN_INK_PIXELS) centers.push(sum / w);
      s = -1;
    }
  }
  const gaps: number[] = [];
  for (let i = 1; i < centers.length; i++)
    gaps.push(centers[i]! - centers[i - 1]!);
  return median(
    gaps.filter((gap) => gap >= CELL_W * 0.6 && gap <= CELL_W * 1.5),
    CELL_W,
  );
}
