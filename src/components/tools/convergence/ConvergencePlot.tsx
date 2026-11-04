import { forwardRef, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { formatTick, niceTicks } from '../../../lib/vasp/convergenceView';

export interface PlotPointData {
  x: number;
  y: number;
  tooltip: string;
  converged: boolean;
}
interface Props {
  title: string;
  xLabel: string;
  yLabel: string;
  points: readonly PlotPointData[];
  band?: { lo: number; hi: number; label: string };
  convergedIndex: number | null;
  /** True when a larger x costs less (k resolution): the axis runs from large to small so cost still grows to the right. */
  reverseX?: boolean;
  description: string;
}

export const W = 640;
export const H = 360;
const M = { l: 68, r: 20, t: 20, b: 52 };

const ConvergencePlot = forwardRef<SVGSVGElement, Props>(function ConvergencePlot(p, ref) {
  const [active, setActive] = useState(0);
  const refs = useRef<(SVGCircleElement | null)[]>([]);
  const xs = p.points.map((q) => q.x);
  const ys = p.points.map((q) => q.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yLo = Math.min(...ys, p.band?.lo ?? Infinity);
  const yHi = Math.max(...ys, p.band?.hi ?? -Infinity);
  const yTicks = niceTicks(yLo, yHi, 5);
  const xTicks = niceTicks(xMin, xMax, 6).filter((t) => t >= xMin - 1e-9 && t <= xMax + 1e-9);
  const xs0 = xMin === xMax ? [xMin - 1, xMax + 1] : [xMin, xMax];
  const sx = scaleLinear()
    .domain(p.reverseX ? [xs0[1]!, xs0[0]!] : (xs0 as [number, number]))
    .range([M.l, W - M.r]);
  const sy = scaleLinear()
    .domain([yTicks[0] ?? yLo, yTicks.at(-1) ?? yHi])
    .range([H - M.b, M.t]);
  const path = line<PlotPointData>()
    .x((d) => sx(d.x))
    .y((d) => sy(d.y))(p.points as PlotPointData[]);
  const cur = Math.min(active, p.points.length - 1);
  const tip = p.points[cur]?.tooltip ?? '';

  const move = (to: number) => {
    const n = Math.max(0, Math.min(p.points.length - 1, to));
    setActive(n);
    refs.current[n]?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowRight: cur + 1,
      ArrowUp: cur + 1,
      ArrowLeft: cur - 1,
      ArrowDown: cur - 1,
      Home: 0,
      End: p.points.length - 1,
    };
    const to = map[e.key];
    if (to === undefined) return;
    e.preventDefault();
    move(to);
  };

  return (
    <figure className="cv-fig">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={p.title}
        aria-describedby={`${p.title.replace(/\s+/g, '-')}-desc`}
        className="cv-svg"
        onKeyDown={onKey}
      >
        <title>{p.title}</title>
        <desc id={`${p.title.replace(/\s+/g, '-')}-desc`}>{p.description}</desc>
        {p.band && (
          <rect
            className="cv-band"
            x={M.l}
            width={W - M.l - M.r}
            y={sy(p.band.hi)}
            height={Math.max(0, sy(p.band.lo) - sy(p.band.hi))}
          >
            <title>{p.band.label}</title>
          </rect>
        )}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className="cv-grid" x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} />
            <text className="cv-tick" x={M.l - 8} y={sy(t) + 4} textAnchor="end">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line className="cv-axis" x1={sx(t)} x2={sx(t)} y1={H - M.b} y2={H - M.b + 5} />
            <text className="cv-tick" x={sx(t)} y={H - M.b + 20} textAnchor="middle">
              {formatTick(t)}
            </text>
          </g>
        ))}
        <line className="cv-axis" x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} />
        <line className="cv-axis" x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} />
        <text className="cv-label" x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle">
          {p.xLabel}
        </text>
        <text
          className="cv-label"
          transform={`translate(16 ${(M.t + H - M.b) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          {p.yLabel}
        </text>
        {path && <path className="cv-line" d={path} fill="none" />}
        {p.convergedIndex !== null && p.points[p.convergedIndex] && (
          <g data-testid="converged-marker" data-x={p.points[p.convergedIndex]!.x}>
            <line
              className="cv-marker"
              x1={sx(p.points[p.convergedIndex]!.x)}
              x2={sx(p.points[p.convergedIndex]!.x)}
              y1={M.t}
              y2={H - M.b}
            />
            <text className="cv-mlabel" x={sx(p.points[p.convergedIndex]!.x) + 6} y={M.t + 12}>
              converged from {p.points[p.convergedIndex]!.x}
            </text>
          </g>
        )}
        {p.points.map((q, i) => (
          <circle
            key={`${q.x}-${i}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={q.converged ? 'cv-pt cv-pt-ok' : 'cv-pt'}
            cx={sx(q.x)}
            cy={sy(q.y)}
            r={i === cur ? 7 : 5}
            tabIndex={i === cur ? 0 : -1}
            role="img"
            aria-label={q.tooltip}
            data-testid="plot-point"
            onFocus={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
          />
        ))}
      </svg>
      <figcaption className="cv-tip" aria-live="polite">
        {tip}
      </figcaption>
    </figure>
  );
});

export default ConvergencePlot;
