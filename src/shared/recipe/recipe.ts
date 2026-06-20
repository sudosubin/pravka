import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

interface BuildPlan {
  variants?: { design?: Record<string, unknown> } & Record<string, unknown>;
  [k: string]: unknown;
}

export interface Recipe {
  buildPlans: Record<string, BuildPlan>;
  [k: string]: unknown;
}

export function loadRecipe(path: string): Recipe {
  return parseToml(readFileSync(path, "utf-8")) as Recipe;
}

export function getDesignSection(recipe: Recipe): Record<string, unknown> {
  const planName = Object.keys(recipe.buildPlans ?? {})[0];
  return planName ? (recipe.buildPlans[planName]?.variants?.design ?? {}) : {};
}

export function writeRecipeWithDesign(
  baseRecipe: Recipe,
  design: Record<string, unknown>,
  outPath: string,
): void {
  const recipe = structuredClone(baseRecipe);
  const planName = Object.keys(recipe.buildPlans ?? {})[0];
  if (!planName) throw new Error("No buildPlans in recipe");
  const plan = recipe.buildPlans[planName]!;
  plan.variants = { ...(plan.variants ?? {}), design };
  writeFileSync(outPath, stringifyToml(recipe));
}
