import { buildCommand, buildRouteMap } from "@stricli/core";
import {
  buildRelease,
  packageRelease,
  releaseDerive,
  releaseTtf,
} from "@/features/release/index.ts";
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

const ttfCmd = buildCommand({
  docs: {
    brief: "Stage: build family TTFs (plain = rename, nerd = FontForge patch)",
  },
  parameters: {
    flags: {
      family: {
        kind: "parsed",
        parse: String,
        brief: "plain | nerd | both",
        default: "both",
      },
      recipe: {
        kind: "parsed",
        parse: String,
        brief: "Recipe TOML (font source, cache hit)",
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
      force: { kind: "boolean", brief: "Rebuild even if present" },
    },
  },
  async func(flags: {
    family: string;
    recipe: string;
    "font-dir"?: string;
    out: string;
    force: boolean;
  }) {
    await releaseTtf({
      family: flags.family,
      recipe: flags.recipe,
      fontDir: flags["font-dir"],
      out: flags.out,
      force: flags.force,
    });
  },
});

function deriveFlags() {
  return {
    family: {
      kind: "parsed" as const,
      parse: String,
      brief: "plain | nerd | both",
      default: "both",
    },
    out: {
      kind: "parsed" as const,
      parse: String,
      brief: "Output directory",
      default: PATHS.release,
    },
    force: { kind: "boolean" as const, brief: "Rebuild even if present" },
  };
}

const otfCmd = buildCommand({
  docs: { brief: "Stage: convert family TTFs to OTF (FontForge)" },
  parameters: { flags: deriveFlags() },
  async func(flags: { family: string; out: string; force: boolean }) {
    await releaseDerive("otf", {
      family: flags.family,
      out: flags.out,
      force: flags.force,
    });
  },
});

const woff2Cmd = buildCommand({
  docs: { brief: "Stage: compress family TTFs to WOFF2" },
  parameters: { flags: deriveFlags() },
  async func(flags: { family: string; out: string; force: boolean }) {
    await releaseDerive("woff2", {
      family: flags.family,
      out: flags.out,
      force: flags.force,
    });
  },
});

const packageCmd = buildCommand({
  docs: { brief: "Stage: zip each family directory and write SHA256SUMS" },
  parameters: {
    flags: {
      version: {
        kind: "parsed",
        parse: String,
        brief: "Release version (default: package.json)",
        optional: true,
      },
      family: {
        kind: "parsed",
        parse: String,
        brief: "plain | nerd | both",
        default: "both",
      },
      out: {
        kind: "parsed",
        parse: String,
        brief: "Output directory",
        default: PATHS.release,
      },
    },
  },
  func(flags: { version?: string; family: string; out: string }) {
    packageRelease({
      version: flags.version,
      family: flags.family,
      out: flags.out,
    });
  },
});

export const releaseRoutes = buildRouteMap({
  docs: { brief: "Package distributable font artifacts" },
  routes: {
    build: buildCmd,
    ttf: ttfCmd,
    otf: otfCmd,
    woff2: woff2Cmd,
    package: packageCmd,
  },
});
