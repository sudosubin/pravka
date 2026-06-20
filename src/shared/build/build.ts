import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { VENDOR_DIR as VENDOR_ROOT } from "@/shared/paths.ts";
import { downloadTo } from "@/shared/source.ts";

const IOSEVKA_VERSION = "34.4.0";

export const VENDOR_DIR = join(VENDOR_ROOT, `iosevka-${IOSEVKA_VERSION}`);

/** Iosevka design-variant / ligation param files (from the vendored source). */
export const VARIANTS_TOML = join(VENDOR_DIR, "params", "variants.toml");
export const LIGATION_TOML = join(VENDOR_DIR, "params", "ligation-set.toml");

/** Download the Iosevka source to vendor/ and install its deps (idempotent). Drives `build setup`. */
export async function setupIosevka(
  opts: { force?: boolean } = {},
): Promise<string> {
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
    const ex = spawnSync("tar", ["-xzf", tar, "-C", vendor], {
      stdio: "inherit",
    });
    if (ex.status !== 0) throw new Error("tar extraction failed");
    const extracted = join(vendor, `Iosevka-${IOSEVKA_VERSION}`);
    // macOS APFS is case-insensitive: extracted dir may already equal VENDOR_DIR.
    const sameDir =
      existsSync(VENDOR_DIR) &&
      realpathSync(extracted) === realpathSync(VENDOR_DIR);
    if (!sameDir) renameSync(extracted, VENDOR_DIR);
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
