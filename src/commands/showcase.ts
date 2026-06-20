import { buildCommand, buildRouteMap } from "@stricli/core";
import {
  buildSpecimenGallery,
  renderCjkGrid,
} from "@/features/showcase/index.ts";
import { PATHS } from "@/shared/paths.ts";

const specimenCmd = buildCommand({
  docs: {
    brief:
      "Render specimen PNGs (pangram/code/weights/cjk) + gallery → docs/assets",
  },
  parameters: {
    flags: {
      recipe: {
        kind: "parsed",
        parse: String,
        brief: "Recipe TOML (triggers build)",
        default: PATHS.bestRecipe,
      },
      out: {
        kind: "parsed",
        parse: String,
        brief: "Output directory",
        default: PATHS.showcaseDocs,
      },
      id: {
        kind: "parsed",
        parse: String,
        brief: "Render a single specimen by id",
        optional: true,
      },
      "font-dir": {
        kind: "parsed",
        parse: String,
        brief: "Use a prebuilt font dir (skip build)",
        optional: true,
      },
    },
  },
  func: async (flags: {
    recipe: string;
    out: string;
    id?: string;
    "font-dir"?: string;
  }) => {
    await buildSpecimenGallery({
      recipe: flags.recipe,
      out: flags.out,
      id: flags.id,
      fontDir: flags["font-dir"],
    });
  },
});

const cjkGridCmd = buildCommand({
  docs: { brief: "Render the CJK EAW grid alignment regression image" },
  parameters: {
    flags: {
      out: {
        kind: "parsed",
        parse: String,
        brief: "Output PNG path",
        default: PATHS.cjkGridPng,
      },
      size: {
        kind: "parsed",
        parse: Number,
        brief: "Font size (half-em base)",
        default: "28",
      },
      "font-dir": {
        kind: "parsed",
        parse: String,
        brief: "Pravka font directory (default: current-best build)",
        optional: true,
      },
    },
  },
  async func(flags: { out: string; size: number; "font-dir"?: string }) {
    await renderCjkGrid({
      out: flags.out,
      size: flags.size,
      fontDir: flags["font-dir"],
    });
  },
});

export const showcaseRoutes = buildRouteMap({
  docs: { brief: "Render images from the Pravka font (showcase / regression)" },
  routes: { specimen: specimenCmd, "cjk-grid": cjkGridCmd },
});
