import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { compress as woff2Compress } from "wawoff2";
import { downloadTo } from "@/shared/source.ts";
import { pMap } from "@/shared/util/io.ts";

const NERD_FONTS_VERSION = "3.4.0";
const PATCHER_URL = `https://github.com/ryanoasis/nerd-fonts/releases/download/v${NERD_FONTS_VERSION}/FontPatcher.zip`;

// Each style maps to its Iosevka output stem (after the "Iosevkapravka-" prefix) and,
// when font-patcher's weight token (from Iosevka's internal Heavy/SemiBold names)
// differs from the style token, the patcher alias to normalize back to the style.
const STYLES: Record<string, { stem: string; nerdAlias?: string }> = {
  Regular: { stem: "normalregular" },
  Italic: { stem: "normalregularItalic" },
  Semibold: { stem: "normalsemibold", nerdAlias: "SemiBold" },
  SemiboldItalic: { stem: "normalsemiboldItalic", nerdAlias: "SemiBoldItalic" },
  Bold: { stem: "normalbold" },
  BoldItalic: { stem: "normalboldItalic" },
  Black: { stem: "normalblack", nerdAlias: "Heavy" },
  BlackItalic: { stem: "normalblackItalic", nerdAlias: "HeavyItalic" },
};

const STYLE_BY_STEM: Record<string, string> = {};
const STYLE_BY_NERD_ALIAS: Record<string, string> = {};
for (const [style, { stem, nerdAlias }] of Object.entries(STYLES)) {
  STYLE_BY_STEM[stem] = style;
  if (nerdAlias) STYLE_BY_NERD_ALIAS[nerdAlias] = style;
}

export type Family = "plain" | "nerd";
export type Format = "ttf" | "otf" | "woff2";

// Release-family directory names; the Nerd family name is what font-patcher --mono emits
// (derived from the font's internal name "Pravka" → "Pravka Nerd Font Mono").
export const FAMILY_DIR: Record<Family, string> = {
  plain: "Pravka",
  nerd: "PravkaNerdFontMono",
};

const NCPU = Math.max(1, availableParallelism() - 1);

/** Download + extract the Nerd Fonts FontPatcher (cached); returns the dir holding `font-patcher`. */
async function ensurePatcher(force?: boolean): Promise<string> {
  const dir = join("vendor", "nerd-fonts", NERD_FONTS_VERSION);
  const script = join(dir, "font-patcher");
  if (!force && existsSync(script)) return dir;
  const zip = join(
    "vendor",
    "nerd-fonts",
    `FontPatcher-${NERD_FONTS_VERSION}.zip`,
  );
  await downloadTo(PATCHER_URL, zip, { force });
  mkdirSync(dir, { recursive: true });
  if (
    spawnSync("unzip", ["-oq", zip, "-d", dir], { stdio: "inherit" }).status !==
    0
  ) {
    throw new Error(`Failed to extract ${zip}`);
  }
  if (!existsSync(script))
    throw new Error(`font-patcher not found after extracting ${zip}`);
  return dir;
}

function patchNerd(ttf: string, outDir: string, patcherDir: string): void {
  const r = spawnSync(
    "fontforge",
    [
      "-quiet",
      "-script",
      join(patcherDir, "font-patcher"),
      ttf,
      "--mono",
      "--complete",
      "--quiet",
      "--outputdir",
      outDir,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  if (r.status !== 0) throw new Error(`font-patcher failed for ${ttf}`);
}

function ttfToOtf(ttf: string, otf: string): void {
  const r = spawnSync(
    "fontforge",
    ["-quiet", "-lang=ff", "-c", "Open($1); Generate($2)", ttf, otf],
    {
      stdio: "inherit",
    },
  );
  if (r.status !== 0)
    throw new Error(`fontforge OTF conversion failed for ${ttf}`);
  setPostIsFixedPitch(otf);
}

function tableRecord(buf: Buffer, tag: string): number {
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (buf.toString("ascii", record, record + 4) === tag) return record;
  }
  throw new Error(`Missing ${tag} table`);
}

function tableChecksum(buf: Buffer, offset: number, length: number): number {
  let sum = 0;
  const paddedLength = Math.ceil(length / 4) * 4;
  for (let i = 0; i < paddedLength; i += 4) {
    let word = 0;
    for (let j = 0; j < 4; j++) {
      const index = offset + i + j;
      word = (word << 8) | (index < offset + length ? buf[index]! : 0);
    }
    sum = (sum + word) >>> 0;
  }
  return sum;
}

function fontChecksum(buf: Buffer): number {
  let sum = 0;
  const paddedLength = Math.ceil(buf.length / 4) * 4;
  for (let i = 0; i < paddedLength; i += 4) {
    let word = 0;
    for (let j = 0; j < 4; j++) {
      const index = i + j;
      word = (word << 8) | (index < buf.length ? buf[index]! : 0);
    }
    sum = (sum + word) >>> 0;
  }
  return sum;
}

function setPostIsFixedPitch(otf: string): void {
  const buf = readFileSync(otf);
  const postRecord = tableRecord(buf, "post");
  const postOffset = buf.readUInt32BE(postRecord + 8);
  const postLength = buf.readUInt32BE(postRecord + 12);
  buf.writeUInt32BE(1, postOffset + 12);
  buf.writeUInt32BE(tableChecksum(buf, postOffset, postLength), postRecord + 4);

  const headRecord = tableRecord(buf, "head");
  const headOffset = buf.readUInt32BE(headRecord + 8);
  const headLength = buf.readUInt32BE(headRecord + 12);
  buf.writeUInt32BE(0, headOffset + 8);
  buf.writeUInt32BE(tableChecksum(buf, headOffset, headLength), headRecord + 4);
  buf.writeUInt32BE((0xb1b0afba - fontChecksum(buf)) >>> 0, headOffset + 8);

  writeFileSync(otf, buf);
}

async function ttfToWoff2(ttf: string, woff2: string): Promise<void> {
  // Copy into a tight Uint8Array: a Node Buffer's underlying ArrayBuffer is a shared pool,
  // which wawoff2 would otherwise read past, producing a corrupt WOFF2.
  const input = Uint8Array.from(readFileSync(ttf));
  writeFileSync(woff2, Buffer.from(await woff2Compress(input)));
}

export function listTtf(dir: string): string[] {
  return existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".ttf"))
    : [];
}

