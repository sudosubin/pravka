import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { VENDOR_DIR as VENDOR_ROOT } from "@/shared/paths.ts";

const IOSEVKA_VERSION = "34.4.0";

export const VENDOR_DIR = join(VENDOR_ROOT, `iosevka-${IOSEVKA_VERSION}`);

/** Iosevka design-variant / ligation param files (from the vendored source). */
export const VARIANTS_TOML = join(VENDOR_DIR, "params", "variants.toml");
export const LIGATION_TOML = join(VENDOR_DIR, "params", "ligation-set.toml");

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
