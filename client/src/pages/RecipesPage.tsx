import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Recipe } from "../api.js";
import { useMacroSync } from "../hooks/useMacroSync.js";

export function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .listRecipes()
      .then((r) => setRecipes(r))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useMacroSync(load);

  if (error) {
    return (
      <>
        <h1 className="page-title">Recipes</h1>
        <div className="error-banner" role="alert">
          {error}
        </div>
        <p className="muted">
          If you expected data here, connect once while online or start the API (port 3001 in dev).
        </p>
      </>
    );
  }

  if (!recipes) {
    return (
      <>
        <h1 className="page-title">Recipes</h1>
        <p className="loader">Loading recipes…</p>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Recipes</h1>
      <p className="page-lede">
        Each recipe stores total macros for the full batch (all servings). Duration is total active plus
        passive time you care to track, in minutes.
      </p>
      <div className="button-row" style={{ marginBottom: "1.25rem" }}>
        <Link to="/recipes/new" className="btn btn-primary">
          New recipe
        </Link>
      </div>
      <div className="card-grid">
        {recipes.map((r) => (
          <article key={r.id} className="card">
            <h2>{r.name}</h2>
            <div className="card-meta">
              <span>{r.durationMinutes} min</span>
              <span>{r.servings} servings</span>
            </div>
            <div className="card-meta">
              <span className="pill">{Math.round(r.calories)} kcal</span>
              <span className="pill">P {r.proteinG}g</span>
              <span className="pill">C {r.carbsG}g</span>
              <span className="pill">F {r.fatG}g</span>
            </div>
            <div className="button-row">
              <Link to={`/recipes/${r.id}`} className="btn btn-primary">
                Open
              </Link>
              <Link to={`/recipes/${r.id}/edit`} className="btn btn-ghost">
                Edit
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
