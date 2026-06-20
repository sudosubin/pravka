import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sumBy } from "es-toolkit";
import sharp from "sharp";
import { diffPanelPng } from "@/features/compare/diff-panel.ts";
import { renderGrid } from "@/features/compare/grid.ts";
import type { Sample } from "@/features/compare/types.ts";
import { downloadToDir } from "@/shared/source.ts";
import { loadFont } from "@/shared/util/font.ts";
import { VISUAL_PNG } from "@/shared/util/image.ts";

export interface ProcessDirs {
  origDir: string;
  pravkaDir: string;
}

async function makeRef(
  s: Sample,
  dirs: ProcessDirs,
): Promise<{ origPath: string; refSource: string }> {
  if (!s.originalUrl) {
    throw new Error(`${s.id}: needs originalUrl (font-free reference)`);
  }
  const downloaded = await downloadToDir(s.originalUrl, dirs.origDir);
  const outputScale = Math.max(1, s.outputScale ?? 1);
  if (outputScale === 1)
    return { origPath: downloaded, refSource: s.originalUrl };
  const origPath = join(dirs.origDir, `${s.id}.scaled.png`);
  await sharp(downloaded)
    .resize(s.width * outputScale, s.height * outputScale, {
      kernel: "lanczos3",
    })
    .png({ compressionLevel: 9 })
    .toFile(origPath);
  return { origPath, refSource: s.originalUrl };
}

function diffClipFor(s: Sample): DiffClipRect {
  const scale = Math.max(1, s.outputScale ?? 1);
  const skipped = sumBy(
    s.skipCps ?? [],
    (r) => Math.min(r.end, s.cpEnd) - Math.max(r.start, s.cpStart) + 1,
  );
  const rows = Math.ceil((s.cpEnd - s.cpStart + 1 - skipped) / s.cols);
  const totalGap = sumBy(s.sectionGaps ?? [], (g) => g.pixels);
  return {
    x: s.gridX * scale,
    y: s.gridY * scale,
    w: s.cols * s.cellW * scale,
    h: (rows * s.cellH + totalGap) * scale,
  };
}

interface DiffClipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Render a sample as three panels (reference, Pravka, diff) into outDir; labels come from the
 * caller's table/HTML. `scale` downsamples each panel (e.g. 2 = half size) for committed docs.
 */
export async function renderSamplePanels(
  s: Sample,
  pravkaFontPath: string,
  tmpDirs: ProcessDirs,
  outDir: string,
  scale = 1,
): Promise<{ refSource: string }> {
  mkdirSync(outDir, { recursive: true });
  for (const d of Object.values(tmpDirs)) mkdirSync(d, { recursive: true });
  const refOut = await makeRef(s, tmpDirs);
  const pravkaTmp = join(tmpDirs.pravkaDir, `${s.id}.png`);
  writeFileSync(pravkaTmp, await renderGrid(loadFont(pravkaFontPath), s));
  const diffBuf = await diffPanelPng(
    refOut.origPath,
    pravkaTmp,
    diffClipFor(s),
  );

  const emit = async (input: string | Buffer, name: string) => {
    const img = sharp(input);
    if (scale > 1) {
      const m = await sharp(input).metadata();
      img.resize(
        Math.round((m.width ?? 0) / scale),
        Math.round((m.height ?? 0) / scale),
        { kernel: "lanczos3" },
      );
    }
    await img.png(VISUAL_PNG).toFile(join(outDir, name));
  };
  await emit(refOut.origPath, "pragmatapro.png");
  await emit(pravkaTmp, "pravka.png");
  await emit(diffBuf, "diff.png");
  return { refSource: refOut.refSource };
}
