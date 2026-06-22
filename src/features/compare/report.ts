import { join } from "node:path";

import { renderCompare } from "@/features/compare/engine.ts";
import { buildFontCacheDir, findRegularTtf } from "@/shared/build/build.ts";
import { BEST_RECIPE, PATHS } from "@/shared/paths.ts";

export interface ReportOpts {
  font?: string;
  out?: string;
  id?: string;
}

/** Local HTML report (reference | Pravka | diff) for every sample + block → dist/reports/compare. */
export async function renderReport(opts: ReportOpts = {}): Promise<string> {
  // Default to the current-best build (content-addressed by recipe hash, so it tracks the recipe
  // and Iosevka version rather than freezing a specific build directory).
  const fontPath = opts.font ?? findRegularTtf(buildFontCacheDir(BEST_RECIPE));
  if (!fontPath)
    throw new Error(
      "No built font for the current-best recipe. Run `pravka build font` first, or pass --font.",
    );
  const out = opts.out ?? PATHS.compareReport;
  const panels = await renderCompare({
    fontPath,
    out,
    html: true,
    id: opts.id,
  });
  const indexPath = join(out, "index.html");
  console.log(`\nIndex: ${indexPath}  (${panels.length} panels)`);
  return indexPath;
}
