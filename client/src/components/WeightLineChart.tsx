import { pathFromPoints } from "./SparkLineChart.js";

export function WeightLineChart(props: {
  width?: number;
  height?: number;
  labels: string[];
  weightsKg: (number | null)[];
  ariaLabel: string;
}) {
  const width = props.width ?? 640;
  const height = props.height ?? 160;
  const { labels, weightsKg } = props;

  const pairs = labels
    .map((day, i) => ({ day, w: weightsKg[i] }))
    .filter((p): p is { day: string; w: number } => p.w != null && Number.isFinite(p.w));

  if (pairs.length < 2) {
    return (
      <p className="subtle" style={{ margin: 0 }}>
        Log weight on at least two days in this range to see a trend.
      </p>
    );
  }

  const values = pairs.map((p) => p.w);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 10;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const n = pairs.length;

  const pts = pairs.map((p, i) => ({
    x: pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW),
    y: pad + innerH - ((p.w - min) / span) * innerH,
  }));

  const d = pathFromPoints(pts);
  const last = pairs[pairs.length - 1].w;

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
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--accent)" />
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
        <span>{pairs[0].day}</span>
        <span>{pairs[pairs.length - 1].day}</span>
      </div>
    </div>
  );
}
