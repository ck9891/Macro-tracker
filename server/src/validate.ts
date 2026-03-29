import type { Response } from "express";
import type { PlannedMealInput, ProgressDayInput, RecipeInput, WeightEntryInput } from "./types.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export function isValidDayParam(day: string): boolean {
  if (typeof day !== "string" || !DAY_RE.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function validateProgressInput(
  body: ProgressDayInput,
  res: Response,
): body is ProgressDayInput {
  const macros = ["calories", "proteinG", "carbsG", "fatG"] as const;
  for (const m of macros) {
    if (typeof body[m] !== "number" || body[m] < 0 || !Number.isFinite(body[m])) {
      res.status(400).json({ error: `${m} must be a non-negative number` });
      return false;
    }
  }
  if (body.weightKg != null) {
    if (typeof body.weightKg !== "number" || body.weightKg <= 0 || !Number.isFinite(body.weightKg)) {
      res.status(400).json({ error: "weightKg must be a positive number when set" });
      return false;
    }
  }
  return true;
}

function isValidMeasuredAt(s: string): boolean {
  if (!s || typeof s !== "string") return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export function validateWeightEntryInput(
  body: WeightEntryInput,
  res: Response,
): body is WeightEntryInput {
  if (!isValidMeasuredAt(body.measuredAt)) {
    res.status(400).json({ error: "measuredAt must be a valid date/time string" });
    return false;
  }
  if (typeof body.weight !== "number" || body.weight <= 0 || !Number.isFinite(body.weight)) {
    res.status(400).json({ error: "weight must be a positive number" });
    return false;
  }
  if (body.unit !== "kg" && body.unit !== "lb") {
    res.status(400).json({ error: 'unit must be "kg" or "lb"' });
    return false;
  }
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") {
      res.status(400).json({ error: "note must be a string" });
      return false;
    }
    if (body.note.length > 2000) {
      res.status(400).json({ error: "note is too long" });
      return false;
    }
  }
  return true;
}
