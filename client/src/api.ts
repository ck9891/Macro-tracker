import type { GroceryResponse, PlannedMeal, Recipe, WeightEntry } from "./types.js";
import { localStore, type OutboxEntry, type OutboxOp } from "./offline/localStore.js";
import { syncEngine } from "./offline/syncEngine.js";
import { rawApi } from "./offline/rawApi.js";
import { computeGroceryFromLocal } from "./lib/grocery.js";

export type {
  Ingredient,
  Recipe,
  PlannedMeal,
  GroceryLine,
  GroceryResponse,
  WeightEntry,
  WeightUnit,
} from "./types.js";

function emitSyncState() {
  window.dispatchEvent(new CustomEvent("macro-sync"));
}

function newOutboxId() {
  return crypto.randomUUID();
}

async function enqueue(op: OutboxOp): Promise<void> {
  const entry: OutboxEntry = {
    id: newOutboxId(),
    createdAt: Date.now(),
    op,
  };
  await localStore.enqueue(entry);
}

async function registerBackgroundSync(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync?.register("macro-outbox-sync");
  } catch {
    /* unsupported or denied */
  }
}

async function afterMutation(): Promise<void> {
  emitSyncState();
  if (syncEngine.isOnline()) {
    try {
      await syncEngine.syncAll();
    } catch {
      void registerBackgroundSync();
    }
    emitSyncState();
  } else {
    void registerBackgroundSync();
  }
}

export const api = {
  health: () => rawApi.health(),

  /** Full sync: pull server state, push outbox, pull again. */
  sync: () => syncEngine.syncAll(),

  listRecipes: async (): Promise<Recipe[]> => {
    return localStore.getAllRecipes();
  },

  getRecipe: async (id: string): Promise<Recipe> => {
    const r = await localStore.getRecipe(id);
    if (!r) throw new Error("Recipe not found");
    return r;
  },

  createRecipe: async (body: Omit<Recipe, "id">): Promise<Recipe> => {
    const id = crypto.randomUUID();
    const recipe: Recipe = { id, ...body };
    await localStore.putRecipe(recipe);
    await enqueue({ kind: "recipe.put", id, body });
    await afterMutation();
    return recipe;
  },

  updateRecipe: async (id: string, body: Omit<Recipe, "id">): Promise<Recipe> => {
    const recipe: Recipe = { id, ...body };
    await localStore.putRecipe(recipe);
    await enqueue({ kind: "recipe.put", id, body });
    await afterMutation();
    return recipe;
  },

  deleteRecipe: async (id: string): Promise<void> => {
    const plan = await localStore.getAllPlan();
    for (const row of plan) {
      if (row.recipeId === id) {
        await localStore.deletePlanMeal(row.id);
        await enqueue({ kind: "plan.delete", id: row.id });
      }
    }
    await localStore.deleteRecipe(id);
    await enqueue({ kind: "recipe.delete", id });
    await afterMutation();
  },

  getPlan: async (): Promise<PlannedMeal[]> => {
    return localStore.getAllPlan();
  },

  addToPlan: async (recipeId: string, servingsMultiplier?: number): Promise<PlannedMeal> => {
    const id = crypto.randomUUID();
    const mult = servingsMultiplier ?? 1;
    const meal: PlannedMeal = { id, recipeId, servingsMultiplier: mult };
    await localStore.putPlanMeal(meal);
    await enqueue({ kind: "plan.put", id, recipeId, servingsMultiplier: mult });
    await afterMutation();
    return meal;
  },

  updatePlanItem: async (id: string, servingsMultiplier: number): Promise<PlannedMeal> => {
    const plan = await localStore.getAllPlan();
    const row = plan.find((p) => p.id === id);
    if (!row) throw new Error("Planned meal not found");
    const updated: PlannedMeal = { ...row, servingsMultiplier };
    await localStore.putPlanMeal(updated);
    await enqueue({
      kind: "plan.patch",
      id,
      recipeId: row.recipeId,
      servingsMultiplier,
    });
    await afterMutation();
    return updated;
  },

  removeFromPlan: async (id: string): Promise<void> => {
    await localStore.deletePlanMeal(id);
    await enqueue({ kind: "plan.delete", id });
    await afterMutation();
  },

  clearPlan: async (): Promise<void> => {
    await localStore.clearPlan();
    await enqueue({ kind: "plan.clear" });
    await afterMutation();
  },

  getGrocery: async (): Promise<GroceryResponse> => {
    const [recipes, plan] = await Promise.all([localStore.getAllRecipes(), localStore.getAllPlan()]);
    return computeGroceryFromLocal(
      recipes,
      plan.map((p) => ({ recipeId: p.recipeId, servingsMultiplier: p.servingsMultiplier })),
    );
  },

  /** Bootstrap local DB from server when app loads (optional). */
  bootstrapFromNetwork: async (): Promise<void> => {
    if (!syncEngine.isOnline()) return;
    await syncEngine.syncAll();
    emitSyncState();
  },

  pendingCount: async (): Promise<number> => {
    const q = await localStore.listOutbox();
    return q.length;
  },

  lastSyncedAt: () => syncEngine.getLastSyncedAt(),

  isOnline: () => syncEngine.isOnline(),

  listWeightEntries: async (): Promise<WeightEntry[]> => {
    return localStore.getAllWeight();
  },

  addWeightEntry: async (body: Omit<WeightEntry, "id">): Promise<WeightEntry> => {
    const id = crypto.randomUUID();
    const entry: WeightEntry = { id, ...body };
    await localStore.putWeight(entry);
    await enqueue({ kind: "weight.put", id, body });
    await afterMutation();
    return entry;
  },

  deleteWeightEntry: async (id: string): Promise<void> => {
    await localStore.deleteWeight(id);
    await enqueue({ kind: "weight.delete", id });
    await afterMutation();
  },
};
