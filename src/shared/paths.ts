import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Walk up from this module until the repo's package.json (robust to file depth and cwd). */
function findRoot(start: string): string {
  for (let dir = start; dir !== dirname(dir); dir = dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) return dir;
  }
  throw new Error("project root (package.json) not found");
}

// Absolute anchors; use these for path math so resolution never depends on cwd.
export const PROJECT_ROOT = findRoot(import.meta.dirname);
export const VENDOR_DIR = join(PROJECT_ROOT, "vendor");
export const FSD_DIR = join(VENDOR_DIR, "fsd");
export const RECIPES_DIR = join(PROJECT_ROOT, "src/shared/recipe/recipes");
export const BASE_RECIPE = join(RECIPES_DIR, "base.toml");
export const BEST_RECIPE = join(RECIPES_DIR, "current-best.toml");
export const DIST_DIR = join(PROJECT_ROOT, "dist");
export const FONTS_DIR = join(DIST_DIR, "fonts");

/**
 * Repo-relative default paths (single source for CLI flag and feature defaults). dist/ is grouped by
 * kind: cache (scratch) · fonts · release · reports; committed panels live under docs/assets.
 */
export const PATHS = {
  baseRecipe: "src/shared/recipe/recipes/base.toml",
  bestRecipe: "src/shared/recipe/recipes/current-best.toml",
  cacheWork: "dist/cache/work",
  cacheBuilds: "dist/cache/builds",
  fonts: "dist/fonts",
  release: "dist/release",
  charsReport: "dist/reports/chars",
  compareReport: "dist/reports/compare",
  glyphReport: "dist/reports/latest",
  codepointsJson: "dist/reports/codepoints.json",
  cjkGridPng: "dist/reports/cjk-grid-regression.png",
  compareDocs: "docs/assets/compare",
  showcaseDocs: "docs/assets/showcase",
} as const;
