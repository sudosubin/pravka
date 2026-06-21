import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DOC_BLOCKS } from "@/features/compare/block-scan.ts";
import { renderBlockPanels } from "@/features/compare/blocks.ts";
import { type Panel, renderIndexHtml } from "@/features/compare/html.ts";
import { renderSamplePanels } from "@/features/compare/sample-panels.ts";
import { SAMPLES } from "@/features/compare/samples.ts";
import { DIST_DIR } from "@/shared/paths.ts";

const triple = (dir: string) => ({
  refPath: join(dir, "pragmatapro.png"),
  pravkaPath: join(dir, "pravka.png"),
  diffPath: join(dir, "diff.png"),
});

export interface RenderCompareOpts {
  fontPath: string;
  out: string;
  html?: boolean;
  scale?: number;
  id?: string;
}

/**
 * One layout for every comparison: `<out>/<name>/{pragmatapro,pravka,diff}.png`. Drives both the
 * local HTML report and the committed docs panels; they differ only by out, scale, and html.
 */
export async function renderCompare(opts: RenderCompareOpts): Promise<Panel[]> {
  const { fontPath, out, scale = 1, id } = opts;
  const tmpRoot = join(DIST_DIR, "cache", "compare-tmp");
  const tmp = {
    origDir: join(tmpRoot, "orig"),
    pravkaDir: join(tmpRoot, "pravka"),
  };
  const panels: Panel[] = [];

  for (const s of SAMPLES) {
    if (id && s.id !== id) continue;
    const dir = join(out, s.id.replaceAll("_", "-"));
    console.log(`Rendering ${s.id} → ${dir}`);
    await renderSamplePanels(s, fontPath, tmp, dir, scale);
    panels.push({ title: s.displayTitle ?? s.id, ...triple(dir) });
  }

  for (const b of DOC_BLOCKS) {
    if (id && b.id !== id) continue;
    const dir = join(out, "blocks", b.id);
    console.log(`Rendering ${b.id} → ${dir}`);
    await renderBlockPanels({
      cpStart: b.cpStart,
      cpEnd: b.cpEnd,
      anchorY: b.anchorY,
      fontPath,
      outDir: dir,
    });
    panels.push({ title: b.title, ...triple(dir) });
  }

  if (panels.length === 0)
    throw new Error(`No samples or blocks match id="${id}"`);
  if (opts.html) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "index.html"), renderIndexHtml(panels, out));
  }
  return panels;
}
