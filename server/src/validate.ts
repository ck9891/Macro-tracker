import type { Response } from "express";
import type { PlannedMealInput, RecipeInput } from "./types.js";

export function validateRecipeInput(body: RecipeInput, res: Response): body is RecipeInput {
  if (!body.name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return false;
  }
  if (
    typeof body.durationMinutes !== "number" ||
    body.durationMinutes < 0 ||
    !Number.isFinite(body.durationMinutes)
  ) {
    res.status(400).json({ error: "durationMinutes must be a non-negative number" });
    return false;
  }
  if (typeof body.servings !== "number" || body.servings <= 0 || !Number.isFinite(body.servings)) {
    res.status(400).json({ error: "servings must be a positive number" });
    return false;
  }
  const macros = ["calories", "proteinG", "carbsG", "fatG"] as const;
  for (const m of macros) {
    if (typeof body[m] !== "number" || body[m] < 0 || !Number.isFinite(body[m])) {
      res.status(400).json({ error: `${m} must be a non-negative number` });
      return false;
    }
  }
  if (!Array.isArray(body.ingredients)) {
    res.status(400).json({ error: "ingredients must be an array" });
    return false;
  }
  if (!Array.isArray(body.steps)) {
    res.status(400).json({ error: "steps must be an array" });
    return false;
  }
  return true;
}

export function validatePlanPut(
  body: PlannedMealInput,
  res: Response,
): body is PlannedMealInput & { recipeId: string } {
  if (!body.recipeId) {
    res.status(400).json({ error: "recipeId is required" });
    return false;
  }
  const mult = body.servingsMultiplier ?? 1;
  if (typeof mult !== "number" || mult <= 0 || !Number.isFinite(mult)) {
    res.status(400).json({ error: "servingsMultiplier must be a positive number" });
    return false;
  }
  return true;
}
