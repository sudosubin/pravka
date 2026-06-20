import { buildCommand, buildRouteMap } from "@stricli/core";
import { buildRelease } from "@/features/release/index.ts";
import { PATHS } from "@/shared/paths.ts";

const buildCmd = buildCommand({
  docs: {
    brief:
      "Package TTF/OTF/WOFF2 (plain + Nerd Font Mono) into dist/release/ with zips + SHA256SUMS",
  },
  parameters: {
    flags: {
      recipe: {
        kind: "parsed",
        parse: String,
        brief: "Recipe TOML (triggers build)",
        default: PATHS.bestRecipe,
      },
      "font-dir": {
        kind: "parsed",
        parse: String,
        brief: "Use a prebuilt font dir (skip build)",
        optional: true,
      },
      out: {
        kind: "parsed",
        parse: String,
        brief: "Output directory",
        default: PATHS.release,
      },
      version: {
        kind: "parsed",
        parse: String,
        brief: "Release version (default: package.json)",
        optional: true,
      },
      formats: {
        kind: "parsed",
        parse: String,
        brief: "Comma list: ttf,otf,woff2",
        default: "ttf,otf,woff2",
      },
      family: {
        kind: "parsed",
        parse: String,
        brief: "plain | nerd | both",
        default: "both",
      },
      force: {
        kind: "boolean",
        brief: "Rebuild the release work tree, ignore cache",
      },
    },
  },
  async func(flags: {
    recipe: string;
    "font-dir"?: string;
    out: string;
    version?: string;
    formats: string;
    family: string;
    force: boolean;
  }) {
    await buildRelease({
      recipe: flags.recipe,
      fontDir: flags["font-dir"],
      out: flags.out,
      version: flags.version,
      formats: flags.formats,
      family: flags.family,
      force: flags.force,
    });
  },
});

export const releaseRoutes = buildRouteMap({
  docs: { brief: "Package distributable font artifacts" },
  routes: { build: buildCmd },
});
