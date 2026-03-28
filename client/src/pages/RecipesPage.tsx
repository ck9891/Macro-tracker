import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Recipe } from "../api.js";

export function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listRecipes()
      .then((r) => {
        if (!cancelled) setRecipes(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <>
        <h1 className="page-title">Recipes</h1>
        <div className="error-banner" role="alert">
          {error}
        </div>
        <p className="muted">Start the API server (port 3001) or open the Docker deployment.</p>
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
