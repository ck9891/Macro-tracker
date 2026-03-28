/**
 * Heuristic parsing of OCR text into ingredients and steps.
 * Expects sections like "Ingredients" / "Steps" or bullet lists.
 */

const ING_LINE =
  /^[-*•]?\s*(?:\d+(?:\.\d+)?\s*)?(?:(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?))\s*([a-zA-Z]+)?\.?\s+(.+)$/;

function parseFractionAmount(a: string, b: string, c: string): number | undefined {
  if (a && b) {
    const n = Number(a);
    const d = Number(b);
    if (d !== 0 && Number.isFinite(n)) return n / d;
  }
  if (c) {
    const x = Number(c);
    if (Number.isFinite(x)) return x;
  }
  return undefined;
}

export function parseRecipeFromOcrText(raw: string): {
  ingredients: { name: string; amount?: number; unit?: string }[];
  steps: string[];
} {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let mode: "ing" | "steps" | "unknown" = "unknown";
  const ingredients: { name: string; amount?: number; unit?: string }[] = [];
  const steps: string[] = [];

  const lowerBlock = raw.toLowerCase();
  if (lowerBlock.includes("ingredient")) mode = "ing";
  if (lowerBlock.includes("instruction") || lowerBlock.includes("direction") || lowerBlock.includes("method")) {
    /* will switch when we see header */
  }

  for (const line of lines) {
    const low = line.toLowerCase();
    if (/^ingredients?:?$/.test(low) || /^you will need:?$/.test(low)) {
      mode = "ing";
      continue;
    }
    if (/^(steps?|instructions?|directions?|method):?$/.test(low)) {
      mode = "steps";
      continue;
    }

    if (mode === "ing") {
      const m = line.match(ING_LINE);
      if (m) {
        const amount = parseFractionAmount(m[1] ?? "", m[2] ?? "", m[3] ?? "");
        const unit = m[4]?.toLowerCase();
        const name = m[5]?.replace(/\s+/g, " ").trim() ?? "";
        if (name) {
          ingredients.push({
            name,
            amount,
            unit: unit && unit.length <= 8 ? unit : undefined,
          });
          continue;
        }
      }
      if (/^[-*•]/.test(line)) {
        const rest = line.replace(/^[-*•]\s*/, "").trim();
        if (rest) ingredients.push({ name: rest });
        continue;
      }
      if (mode === "ing" && line.length > 2) {
        ingredients.push({ name: line });
      }
      continue;
    }

    if (mode === "steps") {
      const step = line.replace(/^\d+[\).]\s*/, "").replace(/^[-*•]\s*/, "").trim();
      if (step) steps.push(step);
      continue;
    }

    if (/^[-*•]/.test(line)) {
      ingredients.push({ name: line.replace(/^[-*•]\s*/, "") });
    }
  }

  if (steps.length === 0 && ingredients.length === 0) {
    for (const line of lines) {
      if (/^\d+[\).]\s+/.test(line)) {
        steps.push(line.replace(/^\d+[\).]\s+/, "").trim());
      }
    }
  }

  const dedupedIng = dedupeIngredients(ingredients);
  return {
    ingredients: dedupedIng.length ? dedupedIng : [{ name: "Review OCR output and edit items" }],
    steps: steps.length ? steps : ["Review OCR output and edit steps"],
  };
}

function dedupeIngredients(items: { name: string; amount?: number; unit?: string }[]) {
  const seen = new Set<string>();
  const out: typeof items = [];
  for (const i of items) {
    const k = `${i.name.toLowerCase()}|${i.amount ?? ""}|${i.unit ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}
