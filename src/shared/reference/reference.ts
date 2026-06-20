import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { memoize } from "es-toolkit";
import sharp from "sharp";
import { cellRect, IMAGE_PATH } from "@/shared/reference/coverage.ts";
import {
  downsample,
  FONT_SIZE,
  MARGIN,
  TARGET_SIZE,
} from "@/shared/render/render.ts";
import { cpHex } from "@/shared/render/snapshot.ts";
import { ensureSource, SOURCES } from "@/shared/source.ts";
import { pMap } from "@/shared/util/io.ts";

// Minimum dark pixels for a cell to count as holding a glyph (vs an unassigned blank cell).
const MIN_INK_PIXELS = 3;

// The full specimen is decoded once and reused; referencePng is called once per covered
// codepoint (thousands of times), and re-decoding the multi-thousand-row PNG each time is costly.
const source = memoize(
  async (): Promise<{
    data: Buffer;
    width: number;
    height: number;
    channels: 1 | 2 | 3 | 4;
  }> => {
    await ensureSource(SOURCES.allChars);
    const { data, info } = await sharp(IMAGE_PATH)
      .flatten({ background: "#ffffff" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      data,
      width: info.width,
      height: info.height,
      channels: info.channels as 1 | 2 | 3 | 4,
    };
  },
);

/**
 * PragmataPro reference glyph for a codepoint, cropped from All_chars and normalized like a Pravka
 * render (trim, margin, 64×64) so the two are diff-comparable. Null when the chart lacks it.
 */
export async function referencePng(cp: number): Promise<Buffer | null> {
  const rect = cellRect(cp);
  if (!rect) return null;

  try {
    const { data, width, height, channels } = await source();
    const cell = await sharp(data, { raw: { width, height, channels } })
      .extract(rect)
      .png()
      .toBuffer();

    const gray = await sharp(cell).grayscale().raw().toBuffer();
    let ink = 0;
    for (const v of gray) if (v < 128) ink++;
    if (ink < MIN_INK_PIXELS) return null; // unassigned blank cell

    // Pad by a margin proportional to the trimmed ink (same MARGIN/FONT_SIZE ratio as the render
    // path); a fixed margin would dwarf the small chart crop and shrink the reference glyph.
    const trimmed = await sharp(cell)
      .trim({ background: "#ffffff", threshold: 20 })
      .png()
      .toBuffer();
    const tm = await sharp(trimmed).metadata();
    const ext = Math.max(
      1,
      Math.round(
        (Math.max(tm.width ?? 0, tm.height ?? 0) * MARGIN) / FONT_SIZE,
      ),
    );
    const padded = await sharp(trimmed)
      .extend({
        top: ext,
        bottom: ext,
        left: ext,
        right: ext,
        background: "#ffffff",
      })
      .png()
      .toBuffer();

    return await downsample(padded, TARGET_SIZE);
  } catch {
    return null; // out-of-bounds crop, untrimmable cell, or other sharp failure
  }
}

/**
 * Write per-codepoint reference crops to `dir` (cp→path), skipping codepoints the chart lacks. PNGs
 * match the 64×64 render/diff format, so they feed runDiff like font-rendered snapshots.
 */
export async function referencePaths(
  cps: number[],
  dir: string,
): Promise<Map<number, string>> {
  await ensureSource(SOURCES.allChars);
  mkdirSync(dir, { recursive: true });
  const out = new Map<number, string>();
  await pMap(cps, 8, async (cp) => {
    const buf = await referencePng(cp);
    if (!buf) return;
    const path = join(dir, `${cpHex(cp)}.png`);
    writeFileSync(path, buf);
    out.set(cp, path);
  });
  return out;
}
