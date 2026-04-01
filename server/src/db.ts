import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, LEGACY_USER_ID } from "./auth.js";
import type { Ingredient, ProgressDay, Recipe, RecipeInput, WeightEntry } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH ?? path.join(__dirname, "..", "data", "app.db");

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

function migrateAuthAndUserScope(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      method TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS magic_login_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  if (!tableHasColumn(db, "users", "is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }

  if (!tableHasColumn(db, "recipes", "user_id")) {
    db.exec("ALTER TABLE recipes ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  }
  if (!tableHasColumn(db, "planned_meals", "user_id")) {
    db.exec(
      "ALTER TABLE planned_meals ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE",
    );
  }
  if (!tableHasColumn(db, "weight_entries", "user_id")) {
    db.exec(
      "ALTER TABLE weight_entries ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE",
    );
  }
  if (!tableHasColumn(db, "daily_progress", "user_id")) {
    db.exec(
      "ALTER TABLE daily_progress ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE",
    );
  }

  const legacyEmail = "legacy@local";
  const hasLegacy = db.prepare("SELECT 1 FROM users WHERE id = ?").get(LEGACY_USER_ID);
  if (!hasLegacy) {
    db.prepare(
      "INSERT INTO users (id, email, password_hash, totp_enabled) VALUES (?, ?, NULL, 0)",
    ).run(LEGACY_USER_ID, legacyEmail);
  }

  db.prepare("UPDATE recipes SET user_id = ? WHERE user_id IS NULL").run(LEGACY_USER_ID);
  db.prepare("UPDATE planned_meals SET user_id = ? WHERE user_id IS NULL").run(LEGACY_USER_ID);
  db.prepare("UPDATE weight_entries SET user_id = ? WHERE user_id IS NULL").run(LEGACY_USER_ID);
  db.prepare("UPDATE daily_progress SET user_id = ? WHERE user_id IS NULL").run(LEGACY_USER_ID);
}

export const TEST_ADMIN_USER_ID = "00000000-0000-0000-0000-000000000002";

/** Sample recipes for empty DBs and dev accounts (meal plan + grocery merge testing). */
export const SAMPLE_RECIPES: RecipeInput[] = [
  {
    name: "Greek yogurt bowl",
    durationMinutes: 5,
    servings: 1,
    calories: 320,
    proteinG: 28,
    carbsG: 32,
    fatG: 8,
    ingredients: [
      { name: "Greek yogurt", amount: 200, unit: "g" },
      { name: "Blueberries", amount: 80, unit: "g" },
      { name: "Honey", amount: 1, unit: "tbsp" },
      { name: "Granola", amount: 30, unit: "g" },
    ],
    steps: [
      "Add yogurt to a bowl.",
      "Top with blueberries and granola.",
      "Drizzle honey and serve.",
    ],
  },
  {
    name: "Chicken stir-fry",
    durationMinutes: 35,
    servings: 4,
    calories: 420,
    proteinG: 38,
    carbsG: 28,
    fatG: 16,
    ingredients: [
      { name: "Chicken breast", amount: 600, unit: "g" },
      { name: "Bell pepper", amount: 2, unit: "whole" },
      { name: "Broccoli", amount: 300, unit: "g" },
      { name: "Soy sauce", amount: 3, unit: "tbsp" },
      { name: "Garlic", amount: 3, unit: "cloves" },
      { name: "Olive oil", amount: 2, unit: "tbsp" },
      { name: "Jasmine rice", amount: 2, unit: "cups" },
    ],
    steps: [
      "Cook rice according to package directions.",
      "Slice chicken and vegetables.",
      "Stir-fry chicken in oil until cooked through.",
      "Add vegetables, garlic, and soy sauce; cook until tender.",
      "Serve over rice.",
    ],
  },
  {
    name: "Overnight oats",
    durationMinutes: 10,
    servings: 2,
    calories: 380,
    proteinG: 14,
    carbsG: 58,
    fatG: 10,
    ingredients: [
      { name: "Rolled oats", amount: 120, unit: "g" },
      { name: "Milk", amount: 400, unit: "ml" },
      { name: "Banana", amount: 1, unit: "whole" },
      { name: "Honey", amount: 2, unit: "tbsp" },
      { name: "Chia seeds", amount: 1, unit: "tbsp" },
    ],
    steps: [
      "Mix oats, milk, chia, and honey in a jar.",
      "Refrigerate overnight.",
      "Top with sliced banana before serving.",
    ],
  },
  {
    name: "Pasta marinara",
    durationMinutes: 25,
    servings: 4,
    calories: 480,
    proteinG: 16,
    carbsG: 72,
    fatG: 14,
    ingredients: [
      { name: "Spaghetti", amount: 400, unit: "g" },
      { name: "Canned tomatoes", amount: 800, unit: "g" },
      { name: "Garlic", amount: 4, unit: "cloves" },
      { name: "Olive oil", amount: 3, unit: "tbsp" },
      { name: "Fresh basil", amount: 12, unit: "g" },
    ],
    steps: [
      "Sauté garlic in olive oil until fragrant.",
      "Add tomatoes; simmer 15 minutes.",
      "Cook pasta; toss with sauce and basil.",
    ],
  },
  {
    name: "Simple green salad",
    durationMinutes: 10,
    servings: 2,
    calories: 180,
    proteinG: 4,
    carbsG: 12,
    fatG: 14,
    ingredients: [
      { name: "Mixed greens", amount: 120, unit: "g" },
      { name: "Cucumber", amount: 0.5, unit: "whole" },
      { name: "Olive oil", amount: 2, unit: "tbsp" },
      { name: "Lemon juice", amount: 1, unit: "tbsp" },
    ],
    steps: ["Whisk lemon juice and olive oil for dressing.", "Toss greens and cucumber; dress and serve."],
  },
];

function insertRecipesForUser(db: Database.Database, userId: string, recipes: RecipeInput[]) {
  const insert = db.prepare(`
    INSERT INTO recipes (id, user_id, name, duration_minutes, servings, calories, protein_g, carbs_g, fat_g, ingredients_json, steps_json)
    VALUES (@id, @user_id, @name, @duration_minutes, @servings, @calories, @protein_g, @carbs_g, @fat_g, @ingredients_json, @steps_json)
  `);
  for (const r of recipes) {
    insert.run({
      id: crypto.randomUUID(),
      user_id: userId,
      name: r.name,
      duration_minutes: r.durationMinutes,
      servings: r.servings,
      calories: r.calories,
      protein_g: r.proteinG,
      carbs_g: r.carbsG,
      fat_g: r.fatG,
      ingredients_json: JSON.stringify(r.ingredients),
      steps_json: JSON.stringify(r.steps),
    });
  }
}

/**
 * Ensures legacy and test-admin accounts have demo recipes when they have none,
 * so meal plan and grocery features are testable after login.
 */
export function seedDemoRecipesForDevAccounts(db: Database.Database) {
  const allow =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_TEST_ADMIN === "1";
  const targets = [LEGACY_USER_ID];
  if (allow) targets.push(TEST_ADMIN_USER_ID);

  for (const uid of targets) {
    const exists = db.prepare("SELECT 1 FROM users WHERE id = ?").get(uid);
    if (!exists) continue;
    const c = db.prepare("SELECT COUNT(*) as c FROM recipes WHERE user_id = ?").get(uid) as { c: number };
    if (c.c > 0) continue;
    insertRecipesForUser(db, uid, SAMPLE_RECIPES);
  }
}

/** Dev (or ENABLE_TEST_ADMIN=1) seeded account with is_admin; credentials from env or defaults. */
export function seedTestAdmin(db: Database.Database) {
  const allow =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_TEST_ADMIN === "1";
  if (!allow) return;

  const email = (process.env.TEST_ADMIN_EMAIL ?? "test.admin@local").toLowerCase();
  const password = process.env.TEST_ADMIN_PASSWORD ?? "TestAdmin123!";
  const passwordHash = hashPassword(password);

  const existing = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email) as
    | { id: string }
    | undefined;
  if (existing) {
    db.prepare(
      "UPDATE users SET password_hash = ?, totp_enabled = 0, totp_secret = NULL, is_admin = 1 WHERE id = ?",
    ).run(passwordHash, existing.id);
    return;
  }

  db.prepare(
    "INSERT INTO users (id, email, password_hash, totp_enabled, is_admin) VALUES (?, ?, ?, 0, 1)",
  ).run(TEST_ADMIN_USER_ID, email, passwordHash);
}

export function openDb() {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      servings INTEGER NOT NULL,
      calories REAL NOT NULL,
      protein_g REAL NOT NULL,
      carbs_g REAL NOT NULL,
      fat_g REAL NOT NULL,
      ingredients_json TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS planned_meals (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      servings_multiplier REAL NOT NULL DEFAULT 1,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS weight_entries (
      id TEXT PRIMARY KEY,
      measured_at TEXT NOT NULL,
      weight REAL NOT NULL,
      unit TEXT NOT NULL,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_progress (
      day TEXT PRIMARY KEY,
      calories REAL NOT NULL,
      protein_g REAL NOT NULL,
      carbs_g REAL NOT NULL,
      fat_g REAL NOT NULL,
      weight_kg REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  migrateAuthAndUserScope(db);
  migrateDailyProgressCompositePk(db);
  seedTestAdmin(db);
  return db;
}

/** Rebuild daily_progress so each user has their own row per calendar day. */
function migrateDailyProgressCompositePk(db: Database.Database) {
  const exists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='daily_progress'")
    .get();
  if (!exists) return;

  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='daily_progress'").get() as
    | { sql: string }
    | undefined;
  const sql = row?.sql?.toLowerCase() ?? "";
  if (sql.includes("primary key (user_id, day)") || sql.includes("primary key(user_id,day)")) {
    return;
  }

  db.exec(`
    CREATE TABLE daily_progress_next (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      calories REAL NOT NULL,
      protein_g REAL NOT NULL,
      carbs_g REAL NOT NULL,
      fat_g REAL NOT NULL,
      weight_kg REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, day)
    );
  `);
  db.exec(`
    INSERT OR REPLACE INTO daily_progress_next (user_id, day, calories, protein_g, carbs_g, fat_g, weight_kg, updated_at)
    SELECT user_id, day, calories, protein_g, carbs_g, fat_g, weight_kg, updated_at
    FROM daily_progress;
  `);
  db.exec("DROP TABLE daily_progress;");
  db.exec("ALTER TABLE daily_progress_next RENAME TO daily_progress;");
}

export function rowToRecipe(row: {
  id: string;
  name: string;
  duration_minutes: number;
  servings: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients_json: string;
  steps_json: string;
}): Recipe {
  return {
    id: row.id,
    name: row.name,
    durationMinutes: row.duration_minutes,
    servings: row.servings,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    ingredients: JSON.parse(row.ingredients_json) as Ingredient[],
    steps: JSON.parse(row.steps_json) as string[],
  };
}

export function rowToWeightEntry(row: {
  id: string;
  measured_at: string;
  weight: number;
  unit: string;
  note: string | null;
}): WeightEntry {
  return {
    id: row.id,
    measuredAt: row.measured_at,
    weight: row.weight,
    unit: row.unit as WeightEntry["unit"],
    ...(row.note != null && row.note !== "" ? { note: row.note } : {}),
  };
}

export function rowToProgressDay(row: {
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

/** When the DB has no recipes at all, seed the legacy user (first-run / migration). */
export function seedIfEmpty(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) as c FROM recipes").get() as { c: number };
  if (count.c > 0) return;
  insertRecipesForUser(db, LEGACY_USER_ID, SAMPLE_RECIPES);
}
