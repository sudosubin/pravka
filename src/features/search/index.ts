import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { meanBy } from "es-toolkit";
import { parse as parseToml } from "smol-toml";
import {
  buildFont,
  LIGATION_TOML as DEFAULT_LIGATION,
  VARIANTS_TOML as DEFAULT_VARIANTS,
  findRegularTtf,
} from "@/shared/build/build.ts";
import { runDiff, type ScorePair } from "@/shared/diff/diff.ts";
import {
  BASE_RECIPE,
  BEST_RECIPE,
  DIST_DIR,
  RECIPES_DIR,
} from "@/shared/paths.ts";
import { buildOptionMap } from "@/shared/recipe/option-map.ts";
import {
  getDesignSection,
  loadRecipe,
  type Recipe,
  writeRecipeWithDesign,
} from "@/shared/recipe/recipe.ts";
import { coveredCps } from "@/shared/reference/coverage.ts";
import { referencePaths } from "@/shared/reference/reference.ts";
import { renderAndCache } from "@/shared/render/render.ts";
import {
  fontHash,
  recipeHash,
  SnapshotCache,
} from "@/shared/render/snapshot.ts";
import { getCmap } from "@/shared/util/codepoints.ts";
import { writeJson } from "@/shared/util/io.ts";

export const AXIS_ORDER = [
  "letter-g",
  "letter-a",
  "digit-zero",
  "digit-one",
  "letter-l-lower",
  "letter-i-tittle",
  "letter-q-lower",
  "letter-R",
  "at-sign",
  "ampersand",
];

const VARIANTS_TOML = process.env.PRAVKA_VARIANTS_TOML ?? DEFAULT_VARIANTS;
const LIGATION_TOML = process.env.PRAVKA_LIGATION_TOML ?? DEFAULT_LIGATION;

function aggregateScore(scores: Map<number, ScorePair>, cps: number[]): number {
  const present = cps.filter((cp) => scores.has(cp));
  return present.length > 0
    ? meanBy(present, (cp) => scores.get(cp)!.composite)
    : 0;
}

/** The subset of reference PNGs covering `cps` (codepoints with no crop are dropped). */
function pickRefs(
  refPngPaths: Map<number, string>,
  cps: number[],
): Map<number, string> {
  return new Map(
    cps.flatMap((cp) => {
      const p = refPngPaths.get(cp);
      return p ? [[cp, p] as const] : [];
    }),
  );
}

/** A temp directory removed automatically at the end of its `using` scope. */
function tempDir(prefix: string): { path: string } & Disposable {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return {
    path,
    [Symbol.dispose]: () => rmSync(path, { recursive: true, force: true }),
  };
}

interface AxisToml {
  prime: string;
  candidates: string[];
}

async function searchOneAxis(
  axisName: string,
  currentDesign: Record<string, unknown>,
  baseRecipe: Recipe,
  intersectionCps: number[],
  refPngPaths: Map<number, string>,
  cache: SnapshotCache,
  mapping: Map<string, Set<number>>,
  cacheDir: string,
): Promise<Record<string, unknown>> {
  const axisFile = join(RECIPES_DIR, "variants", `${axisName}.toml`);
  if (!existsSync(axisFile)) {
    console.log(`  [skip] no axis file: ${axisFile}`);
    return currentDesign;
  }
  const { prime, candidates } = parseToml(
    readFileSync(axisFile, "utf-8"),
  ) as unknown as AxisToml;
  const interSet = new Set(intersectionCps);
  const affected = [...(mapping.get(prime) ?? [])]
    .filter((c) => interSet.has(c))
    .sort((a, b) => a - b);
  if (affected.length === 0) {
    console.log(`  [skip] no affected cps for axis '${prime}'`);
    return currentDesign;
  }

  console.log(
    `\n  Axis '${axisName}' (prime=${prime}, ${affected.length} affected cps, ${candidates.length} candidates)`,
  );

  let bestDesign = { ...currentDesign };
  let bestScore = Infinity;

  for (const candValue of candidates) {
    const trialDesign = { ...currentDesign };
    if (candValue === "__remove__") delete trialDesign[prime];
    else trialDesign[prime] = candValue;

    using tmp = tempDir(`pravka-cand-${axisName}-`);
    const tmpPath = join(tmp.path, "candidate.toml");
    writeRecipeWithDesign(baseRecipe, trialDesign, tmpPath);
    const storePath = buildFont(tmpPath);
    if (!storePath) {
      console.log(`    [${candValue}] build failed, skipping`);
      continue;
    }
    const fontPath = findRegularTtf(storePath);
    if (!fontPath) {
      console.log(`    [${candValue}] no TTF found`);
      continue;
    }
    const candPngPaths = await renderAndCache(fontPath, affected, cache, {
      recipeDesign: trialDesign,
      mapping,
      recipeHashStr: recipeHash(tmpPath),
    });
    const affectedRef = pickRefs(refPngPaths, affected);
    const scores = await runDiff(
      affectedRef,
      candPngPaths,
      join(cacheDir, "diffs", `${axisName}-${candValue}`),
    );
    const agg = aggregateScore(scores, affected);
    console.log(`    [${candValue}]  score=${agg.toFixed(4)}`);
    if (agg < bestScore) {
      bestScore = agg;
      bestDesign = { ...trialDesign };
    }
  }

  console.log(
    `  → Best for '${axisName}': ${String(bestDesign[prime] ?? "(removed)")}  score=${bestScore.toFixed(4)}`,
  );
  return bestDesign;
}

