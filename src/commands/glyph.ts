import { existsSync, readFileSync } from "node:fs";
import { buildCommand, buildRouteMap } from "@stricli/core";
import { LIGATION_TOML, VARIANTS_TOML } from "@/shared/build/build.ts";
import { PATHS } from "@/shared/paths.ts";
import { buildOptionMap } from "@/shared/recipe/option-map.ts";
import { getDesignSection, loadRecipe } from "@/shared/recipe/recipe.ts";
import { renderAndCache } from "@/shared/render/render.ts";
import {
  cpLabel,
  recipeHash,
  SnapshotCache,
} from "@/shared/render/snapshot.ts";
import { parseCodepoints } from "@/shared/util/codepoints-parser.ts";

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

export const glyphRoutes = buildRouteMap({
  docs: {
    brief: "Low-level glyph render / diff / coverage / report primitives",
  },
  routes: {
    render: renderCmd,
  },
});
