import sharp from "sharp";

import { clamp255, loadGray } from "@/shared/util/image.ts";

export interface DiffClip {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Per-pixel diff: black = both, red = reference-only, blue = Pravka-only; pixels outside `clip` are
 * dimmed. No labels or stitching; captions come from the caller's table/HTML.
 */
export async function diffPanelPng(
  refPath: string,
  ourPath: string,
  clip?: DiffClip,
): Promise<Buffer> {
  const ref = await loadGray(refPath);
  const our = await loadGray(ourPath);
  if (ref.w !== our.w || ref.h !== our.h) {
    throw new Error(
      `diff dim mismatch: ref=${ref.w}x${ref.h} our=${our.w}x${our.h}`,
    );
  }
  const { w: W, h: H } = ref;
  const x0 = clip?.x ?? 0;
  const y0 = clip?.y ?? 0;
  const x1 = clip ? clip.x + clip.w : W;
  const y1 = clip ? clip.y + clip.h : H;

  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x < x0 || x >= x1 || y < y0 || y >= y1) {
        const v = 230 + Math.round((ref.data[i]! / 255) * 25);
        buf[i * 3] = v;
        buf[i * 3 + 1] = v;
        buf[i * 3 + 2] = v;
        continue;
      }
      const refInk = (255 - ref.data[i]!) / 255;
      const ourInk = (255 - our.data[i]!) / 255;
      const both = Math.min(refInk, ourInk);
      // sqrt-like boost makes subtle diffs visible
      const refOnly = Math.max(0, refInk - ourInk) ** 0.6;
      const ourOnly = Math.max(0, ourInk - refInk) ** 0.6;
      const r = 255 - both * 255 - refOnly * 35 - ourOnly * 225;
      const g = 255 - both * 255 - refOnly * 225 - ourOnly * 195;
      const b = 255 - both * 255 - refOnly * 225 - ourOnly * 25;
      buf[i * 3] = clamp255(r);
      buf[i * 3 + 1] = clamp255(g);
      buf[i * 3 + 2] = clamp255(b);
    }
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
