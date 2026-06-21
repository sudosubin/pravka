import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

function listFilesRec(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFilesRec(join(dir, e.name)) : [join(dir, e.name)],
  );
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
export function packageRelease(
  opts: { version?: string; family?: string; out?: string } = {},
): void {
  const out = opts.out ?? PATHS.release;
  const version = opts.version ?? pkgVersion();
  const families = parseFamilies(opts.family);

  for (const fam of families) {
    if (!existsSync(join(out, FAMILY_DIR[fam])))
      throw new Error(
        `Missing ${join(out, FAMILY_DIR[fam])}; run the ttf/otf/woff2 stages first.`,
      );
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

  rmSync(out, { recursive: true, force: true });
  for (const fam of families) {
    console.log(`\n=== ${FAMILY_DIR[fam]} ===`);
    const ttfDir = await buildFamilyTtf(fam, fontDir, out, opts.force);
    await deriveFormats(ttfDir, out, fam, formats, opts.force);
  }
  packageRelease({ out, version: opts.version, family: opts.family });
}