export interface RunSearchOpts {
  passes: number;
  axisFilter?: string;
  cacheDir: string;
  baseRecipePath?: string;
  bestRecipePath?: string;
}

export async function runSearch(opts: RunSearchOpts): Promise<void> {
  const baseRecipePath = opts.baseRecipePath ?? BASE_RECIPE;
  const bestRecipePath = opts.bestRecipePath ?? BEST_RECIPE;

  const cache = new SnapshotCache(opts.cacheDir);
  const baseRecipe = loadRecipe(baseRecipePath);
  let currentDesign = getDesignSection(loadRecipe(bestRecipePath));
  const mapping = buildOptionMap(
    VARIANTS_TOML,
    LIGATION_TOML,
    join(opts.cacheDir, "option_codepoints.cache.json"),
  );

  const cpFile = join(opts.cacheDir, "intersection_cps.json");
  let intersectionCps: number[];
  if (existsSync(cpFile)) {
    intersectionCps = JSON.parse(readFileSync(cpFile, "utf-8")) as number[];
  } else {
    console.log("Computing codepoint intersection (building base font first)…");
    const storePath = buildFont(baseRecipePath);
    if (!storePath) throw new Error("Base font build failed");
    const fontPath = findRegularTtf(storePath);
    if (!fontPath) throw new Error("No TTF in base build");
    const refCps = new Set(coveredCps()); // PragmataPro reference, from the All_chars chart
    const candCps = getCmap(fontPath);
    intersectionCps = [...refCps]
      .filter((c) => candCps.has(c))
      .sort((a, b) => a - b);
    writeJson(cpFile, intersectionCps, false);
    console.log(
      `Intersection: ${intersectionCps.length.toLocaleString()} codepoints`,
    );
  }

  // Reference glyphs are cropped from the fsd.it All_chars specimen (no PragmataPro font).
  const refPngPaths = await referencePaths(
    intersectionCps,
    join(opts.cacheDir, "allchars-ref"),
  );
  const axes = opts.axisFilter ? [opts.axisFilter] : AXIS_ORDER;

  for (let pass = 1; pass <= opts.passes; pass++) {
    console.log(`\n=== Pass ${pass}/${opts.passes} ===`);
    for (const axisName of axes) {
      currentDesign = await searchOneAxis(
        axisName,
        currentDesign,
        baseRecipe,
        intersectionCps,
        refPngPaths,
        cache,
        mapping,
        opts.cacheDir,
      );
      writeRecipeWithDesign(baseRecipe, currentDesign, bestRecipePath);
      console.log(`  Saved ${bestRecipePath}`);
    }
  }

  console.log("\n=== Search complete, generating full diff report ===");
  console.log("Final design overrides:", currentDesign);
  await finalize(
    currentDesign,
    intersectionCps,
    refPngPaths,
    cache,
    opts.cacheDir,
  );
}

async function finalize(
  finalDesign: Record<string, unknown>,
  intersectionCps: number[],
  refPngPaths: Map<number, string>,
  cache: SnapshotCache,
  cacheDir: string,
): Promise<void> {
  const storePath = buildFont(BEST_RECIPE);
  if (!storePath) {
    console.log("  [finalize] Final build failed");
    return;
  }
  const fontPath = findRegularTtf(storePath);
  if (!fontPath) {
    console.log("  [finalize] No TTF in final build");
    return;
  }

  const rhash = recipeHash(BEST_RECIPE);
  const candPngPaths = await renderAndCache(fontPath, intersectionCps, cache, {
    recipeDesign: finalDesign,
    recipeHashStr: rhash,
  });

  const allRef = pickRefs(refPngPaths, intersectionCps);
  const scores = await runDiff(
    allRef,
    candPngPaths,
    join(cacheDir, "diffs", "final"),
  );

  const outDir = DIST_DIR;
  const scoresPath = join(outDir, "cache", "builds", `${rhash}.score.json`);
  const obj: Record<string, unknown> = {};
  for (const [cp, v] of scores)
    obj[cp.toString(16).toUpperCase().padStart(4, "0")] = v;
  writeJson(scoresPath, obj, false);

  const ts = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 13)
    .replace(/(\d{8})(\d{4})/, "$1-$2");
  const { buildReport } = await import("@/shared/diff/report.ts");
  const reportPath = buildReport({
    scoresPath,
    cacheDir,
    outDir: join(outDir, "reports", ts),
    recipeHashStr: rhash,
    fontHashStr: fontHash(fontPath),
  });
  console.log(`  [finalize] Report: ${reportPath}`);
}
