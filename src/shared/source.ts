import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { FSD_DIR, VENDOR_DIR } from "@/shared/paths.ts";

export interface Source {
  url: string;
  path: string;
}

// fsd.it specimen images used as PragmataPro references (no font dependency).
export const SOURCES = {
  mAllChars: {
    url: "https://fsd.it/wp-content/uploads/m_all_chars.png",
    path: join(FSD_DIR, "m_all_chars.png"),
  },
  allChars: {
    url: "https://fsd.it/pragmatapro/All_chars.png",
    path: join(FSD_DIR, "All_chars.png"),
  },
  // Side-by-side proportional|Mono specimen; the right half is the Mono variant, a true uniform
  // monospace grid, so block comparison panels can use a fixed column pitch with no drift.
  monoComparison: {
    url: "https://fsd.it/pragmatapro/All_chars_Mono_comparison.png",
    path: join(FSD_DIR, "All_chars_Mono_comparison.png"),
  },
} satisfies Record<string, Source>;

/** Download a URL to a path (cached: skips if present and non-empty unless force). */
export async function downloadTo(
  url: string,
  path: string,
  opts: { force?: boolean } = {},
): Promise<string> {
  if (!opts.force && existsSync(path) && statSync(path).size > 0) return path;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

// Source Han Mono is the CJK fallback for specimen rendering; pinned to the same release rev used
// by nixpkgs (`source-han-mono` 1.002) and cached under vendor/ (gitignored).
const SOURCE_HAN_MONO_VERSION = "1.002";
const SOURCE_HAN_MONO_URL = `https://github.com/adobe-fonts/source-han-mono/releases/download/${SOURCE_HAN_MONO_VERSION}/SourceHanMono.ttc`;
const SOURCE_HAN_MONO_TTC = join(
  VENDOR_DIR,
  `source-han-mono-${SOURCE_HAN_MONO_VERSION}`,
  "SourceHanMono.ttc",
);

/** Download + cache the Source Han Mono CJK fallback font; returns its local path. */
export async function ensureCjkFont(
  opts: { force?: boolean } = {},
): Promise<string> {
  return downloadTo(SOURCE_HAN_MONO_URL, SOURCE_HAN_MONO_TTC, opts);
}

/** Ensure a registered source image is cached locally; returns its path. */
export function ensureSource(
  source: Source,
  opts: { force?: boolean } = {},
): Promise<string> {
  return downloadTo(source.url, source.path, opts);
}

/** Download into a directory, deriving the filename from the URL (legacy ensureOriginal behavior). */
export function downloadToDir(
  url: string,
  dir: string,
  opts: { force?: boolean } = {},
): Promise<string> {
  return downloadTo(url, join(dir, basename(new URL(url).pathname)), opts);
}
