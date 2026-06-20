import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { LIGATION_TOML, VARIANTS_TOML } from "@/shared/build/build.ts";
import { buildOptionMap } from "@/shared/recipe/option-map.ts";

// buildOptionMap parses Iosevka's variant/ligation param files into option → codepoints.
// Needs the vendored Iosevka source, so it self-skips when `build setup` hasn't been run.
const hasVendor = existsSync(VARIANTS_TOML) && existsSync(LIGATION_TOML);

describe("buildOptionMap", () => {
  test.skipIf(!hasVendor)("maps options to codepoints", () => {
    const map = buildOptionMap(VARIANTS_TOML, LIGATION_TOML);
    expect(map.size).toBeGreaterThan(0);
    // Some options legitimately affect no codepoints; the map as a whole must not be empty.
    const total = [...map.values()].reduce((n, cps) => n + cps.size, 0);
    expect(total).toBeGreaterThan(0);
  });
});
