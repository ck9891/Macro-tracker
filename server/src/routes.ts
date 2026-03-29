import type { Express, Request, Response } from "express";
import type Database from "better-sqlite3";
import { requireUser, type AuthUser } from "./auth.js";
import { buildGroceryList, recipeMacrosForBatches } from "./grocery.js";
import { rowToRecipe, rowToWeightEntry } from "./db.js";
import type { PlannedMealInput, RecipeInput, WeightEntryInput } from "./types.js";
import { validatePlanPut, validateRecipeInput, validateWeightEntryInput } from "./validate.js";

type AuthedRequest = Request & { authUser: AuthUser };

function userId(req: Request): string {
  return (req as AuthedRequest).authUser.id;
}

function parseJsonBody<T>(req: Request, res: Response): T | null {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).json({ error: "Expected JSON body" });
    return null;
  }
  return req.body as T;
}

export function registerRoutes(app: Express, db: Database.Database) {
  const needUser = requireUser(db);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/sync", needUser, (req, res) => {
    const uid = userId(req);
    const recipeRows = db
      .prepare("SELECT * FROM recipes WHERE user_id = ? ORDER BY name COLLATE NOCASE")
      .all(uid);
    const planRows = db
      .prepare(
        `
      SELECT pm.id, pm.recipe_id, pm.servings_multiplier
      FROM planned_meals pm
      WHERE pm.user_id = ?
      ORDER BY pm.rowid
    `,
      )
      .all(uid) as { id: string; recipe_id: string; servings_multiplier: number }[];
    const weightRows = db
      .prepare(
        "SELECT id, measured_at, weight, unit, note FROM weight_entries WHERE user_id = ? ORDER BY measured_at DESC",
      )
      .all(uid) as Parameters<typeof rowToWeightEntry>[0][];

    res.json({
      recipes: (recipeRows as Parameters<typeof rowToRecipe>[0][]).map(rowToRecipe),
      plan: planRows.map((r) => ({
        id: r.id,
        recipeId: r.recipe_id,
        servingsMultiplier: r.servings_multiplier,
      })),
      weightEntries: weightRows.map(rowToWeightEntry),
      serverTime: new Date().toISOString(),
    });
  });

  app.get("/api/recipes", needUser, (req, res) => {
    const rows = db
      .prepare("SELECT * FROM recipes WHERE user_id = ? ORDER BY name COLLATE NOCASE")
      .all(userId(req));
    res.json((rows as Parameters<typeof rowToRecipe>[0][]).map(rowToRecipe));
  });

  app.get("/api/recipes/:id", needUser, (req, res) => {
    const row = db
      .prepare("SELECT * FROM recipes WHERE id = ? AND user_id = ?")
      .get(req.params.id, userId(req)) as
      | Parameters<typeof rowToRecipe>[0]
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.json(rowToRecipe(row));
  });

  app.post("/api/recipes", needUser, (req, res) => {
    const body = parseJsonBody<RecipeInput>(req, res);
    if (!body) return;
    if (!validateRecipeInput(body, res)) return;

    const id = crypto.randomUUID();
    db.prepare(
      `
      INSERT INTO recipes (id, user_id, name, duration_minutes, servings, calories, protein_g, carbs_g, fat_g, ingredients_json, steps_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      userId(req),
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

    const row = db
      .prepare("SELECT * FROM recipes WHERE id = ? AND user_id = ?")
      .get(id, userId(req)) as Parameters<typeof rowToRecipe>[0];
    res.status(201).json(rowToRecipe(row));
  });

  /** Idempotent upsert for offline sync (client supplies id). */
  app.put("/api/recipes/:id", needUser, (req, res) => {
    const body = parseJsonBody<RecipeInput>(req, res);
    if (!body) return;
    if (!validateRecipeInput(body, res)) return;

    const id = req.params.id;
    const uid = userId(req);
    const existing = db.prepare("SELECT user_id FROM recipes WHERE id = ?").get(id) as
      | { user_id: string | null }
      | undefined;
    if (existing && existing.user_id !== uid) {
      res.status(403).json({ error: "Recipe belongs to another account" });
      return;
    }
    db.prepare(
      `
      INSERT INTO recipes (id, user_id, name, duration_minutes, servings, calories, protein_g, carbs_g, fat_g, ingredients_json, steps_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
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
      uid,
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
    const row = db.prepare("SELECT * FROM recipes WHERE id = ? AND user_id = ?").get(id, uid) as
      Parameters<typeof rowToRecipe>[0];
    res.json(rowToRecipe(row));
  });

  app.delete("/api/recipes/:id", needUser, (req, res) => {
    const r = db
      .prepare("DELETE FROM recipes WHERE id = ? AND user_id = ?")
      .run(req.params.id, userId(req));
    if (r.changes === 0) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    res.status(204).send();
  });

  app.get("/api/plan", needUser, (req, res) => {
    const rows = db
      .prepare(
        `
      SELECT pm.id, pm.recipe_id, pm.servings_multiplier
      FROM planned_meals pm
      WHERE pm.user_id = ?
      ORDER BY pm.rowid
    `,
      )
      .all(userId(req)) as { id: string; recipe_id: string; servings_multiplier: number }[];
    res.json(
      rows.map((r) => ({
        id: r.id,
        recipeId: r.recipe_id,
        servingsMultiplier: r.servings_multiplier,
      })),
    );
  });

  app.post("/api/plan", needUser, (req, res) => {
    const body = parseJsonBody<PlannedMealInput>(req, res);
    if (!body) return;
    if (!body.recipeId) {
      res.status(400).json({ error: "recipeId is required" });
      return;
    }
    const uid = userId(req);
    const recipe = db
      .prepare("SELECT id FROM recipes WHERE id = ? AND user_id = ?")
      .get(body.recipeId, uid);
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
      "INSERT INTO planned_meals (id, user_id, recipe_id, servings_multiplier) VALUES (?, ?, ?, ?)",
    ).run(id, uid, body.recipeId, mult);
    res.status(201).json({ id, recipeId: body.recipeId, servingsMultiplier: mult });
  });

  /** Idempotent upsert for offline sync (client supplies planned meal id). */
  app.put("/api/plan/:id", needUser, (req, res) => {
    const body = parseJsonBody<PlannedMealInput>(req, res);
    if (!body) return;
    if (!validatePlanPut(body, res)) return;
    const uid = userId(req);
    const existingPlan = db.prepare("SELECT user_id FROM planned_meals WHERE id = ?").get(req.params.id) as
      | { user_id: string | null }
      | undefined;
    if (existingPlan && existingPlan.user_id !== uid) {
      res.status(403).json({ error: "Planned meal belongs to another account" });
      return;
    }
    const recipe = db
      .prepare("SELECT id FROM recipes WHERE id = ? AND user_id = ?")
      .get(body.recipeId, uid);
    if (!recipe) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    const mult = body.servingsMultiplier ?? 1;
    db.prepare(
      `
      INSERT INTO planned_meals (id, user_id, recipe_id, servings_multiplier)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        recipe_id = excluded.recipe_id,
        servings_multiplier = excluded.servings_multiplier
    `,
    ).run(req.params.id, uid, body.recipeId, mult);
    res.json({
      id: req.params.id,
      recipeId: body.recipeId,
      servingsMultiplier: mult,
    });
  });

  app.patch("/api/plan/:id", needUser, (req, res) => {
    const body = parseJsonBody<{ servingsMultiplier?: number }>(req, res);
    if (!body) return;
    const row = db
      .prepare(
        "SELECT id, recipe_id, servings_multiplier FROM planned_meals WHERE id = ? AND user_id = ?",
      )
      .get(req.params.id, userId(req)) as
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
    db.prepare("UPDATE planned_meals SET servings_multiplier = ? WHERE id = ? AND user_id = ?").run(
      mult,
      req.params.id,
      userId(req),
    );
    res.json({
      id: row.id,
      recipeId: row.recipe_id,
      servingsMultiplier: mult,
    });
  });

  app.delete("/api/plan/:id", needUser, (req, res) => {
    const r = db
      .prepare("DELETE FROM planned_meals WHERE id = ? AND user_id = ?")
      .run(req.params.id, userId(req));
    if (r.changes === 0) {
      res.status(404).json({ error: "Planned meal not found" });
      return;
    }
    res.status(204).send();
  });

  app.delete("/api/plan", needUser, (req, res) => {
    db.prepare("DELETE FROM planned_meals WHERE user_id = ?").run(userId(req));
    res.status(204).send();
  });

  app.get("/api/grocery", needUser, (req, res) => {
    const uid = userId(req);
    const planRows = db
      .prepare(
        `
      SELECT pm.id as plan_id, pm.servings_multiplier, r.*
      FROM planned_meals pm
      JOIN recipes r ON r.id = pm.recipe_id AND r.user_id = pm.user_id
      WHERE pm.user_id = ?
      ORDER BY pm.rowid
    `,
      )
      .all(uid) as ({
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

  app.get("/api/weight", needUser, (req, res) => {
    const uid = userId(req);
    const rows = db
      .prepare(
        "SELECT id, measured_at, weight, unit, note FROM weight_entries WHERE user_id = ? ORDER BY measured_at DESC",
      )
      .all(uid) as Parameters<typeof rowToWeightEntry>[0][];
    res.json(rows.map(rowToWeightEntry));
  });

  /** Idempotent upsert for offline sync (client supplies id). */
  app.put("/api/weight/:id", needUser, (req, res) => {
    const body = parseJsonBody<WeightEntryInput>(req, res);
    if (!body) return;
    if (!validateWeightEntryInput(body, res)) return;

    const id = req.params.id;
    const uid = userId(req);
    const existing = db.prepare("SELECT user_id FROM weight_entries WHERE id = ?").get(id) as
      | { user_id: string | null }
      | undefined;
    if (existing && existing.user_id !== uid) {
      res.status(403).json({ error: "Weight entry belongs to another account" });
      return;
    }
    const note = body.note?.trim() ?? null;
    db.prepare(
      `
      INSERT INTO weight_entries (id, user_id, measured_at, weight, unit, note)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        measured_at = excluded.measured_at,
        weight = excluded.weight,
        unit = excluded.unit,
        note = excluded.note
    `,
    ).run(id, uid, body.measuredAt, body.weight, body.unit, note);

    const row = db
      .prepare("SELECT id, measured_at, weight, unit, note FROM weight_entries WHERE id = ? AND user_id = ?")
      .get(id, uid) as Parameters<typeof rowToWeightEntry>[0];
    res.json(rowToWeightEntry(row));
  });

  app.delete("/api/weight/:id", needUser, (req, res) => {
    const r = db
      .prepare("DELETE FROM weight_entries WHERE id = ? AND user_id = ?")
      .run(req.params.id, userId(req));
    if (r.changes === 0) {
      res.status(404).json({ error: "Weight entry not found" });
      return;
    }
    res.status(204).send();
  });
}
