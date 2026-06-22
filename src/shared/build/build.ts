import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism } from "node:os";
import { basename, join } from "node:path";
import { DIST_DIR, VENDOR_DIR as VENDOR_ROOT } from "@/shared/paths.ts";
import { recipeHash } from "@/shared/render/snapshot.ts";
import { downloadTo } from "@/shared/source.ts";

const IOSEVKA_VERSION = "34.4.0";

export const VENDOR_DIR = join(VENDOR_ROOT, `iosevka-${IOSEVKA_VERSION}`);
const LOWERCASE_IOSEVKA_DIR = `iosevka-${IOSEVKA_VERSION}`;

/** Iosevka design-variant / ligation param files (from the vendored source). */
export const VARIANTS_TOML = join(VENDOR_DIR, "params", "variants.toml");
export const LIGATION_TOML = join(VENDOR_DIR, "params", "ligation-set.toml");

/** Download the Iosevka source to vendor/ and install its deps (idempotent). Drives `build setup`. */
export async function setupIosevka(
  opts: { force?: boolean } = {},
): Promise<string> {
  normalizeIosevkaVendorDir();
  if (
    !opts.force &&
    existsSync(VENDOR_DIR) &&
    existsSync(join(VENDOR_DIR, "node_modules"))
  ) {
    console.log(`Iosevka ${IOSEVKA_VERSION} already set up at ${VENDOR_DIR}`);
    return VENDOR_DIR;
  }
  const vendor = VENDOR_ROOT;
  mkdirSync(vendor, { recursive: true });

  if (opts.force || !existsSync(VENDOR_DIR)) {
    console.log(`Downloading Iosevka ${IOSEVKA_VERSION}…`);
    const tar = join(vendor, `iosevka-${IOSEVKA_VERSION}.tar.gz`);
    await downloadTo(
      `https://github.com/be5invis/Iosevka/archive/refs/tags/v${IOSEVKA_VERSION}.tar.gz`,
      tar,
      { force: true },
    );
    rmSync(VENDOR_DIR, { recursive: true, force: true });
    mkdirSync(VENDOR_DIR, { recursive: true });
    const ex = spawnSync(
      "tar",
      ["-xzf", tar, "--strip-components=1", "-C", VENDOR_DIR],
      { stdio: "inherit" },
    );
    if (ex.status !== 0) {
      rmSync(VENDOR_DIR, { recursive: true, force: true });
      throw new Error("tar extraction failed");
    }
    rmSync(tar, { force: true });
    console.log(`Extracted to ${VENDOR_DIR}`);
  }

  console.log("Installing dependencies (bun install)…");
  const inst = spawnSync("bun", ["install"], {
    cwd: VENDOR_DIR,
    stdio: "inherit",
  });
  if (inst.status !== 0) throw new Error("bun install failed");
  console.log(`Done. Iosevka ${IOSEVKA_VERSION} ready at ${VENDOR_DIR}`);
  return VENDOR_DIR;
}

function normalizeIosevkaVendorDir(): void {
  if (!existsSync(VENDOR_ROOT)) return;
  const actual = readdirSync(VENDOR_ROOT).find(
    (name) =>
      name.toLowerCase() === LOWERCASE_IOSEVKA_DIR &&
      name !== LOWERCASE_IOSEVKA_DIR,
  );
  if (!actual) return;

  const actualPath = join(VENDOR_ROOT, actual);
  const tmp = join(VENDOR_ROOT, `.rename-${LOWERCASE_IOSEVKA_DIR}`);
  rmSync(tmp, { recursive: true, force: true });
  renameSync(actualPath, tmp);
  renameSync(tmp, VENDOR_DIR);
}

export function findRegularTtf(fontDir: string): string | null {
  if (!existsSync(fontDir)) return null;
  const all = readdirSync(fontDir).filter((f) =>
    f.toLowerCase().endsWith(".ttf"),
  );
  for (const name of all) {
    const stem = name.toLowerCase().replace(/\.ttf$/, "");
    if (stem.includes("regular") || stem.includes("upright"))
      return join(fontDir, name);
  }
  return all[0] ? join(fontDir, all[0]) : null;
}

export function buildFont(recipePath: string): string | null {
  if (!existsSync(VENDOR_DIR)) {
    console.error(
      `Iosevka source not found at ${VENDOR_DIR}\nRun: pravka build setup`,
    );
    return null;
  }
  if (!existsSync(join(VENDOR_DIR, "node_modules"))) {
    console.error(`npm dependencies not installed.\nRun: pravka build setup`);
    return null;
  }

  const rhash = recipeHash(recipePath);
  const cacheDir = join(DIST_DIR, "fonts", rhash);
  const cached =
    existsSync(cacheDir) &&
    readdirSync(cacheDir).some((f) => f.endsWith(".ttf"));

  if (!cached) {
    copyFileSync(recipePath, join(VENDOR_DIR, "private-build-plans.toml"));

    const ncpu = availableParallelism();
    const result = spawnSync(
      "npm",
      [
        "run",
        "build",
        "--no-update-notifier",
        "--",
        "--targets=ttf-unhinted::Iosevkapravka",
        `--jCmd=${ncpu}`,
        "--verbosity=9",
      ],
      { cwd: VENDOR_DIR, stdio: "inherit" },
    );
    if (result.status !== 0) {
      console.error("Iosevka build failed");
      return null;
    }

    const dist = join(VENDOR_DIR, "dist", "Iosevkapravka");
    const candidate = [join(dist, "TTF-Unhinted"), join(dist, "TTF")].find(
      (d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith(".ttf")),
    );
    if (!candidate) {
      console.error(`No TTF output found under ${dist}`);
      return null;
    }

    mkdirSync(cacheDir, { recursive: true });
    for (const f of readdirSync(candidate)) {
      if (f.endsWith(".ttf")) {
        copyFileSync(join(candidate, f), join(cacheDir, f));
      }
    }
  }

  // Map the opaque content-addressed cache dir back to its source recipe.
  writeFileSync(
    join(cacheDir, "recipe.txt"),
    `${recipePath}\n${basename(recipePath)}\n`,
  );
  return cacheDir;
}
