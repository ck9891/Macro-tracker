import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, type ProgressDay } from "../api.js";
import { SparkLineChart } from "../components/SparkLineChart.js";
import { WeightLineChart } from "../components/WeightLineChart.js";
import { useMacroSync } from "../hooks/useMacroSync.js";
import { localDayString } from "../lib/localDate.js";

const RANGE_OPTIONS = [14, 30, 90] as const;

function startDayForRange(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return localDayString(d);
}

function filterByRange(rows: ProgressDay[], rangeDays: number): ProgressDay[] {
  const start = startDayForRange(rangeDays);
  return rows.filter((r) => r.day >= start);
}

export function ProgressPage() {
  const [rows, setRows] = useState<ProgressDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);
  const [formDay, setFormDay] = useState(() => localDayString());
  const [calories, setCalories] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [clearWeight, setClearWeight] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .listProgress()
      .then((r) => setRows(r))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useMacroSync(load);

  const inRange = useMemo(() => filterByRange(rows, rangeDays), [rows, rangeDays]);

  const chartData = useMemo(() => {
    const labels = inRange.map((r) => r.day);
    return {
      labels,
      calories: inRange.map((r) => r.calories),
      proteinG: inRange.map((r) => r.proteinG),
      carbsG: inRange.map((r) => r.carbsG),
      fatG: inRange.map((r) => r.fatG),
      weightKg: inRange.map((r) => r.weightKg),
    };
  }, [inRange]);

  useEffect(() => {
    const existing = rows.find((r) => r.day === formDay);
    if (existing) {
      setCalories(String(Math.round(existing.calories)));
      setProteinG(String(existing.proteinG));
      setCarbsG(String(existing.carbsG));
      setFatG(String(existing.fatG));
      setWeightKg(existing.weightKg != null ? String(existing.weightKg) : "");
      setClearWeight(false);
    } else {
      setCalories("");
      setProteinG("");
      setCarbsG("");
      setFatG("");
      setWeightKg("");
      setClearWeight(false);
    }
  }, [formDay, rows]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const c = Number(calories);
    const p = Number(proteinG);
    const carb = Number(carbsG);
    const f = Number(fatG);
    if (![c, p, carb, f].every((n) => Number.isFinite(n) && n >= 0)) {
      setError("Macros must be non-negative numbers.");
      return;
    }
    const existing = rows.find((r) => r.day === formDay);
    let w: number | null = null;
    if (clearWeight) {
      w = null;
    } else if (weightKg.trim() !== "") {
      const parsed = Number(weightKg);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError("Weight must be a positive number, or leave blank to keep a previous value.");
        return;
      }
      w = parsed;
    } else if (existing?.weightKg != null) {
      w = existing.weightKg;
    }
    setSaving(true);
    setError(null);
    try {
      await api.upsertProgress(formDay, {
        calories: c,
        proteinG: p,
        carbsG: carb,
        fatG: f,
        weightKg: w,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteDay() {
    const existing = rows.find((r) => r.day === formDay);
    if (!existing) return;
    if (!window.confirm(`Remove the log for ${formDay}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteProgress(formDay);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  const hasEntry = rows.some((r) => r.day === formDay);

  return (
    <>
      <h1 className="page-title">Progress</h1>
      <p className="page-lede">
        Log what you ate and your weight by calendar day. Charts summarize the last few weeks; values are
        independent of the meal plan (plan totals are a separate estimate).
      </p>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="segmented" style={{ marginBottom: "1.25rem" }} role="group" aria-label="Chart range">
        {RANGE_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            className={rangeDays === d ? "active" : ""}
            onClick={() => setRangeDays(d)}
          >
            Last {d} days
          </button>
        ))}
      </div>

      <div className="split split-2" style={{ marginBottom: "1.5rem" }}>
        <section className="card">
          <h2>Calories</h2>
          <SparkLineChart
            labels={chartData.labels}
            series={[
              {
                key: "cal",
                label: "kcal",
                color: "#fbbf24",
                values: chartData.calories,
              },
            ]}
            ariaLabel={`Calories per day over the last ${rangeDays} days`}
          />
        </section>
        <section className="card">
          <h2>Macros (grams)</h2>
          <SparkLineChart
            labels={chartData.labels}
            series={[
              { key: "p", label: "Protein", color: "#34d399", values: chartData.proteinG },
              { key: "c", label: "Carbs", color: "#60a5fa", values: chartData.carbsG },
              { key: "f", label: "Fat", color: "#f472b6", values: chartData.fatG },
            ]}
            ariaLabel={`Protein, carbs, and fat in grams per day over the last ${rangeDays} days`}
          />
        </section>
      </div>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>Weight</h2>
        <WeightLineChart
          labels={chartData.labels}
          weightsKg={chartData.weightKg}
          ariaLabel={`Body weight in kilograms when logged, last ${rangeDays} days`}
        />
      </section>

      <section className="card">
        <h2>Log or edit a day</h2>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="prog-day">Date</label>
            <input
              id="prog-day"
              type="date"
              value={formDay}
              onChange={(e) => setFormDay(e.target.value)}
              required
            />
          </div>
          <div className="field field-inline">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="prog-cal">Calories</label>
              <input
                id="prog-cal"
                type="number"
                min={0}
                step={1}
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="prog-p">Protein (g)</label>
              <input
                id="prog-p"
                type="number"
                min={0}
                step={0.1}
                value={proteinG}
                onChange={(e) => setProteinG(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="prog-c">Carbs (g)</label>
              <input
                id="prog-c"
                type="number"
                min={0}
                step={0.1}
                value={carbsG}
                onChange={(e) => setCarbsG(e.target.value)}
                required
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="prog-f">Fat (g)</label>
              <input
                id="prog-f"
                type="number"
                min={0}
                step={0.1}
                value={fatG}
                onChange={(e) => setFatG(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="prog-w">Weight (kg), optional</label>
            <input
              id="prog-w"
              type="number"
              min={0}
              step={0.1}
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              disabled={clearWeight}
            />
          </div>
          <label className="subtle" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={clearWeight}
              onChange={(e) => setClearWeight(e.target.checked)}
            />
            Clear weight for this day
          </label>
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save day"}
            </button>
            {hasEntry ? (
              <button type="button" className="btn btn-danger" disabled={saving} onClick={onDeleteDay}>
                Remove this day
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </>
  );
}
