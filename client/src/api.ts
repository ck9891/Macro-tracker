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

export const api = {
  health: () => fetch("/api/health").then((r) => json<{ ok: boolean }>(r)),

  listRecipes: () => fetch("/api/recipes").then((r) => json<Recipe[]>(r)),

  getRecipe: (id: string) => fetch(`/api/recipes/${id}`).then((r) => json<Recipe>(r)),

  createRecipe: (body: Omit<Recipe, "id">) =>
    fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<Recipe>(r)),

  updateRecipe: (id: string, body: Omit<Recipe, "id">) =>
    fetch(`/api/recipes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<Recipe>(r)),

  deleteRecipe: (id: string) =>
    fetch(`/api/recipes/${id}`, { method: "DELETE" }).then((r) => json<void>(r)),

  getPlan: () => fetch("/api/plan").then((r) => json<PlannedMeal[]>(r)),

  addToPlan: (recipeId: string, servingsMultiplier?: number) =>
    fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId, servingsMultiplier }),
    }).then((r) => json<PlannedMeal>(r)),

  updatePlanItem: (id: string, servingsMultiplier: number) =>
    fetch(`/api/plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servingsMultiplier }),
    }).then((r) => json<PlannedMeal>(r)),

  removeFromPlan: (id: string) =>
    fetch(`/api/plan/${id}`, { method: "DELETE" }).then((r) => json<void>(r)),

  clearPlan: () => fetch("/api/plan", { method: "DELETE" }).then((r) => json<void>(r)),

  getGrocery: () => fetch("/api/grocery").then((r) => json<GroceryResponse>(r)),
};
