import { buildCommand, buildRouteMap } from "@stricli/core";
import { renderReport, runCharsCompare } from "@/features/compare/index.ts";
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

const charsCmd = buildCommand({
  docs: {
    brief:
      "Per-glyph diff over a codepoint range vs the All_chars reference → dist/reports/chars",
  },
  parameters: {
    flags: {
      font: {
        kind: "parsed",
        parse: String,
        brief: "Pravka TTF (auto-finds under dist/fonts)",
        optional: true,
      },
      range: {
        kind: "parsed",
        parse: String,
        brief: "Hex range, e.g. 2190-27bf (default: all)",
        optional: true,
      },
      out: {
        kind: "parsed",
        parse: String,
        brief: "Output directory (default: dist/reports/chars/<range>)",
        optional: true,
      },
      "cache-dir": {
        kind: "parsed",
        parse: String,
        brief: "Reference/cand cache dir",
        default: PATHS.cacheWork,
      },
    },
  },
  func: async (flags: {
    font?: string;
    range?: string;
    out?: string;
    "cache-dir": string;
  }) => {
    await runCharsCompare({
      font: flags.font,
      range: flags.range,
      out: flags.out,
      cacheDir: flags["cache-dir"],
    });
  },
});

export const compareRoutes = buildRouteMap({
  docs: { brief: "Compare PragmataPro reference vs Pravka (diff images)" },
  routes: { report: reportCmd, chars: charsCmd },
});