/** Build the family's TTFs into <work>/<FAMILY_DIR>/ttf (plain = rename, nerd = patch). */
export async function buildFamilyTtf(
  fam: Family,
  fontDir: string,
  work: string,
  force?: boolean,
): Promise<string> {
  const ttfDir = join(work, FAMILY_DIR[fam], "ttf");
  mkdirSync(ttfDir, { recursive: true });
  const sources = readdirSync(fontDir).filter(
    (f) => f.startsWith("Iosevkapravka-") && f.endsWith(".ttf"),
  );

  if (fam === "plain") {
    for (const f of sources) {
      const style =
        STYLE_BY_STEM[f.replace(/^Iosevkapravka-/, "").replace(/\.ttf$/, "")];
      if (!style) continue;
      const dest = join(ttfDir, `Pravka-${style}.ttf`);
      if (force || !existsSync(dest)) copyFileSync(join(fontDir, f), dest);
    }
    return ttfDir;
  }

  // nerd: patcher derives names/widths; skip if already fully patched
  if (!force && listTtf(ttfDir).length >= sources.length) return ttfDir;
  const patcherDir = await ensurePatcher(force);
  for (const f of listTtf(ttfDir)) rmSync(join(ttfDir, f));
  await pMap(sources, NCPU, async (f) =>
    patchNerd(join(fontDir, f), ttfDir, patcherDir),
  );
  // Normalize Heavy/SemiBold → Black/Semibold so Nerd filenames match the plain family.
  for (const f of listTtf(ttfDir)) {
    const m = f.match(/^PravkaNerdFontMono-(.+)\.ttf$/);
    const fixed = m && STYLE_BY_NERD_ALIAS[m[1]!];
    if (fixed)
      renameSync(
        join(ttfDir, f),
        join(ttfDir, `PravkaNerdFontMono-${fixed}.ttf`),
      );
  }
  return ttfDir;
}

export async function deriveFormats(
  ttfDir: string,
  work: string,
  fam: Family,
  formats: Format[],
  force?: boolean,
) {
  const ttfs = listTtf(ttfDir);
  if (formats.includes("woff2")) {
    const dir = join(work, FAMILY_DIR[fam], "woff2");
    mkdirSync(dir, { recursive: true });
    // wawoff2 is a single shared WASM instance; concurrent calls corrupt each other, so run serially.
    for (const t of ttfs) {
      const dest = join(dir, t.replace(/\.ttf$/, ".woff2"));
      if (force || !existsSync(dest)) await ttfToWoff2(join(ttfDir, t), dest);
    }
  }
  if (formats.includes("otf")) {
    const dir = join(work, FAMILY_DIR[fam], "otf");
    mkdirSync(dir, { recursive: true });
    await pMap(ttfs, NCPU, async (t) => {
      const dest = join(dir, t.replace(/\.ttf$/, ".otf"));
      if (force || !existsSync(dest)) ttfToOtf(join(ttfDir, t), dest);
    });
  }
}

function hasTool(cmd: string): boolean {
  return !spawnSync(cmd, ["--version"], { stdio: "ignore" }).error;
}

export function requireFontforge(): void {
  if (!hasTool("fontforge")) {
    throw new Error(
      "fontforge not found on PATH; required for OTF and Nerd Font output.\n" +
        "It is provided by the dev flake; run inside `nix develop` (or otherwise put fontforge on PATH).\n" +
        "Plain TTF/WOFF2 build without fontforge: --family plain --formats ttf,woff2",
    );
  }
}
