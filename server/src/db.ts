import { PrismaClient } from "@prisma/client";
import { LEGACY_USER_ID } from "./constants.js";
import { hashPassword } from "./password.js";
import type { Ingredient, ProgressDay, Recipe, RecipeInput, WeightEntry } from "./types.js";

export const TEST_ADMIN_USER_ID = "00000000-0000-0000-0000-000000000002";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

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

async function insertRecipesForUser(userId: string, recipes: RecipeInput[]) {
  for (const r of recipes) {
    await prisma.recipe.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        name: r.name,
        durationMinutes: Math.round(r.durationMinutes),
        servings: r.servings,
        calories: r.calories,
        proteinG: r.proteinG,
        carbsG: r.carbsG,
        fatG: r.fatG,
        ingredientsJson: JSON.stringify(r.ingredients),
        stepsJson: JSON.stringify(r.steps),
      },
    });
  }
}

/**
 * Ensures legacy and test-admin accounts have demo recipes when they have none,
 * so meal plan and grocery features are testable after login.
 */
export async function seedDemoRecipesForDevAccounts() {
  const allow =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_TEST_ADMIN === "1";
  const targets = [LEGACY_USER_ID];
  if (allow) targets.push(TEST_ADMIN_USER_ID);

  for (const uid of targets) {
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) continue;
    const c = await prisma.recipe.count({ where: { userId: uid } });
    if (c > 0) continue;
    await insertRecipesForUser(uid, SAMPLE_RECIPES);
  }
}

/** Dev (or ENABLE_TEST_ADMIN=1) seeded account with is_admin; credentials from env or defaults. */
export async function seedTestAdmin() {
  const allow =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_TEST_ADMIN === "1";
  if (!allow) return;

  const email = (process.env.TEST_ADMIN_EMAIL ?? "test.admin@local").toLowerCase();
  const password = process.env.TEST_ADMIN_PASSWORD ?? "TestAdmin123!";
  const passwordHash = hashPassword(password);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        totpEnabled: false,
        totpSecret: null,
        isAdmin: true,
      },
    });
    return;
  }

  await prisma.user.create({
    data: {
      id: TEST_ADMIN_USER_ID,
      email,
      passwordHash,
      totpEnabled: false,
      isAdmin: true,
    },
  });
}

async function ensureLegacyUser() {
  await prisma.user.upsert({
    where: { id: LEGACY_USER_ID },
    create: {
      id: LEGACY_USER_ID,
      email: "legacy@local",
      passwordHash: null,
      totpEnabled: false,
      isAdmin: false,
    },
    update: {},
  });
}

export async function connectDb() {
  await prisma.$connect();
  await ensureLegacyUser();
  await seedTestAdmin();
}

export function rowToRecipe(row: {
  id: string;
  name: string;
  durationMinutes: number;
  servings: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  ingredientsJson: string;
  stepsJson: string;
}): Recipe {
  return {
    id: row.id,
    name: row.name,
    durationMinutes: row.durationMinutes,
    servings: row.servings,
    calories: row.calories,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    ingredients: JSON.parse(row.ingredientsJson) as Ingredient[],
    steps: JSON.parse(row.stepsJson) as string[],
  };
}

export function rowToWeightEntry(row: {
  id: string;
  measuredAt: Date;
  weight: number;
  unit: string;
  note: string | null;
}): WeightEntry {
  return {
    id: row.id,
    measuredAt: row.measuredAt.toISOString(),
    weight: row.weight,
    unit: row.unit as WeightEntry["unit"],
    ...(row.note != null && row.note !== "" ? { note: row.note } : {}),
  };
}

export function rowToProgressDay(row: {
  day: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  weightKg: number | null;
}): ProgressDay {
  return {
    day: row.day,
    calories: row.calories,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    weightKg: row.weightKg == null ? null : row.weightKg,
  };
}

/** When the DB has no recipes at all, seed the legacy user (first-run / migration). */
export async function seedIfEmpty() {
  const count = await prisma.recipe.count();
  if (count > 0) return;
  await insertRecipesForUser(LEGACY_USER_ID, SAMPLE_RECIPES);
}
