import { scaleLinear, scaleLog } from 'd3-scale';
import { line } from 'd3-shape';

export interface LogSeries {
  name: string;
  color: string;
  shape: 'circle' | 'square';
  points: { n: number; error: number }[];
}
interface Props {
  title: string;
  description: string;
  series: LogSeries[];
}

const W = 640;
const H = 340;
const M = { l: 64, r: 120, t: 16, b: 48 };
const FLOOR = 1e-16;

/** Error against mesh size on a logarithmic vertical axis. Errors below 1e-16 are drawn at 1e-16 (rounding noise). */
export default function LogErrorPlot({ title, description, series }: Props) {
  const all = series.flatMap((s) => s.points.map((p) => Math.max(p.error, FLOOR)));
  const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...all, 1e-3))));
  const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...all, hi))));
  const ns = series.flatMap((s) => s.points.map((p) => p.n));
  const x = scaleLinear()
    .domain([Math.min(...ns), Math.max(...ns)])
    .range([M.l, W - M.r]);
  const y = scaleLog()
    .domain([lo, hi])
    .range([H - M.b, M.t]);
  const decades: number[] = [];
  for (let e = Math.round(Math.log10(lo)); e <= Math.round(Math.log10(hi)); e++) decades.push(e);
  const step = decades.length > 8 ? 2 : 1;
  const path = line<{ n: number; error: number }>()
    .x((d) => x(d.n))
    .y((d) => y(Math.max(d.error, FLOOR)));
  return (
    <figure className="logplot">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title}. ${description}`}>
        <title>{title}</title>
        {decades
          .filter((_, i) => i % step === 0)
          .map((e) => (
            <g key={e}>
              <line
                x1={M.l}
                x2={W - M.r}
                y1={y(10 ** e)}
                y2={y(10 ** e)}
                stroke="var(--border, #ccc)"
                strokeWidth="1"
              />
              <text x={M.l - 8} y={y(10 ** e) + 4} textAnchor="end" fontSize="12" fill="currentColor">
                {`1e${e}`}
              </text>
            </g>
          ))}
        {series[0]?.points.map((p) => (
          <text key={p.n} x={x(p.n)} y={H - M.b + 18} textAnchor="middle" fontSize="12" fill="currentColor">
            {p.n % 4 === 0 ? p.n : ''}
          </text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" fontSize="13" fill="currentColor">
          Mesh size N (N x N points)
        </text>
        <text
          transform={`translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="13"
          fill="currentColor"
        >
          Absolute error (t per site)
        </text>
        {series.map((s) => (
          <g key={s.name}>
            <path d={path(s.points) ?? ''} fill="none" stroke={s.color} strokeWidth="2" />
            {s.points.map((p) =>
              s.shape === 'circle' ? (
                <circle key={p.n} cx={x(p.n)} cy={y(Math.max(p.error, FLOOR))} r="4" fill={s.color} />
              ) : (
                <rect
                  key={p.n}
                  x={x(p.n) - 4}
                  y={y(Math.max(p.error, FLOOR)) - 4}
                  width="8"
                  height="8"
                  fill={s.color}
                />
              ),
            )}
            <text
              x={W - M.r + 8}
              y={y(Math.max(s.points.at(-1)?.error ?? FLOOR, FLOOR)) + 4}
              fontSize="12"
              fill="currentColor"
              fontWeight="600"
            >
              {s.name}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
