import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  buildFamilyTtf,
  deriveFormats,
  FAMILY_DIR,
  type Family,
  type Format,
  listTtf,
  requireFontforge,
} from "@/features/release/convert.ts";
import { buildFont } from "@/shared/build/build.ts";
import { PATHS } from "@/shared/paths.ts";
import { sha256Hex } from "@/shared/render/snapshot.ts";
import { writeZipFromDir } from "@/shared/util/zip.ts";

export interface ReleaseOpts {
  recipe?: string;
  fontDir?: string;
  out?: string;
  version?: string;
  formats?: string;
  family?: string;
  force?: boolean;
}

function pkgVersion(): string {
  return (
    (JSON.parse(readFileSync("package.json", "utf-8")) as { version?: string })
      .version ?? "0.0.0"
  );
}

async function listFilesRec(dir: string): Promise<string[]> {
  const files = await Promise.all(
    (await readdir(dir, { withFileTypes: true })).map((e) =>
      e.isDirectory() ? listFilesRec(join(dir, e.name)) : [join(dir, e.name)],
    ),
  );
  return files.flat();
}

function parseFamilies(family?: string): Family[] {
  return family === "plain"
    ? ["plain"]
    : family === "nerd"
      ? ["nerd"]
      : ["plain", "nerd"];
}

function parseFormats(formats?: string): Format[] {
  return (formats ?? "ttf,otf,woff2")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Format[];
}

/** Resolve the Iosevka TTF source dir (prebuilt --font-dir, or a cache-hit `buildFont`). */
function resolveFontDir(opts: { fontDir?: string; recipe?: string }): string {
  const fontDir = opts.fontDir ?? buildFont(opts.recipe ?? PATHS.bestRecipe);
  if (!fontDir)
    throw new Error("Font build failed. Run `pravka build font` first.");
  if (readdirSync(fontDir).filter((f) => f.endsWith(".ttf")).length === 0)
    throw new Error(`No .ttf files in ${fontDir}`);
  return fontDir;
}

export interface StageOpts {
  family?: string;
  recipe?: string;
  fontDir?: string;
  out?: string;
  force?: boolean;
}

/** Stage: build each family's TTFs (plain = rename, nerd = patch) into <out>/<Family>/ttf. */
export async function releaseTtf(opts: StageOpts = {}): Promise<void> {
  const out = opts.out ?? PATHS.release;
  const families = parseFamilies(opts.family);
  requireFontforge();
  const fontDir = resolveFontDir(opts);
  for (const fam of families) {
    console.log(`\n=== ${FAMILY_DIR[fam]} ttf ===`);
    await buildFamilyTtf(fam, fontDir, out, opts.force);
  }
}

/** Stage: derive one format (otf | woff2) from each family's already-built TTFs. */
export async function releaseDerive(
  fmt: Format,
  opts: { family?: string; out?: string; force?: boolean } = {},
): Promise<void> {
  const out = opts.out ?? PATHS.release;
  const families = parseFamilies(opts.family);
  if (fmt === "otf") requireFontforge();
  for (const fam of families) {
    const ttfDir = join(out, FAMILY_DIR[fam], "ttf");
    if (listTtf(ttfDir).length === 0)
      throw new Error(
        `No TTFs at ${ttfDir}; run \`pravka release ttf\` first.`,
      );
    console.log(`\n=== ${FAMILY_DIR[fam]} ${fmt} ===`);
    await deriveFormats(ttfDir, out, fam, [fmt], opts.force);
  }
}

/** Stage: zip each family directory and write SHA256SUMS over the whole release tree. */
export async function packageRelease(
  opts: { version?: string; family?: string; out?: string } = {},
): Promise<void> {
  const out = opts.out ?? PATHS.release;
  const version = opts.version ?? pkgVersion();
  const families = parseFamilies(opts.family);

  for (const fam of families) {
    if (!existsSync(join(out, FAMILY_DIR[fam])))
      throw new Error(
        `Missing ${join(out, FAMILY_DIR[fam])}; run the ttf/otf/woff2 stages first.`,
      );
    const zip = `${FAMILY_DIR[fam]}-${version}.zip`;
    await rm(join(out, zip), { force: true });
    await writeZipFromDir(join(out, FAMILY_DIR[fam]), join(out, zip), {
      rootName: FAMILY_DIR[fam],
    });
  }

  const files = await listFilesRec(out);
  const sums = (
    await Promise.all(
      files
        .filter((f) => !f.endsWith("SHA256SUMS"))
        .sort()
        .map(async (f) => {
          const hash = sha256Hex(await readFile(f));
          return `${hash}  ${relative(out, f).replaceAll("\\", "/")}`;
        }),
    )
  ).join("\n");
  await writeFile(join(out, "SHA256SUMS"), `${sums}\n`);

  console.log(`\nRelease ${version} → ${out}/`);
  for (const fam of families)
    console.log(`  ${FAMILY_DIR[fam]}-${version}.zip`);
}

/** One-shot: clean the release dir and run every stage (ttf → formats → package). */
export async function buildRelease(opts: ReleaseOpts = {}): Promise<void> {
  const out = opts.out ?? PATHS.release;
  const families = parseFamilies(opts.family);
  const formats = parseFormats(opts.formats);
  requireFontforge();
  const fontDir = resolveFontDir(opts);

  await rm(out, { recursive: true, force: true });
  for (const fam of families) {
    console.log(`\n=== ${FAMILY_DIR[fam]} ===`);
    const ttfDir = await buildFamilyTtf(fam, fontDir, out, opts.force);
    await deriveFormats(ttfDir, out, fam, formats, opts.force);
  }
  await packageRelease({ out, version: opts.version, family: opts.family });
}
