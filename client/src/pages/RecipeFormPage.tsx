import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Ingredient, type Recipe } from "../api.js";

function emptyRecipe(): Omit<Recipe, "id"> {
  return {
    name: "",
    durationMinutes: 30,
    servings: 2,
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    ingredients: [{ name: "", amount: undefined, unit: undefined }],
    steps: [""],
  };
}

export function RecipeFormPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [form, setForm] = useState<Omit<Recipe, "id">>(emptyRecipe);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew || !id) return;
    let cancelled = false;
    api
      .getRecipe(id)
      .then((r) => {
        if (cancelled) return;
        const { id: _i, ...rest } = r;
        setForm(rest);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function setIngredient(index: number, patch: Partial<Ingredient>) {
    setForm((f) => {
      const ingredients = [...f.ingredients];
      ingredients[index] = { ...ingredients[index], ...patch };
      return { ...f, ingredients };
    });
  }

  function addIngredient() {
    setForm((f) => ({
      ...f,
      ingredients: [...f.ingredients, { name: "", amount: undefined, unit: undefined }],
    }));
  }

  function removeIngredient(index: number) {
    setForm((f) => ({
      ...f,
      ingredients: f.ingredients.filter((_, i) => i !== index),
    }));
  }

  function setStep(index: number, value: string) {
    setForm((f) => {
      const steps = [...f.steps];
      steps[index] = value;
      return { ...f, steps };
    });
  }

  function addStep() {
    setForm((f) => ({ ...f, steps: [...f.steps, ""] }));
  }

  function removeStep(index: number) {
    setForm((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== index) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ingredients = form.ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({
        name: i.name.trim(),
        amount:
          i.amount === undefined || Number.isNaN(Number(i.amount)) ? undefined : Number(i.amount),
        unit: i.unit?.trim() || undefined,
      }));
    const steps = form.steps.map((s) => s.trim()).filter(Boolean);
    const body: Omit<Recipe, "id"> = {
      ...form,
      name: form.name.trim(),
      ingredients,
      steps,
    };
    try {
      if (isNew) {
        const created = await api.createRecipe(body);
        navigate(`/recipes/${created.id}`);
      } else if (id) {
        await api.updateRecipe(id, body);
        navigate(`/recipes/${id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  if (loading) {
    return <p className="loader">Loading recipe…</p>;
  }

  return (
    <>
      <div className="button-row" style={{ marginBottom: "1rem" }}>
        <Link to={isNew ? "/recipes" : `/recipes/${id}`} className="btn btn-ghost">
          ← Cancel
        </Link>
      </div>
      <h1 className="page-title">{isNew ? "New recipe" : "Edit recipe"}</h1>
      <p className="page-lede">
        Macros are totals for the entire recipe (all servings). The app scales ingredients from the meal
        plan using servings and batch multiplier.
      </p>
      {error ? <div className="error-banner">{error}</div> : null}
      <form onSubmit={(e) => void submit(e)} className="card" style={{ padding: "1.25rem" }}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="field-inline">
          <div className="field">
            <label htmlFor="duration">Duration (minutes)</label>
            <input
              id="duration"
              type="number"
              min={0}
              step={1}
              value={form.durationMinutes}
              onChange={(e) =>
                setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))
              }
              required
            />
          </div>
          <div className="field">
            <label htmlFor="servings">Servings (portions)</label>
            <input
              id="servings"
              type="number"
              min={1}
              step={1}
              value={form.servings}
              onChange={(e) => setForm((f) => ({ ...f, servings: Number(e.target.value) }))}
              required
            />
          </div>
        </div>
        <div className="field-inline" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="field">
            <label htmlFor="cal">Calories (total)</label>
            <input
              id="cal"
              type="number"
              min={0}
              step={1}
              value={form.calories}
              onChange={(e) => setForm((f) => ({ ...f, calories: Number(e.target.value) }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="p">Protein g</label>
            <input
              id="p"
              type="number"
              min={0}
              step={0.1}
              value={form.proteinG}
              onChange={(e) => setForm((f) => ({ ...f, proteinG: Number(e.target.value) }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="c">Carbs g</label>
            <input
              id="c"
              type="number"
              min={0}
              step={0.1}
              value={form.carbsG}
              onChange={(e) => setForm((f) => ({ ...f, carbsG: Number(e.target.value) }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="f">Fat g</label>
            <input
              id="f"
              type="number"
              min={0}
              step={0.1}
              value={form.fatG}
              onChange={(e) => setForm((f) => ({ ...f, fatG: Number(e.target.value) }))}
              required
            />
          </div>
        </div>
        <h2 style={{ marginTop: "0.5rem", fontSize: "1.1rem" }}>Ingredients</h2>
        {form.ingredients.map((ing, index) => (
          <div key={index} className="field-inline" style={{ alignItems: "end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Item</label>
              <input
                value={ing.name}
                onChange={(e) => setIngredient(index, { name: e.target.value })}
                placeholder="e.g. Olive oil"
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Amount</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={ing.amount ?? ""}
                onChange={(e) =>
                  setIngredient(index, {
                    amount: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Unit</label>
              <input
                value={ing.unit ?? ""}
                onChange={(e) => setIngredient(index, { unit: e.target.value })}
                placeholder="g, tbsp…"
              />
            </div>
            <button type="button" className="btn btn-danger" onClick={() => removeIngredient(index)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={addIngredient}>
          Add ingredient
        </button>

        <h2 style={{ marginTop: "1.25rem", fontSize: "1.1rem" }}>Steps</h2>
        {form.steps.map((s, index) => (
          <div key={index} className="field" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem", alignItems: "start" }}>
            <textarea value={s} onChange={(e) => setStep(index, e.target.value)} placeholder={`Step ${index + 1}`} />
            <button type="button" className="btn btn-danger" onClick={() => removeStep(index)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={addStep}>
          Add step
        </button>

        <div className="button-row" style={{ marginTop: "1.5rem" }}>
          <button type="submit" className="btn btn-primary">
            Save recipe
          </button>
        </div>
      </form>
    </>
  );
}
