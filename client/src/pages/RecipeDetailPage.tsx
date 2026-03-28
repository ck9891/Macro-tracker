import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Recipe } from "../api.js";

export function RecipeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .getRecipe(id)
      .then((r) => {
        if (!cancelled) setRecipe(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function addToPlan() {
    if (!recipe) return;
    setBusy(true);
    try {
      await api.addToPlan(recipe.id, 1);
      navigate("/plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function removeRecipe() {
    if (!recipe || !confirm(`Delete “${recipe.name}”?`)) return;
    setBusy(true);
    try {
      await api.deleteRecipe(recipe.id);
      navigate("/recipes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  if (error && !recipe) {
    return (
      <>
        <h1 className="page-title">Recipe</h1>
        <div className="error-banner">{error}</div>
        <Link to="/recipes" className="btn">
          Back
        </Link>
      </>
    );
  }

  if (!recipe) {
    return (
      <>
        <h1 className="page-title">Recipe</h1>
        <p className="loader">Loading…</p>
      </>
    );
  }

  return (
    <>
      <div className="button-row" style={{ marginBottom: "1rem" }}>
        <Link to="/recipes" className="btn btn-ghost">
          ← All recipes
        </Link>
        <Link to={`/recipes/${recipe.id}/edit`} className="btn">
          Edit
        </Link>
      </div>
      <h1 className="page-title">{recipe.name}</h1>
      <p className="page-lede">
        <span className="mono">{recipe.durationMinutes} min</span>
        <span className="muted"> · </span>
        <span className="mono">{recipe.servings} servings</span>
        <span className="muted"> · </span>
        <span className="mono">
          {Math.round(recipe.calories)} kcal · P {recipe.proteinG}g · C {recipe.carbsG}g · F {recipe.fatG}g
        </span>
      </p>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="split split-2">
        <section className="card">
          <h2>Ingredients</h2>
          <ul className="list-plain">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {ing.name}
                {ing.amount != null ? (
                  <>
                    {" "}
                    <span className="muted mono">
                      — {ing.amount}
                      {ing.unit ? ` ${ing.unit}` : ""}
                    </span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Steps</h2>
          <ol className="list-plain">
            {recipe.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      </div>
      <div className="button-row" style={{ marginTop: "1.25rem" }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void addToPlan()}>
          Add to meal plan
        </button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void removeRecipe()}>
          Delete recipe
        </button>
      </div>
    </>
  );
}
