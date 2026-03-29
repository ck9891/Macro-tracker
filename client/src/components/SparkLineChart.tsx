type Point = { x: number; y: number };

type Series = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

function pathFromPoints(pts: Point[]): string {
  if (pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

export function SparkLineChart(props: {
  width?: number;
  height?: number;
  labels: string[];
  series: Series[];
  ariaLabel: string;
}) {
  const width = props.width ?? 640;
  const height = props.height ?? 200;
  const { labels, series } = props;

  if (series.length === 0 || labels.length === 0) {
    return (
      <p className="subtle" style={{ margin: 0 }}>
        No data in this range.
      </p>
    );
  }

  const allVals = series.flatMap((s) => s.values);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const span = max - min || 1;
  const pad = 10;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const n = labels.length;

  const paths = series.map((s) => {
    const pts = s.values.map((v, i) => ({
      x: pad + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW),
      y: pad + innerH - ((v - min) / span) * innerH,
    }));
    return { ...s, d: pathFromPoints(pts), pts };
  });

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
        {paths.map((p) => (
          <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="chart-legend">
        {paths.map((p) => (
          <span key={p.key} className="chart-legend-item">
            <span className="chart-swatch" style={{ background: p.color }} aria-hidden />
            {p.label}
            {p.values.length > 0 ? (
              <span className="muted mono" style={{ marginLeft: "0.25rem" }}>
                {p.values[p.values.length - 1] % 1 === 0
                  ? p.values[p.values.length - 1]
                  : p.values[p.values.length - 1].toFixed(1)}
              </span>
            ) : null}
          </span>
        ))}
      </div>
      <div className="chart-axis subtle mono" style={{ fontSize: "0.75rem", marginTop: "0.35rem" }}>
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

export { pathFromPoints };
