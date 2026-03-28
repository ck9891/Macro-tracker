import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type GroceryResponse } from "../api.js";

function formatAmount(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

export function GroceryPage() {
  const [data, setData] = useState<GroceryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getGrocery()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error && !data) {
    return (
      <>
        <h1 className="page-title">Grocery list</h1>
        <div className="error-banner">{error}</div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <h1 className="page-title">Grocery list</h1>
        <p className="loader">Loading…</p>
      </>
    );
  }

  const { lines, plannedCount, macroTotals } = data;

  return (
    <>
      <h1 className="page-title">Grocery list</h1>
      <p className="page-lede">
        Built from your meal plan. Items with the same name and unit are summed. Different units stay
        separate so nothing is double-counted incorrectly.
      </p>
      <div className="button-row" style={{ marginBottom: "1rem" }}>
        <Link to="/plan" className="btn btn-primary">
          Edit meal plan
        </Link>
      </div>
      {plannedCount === 0 ? (
        <p className="muted">Plan at least one recipe to populate the list.</p>
      ) : (
        <>
          <section className="card" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Macros for planned batches</h2>
            <p className="card-meta">
              <span className="pill">{Math.round(macroTotals.calories)} kcal</span>
              <span className="pill">P {macroTotals.proteinG.toFixed(1)}g</span>
              <span className="pill">C {macroTotals.carbsG.toFixed(1)}g</span>
              <span className="pill">F {macroTotals.fatG.toFixed(1)}g</span>
            </p>
            <p className="subtle">Totals assume recipe macros are stored per full batch.</p>
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Items</h2>
            {lines.map((line) => (
              <div key={line.key} className="grocery-line">
                <div className="grocery-total">
                  {line.displayName}
                  {line.totalAmount != null && line.unit ? (
                    <span className="muted mono">
                      {" "}
                      — {formatAmount(line.totalAmount)} {line.unit}
                    </span>
                  ) : null}
                </div>
                {line.parts.length > 0 ? (
                  <ul className="list-plain subtle" style={{ marginTop: "0.35rem" }}>
                    {line.parts.map((p, i) => (
                      <li key={i}>
                        {p.amount != null ? `${formatAmount(p.amount)}${p.unit ? ` ${p.unit}` : ""}` : "—"}
                        {p.note ? ` (${p.note})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <details style={{ marginTop: "0.35rem" }}>
                  <summary className="subtle" style={{ cursor: "pointer" }}>
                    From recipes
                  </summary>
                  <ul className="list-plain subtle">
                    {line.recipeRefs.map((r, i) => (
                      <li key={i}>
                        {r.recipeName}: <span className="mono">{r.contribution}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
