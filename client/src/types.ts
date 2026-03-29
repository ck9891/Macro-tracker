export type Ingredient = {
  name: string;
  amount?: number;
  unit?: string;
};

export type Recipe = {
  id: string;
  name: string;
  durationMinutes: number;
  servings: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  ingredients: Ingredient[];
  steps: string[];
};

export type PlannedMeal = {
  id: string;
  recipeId: string;
  servingsMultiplier: number;
};

export type GroceryLine = {
  key: string;
  displayName: string;
  totalAmount?: number;
  unit?: string;
  parts: { amount?: number; unit?: string; note?: string }[];
  recipeRefs: { recipeName: string; contribution: string }[];
};

export type GroceryResponse = {
  lines: GroceryLine[];
  plannedCount: number;
  macroTotals: { calories: number; proteinG: number; carbsG: number; fatG: number };
};

/** YYYY-MM-DD; values are what you actually ate / weighed that calendar day. */
export type ProgressDay = {
  day: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  weightKg: number | null;
};

export type ProgressDayInput = Omit<ProgressDay, "day">;
