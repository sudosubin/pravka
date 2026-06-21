import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
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
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

// Noto Sans Mono CJK (Variable OTC) is the CJK fallback for specimen rendering; pinned to a release
// tag for reproducibility and cached under vendor/ (gitignored).
const NOTO_CJK_TAG = "Sans2.004";
const NOTO_CJK_URL = `https://raw.githubusercontent.com/notofonts/noto-cjk/${NOTO_CJK_TAG}/Sans/Variable/OTC/NotoSansMonoCJK-VF.otf.ttc`;

/** Download + cache the Noto Sans Mono CJK fallback font; returns its local path. */
export function ensureCjkFont(opts: { force?: boolean } = {}): Promise<string> {
  return downloadTo(
    NOTO_CJK_URL,
    join(VENDOR_DIR, "noto-cjk", "NotoSansMonoCJK-VF.otf.ttc"),
    opts,
  );
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
