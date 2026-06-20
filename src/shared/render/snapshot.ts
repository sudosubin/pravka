import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function fontHash(fontPath: string): string {
  return sha256Hex(readFileSync(fontPath)).slice(0, 16);
}

export function recipeHash(recipePath: string): string {
  return sha256Hex(readFileSync(recipePath)).slice(0, 16);
}

export function optSubsetForCp(
  cp: number,
  recipeDesign: Record<string, unknown>,
  mapping: Map<string, Set<number>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(recipeDesign)) {
    if (mapping.get(k)?.has(cp)) out[k] = v;
  }
  return out;
}

export function cpHex(cp: number): string {
  return cp.toString(16).padStart(5, "0");
}

export function cpLabel(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}
