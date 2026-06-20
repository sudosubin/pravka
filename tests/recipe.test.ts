import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BEST_RECIPE } from "@/shared/paths.ts";
import {
  getDesignSection,
  loadRecipe,
  writeRecipeWithDesign,
} from "@/shared/recipe/recipe.ts";

// The recipe is the source of truth for the search; its design section must survive a
// write → reload round-trip unchanged (formerly the `search_recipe_roundtrip` parity case).
describe("recipe round-trip", () => {
  test("design survives write → reload with an override applied", () => {
    const recipe = loadRecipe(BEST_RECIPE);
    const override = {
      ...getDesignSection(recipe),
      g: "single-storey-serifless",
    };
    const out = join(mkdtempSync(join(tmpdir(), "pravka-recipe-")), "out.toml");
    writeRecipeWithDesign(recipe, override, out);
    expect(getDesignSection(loadRecipe(out))).toEqual(override);
  });
});
