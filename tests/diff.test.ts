import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { scorePair } from "@/shared/diff/diff.ts";

// Behavioural invariants for the pixel-diff scorer (formerly the python-parity `diff_*` cases):
// identical inputs score ~0, scoring is symmetric, deterministic, and in range.
const FIX = join(import.meta.dir, "fixtures", "glyphs");
const KEYS = ["u0030", "u0031", "u0061", "u0067", "u006c"];

describe("scorePair", () => {
  for (const key of KEYS) {
    const a = join(FIX, `a_${key}.png`);
    const b = join(FIX, `b_${key}.png`);

    test(`${key}: identical ≈ 0`, async () => {
      const self = await scorePair(a, a);
      expect(self.composite).toBeLessThan(0.005);
      expect(self.ssim).toBeGreaterThan(0.999);
    });

    test(`${key}: symmetric, in-range, deterministic`, async () => {
      const ab = await scorePair(a, b);
      const ba = await scorePair(b, a);
      const ab2 = await scorePair(a, b);
      expect(Math.abs(ab.composite - ba.composite)).toBeLessThan(1e-6);
      expect(ab.composite).toBeGreaterThanOrEqual(0);
      expect(ab.composite).toBeLessThanOrEqual(1);
      expect(ab.ssim).toBeGreaterThanOrEqual(-1);
      expect(ab.ssim).toBeLessThanOrEqual(1);
      expect(ab2.composite).toBe(ab.composite);
    });
  }
});
