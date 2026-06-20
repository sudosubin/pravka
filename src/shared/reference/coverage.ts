import { readFileSync } from "node:fs";
import { join } from "node:path";

import { memoize } from "es-toolkit";

import { SOURCES } from "@/shared/source.ts";

export interface CoverageRow {
  cp: number;
  yTop: number;
  yBot: number;
  /** Column-0 glyph center x. */
  x0: number;
  /** Cell pitch for this row (wide-glyph blocks use wider cells). */
  cellW: number;
}

export interface Coverage {
  source: {
    url: string;
    imageWidth: number;
    imageHeight: number;
  };
  geometry: { cols: number };
  rows: CoverageRow[];
}

export interface CellRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const COVERAGE_PATH = join(import.meta.dirname, "coverage.json");
export const IMAGE_PATH = SOURCES.allChars.path;

const load = memoize(
  (): { cov: Coverage; rowByStart: Map<number, CoverageRow> } => {
    const cov = JSON.parse(readFileSync(COVERAGE_PATH, "utf-8")) as Coverage;
    return { cov, rowByStart: new Map(cov.rows.map((r) => [r.cp, r])) };
  },
);

/** Pixel rectangle of a codepoint's cell in All_chars.png, or null if the chart omits its row. */
export function cellRect(cp: number): CellRect | null {
  const { cov, rowByStart } = load();
  const row = rowByStart.get(cp & ~0xf);
  if (!row) return null;
  const col = cp & 0xf;
  if (col >= cov.geometry.cols) return null;
  const center = row.x0 + col * row.cellW;
  const left = Math.max(0, Math.round(center - row.cellW / 2));
  const top = Math.max(0, row.yTop);
  // Clamp to image bounds; wide-block cells at high columns can run past the right edge.
  const width = Math.min(Math.round(row.cellW), cov.source.imageWidth - left);
  const height = Math.min(
    row.yBot - row.yTop + 1,
    cov.source.imageHeight - top,
  );
  if (width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

/** All codepoints whose row is present in the chart (cells may still be individually blank). */
export function coveredCps(rangeStart = 0, rangeEnd = 0x10ffff): number[] {
  const { cov } = load();
  const out: number[] = [];
  for (const row of cov.rows) {
    for (let col = 0; col < cov.geometry.cols; col++) {
      const cp = row.cp + col;
      if (cp >= rangeStart && cp <= rangeEnd) out.push(cp);
    }
  }
  return out.sort((a, b) => a - b);
}
