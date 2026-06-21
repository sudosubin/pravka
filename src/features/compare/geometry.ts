// Absolute pixel geometry for the two fsd.it reference specimens, consumed by blocks.ts and calibrate.ts.
export const REFERENCE_GEOMETRY = {
  // Mono-comparison grid + scan window for rendering comparison block panels.
  blocks: {
    gridX0: 1710,
    cellW: 35,
    rowPitch: 39.2,
    cols: 16,
    displayScale: 2,
    minInkPixels: 3,
    scanLeft: 1500,
    // Covers the label gutter through the widest symbol row's glyphs.
    scanW: 880,
    // Whitespace kept around the ink so nothing is clipped.
    cropMargin: 26,
    // "U+" row-label scan window; narrow enough to exclude indented section titles.
    labelX1: 1552,
    labelX2: 1612,
  },
  // All_chars label-column geometry and OCR sampling for calibrating coverage.json.
  calibrate: {
    labelX0: 150,
    labelXEnd: 275,
    normW: 10,
    normH: 16,
    // Max Hamming distance between normalized bitmaps to treat them as the same cluster.
    clusterMaxHamming: 14,
  },
} as const;
