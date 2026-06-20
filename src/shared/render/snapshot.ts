import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PATHS } from "@/shared/paths.ts";
import { writeJson } from "@/shared/util/io.ts";

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

// Stable serialization for snapshot cache keys: sorted keys at every depth, no whitespace.
function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

const RENDER_PARAMS = {
  font_size: 64,
  oversample: 4,
  dpi: 72,
  margin: 8,
  foreground: "000000ff",
  background: "ffffffff",
} as const;

const RENDER_PARAMS_HASH = sha256Hex(canonicalJson(RENDER_PARAMS)).slice(0, 16);

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

const manifestKey = (fh: string, rh: string, cp: number) =>
  `${fh}:${rh}:${cpHex(cp)}`;

export class SnapshotCache {
  readonly root: string;
  readonly snapshotsDir: string;
  readonly manifestPath: string;
  private manifest: Record<string, string> = {};
  private dirty = false;

  constructor(cacheDir: string = PATHS.cacheWork) {
    this.root = cacheDir;
    this.snapshotsDir = join(cacheDir, "snapshots");
    this.manifestPath = join(cacheDir, "manifest.json");
    mkdirSync(this.snapshotsDir, { recursive: true });
    if (existsSync(this.manifestPath)) {
      this.manifest = JSON.parse(readFileSync(this.manifestPath, "utf-8"));
    }
  }

  key(cp: number, fh: string, optSubset: Record<string, unknown>): string {
    return sha256Hex(
      canonicalJson({
        cp,
        font_hash: fh,
        opt_subset: optSubset,
        render_params: RENDER_PARAMS_HASH,
      }),
    ).slice(0, 16);
  }

  pathForKey(key16: string, cp: number): string {
    return join(this.snapshotsDir, key16, `${cpHex(cp)}.png`);
  }

  // Manifest fast-path: skip canonicalJson+sha256 when (fh, rh, cp) is known.
  // Safe because rh uniquely identifies the recipe → optSubset is deterministic for that (cp, fh, rh).
  get(
    cp: number,
    fh: string,
    optSubset: Record<string, unknown>,
    rh: string = "",
  ): string | null {
    const k = this.manifest[manifestKey(fh, rh, cp)];
    if (k) {
      const p = this.pathForKey(k, cp);
      if (existsSync(p)) return p;
    }
    const p = this.pathForKey(this.key(cp, fh, optSubset), cp);
    return existsSync(p) ? p : null;
  }

  put(
    cp: number,
    fh: string,
    optSubset: Record<string, unknown>,
    pngBytes: Uint8Array,
    rh: string = "",
  ): string {
    const k = this.key(cp, fh, optSubset);
    const p = this.pathForKey(k, cp);
    mkdirSync(join(this.snapshotsDir, k), { recursive: true });
    writeFileSync(p, pngBytes);
    this.manifest[manifestKey(fh, rh, cp)] = k;
    this.dirty = true;
    return p;
  }

  saveManifest(): void {
    if (!this.dirty) return;
    writeJson(this.manifestPath, this.manifest);
    this.dirty = false;
  }
}
