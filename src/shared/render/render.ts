import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import {
  fontHash,
  optSubsetForCp,
  type SnapshotCache,
} from "@/shared/render/snapshot.ts";
import {
  drawGlyph,
  type Font,
  isMissingGlyph,
  loadFont,
} from "@/shared/util/font.ts";
import { whitePng } from "@/shared/util/image.ts";
import { pMap } from "@/shared/util/io.ts";

const CONCURRENCY = 8;

const OVERSAMPLE = 4;
export const TARGET_SIZE = 64;
export const FONT_SIZE = TARGET_SIZE * OVERSAMPLE;
export const MARGIN = TARGET_SIZE / 8;

export async function renderGlyphPng(
  fontOrPath: string | Font,
  cp: number,
  opts: { fontSize?: number; margin?: number } = {},
): Promise<Buffer> {
  const fontSize = opts.fontSize ?? FONT_SIZE;
  const margin = opts.margin ?? MARGIN;
  const font =
    typeof fontOrPath === "string" ? loadFont(fontOrPath) : fontOrPath;

  const glyph = font.charToGlyph(String.fromCodePoint(cp));
  if (isMissingGlyph(glyph)) return whitePng(fontSize + margin * 2);

  const path = glyph.getPath(0, 0, fontSize);
  const bbox = path.getBoundingBox();
  const inkW = Math.ceil(bbox.x2 - bbox.x1);
  const inkH = Math.ceil(bbox.y2 - bbox.y1);
  if (inkW <= 0 || inkH <= 0) return whitePng(fontSize + margin * 2);

  const canvasW = inkW + margin * 2;
  const canvasH = inkH + margin * 2;
  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.translate(margin - bbox.x1, margin - bbox.y1);
  drawGlyph(ctx, glyph, 0, 0, fontSize, "#000000");
  return canvas.toBuffer("image/png");
}

export async function downsample(
  pngBytes: Buffer,
  target: number = TARGET_SIZE,
): Promise<Buffer> {
  const meta = await sharp(pngBytes).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w === 0 || h === 0) return whitePng(target);

  const scale = target / Math.max(w, h);
  const newW = Math.max(1, Math.round(w * scale));
  const newH = Math.max(1, Math.round(h * scale));
  const resized = await sharp(pngBytes)
    .resize(newW, newH, { kernel: "lanczos3", fit: "fill" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return sharp({
    create: {
      width: target,
      height: target,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      {
        input: resized,
        top: Math.floor((target - newH) / 2),
        left: Math.floor((target - newW) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function renderAndCache(
  fontPath: string,
  cps: Iterable<number>,
  cache: SnapshotCache,
  opts: {
    recipeDesign?: Record<string, unknown>;
    mapping?: Map<string, Set<number>>;
    recipeHashStr?: string;
    force?: boolean;
  } = {},
): Promise<Map<number, string>> {
  const fh = fontHash(fontPath);
  const recipeDesign = opts.recipeDesign ?? {};
  const mapping = opts.mapping ?? new Map<string, Set<number>>();
  const rhash = opts.recipeHashStr ?? "";
  const font = loadFont(fontPath);

  const cpList = [...cps];
  const entries = await pMap(cpList, CONCURRENCY, async (cp) => {
    const optSubset = optSubsetForCp(cp, recipeDesign, mapping);
    if (!opts.force) {
      const cached = cache.get(cp, fh, optSubset, rhash);
      if (cached) return [cp, cached] as const;
    }
    const raw = await renderGlyphPng(font, cp);
    const downsampled = await downsample(raw);
    return [cp, cache.put(cp, fh, optSubset, downsampled, rhash)] as const;
  });
  cache.saveManifest();
  return new Map(entries);
}
