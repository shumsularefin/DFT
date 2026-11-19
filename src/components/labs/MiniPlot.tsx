import './MiniPlot.css';
import { useId } from 'react';

export interface Curve {
  xs: ArrayLike<number>;
  ys: ArrayLike<number>;
  label: string;
  color: string;
  dash?: string;
  fill?: boolean;
}
interface Props {
  title: string;
  xLabel: string;
  yLabel: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  curves: Curve[];
  /** Vertical guide lines with a short label, for example the Fermi level. */
  marks?: { x: number; label: string }[];
  /** Horizontal guide at y = 0, 1 and so on. */
  hlines?: number[];
}
const W = 480;
const H = 220;
const PAD = { l: 52, r: 12, t: 12, b: 36 };

/** Small accessible line plot: SVG with a title, labelled axes, a legend and dashes so curves are not colour-only. */
export default function MiniPlot({
  title,
  xLabel,
  yLabel,
  xMin,
  xMax,
  yMin,
  yMax,
  curves,
  marks = [],
  hlines = [],
}: Props) {
  const id = useId();
  const sx = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const sy = (v: number) =>
    H - PAD.b - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const path = (c: Curve) => {
    const pts: string[] = [];
    for (let i = 0; i < c.xs.length; i++) pts.push(`${sx(c.xs[i]!).toFixed(1)},${sy(c.ys[i]!).toFixed(1)}`);
    return `M${pts.join('L')}`;
  };
  const ticks = (a: number, b: number) => [a, (a + b) / 2, b];
  return (
    <figure className="mp">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>{title}</title>
        <rect
          x={PAD.l}
          y={PAD.t}
          width={W - PAD.l - PAD.r}
          height={H - PAD.t - PAD.b}
          fill="var(--surface)"
          stroke="var(--border)"
        />
        {ticks(yMin, yMax).map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" />
            <text x={PAD.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {ticks(xMin, xMax).map((t) => (
          <text
            key={`x${t}`}
            x={sx(t)}
            y={H - PAD.b + 15}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
          >
            {t.toFixed(1)}
          </text>
        ))}
        {hlines.map((h) => (
          <line
            key={`h${h}`}
            x1={PAD.l}
            x2={W - PAD.r}
            y1={sy(h)}
            y2={sy(h)}
            stroke="var(--border-strong)"
            strokeDasharray="2 3"
          />
        ))}
        {marks.map((m) => (
          <g key={m.label}>
            <line
              x1={sx(m.x)}
              x2={sx(m.x)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="var(--border-strong)"
              strokeDasharray="4 3"
            />
            <text x={sx(m.x) + 4} y={PAD.t + 11} fontSize="11" fill="var(--text-muted)">
              {m.label}
            </text>
          </g>
        ))}
        {curves.map((c) => (
          <g key={c.label}>
            {c.fill && (
              <path
                d={`${path(c)}L${sx(c.xs[c.xs.length - 1]!).toFixed(1)},${sy(0).toFixed(1)}L${sx(c.xs[0]!).toFixed(1)},${sy(0).toFixed(1)}Z`}
                fill={c.color}
                opacity="0.12"
              />
            )}
            <path d={path(c)} fill="none" stroke={c.color} strokeWidth="2.4" strokeDasharray={c.dash} />
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--text)">
          {xLabel}
        </text>
        <text
          transform={`translate(13 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="12"
          fill="var(--text)"
        >
          {yLabel}
        </text>
      </svg>
      <figcaption className="mp-legend">
        {curves.map((c) => (
          <span key={c.label}>
            <svg width="28" height="10" aria-hidden="true">
              <line
                x1="1"
                x2="27"
                y1="5"
                y2="5"
                stroke={c.color}
                strokeWidth="2.4"
                strokeDasharray={c.dash}
              />
            </svg>{' '}
            {c.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
