import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEGACY_USER_ID } from "./auth.js";
import type { Ingredient, Recipe, RecipeInput } from "./types.js";

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

  if (!tableHasColumn(db, "recipes", "user_id")) {
    db.exec("ALTER TABLE recipes ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE");
  }
  if (!tableHasColumn(db, "planned_meals", "user_id")) {
    db.exec(
      "ALTER TABLE planned_meals ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE",
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
  `);
  migrateAuthAndUserScope(db);
  return db;
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

export function seedIfEmpty(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) as c FROM recipes").get() as { c: number };
  if (count.c > 0) return;

  const samples: RecipeInput[] = [
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
  ];

  const insert = db.prepare(`
    INSERT INTO recipes (id, user_id, name, duration_minutes, servings, calories, protein_g, carbs_g, fat_g, ingredients_json, steps_json)
    VALUES (@id, @user_id, @name, @duration_minutes, @servings, @calories, @protein_g, @carbs_g, @fat_g, @ingredients_json, @steps_json)
  `);

  for (const r of samples) {
    const id = crypto.randomUUID();
    insert.run({
      id,
      user_id: LEGACY_USER_ID,
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
