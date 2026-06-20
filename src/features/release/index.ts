import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { compress as woff2Compress } from "wawoff2";
import { buildFont } from "@/shared/build/build.ts";
import { PATHS } from "@/shared/paths.ts";
import { sha256Hex } from "@/shared/render/snapshot.ts";
import { downloadTo } from "@/shared/source.ts";
import { pMap } from "@/shared/util/io.ts";

const NERD_FONTS_VERSION = "3.4.0";
const PATCHER_URL = `https://github.com/ryanoasis/nerd-fonts/releases/download/v${NERD_FONTS_VERSION}/FontPatcher.zip`;

// Iosevka output stem (after the "Iosevkapravka-" prefix) → release style token.
const STYLE_BY_STEM: Record<string, string> = {
  normalregular: "Regular",
  normalregularItalic: "Italic",
  normalsemibold: "Semibold",
  normalsemiboldItalic: "SemiboldItalic",
  normalbold: "Bold",
  normalboldItalic: "BoldItalic",
  normalblack: "Black",
  normalblackItalic: "BlackItalic",
};

// font-patcher derives weight tokens from Iosevka's internal weight names (Heavy/SemiBold);
// normalize them to the recipe-key tokens so the Nerd filenames match the plain family.
const NERD_STYLE_FIX: Record<string, string> = {
  SemiBold: "Semibold",
  SemiBoldItalic: "SemiboldItalic",
  Heavy: "Black",
  HeavyItalic: "BlackItalic",
};

type Family = "plain" | "nerd";
type Format = "ttf" | "otf" | "woff2";

// Release-family directory names; the Nerd family name is what font-patcher --mono emits
// (derived from the font's internal name "Pravka" → "Pravka Nerd Font Mono").
const FAMILY_DIR: Record<Family, string> = {
  plain: "Pravka",
  nerd: "PravkaNerdFontMono",
};

export interface ReleaseOpts {
  recipe?: string;
  fontDir?: string;
  out?: string;
  version?: string;
  formats?: string;
  family?: string;
  force?: boolean;
}

const NCPU = Math.max(1, availableParallelism() - 1);

function hasTool(cmd: string): boolean {
  return !spawnSync(cmd, ["--version"], { stdio: "ignore" }).error;
}

function pkgVersion(): string {
  return (
    (JSON.parse(readFileSync("package.json", "utf-8")) as { version?: string })
      .version ?? "0.0.0"
  );
}

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
}

async function ttfToWoff2(ttf: string, woff2: string): Promise<void> {
  // Copy into a tight Uint8Array: a Node Buffer's underlying ArrayBuffer is a shared pool,
  // which wawoff2 would otherwise read past, producing a corrupt WOFF2.
  const input = Uint8Array.from(readFileSync(ttf));
  writeFileSync(woff2, Buffer.from(await woff2Compress(input)));
}

function listTtf(dir: string): string[] {
  return existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".ttf"))
    : [];
}

/** Build the family's TTFs into <work>/<FAMILY_DIR>/ttf (plain = rename, nerd = patch). */
async function buildFamilyTtf(
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
    const fixed = m && NERD_STYLE_FIX[m[1]!];
    if (fixed)
      renameSync(
        join(ttfDir, f),
        join(ttfDir, `PravkaNerdFontMono-${fixed}.ttf`),
      );
  }
  return ttfDir;
}

async function deriveFormats(
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

function listFilesRec(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFilesRec(join(dir, e.name)) : [join(dir, e.name)],
  );
}

export async function buildRelease(opts: ReleaseOpts = {}): Promise<void> {
  const recipe = opts.recipe ?? PATHS.bestRecipe;
  const out = opts.out ?? PATHS.release;
  const version = opts.version ?? pkgVersion();
  const formats = (opts.formats ?? "ttf,otf,woff2")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Format[];
  const families: Family[] =
    opts.family === "plain"
      ? ["plain"]
      : opts.family === "nerd"
        ? ["nerd"]
        : ["plain", "nerd"];

  const fontDir = opts.fontDir ?? buildFont(recipe);
  if (!fontDir)
    throw new Error("Font build failed. Run `pravka build font` first.");
  if (readdirSync(fontDir).filter((f) => f.endsWith(".ttf")).length === 0) {
    throw new Error(`No .ttf files in ${fontDir}`);
  }

  const needFontforge = formats.includes("otf") || families.includes("nerd");
  if (needFontforge && !hasTool("fontforge")) {
    throw new Error(
      "fontforge not found on PATH; required for OTF and Nerd Font output.\n" +
        "It is provided by the dev flake; run inside `nix develop` (or otherwise put fontforge on PATH).\n" +
        "Plain TTF/WOFF2 build without fontforge: --family plain --formats ttf,woff2",
    );
  }

  // Release intermediates are built fresh each run in a temp dir (removed at the end).
  const work = mkdtempSync(join(tmpdir(), "pravka-release-"));

  for (const fam of families) {
    console.log(`\n=== ${FAMILY_DIR[fam]} ===`);
    const ttfDir = await buildFamilyTtf(fam, fontDir, work, opts.force);
    await deriveFormats(ttfDir, work, fam, formats, opts.force);
  }

  // Assemble dist/ from the work tree (only requested formats), then zip + checksums.
  rmSync(out, { recursive: true, force: true });
  for (const fam of families) {
    for (const fmt of formats) {
      const src = join(work, FAMILY_DIR[fam], fmt);
      if (!existsSync(src)) continue;
      const dst = join(out, FAMILY_DIR[fam], fmt);
      mkdirSync(dst, { recursive: true });
      for (const f of readdirSync(src))
        copyFileSync(join(src, f), join(dst, f));
    }
  }

  for (const fam of families) {
    const zip = `${FAMILY_DIR[fam]}-${version}.zip`;
    rmSync(join(out, zip), { force: true });
    const r = spawnSync("zip", ["-rq", zip, FAMILY_DIR[fam]], {
      cwd: out,
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error(`zip failed for ${FAMILY_DIR[fam]}`);
  }

  const sums = listFilesRec(out)
    .filter((f) => !f.endsWith("SHA256SUMS"))
    .sort()
    .map(
      (f) =>
        `${sha256Hex(readFileSync(f))}  ${relative(out, f).replaceAll("\\", "/")}`,
    )
    .join("\n");
  writeFileSync(join(out, "SHA256SUMS"), `${sums}\n`);
  rmSync(work, { recursive: true, force: true });

  console.log(`\nRelease ${version} → ${out}/`);
  for (const fam of families)
    console.log(`  ${FAMILY_DIR[fam]}-${version}.zip  (${formats.join(", ")})`);
}
