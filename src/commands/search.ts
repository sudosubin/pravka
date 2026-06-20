import { buildCommand } from "@stricli/core";
import { runSearch } from "@/features/search/index.ts";
import { PATHS } from "@/shared/paths.ts";

export const searchCmd = buildCommand({
  docs: { brief: "Greedy axis-by-axis variant search against the reference" },
  parameters: {
    flags: {
      passes: {
        kind: "parsed",
        parse: Number,
        brief: "Number of search passes",
        default: "2",
      },
      axis: {
        kind: "parsed",
        parse: String,
        brief: "Limit to a single axis",
        optional: true,
      },
      "cache-dir": {
        kind: "parsed",
        parse: String,
        brief: "Build/render cache",
        default: PATHS.cacheWork,
      },
      base: {
        kind: "parsed",
        parse: String,
        brief: "Base recipe",
        default: PATHS.baseRecipe,
      },
      best: {
        kind: "parsed",
        parse: String,
        brief: "Best recipe (written in place)",
        default: PATHS.bestRecipe,
      },
    },
  },
  func: (flags: {
    passes: number;
    axis?: string;
    "cache-dir": string;
    base: string;
    best: string;
  }) =>
    runSearch({
      passes: flags.passes,
      axisFilter: flags.axis,
      cacheDir: flags["cache-dir"],
      baseRecipePath: flags.base,
      bestRecipePath: flags.best,
    }),
});
