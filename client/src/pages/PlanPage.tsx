import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PlannedMeal, type Recipe } from "../api.js";
import { useMacroSync } from "../hooks/useMacroSync.js";

export function PlanPage() {
  const [plan, setPlan] = useState<PlannedMeal[] | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.getPlan(), api.listRecipes()])
      .then(([p, r]) => {
        setPlan(p);
        setRecipes(r);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useMacroSync(load);

  const recipeById = useMemo(() => {
    const m = new Map<string, Recipe>();
    recipes?.forEach((r) => m.set(r.id, r));
    return m;
  }, [recipes]);

  async function updateMultiplier(id: string, value: number) {
    try {
      const updated = await api.updatePlanItem(id, value);
      setPlan((prev) => prev?.map((p) => (p.id === id ? updated : p)) ?? prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function remove(id: string) {
    try {
      await api.removeFromPlan(id);
      setPlan((prev) => prev?.filter((p) => p.id !== id) ?? prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function clear() {
    if (!confirm("Clear entire meal plan?")) return;
    try {
      await api.clearPlan();
      setPlan([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed");
    }
  }

  if (error && !plan) {
    return (
      <>
        <h1 className="page-title">Meal plan</h1>
        <div className="error-banner">{error}</div>
      </>
    );
  }

  if (!plan || !recipes) {
    return (
      <>
        <h1 className="page-title">Meal plan</h1>
        <p className="loader">Loading…</p>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Meal plan</h1>
      <p className="page-lede">
        Batch multiplier scales the whole recipe (ingredients and macro totals). Example:{" "}
        <span className="mono">2×</span> on a 4-serving recipe doubles every amount and doubles batch
        macros.
      </p>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="button-row" style={{ marginBottom: "1rem" }}>
        <Link to="/recipes" className="btn btn-primary">
          Add recipes
        </Link>
        <Link to="/grocery" className="btn">
          View grocery list
        </Link>
        {plan.length > 0 ? (
          <button type="button" className="btn btn-danger btn-ghost" onClick={() => void clear()}>
            Clear plan
          </button>
        ) : null}
      </div>
      {plan.length === 0 ? (
        <p className="muted">No meals planned yet. Open a recipe and use “Add to meal plan”, or pick from the recipe list.</p>
      ) : (
        <div className="card-grid" style={{ gridTemplateColumns: "1fr" }}>
          {plan.map((p) => {
            const r = recipeById.get(p.recipeId);
            return (
              <article key={p.id} className="card" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <h2 style={{ marginBottom: "0.25rem" }}>{r?.name ?? "Unknown recipe"}</h2>
                  <div className="card-meta">
                    {r ? (
                      <>
                        <span>{r.durationMinutes} min</span>
                        <span>
                          {Math.round(r.calories * p.servingsMultiplier)} kcal in plan
                        </span>
                      </>
                    ) : (
                      <span className="muted">Recipe missing — remove this row</span>
                    )}
                  </div>
                </div>
                <div className="field" style={{ margin: 0, minWidth: "140px" }}>
                  <label htmlFor={`m-${p.id}`}>Batch ×</label>
                  <input
                    id={`m-${p.id}`}
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={p.servingsMultiplier}
                    onChange={(e) => void updateMultiplier(p.id, Number(e.target.value))}
                  />
                </div>
                <div className="button-row" style={{ margin: 0 }}>
                  {r ? (
                    <Link to={`/recipes/${r.id}`} className="btn">
                      Recipe
                    </Link>
                  ) : null}
                  <button type="button" className="btn btn-danger" onClick={() => void remove(p.id)}>
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
