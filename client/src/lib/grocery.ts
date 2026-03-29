import type { GroceryResponse, Recipe } from "../types.js";

export type GroceryLine = {
  key: string;
  displayName: string;
  totalAmount?: number;
  unit?: string;
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

export function recipeMacrosForBatches(recipe: Recipe, batchMultiplier: number) {
  return {
    calories: recipe.calories * batchMultiplier,
    proteinG: recipe.proteinG * batchMultiplier,
    carbsG: recipe.carbsG * batchMultiplier,
    fatG: recipe.fatG * batchMultiplier,
  };
}

export function computeGroceryFromLocal(
  recipes: Recipe[],
  plan: { recipeId: string; servingsMultiplier: number }[],
): GroceryResponse {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const selections: { recipe: Recipe; servingsMultiplier: number }[] = [];
  for (const p of plan) {
    const r = byId.get(p.recipeId);
    if (r) selections.push({ recipe: r, servingsMultiplier: p.servingsMultiplier });
  }
  const lines = buildGroceryList(selections);
  const totals = selections.reduce(
    (acc, s) => {
      const m = recipeMacrosForBatches(s.recipe, s.servingsMultiplier);
      acc.calories += m.calories;
      acc.proteinG += m.proteinG;
      acc.carbsG += m.carbsG;
      acc.fatG += m.fatG;
      return acc;
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  return {
    lines,
    plannedCount: plan.length,
    macroTotals: totals,
  };
}
