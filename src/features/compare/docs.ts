import { renderCompare } from "@/features/compare/engine.ts";
import { buildFont, findRegularTtf } from "@/shared/build/build.ts";
import { PATHS } from "@/shared/paths.ts";

const DOCS_SCALE = 2; // committed docs render at half the working resolution

export interface DocsCompareOpts {
  recipe?: string;
  out?: string;
  fontDir?: string;
  id?: string;
}

/**
 * Committed comparison panels in docs/assets/compare/ (pragmatapro · pravka · diff per sample/block),
 * embedded as markdown tables in README / COMPARISON.md. Same engine and layout as `compare report`
 * (see renderCompare); font-free.
 */
export async function buildDocsCompare(
  opts: DocsCompareOpts = {},
): Promise<void> {
  const recipe = opts.recipe ?? PATHS.bestRecipe;
  const out = opts.out ?? PATHS.compareDocs;

  const fontDir = opts.fontDir ?? buildFont(recipe);
  if (!fontDir)
    throw new Error("Font build failed. Run `pravka build font` first.");
  const fontPath = findRegularTtf(fontDir);
  if (!fontPath) throw new Error(`No regular TTF found in ${fontDir}`);

  await renderCompare({ fontPath, out, scale: DOCS_SCALE, id: opts.id });
  console.log(`\nDone. Panels under ${out}/`);
}
