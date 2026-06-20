import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { ssim as ssimJs } from "ssim.js";
import { cpHex } from "@/shared/render/snapshot.ts";
import {
  clamp255,
  grayToRgba,
  loadGray,
  VISUAL_PNG,
} from "@/shared/util/image.ts";
import { pMap, writeJson } from "@/shared/util/io.ts";

let ssimBufA: Uint8ClampedArray | null = null;
let ssimBufB: Uint8ClampedArray | null = null;
let ssimBufSize = 0;

function ssim(X: Float32Array, Y: Float32Array, w: number, h: number): number {
  if (X.length !== Y.length || X.length !== w * h) {
    throw new Error("ssim: array shape mismatch");
  }
  const n = w * h * 4;
  if (ssimBufSize !== n) {
    ssimBufA = new Uint8ClampedArray(n);
    ssimBufB = new Uint8ClampedArray(n);
    ssimBufSize = n;
  }
  grayToRgba(X, w, h, ssimBufA!);
  grayToRgba(Y, w, h, ssimBufB!);
  return ssimJs(
    { data: ssimBufA!, width: w, height: h },
    { data: ssimBufB!, width: w, height: h },
  ).mssim;
}

const CONCURRENCY = 8;

const INK_HEIGHT = 48;
const CANVAS_SIZE = 64;

export interface ScorePair {
  pct_mismatch: number;
  l2: number;
  ssim: number;
  composite: number;
  pct_raw: number;
}

export interface ScoreRecord extends ScorePair {
  overlay: string;
  ref_png: string;
  cand_png: string;
}

interface InkBbox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function inkBbox(
  data: Float32Array,
  w: number,
  h: number,
  threshold = 200,
): InkBbox {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    let hasInk = false;
    for (let x = 0; x < w; x++)
      if (data[y * w + x]! < threshold) {
        hasInk = true;
        break;
      }
    if (hasInk) {
      if (top === -1) top = y;
      bottom = y + 1;
    }
  }
  if (top === -1) return { top: 0, bottom: h, left: 0, right: w };
  let left = -1;
  let right = -1;
  for (let x = 0; x < w; x++) {
    let hasInk = false;
    for (let y = top; y < bottom; y++)
      if (data[y * w + x]! < threshold) {
        hasInk = true;
        break;
      }
    if (hasInk) {
      if (left === -1) left = x;
      right = x + 1;
    }
  }
  return { top, bottom, left, right };
}

