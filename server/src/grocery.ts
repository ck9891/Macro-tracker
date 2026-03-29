import type { Recipe } from "./types.js";

export type GroceryLine = {
  key: string;
  displayName: string;
  /** Combined numeric amount when units match; undefined if not combinable */
  totalAmount?: number;
  unit?: string;
  /** Human-readable parts when amounts could not be merge (different units) */
  parts: { amount?: number; unit?: string; note?: string }[];
  recipeRefs: { recipeName: string; contribution: string }[];
};

const UNIT_ALIASES: Record<string, string> = {
  gram: "g",
  grams: "g",
  g: "g",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "l",
  liter: "l",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  cup: "cup",
  cups: "cup",
  whole: "whole",
  clove: "cloves",
  cloves: "cloves",
  pinch: "pinch",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
};

function normalizeUnit(unit: string | undefined): string | undefined {
  if (!unit) return undefined;
  const u = unit.trim().toLowerCase();
  return UNIT_ALIASES[u] ?? u;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "");
}

/**
 * Merge ingredients across recipes: same normalized name + same normalized unit → sum amounts.
 * Different units for the same item appear as separate lines with recipe attribution.
 */
export function buildGroceryList(
  selections: { recipe: Recipe; servingsMultiplier: number }[],
): GroceryLine[] {
  type Bucket = {
    displayName: string;
    unit?: string;
    amounts: number[];
    parts: GroceryLine["parts"];
    recipeRefs: GroceryLine["recipeRefs"];
  };

  const byKey = new Map<string, Bucket>();

  for (const { recipe, servingsMultiplier } of selections) {
    const scale = servingsMultiplier * (recipe.servings > 0 ? 1 / recipe.servings : 1);

    for (const ing of recipe.ingredients) {
      const nUnit = normalizeUnit(ing.unit);
      const nName = normalizeName(ing.name);
      const key =
        nUnit !== undefined
          ? `${nName}::${nUnit}`
          : `${nName}::${ing.amount ?? "x"}::${ing.unit ?? "each"}`;

      const scaled =
        ing.amount !== undefined && ing.amount !== null ? ing.amount * scale : undefined;
      const contribution =
        scaled !== undefined
          ? `${scaled % 1 === 0 ? scaled : scaled.toFixed(2)}${ing.unit ? ` ${ing.unit}` : ""}`
          : ing.unit
            ? `— ${ing.unit}`
            : "as needed";

      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = {
          displayName: ing.name.trim(),
          unit: nUnit ?? ing.unit?.trim(),
          amounts: [],
          parts: [],
          recipeRefs: [],
        };
        byKey.set(key, bucket);
      }

      bucket.recipeRefs.push({ recipeName: recipe.name, contribution });

      if (scaled !== undefined && nUnit !== undefined) {
        bucket.amounts.push(scaled);
      } else {
        bucket.parts.push({
          amount: scaled,
          unit: ing.unit?.trim(),
          note: recipe.name,
        });
      }
    }
  }

  const lines: GroceryLine[] = [];

  for (const [key, b] of byKey) {
    const total =
      b.amounts.length > 0 ? b.amounts.reduce((a, c) => a + c, 0) : undefined;
    const mergedParts =
      b.parts.length > 0
        ? b.parts
        : b.amounts.length > 0
          ? []
          : [{ note: b.recipeRefs.map((r) => r.recipeName).join(", ") }];

    lines.push({
      key,
      displayName: b.displayName,
      totalAmount: total,
      unit: b.unit,
      parts: mergedParts,
      recipeRefs: b.recipeRefs,
    });
  }

  lines.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
  return lines;
}

/** Macros on the recipe row are totals for one full batch (recipe.servings portions). */
export function recipeMacrosForBatches(recipe: Recipe, batchMultiplier: number) {
  return {
    calories: recipe.calories * batchMultiplier,
    proteinG: recipe.proteinG * batchMultiplier,
    carbsG: recipe.carbsG * batchMultiplier,
    fatG: recipe.fatG * batchMultiplier,
  };
}
