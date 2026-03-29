import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <>
      <h1 className="page-title">Plan meals, merge groceries, stay on macros</h1>
      <p className="page-lede">
        Add recipes with prep or cook time and per-recipe macros. Build a meal plan with optional batch
        multipliers. Your grocery list merges duplicate ingredients when units match and shows what each
        recipe contributed.
      </p>
      <div className="card-grid">
        <section className="card">
          <h2>Recipes</h2>
          <p className="muted">Duration, servings, ingredients, steps, and macro totals.</p>
          <div className="button-row">
            <Link to="/recipes" className="btn btn-primary">
              Browse recipes
            </Link>
          </div>
        </section>
        <section className="card">
          <h2>Meal plan</h2>
          <p className="muted">Pick what you are cooking; scale batches without retyping ingredients.</p>
          <div className="button-row">
            <Link to="/plan" className="btn btn-primary">
              Open plan
            </Link>
          </div>
        </section>
        <section className="card">
          <h2>Smart grocery list</h2>
          <p className="muted">Auto-built from your plan with merged lines and macro rollups.</p>
          <div className="button-row">
            <Link to="/grocery" className="btn btn-primary">
              View list
            </Link>
          </div>
        </section>
        <section className="card">
          <h2>Weight</h2>
          <p className="muted">Log measurements with a time and optional note; synced like the rest of your data.</p>
          <div className="button-row">
            <Link to="/weight" className="btn btn-primary">
              Track weight
            </Link>
          </div>
        </section>
        <section className="card">
          <h2>Photo import</h2>
          <p className="muted">Optional OCR in the browser to draft ingredients and steps from a picture.</p>
          <div className="button-row">
            <Link to="/import" className="btn btn-primary">
              Import
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