async function normalize(
  arr: Float32Array,
  w: number,
  h: number,
  targetInk: number = INK_HEIGHT,
  canvas: number = CANVAS_SIZE,
): Promise<Float32Array> {
  const { top, bottom, left, right } = inkBbox(arr, w, h);
  const inkH = Math.max(1, bottom - top);
  const inkW = Math.max(1, right - left);
  const scale = Math.min(targetInk / inkH, canvas / inkW);
  const newH = Math.max(1, Math.round(inkH * scale));
  const newW = Math.max(1, Math.round(inkW * scale));

  const cropped = Buffer.alloc(inkW * inkH);
  for (let y = 0; y < inkH; y++)
    for (let x = 0; x < inkW; x++)
      cropped[y * inkW + x] = clamp255(arr[(top + y) * w + (left + x)]!);

  const resized = await sharp(cropped, {
    raw: { width: inkW, height: inkH, channels: 1 },
  })
    .resize(newW, newH, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer();

  const out = new Float32Array(canvas * canvas);
  out.fill(255);
  const yOff = Math.max(0, Math.floor((canvas - newH) / 2));
  const xOff = Math.max(0, Math.floor((canvas - newW) / 2));
  const pasteH = Math.min(newH, canvas - yOff);
  const pasteW = Math.min(newW, canvas - xOff);
  for (let y = 0; y < pasteH; y++)
    for (let x = 0; x < pasteW; x++)
      out[(yOff + y) * canvas + (xOff + x)] = resized[y * newW + x]!;
  return out;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export async function scorePair(
  refPath: string,
  candPath: string,
): Promise<ScorePair> {
  const [refRaw, candRaw] = await Promise.all([
    loadGray(refPath),
    loadGray(candPath),
  ]);
  const [ref, cand] = await Promise.all([
    normalize(refRaw.data, refRaw.w, refRaw.h),
    normalize(candRaw.data, candRaw.w, candRaw.h),
  ]);

  let mismatch = 0;
  let l2sum = 0;
  for (let i = 0; i < ref.length; i++) {
    const d = ref[i]! - cand[i]!;
    if (Math.abs(d) > 8) mismatch++;
    l2sum += d * d;
  }
  const pct_mismatch = mismatch / ref.length;
  const l2 = Math.sqrt(l2sum) / ref.length / 255;
  const ssimVal = ssim(ref, cand, CANVAS_SIZE, CANVAS_SIZE);
  const composite = 0.4 * pct_mismatch + 0.3 * l2 + 0.3 * (1 - ssimVal);

  let pct_raw = 0;
  if (refRaw.data.length === candRaw.data.length) {
    let m = 0;
    for (let i = 0; i < refRaw.data.length; i++)
      if (Math.abs(refRaw.data[i]! - candRaw.data[i]!) > 8) m++;
    pct_raw = m / refRaw.data.length;
  }

  return {
    pct_mismatch: round6(pct_mismatch),
    l2: round6(l2),
    ssim: round6(ssimVal),
    composite: round6(composite),
    pct_raw: round6(pct_raw),
  };
}

// Overlay uses raw PNGs so the visualization matches the displayed ref/cand cells.
// red=ref-only ink, blue=cand-only, black=both, white=neither.
export async function diffOverlayPng(
  ref0: string | Buffer,
  cand0: string | Buffer,
): Promise<Buffer> {
  const [ref, cand] = await Promise.all([loadGray(ref0), loadGray(cand0)]);
  if (ref.w !== cand.w || ref.h !== cand.h) {
    throw new Error("diffOverlayPng: ref/cand dimensions differ");
  }

  const buf = Buffer.alloc(ref.w * ref.h * 3);
  for (let i = 0; i < ref.data.length; i++) {
    const refInk = (255 - ref.data[i]!) / 255;
    const ourInk = (255 - cand.data[i]!) / 255;
    const both = Math.min(refInk, ourInk);
    const refOnly = Math.max(0, refInk - ourInk);
    const ourOnly = Math.max(0, ourInk - refInk);
    const r = 255 - refOnly * 35 - ourOnly * 225 - both * 255;
    const g = 255 - refOnly * 225 - ourOnly * 225 - both * 255;
    const b = 255 - refOnly * 225 - ourOnly * 25 - both * 255;
    buf[i * 3] = clamp255(r);
    buf[i * 3 + 1] = clamp255(g);
    buf[i * 3 + 2] = clamp255(b);
  }
  return sharp(buf, { raw: { width: ref.w, height: ref.h, channels: 3 } })
    .png(VISUAL_PNG)
    .toBuffer();
}

export async function runDiff(
  refPaths: Map<number, string>,
  candPaths: Map<number, string>,
  diffsDir: string,
): Promise<Map<number, ScoreRecord>> {
  mkdirSync(diffsDir, { recursive: true });
  const cps = [...refPaths.keys()]
    .filter((cp) => candPaths.has(cp))
    .sort((a, b) => a - b);

  const records = await pMap(cps, CONCURRENCY, async (cp) => {
    const refPath = refPaths.get(cp)!;
    const candPath = candPaths.get(cp)!;
    const [score, overlay] = await Promise.all([
      scorePair(refPath, candPath),
      diffOverlayPng(refPath, candPath),
    ]);
    const hex = cpHex(cp);
    const overlayPath = join(diffsDir, `${hex}_overlay.png`);
    writeFileSync(overlayPath, overlay);
    writeJson(
      join(diffsDir, `${hex}.json`),
      { ...score, ref: refPath, cand: candPath },
      false,
    );
    return [
      cp,
      { ...score, overlay: overlayPath, ref_png: refPath, cand_png: candPath },
    ] as const;
  });
  return new Map(records);
}
