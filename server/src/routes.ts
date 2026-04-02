import type { Express, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireUser, type AuthUser } from "./auth.js";
import { buildGroceryList, recipeMacrosForBatches } from "./grocery.js";
import { rowToProgressDay, rowToRecipe, rowToWeightEntry } from "./db.js";
import type { PlannedMealInput, ProgressDayInput, RecipeInput, WeightEntryInput } from "./types.js";
import {
  isValidDayParam,
  validatePlanPut,
  validateProgressInput,
  validateRecipeInput,
  validateWeightEntryInput,
} from "./validate.js";

type AuthedRequest = Request & { authUser: AuthUser };

function userId(req: Request): string {
  return (req as AuthedRequest).authUser.id;
}

/** Express may type `req.params.*` as `string | string[]`. */
function routeParam(p: string | string[] | undefined): string {
  const v = Array.isArray(p) ? p[0] : p;
  return typeof v === "string" ? v : "";
}

function parseJsonBody<T>(req: Request, res: Response): T | null {
  if (!req.body || typeof req.body !== "object") {
    res.status(400).json({ error: "Expected JSON body" });
    return null;
  }
  return req.body as T;
}

export function registerRoutes(app: Express, db: PrismaClient) {
  const needUser = requireUser(db);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/sync", needUser, async (req, res, next) => {
    try {
      const uid = userId(req);
      const recipeRows = await db.recipe.findMany({
        where: { userId: uid },
        orderBy: { name: "asc" },
      });
      const planRows = await db.plannedMeal.findMany({
        where: { userId: uid },
        orderBy: { createdAt: "asc" },
        select: { id: true, recipeId: true, servingsMultiplier: true },
      });
      const weightRows = await db.weightEntry.findMany({
        where: { userId: uid },
        orderBy: { measuredAt: "desc" },
      });
      const progressRows = await db.dailyProgress.findMany({
        where: { userId: uid },
        orderBy: { day: "asc" },
      });

      res.json({
        recipes: recipeRows.map(rowToRecipe),
        plan: planRows.map((r) => ({
          id: r.id,
          recipeId: r.recipeId,
          servingsMultiplier: r.servingsMultiplier,
        })),
        weightEntries: weightRows.map(rowToWeightEntry),
        progress: progressRows.map(rowToProgressDay),
        serverTime: new Date().toISOString(),
      });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/recipes", needUser, async (req, res, next) => {
    try {
      const rows = await db.recipe.findMany({
        where: { userId: userId(req) },
        orderBy: { name: "asc" },
      });
      res.json(rows.map(rowToRecipe));
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/recipes/:id", needUser, async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      const row = await db.recipe.findFirst({
        where: { id, userId: userId(req) },
      });
      if (!row) {
        res.status(404).json({ error: "Recipe not found" });
        return;
      }
      res.json(rowToRecipe(row));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/recipes", needUser, async (req, res, next) => {
    try {
      const body = parseJsonBody<RecipeInput>(req, res);
      if (!body) return;
      if (!validateRecipeInput(body, res)) return;

      const id = crypto.randomUUID();
      await db.recipe.create({
        data: {
          id,
          userId: userId(req),
          name: body.name.trim(),
          durationMinutes: Math.round(body.durationMinutes),
          servings: body.servings,
          calories: body.calories,
          proteinG: body.proteinG,
          carbsG: body.carbsG,
          fatG: body.fatG,
          ingredientsJson: JSON.stringify(body.ingredients),
          stepsJson: JSON.stringify(body.steps.map((s) => String(s))),
        },
      });
      const row = await db.recipe.findFirstOrThrow({
        where: { id, userId: userId(req) },
      });
      res.status(201).json(rowToRecipe(row));
    } catch (e) {
      next(e);
    }
  });

  /** Idempotent upsert for offline sync (client supplies id). */
  app.put("/api/recipes/:id", needUser, async (req, res, next) => {
    try {
      const body = parseJsonBody<RecipeInput>(req, res);
      if (!body) return;
      if (!validateRecipeInput(body, res)) return;

      const id = routeParam(req.params.id);
      const uid = userId(req);
      const existing = await db.recipe.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (existing && existing.userId !== uid) {
        res.status(403).json({ error: "Recipe belongs to another account" });
        return;
      }
      await db.recipe.upsert({
        where: { id },
        create: {
          id,
          userId: uid,
          name: body.name.trim(),
          durationMinutes: Math.round(body.durationMinutes),
          servings: body.servings,
          calories: body.calories,
          proteinG: body.proteinG,
          carbsG: body.carbsG,
          fatG: body.fatG,
          ingredientsJson: JSON.stringify(body.ingredients),
          stepsJson: JSON.stringify(body.steps.map((s) => String(s))),
        },
        update: {
          userId: uid,
          name: body.name.trim(),
          durationMinutes: Math.round(body.durationMinutes),
          servings: body.servings,
          calories: body.calories,
          proteinG: body.proteinG,
          carbsG: body.carbsG,
          fatG: body.fatG,
          ingredientsJson: JSON.stringify(body.ingredients),
          stepsJson: JSON.stringify(body.steps.map((s) => String(s))),
        },
      });
      const row = await db.recipe.findFirstOrThrow({
        where: { id, userId: uid },
      });
      res.json(rowToRecipe(row));
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/recipes/:id", needUser, async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      const r = await db.recipe.deleteMany({
        where: { id, userId: userId(req) },
      });
      if (r.count === 0) {
        res.status(404).json({ error: "Recipe not found" });
        return;
      }
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/plan", needUser, async (req, res, next) => {
    try {
      const rows = await db.plannedMeal.findMany({
        where: { userId: userId(req) },
        orderBy: { createdAt: "asc" },
        select: { id: true, recipeId: true, servingsMultiplier: true },
      });
      res.json(
        rows.map((r) => ({
          id: r.id,
          recipeId: r.recipeId,
          servingsMultiplier: r.servingsMultiplier,
        })),
      );
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/plan", needUser, async (req, res, next) => {
    try {
      const body = parseJsonBody<PlannedMealInput>(req, res);
      if (!body) return;
      if (!body.recipeId) {
        res.status(400).json({ error: "recipeId is required" });
        return;
      }
      const uid = userId(req);
      const recipe = await db.recipe.findFirst({
        where: { id: body.recipeId, userId: uid },
        select: { id: true },
      });
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
      await db.plannedMeal.create({
        data: {
          id,
          userId: uid,
          recipeId: body.recipeId,
          servingsMultiplier: mult,
        },
      });
      res.status(201).json({ id, recipeId: body.recipeId, servingsMultiplier: mult });
    } catch (e) {
      next(e);
    }
  });

  /** Idempotent upsert for offline sync (client supplies planned meal id). */
  app.put("/api/plan/:id", needUser, async (req, res, next) => {
    try {
      const body = parseJsonBody<PlannedMealInput>(req, res);
      if (!body) return;
      if (!validatePlanPut(body, res)) return;
      const uid = userId(req);
      const planId = routeParam(req.params.id);
      const existingPlan = await db.plannedMeal.findUnique({
        where: { id: planId },
        select: { userId: true },
      });
      if (existingPlan && existingPlan.userId !== uid) {
        res.status(403).json({ error: "Planned meal belongs to another account" });
        return;
      }
      const recipe = await db.recipe.findFirst({
        where: { id: body.recipeId, userId: uid },
        select: { id: true },
      });
      if (!recipe) {
        res.status(404).json({ error: "Recipe not found" });
        return;
      }
      const mult = body.servingsMultiplier ?? 1;
      await db.plannedMeal.upsert({
        where: { id: planId },
        create: {
          id: planId,
          userId: uid,
          recipeId: body.recipeId,
          servingsMultiplier: mult,
        },
        update: {
          userId: uid,
          recipeId: body.recipeId,
          servingsMultiplier: mult,
        },
      });
      res.json({
        id: planId,
        recipeId: body.recipeId,
        servingsMultiplier: mult,
      });
    } catch (e) {
      next(e);
    }
  });

  app.patch("/api/plan/:id", needUser, async (req, res, next) => {
    try {
      const planId = routeParam(req.params.id);
      const body = parseJsonBody<{ servingsMultiplier?: number }>(req, res);
      if (!body) return;
      const row = await db.plannedMeal.findFirst({
        where: { id: planId, userId: userId(req) },
        select: { id: true, recipeId: true, servingsMultiplier: true },
      });
      if (!row) {
        res.status(404).json({ error: "Planned meal not found" });
        return;
      }
      let mult = body.servingsMultiplier ?? row.servingsMultiplier;
      if (typeof mult !== "number" || mult <= 0 || !Number.isFinite(mult)) {
        res.status(400).json({ error: "servingsMultiplier must be a positive number" });
        return;
      }
      await db.plannedMeal.update({
        where: { id: planId },
        data: { servingsMultiplier: mult },
      });
      res.json({
        id: row.id,
        recipeId: row.recipeId,
        servingsMultiplier: mult,
      });
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/plan/:id", needUser, async (req, res, next) => {
    try {
      const planId = routeParam(req.params.id);
      const r = await db.plannedMeal.deleteMany({
        where: { id: planId, userId: userId(req) },
      });
      if (r.count === 0) {
        res.status(404).json({ error: "Planned meal not found" });
        return;
      }
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/plan", needUser, async (req, res, next) => {
    try {
      await db.plannedMeal.deleteMany({ where: { userId: userId(req) } });
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/grocery", needUser, async (req, res, next) => {
    try {
      const uid = userId(req);
      const planRows = await db.plannedMeal.findMany({
        where: { userId: uid },
        orderBy: { createdAt: "asc" },
        include: {
          recipe: true,
        },
      });

      const selections = planRows.map((row) => ({
        recipe: rowToRecipe(row.recipe),
        servingsMultiplier: row.servingsMultiplier,
      }));

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
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/progress", needUser, async (req, res, next) => {
    try {
      const uid = userId(req);
      const rows = await db.dailyProgress.findMany({
        where: { userId: uid },
        orderBy: { day: "asc" },
      });
      res.json(rows.map(rowToProgressDay));
    } catch (e) {
      next(e);
    }
  });

  app.put("/api/progress/:day", needUser, async (req, res, next) => {
    try {
      const dayParam = req.params.day;
      const day = Array.isArray(dayParam) ? dayParam[0] : dayParam;
      if (!isValidDayParam(day)) {
        res.status(400).json({ error: "day must be YYYY-MM-DD" });
        return;
      }
      const body = parseJsonBody<ProgressDayInput>(req, res);
      if (!body) return;
      if (!validateProgressInput(body, res)) return;

      const uid = userId(req);
      const weightKg = body.weightKg == null ? null : body.weightKg;
      await db.dailyProgress.upsert({
        where: { userId_day: { userId: uid, day } },
        create: {
          userId: uid,
          day,
          calories: body.calories,
          proteinG: body.proteinG,
          carbsG: body.carbsG,
          fatG: body.fatG,
          weightKg,
        },
        update: {
          calories: body.calories,
          proteinG: body.proteinG,
          carbsG: body.carbsG,
          fatG: body.fatG,
          weightKg,
        },
      });
      const row = await db.dailyProgress.findUniqueOrThrow({
        where: { userId_day: { userId: uid, day } },
      });
      res.json(rowToProgressDay(row));
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/progress/:day", needUser, async (req, res, next) => {
    try {
      const dayParam = req.params.day;
      const day = Array.isArray(dayParam) ? dayParam[0] : dayParam;
      if (!isValidDayParam(day)) {
        res.status(400).json({ error: "day must be YYYY-MM-DD" });
        return;
      }
      const r = await db.dailyProgress.deleteMany({
        where: { userId: userId(req), day },
      });
      if (r.count === 0) {
        res.status(404).json({ error: "No entry for that day" });
        return;
      }
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/weight", needUser, async (req, res, next) => {
    try {
      const uid = userId(req);
      const rows = await db.weightEntry.findMany({
        where: { userId: uid },
        orderBy: { measuredAt: "desc" },
      });
      res.json(rows.map(rowToWeightEntry));
    } catch (e) {
      next(e);
    }
  });

  /** Idempotent upsert for offline sync (client supplies id). */
  app.put("/api/weight/:id", needUser, async (req, res, next) => {
    try {
      const body = parseJsonBody<WeightEntryInput>(req, res);
      if (!body) return;
      if (!validateWeightEntryInput(body, res)) return;

      const id = routeParam(req.params.id);
      const uid = userId(req);
      const existing = await db.weightEntry.findUnique({
        where: { id },
        select: { userId: true },
      });
      if (existing && existing.userId !== uid) {
        res.status(403).json({ error: "Weight entry belongs to another account" });
        return;
      }
      const note = body.note?.trim() ?? null;
      const measuredAt = new Date(body.measuredAt);
      await db.weightEntry.upsert({
        where: { id },
        create: {
          id,
          userId: uid,
          measuredAt,
          weight: body.weight,
          unit: body.unit,
          note,
        },
        update: {
          userId: uid,
          measuredAt,
          weight: body.weight,
          unit: body.unit,
          note,
        },
      });
      const row = await db.weightEntry.findFirstOrThrow({
        where: { id, userId: uid },
      });
      res.json(rowToWeightEntry(row));
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/weight/:id", needUser, async (req, res, next) => {
    try {
      const id = routeParam(req.params.id);
      const r = await db.weightEntry.deleteMany({
        where: { id, userId: userId(req) },
      });
      if (r.count === 0) {
        res.status(404).json({ error: "Weight entry not found" });
        return;
      }
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });
}
