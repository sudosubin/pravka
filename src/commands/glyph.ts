import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCommand, buildRouteMap } from "@stricli/core";
import { LIGATION_TOML, VARIANTS_TOML } from "@/shared/build/build.ts";
import { runDiff } from "@/shared/diff/diff.ts";
import { PATHS } from "@/shared/paths.ts";
import { buildOptionMap } from "@/shared/recipe/option-map.ts";
import { getDesignSection, loadRecipe } from "@/shared/recipe/recipe.ts";
import { renderAndCache } from "@/shared/render/render.ts";
import {
  cpLabel,
  recipeHash,
  SnapshotCache,
} from "@/shared/render/snapshot.ts";
import { coverageReport } from "@/shared/util/codepoints.ts";
import { parseCodepoints } from "@/shared/util/codepoints-parser.ts";
import { writeJson } from "@/shared/util/io.ts";

const renderCmd = buildCommand({
  docs: { brief: "Render glyphs from a font to cached PNG snapshots" },
  parameters: {
    flags: {
      font: { kind: "parsed", parse: String, brief: "Font file (TTF)" },
      codepoints: {
        kind: "parsed",
        parse: parseCodepoints,
        brief: "Comma-separated codepoints (U+0067,61)",
        optional: true,
      },
      "cp-file": {
        kind: "parsed",
        parse: String,
        brief: "JSON file with a codepoint array",
        optional: true,
      },
      recipe: {
        kind: "parsed",
        parse: String,
        brief: "Recipe TOML for variant context",
        default: PATHS.bestRecipe,
      },
      "cache-dir": {
        kind: "parsed",
        parse: String,
        brief: "Snapshot cache directory",
        default: PATHS.cacheWork,
      },
      force: { kind: "boolean", brief: "Re-render even if cached" },
    },
  },
  async func(flags: {
    font: string;
    codepoints?: number[];
    "cp-file"?: string;
    recipe: string;
    "cache-dir": string;
    force: boolean;
  }) {
    let cps: number[] = [];
    if (flags.codepoints) cps = flags.codepoints;
    else if (flags["cp-file"])
      cps = JSON.parse(readFileSync(flags["cp-file"], "utf-8"));
    else throw new Error("Provide --codepoints or --cp-file");

    let recipeDesign: Record<string, unknown> = {};
    let mapping = new Map<string, Set<number>>();
    let rhash = "";
    if (flags.recipe && existsSync(flags.recipe)) {
      recipeDesign = getDesignSection(loadRecipe(flags.recipe));
      rhash = recipeHash(flags.recipe);
      const variants = process.env.PRAVKA_VARIANTS_TOML ?? VARIANTS_TOML;
      const ligation = process.env.PRAVKA_LIGATION_TOML ?? LIGATION_TOML;
      if (existsSync(variants) && existsSync(ligation)) {
        mapping = buildOptionMap(
          variants,
          ligation,
          `${flags["cache-dir"]}/option_codepoints.cache.json`,
        );
      }
    }

    const cache = new SnapshotCache(flags["cache-dir"]);
    const results = await renderAndCache(flags.font, cps, cache, {
      recipeDesign,
      mapping,
      recipeHashStr: rhash,
      force: flags.force,
    });
    for (const cp of [...results.keys()].sort((a, b) => a - b)) {
      console.log(`${cpLabel(cp)}  ${results.get(cp)}`);
    }
  },
});

const diffCmd = buildCommand({
  docs: { brief: "Render two fonts and score per-glyph pixel diffs" },
  parameters: {
    flags: {
      ref: { kind: "parsed", parse: String, brief: "Reference font (TTF)" },
      cand: { kind: "parsed", parse: String, brief: "Candidate font (TTF)" },
      codepoints: {
        kind: "parsed",
        parse: parseCodepoints,
        brief: "Comma-separated codepoints",
      },
      "cache-dir": {
        kind: "parsed",
        parse: String,
        brief: "Snapshot cache directory",
        default: PATHS.cacheWork,
      },
      out: {
        kind: "parsed",
        parse: String,
        brief: "Write scores JSON to this path",
        optional: true,
      },
    },
  },
  async func(flags: {
    ref: string;
    cand: string;
    codepoints: number[];
    "cache-dir": string;
    out?: string;
  }) {
    const cache = new SnapshotCache(flags["cache-dir"]);
    const [refPaths, candPaths] = await Promise.all([
      renderAndCache(flags.ref, flags.codepoints, cache),
      renderAndCache(flags.cand, flags.codepoints, cache),
    ]);
    const results = await runDiff(
      refPaths,
      candPaths,
      join(flags["cache-dir"], "diffs", "cli"),
    );
    for (const cp of [...results.keys()].sort((a, b) => a - b)) {
      const s = results.get(cp)!;
      console.log(
        `${cpLabel(cp)}  composite=${s.composite.toFixed(4)}  ssim=${s.ssim.toFixed(4)}`,
      );
    }
    if (flags.out) {
      writeJson(
        flags.out,
        Object.fromEntries(
          [...results].map(([cp, v]) => [cpLabel(cp).slice(2), v]),
        ),
      );
    }
  },
});

const codepointsCmd = buildCommand({
  docs: {
    brief:
      "Report glyph coverage of a font (and intersection with a candidate)",
  },
  parameters: {
    flags: {
      ref: { kind: "parsed", parse: String, brief: "Reference font (TTF)" },
      cand: {
        kind: "parsed",
        parse: String,
        brief: "Candidate font (TTF)",
        optional: true,
      },
      out: {
        kind: "parsed",
        parse: String,
        brief: "Output JSON path",
        default: PATHS.codepointsJson,
      },
    },
  },
  func(flags: { ref: string; cand?: string; out: string }) {
    const report = coverageReport(flags.ref, flags.cand);
    writeJson(flags.out, report);
    const fmt = (n: number) => n.toLocaleString();
    if (flags.cand) {
      console.log(
        `Intersection: ${fmt(report.intersection_count ?? 0)}  | Ref-only: ${fmt(report.ref_only_count ?? 0)}  | Cand-only: ${fmt(report.cand_only_count ?? 0)}`,
      );
    } else {
      console.log(`Coverage: ${fmt(report.ref_count)} codepoints`);
    }
  },
});

export const glyphRoutes = buildRouteMap({
  docs: {
    brief: "Low-level glyph render / diff / coverage / report primitives",
  },
  routes: {
    render: renderCmd,
    diff: diffCmd,
    codepoints: codepointsCmd,
  },
});
