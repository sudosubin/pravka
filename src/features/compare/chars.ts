import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRegularTtf } from "@/shared/build/build.ts";
import { runDiff } from "@/shared/diff/diff.ts";
import { buildReport } from "@/shared/diff/report.ts";
import { PATHS } from "@/shared/paths.ts";
import { coveredCps } from "@/shared/reference/coverage.ts";
import { referencePng } from "@/shared/reference/reference.ts";
import { downsample, renderGlyphPng } from "@/shared/render/render.ts";
import { cpHex } from "@/shared/render/snapshot.ts";
import { ensureSource, SOURCES } from "@/shared/source.ts";
import { isMissingGlyph, loadFont } from "@/shared/util/font.ts";
import { pMap, writeJson } from "@/shared/util/io.ts";

/** Find a Pravka regular .ttf under dist/fonts/ when no font is given. */
function findCachedFont(): string {
  const root = PATHS.fonts;
  if (!existsSync(root)) throw new Error("no dist/fonts; pass --font <ttf>");
  for (const dir of readdirSync(root)) {
    const ttf = findRegularTtf(join(root, dir));
    if (ttf) return ttf;
  }
  throw new Error("no .ttf under dist/fonts; pass --font <ttf>");
}

/** Parse "lo-hi" (hex) or single "cp" into an inclusive codepoint range. */
function parseRange(s: string | undefined): [number, number] {
  if (!s) return [0, 0x10ffff];
  const [a, b] = s.split("-");
  return [parseInt(a!, 16), b ? parseInt(b, 16) : parseInt(a!, 16)];
}

export interface CharsCompareOpts {
  font?: string;
  range?: string;
  out?: string;
  cacheDir?: string;
}

/** Per-glyph diff report of a codepoint range vs the image-cropped All_chars reference (font-free). */
export async function runCharsCompare(
  opts: CharsCompareOpts = {},
): Promise<string> {
  await ensureSource(SOURCES.allChars);

  const fontPath = opts.font ?? findCachedFont();
  const [lo, hi] = parseRange(opts.range);
  const outDir =
    opts.out ??
    join(PATHS.charsReport, `${lo.toString(16)}-${hi.toString(16)}`);
  const cacheDir = opts.cacheDir ?? PATHS.cacheWork;
  const refDir = join(cacheDir, "ref");
  const candDir = join(cacheDir, "cand");
  const diffsDir = join(cacheDir, "diffs");
  for (const d of [refDir, candDir, diffsDir, outDir])
    mkdirSync(d, { recursive: true });

  const font = loadFont(fontPath);
  const cps = coveredCps(lo, hi);
  console.log(
    `Comparing ${cps.length} candidate codepoints in U+${lo.toString(16)}..U+${hi.toString(16)}`,
  );
  console.log(`Pravka font: ${fontPath}`);

  const refPaths = new Map<number, string>();
  const candPaths = new Map<number, string>();

  let failed = 0;
  await pMap(cps, 8, async (cp) => {
    try {
      const ref = await referencePng(cp);
      if (!ref) return; // chart has no glyph here
      const glyph = font.charToGlyph(String.fromCodePoint(cp));
      if (isMissingGlyph(glyph)) return; // Pravka lacks it; skip shape comparison
      const hex = cpHex(cp);
      const refPath = join(refDir, `${hex}.png`);
      const candPath = join(candDir, `${hex}.png`);
      writeFileSync(refPath, ref);
      writeFileSync(candPath, await downsample(await renderGlyphPng(font, cp)));
      refPaths.set(cp, refPath);
      candPaths.set(cp, candPath);
    } catch {
      failed++;
    }
  });
  if (failed)
    console.log(`Skipped ${failed} codepoints that failed to render/crop`);

  console.log(`Rendered ${refPaths.size} comparable glyphs; diffing…`);
  const records = await runDiff(refPaths, candPaths, diffsDir);

  const scores = Object.fromEntries(
    [...records].map(([cp, rec]) => [cpHex(cp).toUpperCase(), rec]),
  );
  const scoresPath = join(outDir, "scores.json");
  writeJson(scoresPath, scores, false);

  buildReport({ scoresPath, cacheDir, outDir, topN: 10000 });
  console.log(
    `Report: ${join(outDir, "index.html")}  (${records.size} glyphs)`,
  );
  return join(outDir, "index.html");
}
