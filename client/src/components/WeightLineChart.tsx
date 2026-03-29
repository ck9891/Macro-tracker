import { pathFromPoints } from "./SparkLineChart.js";

export type WeightChartPoint = {
  measuredAt: string;
  weightKg: number;
};

function formatAxisLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WeightLineChart(props: {
  width?: number;
  height?: number;
  points: WeightChartPoint[];
  ariaLabel: string;
}) {
  const width = props.width ?? 640;
  const height = props.height ?? 160;
  const ptsSorted = [...props.points].sort(
    (a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt),
  );

  if (ptsSorted.length < 2) {
    return (
      <p className="subtle" style={{ margin: 0 }}>
        Log at least two weight entries in this range to see a trend. Use the Weight page to add
        measurements.
      </p>
    );
  }

  const values = ptsSorted.map((p) => p.weightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 10;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const n = ptsSorted.length;

  const pts = ptsSorted.map((p, i) => ({
    x: pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW),
    y: pad + innerH - ((p.weightKg - min) / span) * innerH,
  }));

  const d = pathFromPoints(pts);
  const last = ptsSorted[ptsSorted.length - 1].weightKg;

  return (
    <div className="chart-wrap">
      <svg
        className="spark-chart"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={props.ariaLabel}
      >
        <title>{props.ariaLabel}</title>
        <path
          d={d}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {pts.map((p, i) => (
          <circle key={ptsSorted[i].measuredAt} cx={p.x} cy={p.y} r={3} fill="var(--accent)" />
        ))}
      </svg>
      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-swatch" style={{ background: "var(--accent)" }} aria-hidden />
          Weight (kg)
          <span className="muted mono" style={{ marginLeft: "0.25rem" }}>
            {last % 1 === 0 ? last : last.toFixed(1)}
          </span>
        </span>
      </div>
      <div className="chart-axis subtle mono" style={{ fontSize: "0.75rem", marginTop: "0.35rem" }}>
        <span>{formatAxisLabel(ptsSorted[0].measuredAt)}</span>
        <span>{formatAxisLabel(ptsSorted[ptsSorted.length - 1].measuredAt)}</span>
      </div>
    </div>
  );
}
