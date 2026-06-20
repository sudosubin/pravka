import { clamp } from "es-toolkit";
import sharp from "sharp";

// PNG options for human-facing images (compare panels, diff overlays, specimens). Palette
// quantization roughly halves the file with no visible loss. Not for snapshot/reference crops fed
// to the diff scorer, which must stay full-color.
export const VISUAL_PNG: sharp.PngOptions = {
  compressionLevel: 9,
  palette: true,
  quality: 90,
  effort: 10,
};

export interface Gray {
  data: Float32Array;
  w: number;
  h: number;
}

export async function loadGray(src: string | Buffer): Promise<Gray> {
  const { data, info } = await sharp(src)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: Float32Array.from(data), w: info.width, h: info.height };
}

export async function whitePng(size: number): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export const clamp255 = (x: number): number => clamp(Math.round(x), 0, 255);

export function grayToRgba(
  gray: Float32Array,
  w: number,
  h: number,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  const buf = out ?? new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < gray.length; i++) {
    const v = clamp255(gray[i]!);
    const j = i * 4;
    buf[j] = v;
    buf[j + 1] = v;
    buf[j + 2] = v;
    buf[j + 3] = 255;
  }
  return buf;
}
