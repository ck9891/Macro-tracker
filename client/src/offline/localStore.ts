import type { PlannedMeal, Recipe, WeightEntry } from "../types.js";

const DB_NAME = "macro-tracker-v1";
const DB_VERSION = 2;

export type OutboxOp =
  | { kind: "recipe.put"; id: string; body: Omit<Recipe, "id"> }
  | { kind: "recipe.delete"; id: string }
  | { kind: "plan.put"; id: string; recipeId: string; servingsMultiplier: number }
  | { kind: "plan.patch"; id: string; recipeId: string; servingsMultiplier: number }
  | { kind: "plan.delete"; id: string }
  | { kind: "plan.clear" }
  | { kind: "weight.put"; id: string; body: Omit<WeightEntry, "id"> }
  | { kind: "weight.delete"; id: string };

export type OutboxEntry = {
  id: string;
  createdAt: number;
  op: OutboxOp;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("recipes")) {
          db.createObjectStore("recipes", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("plan")) {
          db.createObjectStore("plan", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("weight")) {
          db.createObjectStore("weight", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id" });
        }
      };
    });
  }
  return dbPromise;
}

function reqDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const localStore = {
  async getAllRecipes(): Promise<Recipe[]> {
    const db = await openDb();
    const t = db.transaction(["recipes"], "readonly");
    return reqDone(t.objectStore("recipes").getAll() as IDBRequest<Recipe[]>);
  },

  async getRecipe(id: string): Promise<Recipe | undefined> {
    const db = await openDb();
    const t = db.transaction(["recipes"], "readonly");
    return reqDone(t.objectStore("recipes").get(id) as IDBRequest<Recipe | undefined>);
  },

  async putRecipe(recipe: Recipe): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["recipes"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("recipes").put(recipe);
    });
  },

  async deleteRecipe(id: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["recipes"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("recipes").delete(id);
    });
  },

  async replaceRecipes(recipes: Recipe[]): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["recipes"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      const st = t.objectStore("recipes");
      st.clear();
      for (const r of recipes) st.put(r);
    });
  },

  async getAllPlan(): Promise<PlannedMeal[]> {
    const db = await openDb();
    const t = db.transaction(["plan"], "readonly");
    return reqDone(t.objectStore("plan").getAll() as IDBRequest<PlannedMeal[]>);
  },

  async putPlanMeal(meal: PlannedMeal): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["plan"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("plan").put(meal);
    });
  },

  async deletePlanMeal(id: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["plan"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("plan").delete(id);
    });
  },

  async clearPlan(): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["plan"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("plan").clear();
    });
  },

  async replacePlan(plan: PlannedMeal[]): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["plan"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      const st = t.objectStore("plan");
      st.clear();
      for (const p of plan) st.put(p);
    });
  },

  async getAllWeight(): Promise<WeightEntry[]> {
    const db = await openDb();
    const t = db.transaction(["weight"], "readonly");
    return reqDone(t.objectStore("weight").getAll() as IDBRequest<WeightEntry[]>);
  },

  async putWeight(entry: WeightEntry): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["weight"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("weight").put(entry);
    });
  },

  async deleteWeight(id: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["weight"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("weight").delete(id);
    });
  },

  async replaceWeight(entries: WeightEntry[]): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["weight"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      const st = t.objectStore("weight");
      st.clear();
      for (const e of entries) st.put(e);
    });
  },

  async getMeta(key: string): Promise<unknown> {
    const db = await openDb();
    const t = db.transaction(["meta"], "readonly");
    return reqDone(t.objectStore("meta").get(key));
  },

  async setMeta(key: string, value: unknown): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["meta"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("meta").put(value, key);
    });
  },

  async enqueue(entry: OutboxEntry): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["outbox"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("outbox").put(entry);
    });
  },

  async listOutbox(): Promise<OutboxEntry[]> {
    const db = await openDb();
    const t = db.transaction(["outbox"], "readonly");
    return reqDone(t.objectStore("outbox").getAll() as IDBRequest<OutboxEntry[]>);
  },

  async removeOutbox(id: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["outbox"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("outbox").delete(id);
    });
  },
};
