import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Tesseract from "tesseract.js";
import { api } from "../api.js";
import { parseRecipeFromOcrText } from "../lib/recipeImport.js";

export function ImportRecipePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setStatus("Reading image…");
    setPreview("");
    try {
      const result = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setStatus(`OCR… ${Math.round((m.progress ?? 0) * 100)}%`);
          }
        },
      });
      const text = result.data.text.trim();
      setPreview(text);
      setStatus("Parsing…");
      const parsed = parseRecipeFromOcrText(text);
      const created = await api.createRecipe({
        name: `Imported ${new Date().toLocaleDateString()}`,
        durationMinutes: 0,
        servings: 1,
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        ingredients: parsed.ingredients,
        steps: parsed.steps,
      });
      setStatus(null);
      navigate(`/recipes/${created.id}/edit`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Import from photo</h1>
      <p className="page-lede">
        OCR runs in your browser (via Tesseract.js). No image is uploaded to the server. After import,
        review and fix amounts, then add macros and duration on the edit screen.
      </p>
      {status ? <p className="loader">{status}</p> : null}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="photo">Recipe photo</label>
          <input
            id="photo"
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <p className="subtle" style={{ marginTop: "0.75rem" }}>
          Tip: use good lighting and a straight-on photo of the ingredients and steps sections.
        </p>
      </div>
      {preview ? (
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Raw OCR (reference)</h2>
          <pre className="import-preview">{preview}</pre>
        </section>
      ) : null}
      <div className="button-row" style={{ marginTop: "1rem" }}>
        <Link to="/recipes" className="btn">
          Back to recipes
        </Link>
      </div>
    </>
  );
}
