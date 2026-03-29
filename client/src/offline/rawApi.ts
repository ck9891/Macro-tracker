import type { PlannedMeal, ProgressDay, Recipe } from "../types.js";

export type SyncPack = {
  recipes: Recipe[];
  plan: PlannedMeal[];
  progress: ProgressDay[];
  serverTime: string;
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Direct network API (no offline layer). */
export const rawApi = {
  health: () => fetch("/api/health").then((r) => json<{ ok: boolean }>(r)),

  getSyncPack: () => fetch("/api/sync").then((r) => json<SyncPack>(r)),

  putRecipe: (id: string, body: Omit<Recipe, "id">) =>
    fetch(`/api/recipes/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<Recipe>(r)),

  deleteRecipe: (id: string) =>
    fetch(`/api/recipes/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => json<void>(r)),

  putPlanMeal: (id: string, recipeId: string, servingsMultiplier: number) =>
    fetch(`/api/plan/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, servingsMultiplier }),
    }).then((r) => json<PlannedMeal>(r)),

  deletePlanMeal: (id: string) =>
    fetch(`/api/plan/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => json<void>(r)),

  clearPlan: () => fetch("/api/plan", { method: "DELETE" }).then((r) => json<void>(r)),

  putProgress: (day: string, body: Omit<ProgressDay, "day">) =>
    fetch(`/api/progress/${encodeURIComponent(day)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calories: body.calories,
        proteinG: body.proteinG,
        carbsG: body.carbsG,
        fatG: body.fatG,
        weightKg: body.weightKg,
      }),
    }).then((r) => json<ProgressDay>(r)),

  deleteProgress: async (day: string) => {
    const res = await fetch(`/api/progress/${encodeURIComponent(day)}`, { method: "DELETE" });
    if (res.status === 204 || res.status === 404) return;
    await json<void>(res);
  },
};
