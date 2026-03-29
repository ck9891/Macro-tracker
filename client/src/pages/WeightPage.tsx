import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type WeightEntry, type WeightUnit } from "../api.js";
import { useMacroSync } from "../hooks/useMacroSync.js";

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplay(dt: string): string {
  const t = Date.parse(dt);
  if (!Number.isFinite(t)) return dt;
  return new Date(t).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function WeightPage() {
  const [entries, setEntries] = useState<WeightEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [measuredAtLocal, setMeasuredAtLocal] = useState(() => toDatetimeLocalValue(new Date()));
  const [weightInput, setWeightInput] = useState("");
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .listWeightEntries()
      .then(setEntries)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useMacroSync(load);

  const sorted = useMemo(() => {
    if (!entries) return [];
    return [...entries].sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt));
  }, [entries]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const w = Number(weightInput);
    if (!Number.isFinite(w) || w <= 0) {
      setError("Enter a positive weight.");
      return;
    }
    const measuredAt = new Date(measuredAtLocal).toISOString();
    if (!Number.isFinite(Date.parse(measuredAt))) {
      setError("Invalid date/time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.addWeightEntry({
        measuredAt,
        weight: w,
        unit,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setWeightInput("");
      setNote("");
      setMeasuredAtLocal(toDatetimeLocalValue(new Date()));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this weight entry?")) return;
    try {
      await api.deleteWeightEntry(id);
      setEntries((prev) => prev?.filter((e) => e.id !== id) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (error && !entries) {
    return (
      <>
        <h1 className="page-title">Weight</h1>
        <div className="error-banner">{error}</div>
      </>
    );
  }

  if (!entries) {
    return (
      <>
        <h1 className="page-title">Weight</h1>
        <p className="loader">Loading…</p>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Weight</h1>
      <p className="page-lede">
        Log body weight with a timestamp. Entries sync with your recipes and meal plan when you are online.
      </p>
      {error ? <div className="error-banner">{error}</div> : null}

      <form className="card" onSubmit={(ev) => void onSubmit(ev)} style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Add entry</h2>
        <div className="field">
          <label htmlFor="w-when">When</label>
          <input
            id="w-when"
            type="datetime-local"
            value={measuredAtLocal}
            onChange={(e) => setMeasuredAtLocal(e.target.value)}
            required
          />
        </div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 140px", margin: 0 }}>
            <label htmlFor="w-value">Weight</label>
            <input
              id="w-value"
              type="number"
              min={0.1}
              step={0.1}
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder="e.g. 72.5"
              required
            />
          </div>
          <div className="field" style={{ flex: "0 0 120px", margin: 0 }}>
            <label htmlFor="w-unit">Unit</label>
            <select id="w-unit" value={unit} onChange={(e) => setUnit(e.target.value as WeightUnit)}>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="w-note">Note (optional)</label>
          <input
            id="w-note"
            type="text"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. morning, fasted"
          />
        </div>
        <div className="button-row">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save entry"}
          </button>
        </div>
      </form>

      {sorted.length === 0 ? (
        <p className="muted">No entries yet. Add your first measurement above.</p>
      ) : (
        <div className="card-grid" style={{ gridTemplateColumns: "1fr" }}>
          {sorted.map((e) => (
            <article key={e.id} className="card" style={{ flexDirection: "row", flexWrap: "wrap", gap: "1rem" }}>
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                  {e.weight} {e.unit}
                </div>
                <div className="card-meta">
                  <span>{formatDisplay(e.measuredAt)}</span>
                </div>
                {e.note ? <p className="muted" style={{ margin: "0.5rem 0 0" }}>{e.note}</p> : null}
              </div>
              <div className="button-row" style={{ margin: 0, alignSelf: "center" }}>
                <button type="button" className="btn btn-danger" onClick={() => void remove(e.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
