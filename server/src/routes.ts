import type { Express, Request, Response } from "express";
import type Database from "better-sqlite3";
import { buildGroceryList, recipeMacrosForBatches } from "./grocery.js";
import { rowToRecipe } from "./db.js";
import type { PlannedMealInput, ProgressDay, ProgressDayInput, RecipeInput } from "./types.js";
import {
  isValidDayParam,
  validatePlanPut,
  validateProgressInput,
  validateRecipeInput,
} from "./validate.js";

function rowToProgressDay(row: {
  day: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  weight_kg: number | null;
}): ProgressDay {
  return {
    day: row.day,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    weightKg: row.weight_kg == null ? null : row.weight_kg,
  };
}

function parseJsonBody<T>(req: Request, res: Response): T | null {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).json({ error: "Expected JSON body" });
    return null;
  }
  return req.body as T;
}

export function registerRoutes(app: Express, db: Database.Database) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/sync", (_req, res) => {
    const recipeRows = db.prepare("SELECT * FROM recipes ORDER BY name COLLATE NOCASE").all();
    const planRows = db
      .prepare(
        `
      SELECT pm.id, pm.recipe_id, pm.servings_multiplier
      FROM planned_meals pm
      ORDER BY pm.rowid
    `,
      )
      .all() as { id: string; recipe_id: string; servings_multiplier: number }[];
    const progressRows = db
      .prepare("SELECT day, calories, protein_g, carbs_g, fat_g, weight_kg FROM daily_progress ORDER BY day")
      .all() as {
      day: string;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      weight_kg: number | null;
    }[];
    res.json({
      recipes: (recipeRows as Parameters<typeof rowToRecipe>[0][]).map(rowToRecipe),
      plan: planRows.map((r) => ({
        id: r.id,
        recipeId: r.recipe_id,
        servingsMultiplier: r.servings_multiplier,
      })),
      progress: progressRows.map(rowToProgressDay),
      serverTime: new Date().toISOString(),
    });
  });

  app.get("/api/recipes", (_req, res) => {
    const rows = db.prepare("SELECT * FROM recipes ORDER BY name COLLATE NOCASE").all();
    res.json((rows as Parameters<typeof rowToRecipe>[0][]).map(rowToRecipe));
  });

  app.get("/api/recipes/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id) as
      | Parameters<typeof rowToRecipe>[0]
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json(rowToRecipe(row));
  });

  app.post("/api/recipes", (req, res) => {
    const body = parseJsonBody<RecipeInput>(req, res);
    if (!body) return;
    if (!validateRecipeInput(body, res)) return;

    const id = crypto.randomUUID();
    db.prepare(
      `
      INSERT INTO recipes (id, name, duration_minutes, servings, calories, protein_g, carbs_g, fat_g, ingredients_json, steps_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      body.name.trim(),
      Math.round(body.durationMinutes),
      body.servings,
      body.calories,
      body.proteinG,
      body.carbsG,
      body.fatG,
      JSON.stringify(body.ingredients),
      JSON.stringify(body.steps.map((s) => String(s))),
    );

    const row = db.prepare("SELECT * FROM recipes WHERE id = ?").get(id) as Parameters<
      typeof rowToRecipe
    >[0];
    res.status(201).json(rowToRecipe(row));
  });

  /** Idempotent upsert for offline sync (client supplies id). */
  app.put("/api/recipes/:id", (req, res) => {
    const body = parseJsonBody<RecipeInput>(req, res);
    if (!body) return;
    if (!validateRecipeInput(body, res)) return;

    const id = req.params.id;
    db.prepare(
      `
      INSERT INTO recipes (id, name, duration_minutes, servings, calories, protein_g, carbs_g, fat_g, ingredients_json, steps_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        duration_minutes = excluded.duration_minutes,
        servings = excluded.servings,
        calories = excluded.calories,
        protein_g = excluded.protein_g,
        carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g,
        ingredients_json = excluded.ingredients_json,
        steps_json = excluded.steps_json
    `,
    ).run(
      id,
      body.name.trim(),
      Math.round(body.durationMinutes),
      body.servings,
      body.calories,
      body.proteinG,
      body.carbsG,
      body.fatG,
      JSON.stringify(body.ingredients),
      JSON.stringify(body.steps.map((s) => String(s))),
    );
    const row = db.prepare("SELECT * FROM recipes WHERE id = ?").get(id) as Parameters<
      typeof rowToRecipe
    >[0];
    res.json(rowToRecipe(row));
  });

  app.delete("/api/recipes/:id", (req, res) => {
    const r = db.prepare("DELETE FROM recipes WHERE id = ?").run(req.params.id);
    if (r.changes === 0) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.status(204).send();
  });

  app.get("/api/plan", (_req, res) => {
    const rows = db
      .prepare(
        `
      SELECT pm.id, pm.recipe_id, pm.servings_multiplier
      FROM planned_meals pm
      ORDER BY pm.rowid
    `,
      )
      .all() as { id: string; recipe_id: string; servings_multiplier: number }[];
    res.json(
      rows.map((r) => ({
        id: r.id,
        recipeId: r.recipe_id,
        servingsMultiplier: r.servings_multiplier,
      })),
    );
  });

  app.post("/api/plan", (req, res) => {
    const body = parseJsonBody<PlannedMealInput>(req, res);
    if (!body) return;
    if (!body.recipeId) {
      res.status(400).json({ error: "recipeId is required" });
      return;
    }
    const recipe = db.prepare("SELECT id FROM recipes WHERE id = ?").get(body.recipeId);
    if (!recipe) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    let mult = body.servingsMultiplier ?? 1;
    if (typeof mult !== "number" || mult <= 0 || !Number.isFinite(mult)) {
      res.status(400).json({ error: "servingsMultiplier must be a positive number" });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      "INSERT INTO planned_meals (id, recipe_id, servings_multiplier) VALUES (?, ?, ?)",
    ).run(id, body.recipeId, mult);
    res.status(201).json({ id, recipeId: body.recipeId, servingsMultiplier: mult });
  });

  /** Idempotent upsert for offline sync (client supplies planned meal id). */
  app.put("/api/plan/:id", (req, res) => {
    const body = parseJsonBody<PlannedMealInput>(req, res);
    if (!body) return;
    if (!validatePlanPut(body, res)) return;
    const recipe = db.prepare("SELECT id FROM recipes WHERE id = ?").get(body.recipeId);
    if (!recipe) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    const mult = body.servingsMultiplier ?? 1;
    db.prepare(
      `
      INSERT INTO planned_meals (id, recipe_id, servings_multiplier)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        recipe_id = excluded.recipe_id,
        servings_multiplier = excluded.servings_multiplier
    `,
    ).run(req.params.id, body.recipeId, mult);
    res.json({
      id: req.params.id,
      recipeId: body.recipeId,
      servingsMultiplier: mult,
    });
  });

  app.patch("/api/plan/:id", (req, res) => {
    const body = parseJsonBody<{ servingsMultiplier?: number }>(req, res);
    if (!body) return;
    const row = db
      .prepare("SELECT id, recipe_id, servings_multiplier FROM planned_meals WHERE id = ?")
      .get(req.params.id) as
      | { id: string; recipe_id: string; servings_multiplier: number }
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Planned meal not found" });
      return;
    }
    let mult = body.servingsMultiplier ?? row.servings_multiplier;
    if (typeof mult !== "number" || mult <= 0 || !Number.isFinite(mult)) {
      res.status(400).json({ error: "servingsMultiplier must be a positive number" });
      return;
    }
    db.prepare("UPDATE planned_meals SET servings_multiplier = ? WHERE id = ?").run(
      mult,
      req.params.id,
    );
    res.json({
      id: row.id,
      recipeId: row.recipe_id,
      servingsMultiplier: mult,
    });
  });

  app.delete("/api/plan/:id", (req, res) => {
    const r = db.prepare("DELETE FROM planned_meals WHERE id = ?").run(req.params.id);
    if (r.changes === 0) {
      res.status(404).json({ error: "Planned meal not found" });
      return;
    }
    res.status(204).send();
  });

  app.delete("/api/plan", (_req, res) => {
    db.prepare("DELETE FROM planned_meals").run();
    res.status(204).send();
  });

  app.get("/api/grocery", (_req, res) => {
    const planRows = db
      .prepare(
        `
      SELECT pm.id as plan_id, pm.servings_multiplier, r.*
      FROM planned_meals pm
      JOIN recipes r ON r.id = pm.recipe_id
      ORDER BY pm.rowid
    `,
      )
      .all() as ({
        plan_id: string;
        servings_multiplier: number;
      } & Parameters<typeof rowToRecipe>[0])[];

    const selections = planRows.map((row) => {
      const { plan_id: _p, servings_multiplier, ...recipeRow } = row;
      return {
        recipe: rowToRecipe(recipeRow),
        servingsMultiplier: servings_multiplier,
      };
    });

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

    res.json({
      lines,
      plannedCount: selections.length,
      macroTotals: totals,
    });
  });

  app.get("/api/progress", (_req, res) => {
    const rows = db
      .prepare("SELECT day, calories, protein_g, carbs_g, fat_g, weight_kg FROM daily_progress ORDER BY day")
      .all() as {
      day: string;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      weight_kg: number | null;
    }[];
    res.json(rows.map(rowToProgressDay));
  });

  app.put("/api/progress/:day", (req, res) => {
    const day = req.params.day;
    if (!isValidDayParam(day)) {
      res.status(400).json({ error: "day must be YYYY-MM-DD" });
      return;
    }
    const body = parseJsonBody<ProgressDayInput>(req, res);
    if (!body) return;
    if (!validateProgressInput(body, res)) return;

    const weightKg = body.weightKg == null ? null : body.weightKg;
    db.prepare(
      `
      INSERT INTO daily_progress (day, calories, protein_g, carbs_g, fat_g, weight_kg, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(day) DO UPDATE SET
        calories = excluded.calories,
        protein_g = excluded.protein_g,
        carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g,
        weight_kg = excluded.weight_kg,
        updated_at = excluded.updated_at
    `,
    ).run(day, body.calories, body.proteinG, body.carbsG, body.fatG, weightKg);

    const row = db
      .prepare("SELECT day, calories, protein_g, carbs_g, fat_g, weight_kg FROM daily_progress WHERE day = ?")
      .get(day) as Parameters<typeof rowToProgressDay>[0];
    res.json(rowToProgressDay(row));
  });

  app.delete("/api/progress/:day", (req, res) => {
    const day = req.params.day;
    if (!isValidDayParam(day)) {
      res.status(400).json({ error: "day must be YYYY-MM-DD" });
      return;
    }
    const r = db.prepare("DELETE FROM daily_progress WHERE day = ?").run(day);
    if (r.changes === 0) {
      res.status(404).json({ error: "No entry for that day" });
      return;
    }
    res.status(204).send();
  });
}
