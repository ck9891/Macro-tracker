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

export type WeightUnit = "kg" | "lb";

export type WeightEntryInput = {
  /** ISO 8601 timestamp (e.g. from datetime-local or Date.toISOString()). */
  measuredAt: string;
  weight: number;
  unit: WeightUnit;
  note?: string;
};

export type WeightEntry = WeightEntryInput & { id: string };
