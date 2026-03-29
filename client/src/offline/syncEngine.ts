import { computeGroceryFromLocal } from "../lib/grocery.js";
import type { PlannedMeal, ProgressDay, Recipe } from "../types.js";
import { localStore, type OutboxEntry } from "./localStore.js";
import { rawApi } from "./rawApi.js";

const LAST_SYNC_KEY = "lastSyncedAt";

export type Connectivity = "online" | "offline" | "unknown";

function sortOutbox(entries: OutboxEntry[]): OutboxEntry[] {
  return [...entries].sort((a, b) => a.createdAt - b.createdAt);
}

async function applyOpToLocal(op: OutboxEntry["op"]): Promise<void> {
  switch (op.kind) {
    case "recipe.put": {
      const recipe: Recipe = { id: op.id, ...op.body };
      await localStore.putRecipe(recipe);
      break;
    }
    case "recipe.delete":
      await localStore.deleteRecipe(op.id);
      break;
    case "plan.put":
      await localStore.putPlanMeal({
        id: op.id,
        recipeId: op.recipeId,
        servingsMultiplier: op.servingsMultiplier,
      });
      break;
    case "plan.patch":
      await localStore.putPlanMeal({
        id: op.id,
        recipeId: op.recipeId,
        servingsMultiplier: op.servingsMultiplier,
      });
      break;
    case "plan.delete":
      await localStore.deletePlanMeal(op.id);
      break;
    case "plan.clear":
      await localStore.clearPlan();
      break;
    case "progress.put": {
      const row: ProgressDay = { day: op.day, ...op.body };
      await localStore.putProgress(row);
      break;
    }
    case "progress.delete":
      await localStore.deleteProgress(op.day);
      break;
    default:
      break;
  }
}

async function sendOp(entry: OutboxEntry): Promise<void> {
  const { op } = entry;
  switch (op.kind) {
    case "recipe.put":
      await rawApi.putRecipe(op.id, op.body);
      break;
    case "recipe.delete":
      await rawApi.deleteRecipe(op.id);
      break;
    case "plan.put":
      await rawApi.putPlanMeal(op.id, op.recipeId, op.servingsMultiplier);
      break;
    case "plan.patch":
      await rawApi.putPlanMeal(op.id, op.recipeId, op.servingsMultiplier);
      break;
    case "plan.delete":
      await rawApi.deletePlanMeal(op.id);
      break;
    case "plan.clear":
      await rawApi.clearPlan();
      break;
    case "progress.put":
      await rawApi.putProgress(op.day, op.body);
      break;
    case "progress.delete":
      await rawApi.deleteProgress(op.day);
      break;
    default:
      break;
  }
}

export const syncEngine = {
  isOnline(): boolean {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  },

  async pullAndMergeLocal(): Promise<void> {
    const pack = await rawApi.getSyncPack();
    await localStore.replaceRecipes(pack.recipes);
    await localStore.replacePlan(pack.plan);
    await localStore.replaceProgress(pack.progress ?? []);
    await localStore.setMeta(LAST_SYNC_KEY, pack.serverTime);

    const pending = sortOutbox(await localStore.listOutbox());
    for (const e of pending) {
      await applyOpToLocal(e.op);
    }
  },

  async processOutbox(): Promise<{ processed: number; failed?: string }> {
    const pending = sortOutbox(await localStore.listOutbox());
    let processed = 0;
    for (const entry of pending) {
      try {
        await sendOp(entry);
        await localStore.removeOutbox(entry.id);
        processed += 1;
      } catch (e) {
        return {
          processed,
          failed: e instanceof Error ? e.message : "Sync failed",
        };
      }
    }
    return { processed };
  },

  async syncAll(): Promise<void> {
    await this.pullAndMergeLocal();
    const r = await this.processOutbox();
    if (r.failed) throw new Error(r.failed);
    await this.pullAndMergeLocal();
  },

  async getLastSyncedAt(): Promise<string | null> {
    const v = await localStore.getMeta(LAST_SYNC_KEY);
    return typeof v === "string" ? v : null;
  },

  computeGroceryOffline(recipes: Recipe[], plan: PlannedMeal[]) {
    return computeGroceryFromLocal(
      recipes,
      plan.map((p) => ({ recipeId: p.recipeId, servingsMultiplier: p.servingsMultiplier })),
    );
  },
};
