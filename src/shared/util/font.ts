import { readFileSync } from "node:fs";
import { type SKRSContext2D } from "@napi-rs/canvas";
import { memoize } from "es-toolkit";
import opentype, { type Font, type Glyph } from "opentype.js";

export type { Font, Glyph };

export const loadFont = memoize((fontPath: string): Font => {
  const buf = readFileSync(fontPath);
  return opentype.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
});

export function glyphAdvance(
  font: Font,
  glyph: Glyph,
  fontSize: number,
): number {
  return ((glyph.advanceWidth ?? font.unitsPerEm) * fontSize) / font.unitsPerEm;
}

export function drawGlyph(
  ctx: SKRSContext2D,
  glyph: Glyph,
  x: number,
  y: number,
  fontSize: number,
  color: string,
): void {
  const path = glyph.getPath(x, y, fontSize);
  (path as { fill?: string | null; stroke?: string | null }).fill = color;
  (path as { stroke?: string | null }).stroke = null;
  path.draw(ctx as unknown as CanvasRenderingContext2D);
}

export function drawTextLeft(
  ctx: SKRSContext2D,
  font: Font,
  text: string,
  x: number,
  baselineY: number,
  fontSize: number,
  color: string,
): void {
  let cursor = x;
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    drawGlyph(ctx, g, cursor, baselineY, fontSize, color);
    cursor += glyphAdvance(font, g, fontSize);
  }
}

export function isMissingGlyph(glyph: Glyph): boolean {
  return (glyph as { index?: number }).index === 0;
}
