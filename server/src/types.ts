export type Ingredient = {
  name: string;
  amount?: number;
  unit?: string;
};

export type RecipeInput = {
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

export type Recipe = RecipeInput & { id: string };

export type PlannedMealInput = {
  recipeId: string;
  /** Multiply recipe ingredient amounts by this (e.g. 2 = double batch). Default 1. */
  servingsMultiplier?: number;
};

export type PlannedMeal = PlannedMealInput & { id: string };

/** Calendar day in YYYY-MM-DD (client-local interpretation). */
export type ProgressDayInput = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Omit or null when not weighed that day. */
  weightKg?: number | null;
};

export type ProgressDay = ProgressDayInput & { day: string };
