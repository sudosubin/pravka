import { buildCommand, buildRouteMap } from "@stricli/core";
import { renderReport } from "@/features/compare/index.ts";
import { PATHS } from "@/shared/paths.ts";

const reportCmd = buildCommand({
  docs: {
    brief:
      "Local HTML report (reference | Pravka | diff) for every sample + block → dist/reports/compare",
  },
  parameters: {
    flags: {
      font: {
        kind: "parsed",
        parse: String,
        brief: "Pravka TTF",
        optional: true,
      },
      out: {
        kind: "parsed",
        parse: String,
        brief: "Output directory",
        default: PATHS.compareReport,
      },
      id: {
        kind: "parsed",
        parse: String,
        brief: "Process a single sample by id",
        optional: true,
      },
    },
  },
  func: async (flags: { font?: string; out: string; id?: string }) => {
    await renderReport(flags);
  },
});

export const compareRoutes = buildRouteMap({
  docs: { brief: "Compare PragmataPro reference vs Pravka (diff images)" },
  routes: { report: reportCmd },
});
