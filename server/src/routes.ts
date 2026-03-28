import type { Express, Request, Response } from "express";
import type Database from "better-sqlite3";
import { buildGroceryList, recipeMacrosForBatches } from "./grocery.js";
import { rowToRecipe } from "./db.js";
import type { PlannedMealInput, RecipeInput } from "./types.js";

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
    if (!body.name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (
      typeof body.durationMinutes !== "number" ||
      body.durationMinutes < 0 ||
      !Number.isFinite(body.durationMinutes)
    ) {
      res.status(400).json({ error: "durationMinutes must be a non-negative number" });
      return;
    }
    if (typeof body.servings !== "number" || body.servings <= 0 || !Number.isFinite(body.servings)) {
      res.status(400).json({ error: "servings must be a positive number" });
      return;
    }
    const macros = ["calories", "proteinG", "carbsG", "fatG"] as const;
    for (const m of macros) {
      if (typeof body[m] !== "number" || body[m] < 0 || !Number.isFinite(body[m])) {
        res.status(400).json({ error: `${m} must be a non-negative number` });
        return;
      }
    }
    if (!Array.isArray(body.ingredients)) {
      res.status(400).json({ error: "ingredients must be an array" });
      return;
    }
    if (!Array.isArray(body.steps)) {
      res.status(400).json({ error: "steps must be an array" });
      return;
    }

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

  app.put("/api/recipes/:id", (req, res) => {
    const body = parseJsonBody<RecipeInput>(req, res);
    if (!body) return;
    const existing = db.prepare("SELECT id FROM recipes WHERE id = ?").get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    if (!body.name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    db.prepare(
      `
      UPDATE recipes SET
        name = ?, duration_minutes = ?, servings = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?,
        ingredients_json = ?, steps_json = ?
      WHERE id = ?
    `,
    ).run(
      body.name.trim(),
      Math.round(body.durationMinutes),
      body.servings,
      body.calories,
      body.proteinG,
      body.carbsG,
      body.fatG,
      JSON.stringify(body.ingredients),
      JSON.stringify(body.steps.map((s) => String(s))),
      req.params.id,
    );
    const row = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id) as Parameters<
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
}
