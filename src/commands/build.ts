import { buildCommand, buildRouteMap } from "@stricli/core";
import { buildFont, setupIosevka } from "@/shared/build/build.ts";
import { PATHS } from "@/shared/paths.ts";

const setupCmd = buildCommand({
  docs: { brief: "Download the Iosevka source and install its dependencies" },
  parameters: {
    flags: {
      force: { kind: "boolean", brief: "Re-download even if vendor exists" },
    },
  },
  func: async (flags: { force: boolean }) => {
    await setupIosevka(flags);
  },
});

function runBuild(recipe: string): void {
  const dir = buildFont(recipe);
  if (!dir) throw new Error("Font build failed");
  console.log(dir);
}

const fontCmd = buildCommand({
  docs: { brief: "Build the Pravka font from a recipe" },
  parameters: {
    flags: {
      recipe: {
        kind: "parsed",
        parse: String,
        brief: "Recipe TOML",
        default: PATHS.bestRecipe,
      },
    },
  },
  func: (flags: { recipe: string }) => runBuild(flags.recipe),
});

const baselineCmd = buildCommand({
  docs: {
    brief:
      "Build the untuned SS08 baseline (src/shared/recipe/recipes/base.toml)",
  },
  parameters: { flags: {} },
  func: () => runBuild(PATHS.baseRecipe),
});

export const buildRoutes = buildRouteMap({
  docs: { brief: "Font toolchain: setup and build" },
  routes: { setup: setupCmd, font: fontCmd, baseline: baselineCmd },
});
