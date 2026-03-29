import type { PlannedMeal, ProgressDay, Recipe } from "../types.js";

const DB_NAME = "macro-tracker-v1";
const DB_VERSION = 2;

export type OutboxOp =
  | { kind: "recipe.put"; id: string; body: Omit<Recipe, "id"> }
  | { kind: "recipe.delete"; id: string }
  | { kind: "plan.put"; id: string; recipeId: string; servingsMultiplier: number }
  | { kind: "plan.patch"; id: string; recipeId: string; servingsMultiplier: number }
  | { kind: "plan.delete"; id: string }
  | { kind: "plan.clear" }
  | { kind: "progress.put"; day: string; body: Omit<ProgressDay, "day"> }
  | { kind: "progress.delete"; day: string };

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
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("progress")) {
          db.createObjectStore("progress", { keyPath: "day" });
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

  async getAllProgress(): Promise<ProgressDay[]> {
    const db = await openDb();
    const t = db.transaction(["progress"], "readonly");
    return reqDone(t.objectStore("progress").getAll() as IDBRequest<ProgressDay[]>);
  },

  async putProgress(row: ProgressDay): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["progress"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("progress").put(row);
    });
  },

  async deleteProgress(day: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["progress"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore("progress").delete(day);
    });
  },

  async replaceProgress(rows: ProgressDay[]): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(["progress"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      const st = t.objectStore("progress");
      st.clear();
      for (const r of rows) st.put(r);
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
