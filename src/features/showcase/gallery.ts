import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setupFonts } from "@/features/showcase/canvas-text.ts";
import {
  type GalleryItem,
  renderGalleryHtml,
} from "@/features/showcase/html.ts";
import { renderSpecimen } from "@/features/showcase/render.ts";
import { SPECIMENS, THEME } from "@/features/showcase/specimens.ts";
import { buildFont } from "@/shared/build/build.ts";
import { PATHS } from "@/shared/paths.ts";

export interface SpecimenGalleryOpts {
  recipe?: string;
  out?: string;
  id?: string;
  fontDir?: string;
}

/** Render specimen PNGs (pangram/code/weights/cjk) + a gallery index.html from the built font. */
export async function buildSpecimenGallery(
  opts: SpecimenGalleryOpts = {},
): Promise<string> {
  const recipe = opts.recipe ?? PATHS.bestRecipe;
  const outDir = opts.out ?? PATHS.showcaseDocs;

  const fontDir = opts.fontDir ?? buildFont(recipe);
  if (!fontDir)
    throw new Error("Font build failed. Run `pravka build font` first.");

  await setupFonts(fontDir);
  mkdirSync(outDir, { recursive: true });

  const toRun = opts.id ? SPECIMENS.filter((s) => s.id === opts.id) : SPECIMENS;
  if (toRun.length === 0)
    throw new Error(`No specimen matches id="${opts.id}"`);

  const items: GalleryItem[] = [];
  for (const spec of toRun) {
    console.log(`Rendering ${spec.id}…`);
    const result = await renderSpecimen(spec, fontDir, THEME);
    const pngPath = join(outDir, `${spec.id}.png`);
    writeFileSync(pngPath, result.buffer);
    items.push({ ...result, pngPath });
    console.log(`  → ${pngPath}  (${result.width}×${result.height})`);
  }

  const galleryPath = join(outDir, "index.html");
  writeFileSync(galleryPath, renderGalleryHtml(items, outDir));
  console.log(`\nGallery: ${galleryPath}`);
  return galleryPath;
}
