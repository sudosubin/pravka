import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { findRegularTtf } from "@/shared/build/build.ts";
import { runDiff } from "@/shared/diff/diff.ts";
import { buildReport } from "@/shared/diff/report.ts";
import { FONTS_DIR } from "@/shared/paths.ts";
import { renderAndCache } from "@/shared/render/render.ts";
import { cpLabel, SnapshotCache } from "@/shared/render/snapshot.ts";
import { writeJson } from "@/shared/util/io.ts";

// End-to-end pipeline smoke (formerly tests/smoke/*.sh): render → diff → report on a few glyphs,
// using whatever fonts are present. Self-skips when fewer than two are found (e.g. bare CI).
function availableFonts(): string[] {
  const fonts: string[] = [];
  if (existsSync(FONTS_DIR))
    for (const d of readdirSync(FONTS_DIR)) {
      const ttf = findRegularTtf(join(FONTS_DIR, d));
      if (ttf) fonts.push(ttf);
    }
  for (const sys of [
    join(homedir(), "Library/Fonts/InterVariable.ttf"),
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Symbol.ttf",
  ])
    if (existsSync(sys)) fonts.push(sys);
  return [...new Set(fonts)];
}

const FONTS = availableFonts();
const CPS = [0x67, 0x61, 0x30, 0x31, 0x6c]; // g a 0 1 l

describe("render → diff → report pipeline", () => {
  test.skipIf(FONTS.length < 2)(
    "renders, scores, and reports glyphs",
    async () => {
      const [fontA, fontB] = FONTS;
      const dir = mkdtempSync(join(tmpdir(), "pravka-smoke-"));
      const cache = new SnapshotCache(join(dir, "cache"));

      const refPaths = await renderAndCache(fontA!, CPS, cache);
      const candPaths = await renderAndCache(fontB!, CPS, cache);
      expect(refPaths.size).toBe(CPS.length);
      for (const p of refPaths.values()) expect(existsSync(p)).toBe(true);

      const scores = await runDiff(refPaths, candPaths, join(dir, "diffs"));
      expect(scores.size).toBeGreaterThan(0);
      for (const s of scores.values()) {
        expect(s.composite).toBeGreaterThanOrEqual(0);
        expect(s.composite).toBeLessThanOrEqual(1);
        expect(s.ssim).toBeGreaterThanOrEqual(-1);
        expect(s.ssim).toBeLessThanOrEqual(1);
      }

      const scoresPath = join(dir, "scores.json");
      writeJson(
        scoresPath,
        Object.fromEntries(
          [...scores].map(([cp, v]) => [cpLabel(cp).slice(2), v]),
        ),
      );
      const reportDir = join(dir, "report");
      buildReport({
        scoresPath,
        cacheDir: join(dir, "cache"),
        outDir: reportDir,
      });
      const html = readFileSync(join(reportDir, "index.html"), "utf-8");
      expect(html).toContain("data:image/png;base64");

      // Determinism: re-render is a cache hit and returns identical paths.
      const again = await renderAndCache(fontA!, CPS, cache);
      expect([...again]).toEqual([...refPaths]);
    },
  );
});
