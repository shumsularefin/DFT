import { forwardRef, useId } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { fmt, niceTicks } from '../../../lib/vasp/ticks';

export interface Pt {
  x: number;
  y: number | null;
  note?: string;
}
export interface Series {
  name: string;
  cls: 's1' | 's2' | 's3';
  points: readonly Pt[];
}
export interface ChartProps {
  title: string;
  description: string;
  xLabel: string;
  yLabel: string;
  xDomain: [number, number];
  yDomain: [number, number];
  series?: readonly Series[];
  hLines?: readonly { value: number; label: string }[];
  vBands?: readonly { lo: number; hi: number; label: string }[];
  marker?: { x: number; y: number; label: string } | null;
  /** Categorical x: tick text per x value (the family sweep). */
  xTickText?: readonly string[];
  /** Rows of the table shown beside the plot. */
  table: { head: readonly string[]; rows: readonly (readonly string[])[] };
}

export const W = 640;
export const H = 360;
const M = { l: 62, r: 16, t: 16, b: 50 };

const Chart = forwardRef<SVGSVGElement, ChartProps>(function Chart(p, ref) {
  const id = useId();
  const sx = scaleLinear()
    .domain(p.xDomain)
    .range([M.l, W - M.r]);
  const sy = scaleLinear()
    .domain(p.yDomain)
    .range([H - M.b, M.t]);
  const xTicks = p.xTickText ? p.xTickText.map((_, i) => i) : niceTicks(p.xDomain[0], p.xDomain[1], 6);
  const yTicks = niceTicks(p.yDomain[0], p.yDomain[1], 6);
  const path = line<Pt>()
    .defined((d) => d.y !== null && Number.isFinite(d.y))
    .x((d) => sx(d.x))
    .y((d) => sy(d.y as number));
  const clampY = (v: number) => Math.max(M.t, Math.min(H - M.b, v));
  return (
    <figure className="tfp-fig">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}t`}
        aria-describedby={`${id}d`}
        className="tfp-svg"
      >
        <title id={`${id}t`}>{p.title}</title>
        <desc id={`${id}d`}>{p.description}</desc>
        {p.vBands?.map((b) => (
          <rect
            key={b.label}
            className="tfp-band"
            x={sx(b.lo)}
            width={Math.max(0, sx(b.hi) - sx(b.lo))}
            y={M.t}
            height={H - M.t - M.b}
          >
            <title>{b.label}</title>
          </rect>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className="tfp-grid" x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} />
            <text className="tfp-tick" x={M.l - 8} y={sy(t) + 4} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={`x${t}`} className="tfp-tick" x={sx(t)} y={H - M.b + 18} textAnchor="middle">
            {p.xTickText ? p.xTickText[i] : fmt(t)}
          </text>
        ))}
        <line className="tfp-axis" x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} />
        <line className="tfp-axis" x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} />
        {p.hLines?.map((l, i) => (
          <g key={l.label} data-testid="ref-line" data-value={l.value}>
            <line className="tfp-ref" x1={M.l} x2={W - M.r} y1={sy(l.value)} y2={sy(l.value)} />
            <text className="tfp-mlabel" x={W - M.r - 4} y={sy(l.value) + (i % 2 ? 14 : -5)} textAnchor="end">
              {l.label}
            </text>
          </g>
        ))}
        <text className="tfp-label" x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle">
          {p.xLabel}
        </text>
        <text
          className="tfp-label"
          transform={`translate(15 ${(M.t + H - M.b) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {p.yLabel}
        </text>
        {p.series?.map((s) => (
          <g key={s.name} className={`tfp-${s.cls}`}>
            <path className="tfp-line" d={path(s.points as Pt[]) ?? ''} fill="none" />
            {s.points.map((q, i) =>
              q.y === null || !Number.isFinite(q.y) ? (
                <g key={i} data-testid="gap" transform={`translate(${sx(q.x)} ${H - M.b - 8})`}>
                  <title>{q.note ?? 'no value'}</title>
                  <path className="tfp-gap" d="M-4 -4 L4 4 M-4 4 L4 -4" />
                </g>
              ) : (
                <circle key={i} className="tfp-pt" cx={sx(q.x)} cy={sy(q.y)} r={3.5} data-testid="pt">
                  <title>{`${s.name}: ${fmt(q.y)}`}</title>
                </circle>
              ),
            )}
          </g>
        ))}
        {p.marker && (
          <g data-testid="marker" data-x={p.marker.x} data-y={p.marker.y}>
            <circle className="tfp-mark" cx={sx(p.marker.x)} cy={clampY(sy(p.marker.y))} r={7} />
            <text className="tfp-mlabel" x={sx(p.marker.x) + 10} y={clampY(sy(p.marker.y)) - 8}>
              {p.marker.label}
            </text>
          </g>
        )}
      </svg>
      {p.series && p.series.length > 1 && (
        <ul className="tfp-legend">
          {p.series.map((s) => (
            <li key={s.name} className={`tfp-${s.cls}`}>
              <span className="tfp-swatch" aria-hidden="true" /> {s.name}
            </li>
          ))}
        </ul>
      )}
      <details className="tfp-data">
        <summary>Data table for this plot</summary>
        <div className="tfp-scroll" tabIndex={0} role="region" aria-label={`${p.title}, data table`}>
          <table className="tfp-table">
            <caption className="sr-only">{p.title}</caption>
            <thead>
              <tr>
                {p.table.head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
});
export default Chart;
