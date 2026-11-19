import { forwardRef, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { formatTick, niceTicks } from '../../../lib/vasp/convergenceView';
import { eosCurve, type EosFit } from '../../../lib/physics/eos';

export const W = 640;
export const H = 470;
const M = { l: 76, r: 20, t: 20, b: 52 };
/** Top panel: E(V). Bottom panel: residuals in meV. */
const TOP_B = 310;
const RES_T = 344;

/** E(V) points with the fitted curve, and a residual panel below. Arrow keys move between points. */
const EosPlot = forwardRef<SVGSVGElement, { fit: EosFit; description: string }>(function EosPlot(
  { fit, description },
  ref,
) {
  const [active, setActive] = useState(0);
  const refs = useRef<(SVGCircleElement | null)[]>([]);
  const pts = fit.points;
  const vs = pts.map((p) => p.volume);
  const vLo = Math.min(...vs, fit.params.v0);
  const vHi = Math.max(...vs, fit.params.v0);
  const pad = (vHi - vLo) * 0.04;
  const curve = eosCurve(fit, vLo - pad, vHi + pad, 200);
  const es = [...pts.map((p) => p.energy), ...curve.map((c) => c.energy)];
  const eTicks = niceTicks(Math.min(...es), Math.max(...es), 5);
  const vTicks = niceTicks(vLo - pad, vHi + pad, 6).filter((t) => t >= vLo - pad && t <= vHi + pad);
  const rs = pts.map((p) => p.residual * 1000);
  const rMax = Math.max(...rs.map(Math.abs), 1e-6);
  const rTicks = niceTicks(-rMax, rMax, 3);
  const sx = scaleLinear()
    .domain([vLo - pad, vHi + pad])
    .range([M.l, W - M.r]);
  const sy = scaleLinear()
    .domain([eTicks[0]!, eTicks.at(-1)!])
    .range([TOP_B, M.t]);
  const sr = scaleLinear()
    .domain([rTicks[0]!, rTicks.at(-1)!])
    .range([H - M.b, RES_T]);
  const path = line<{ volume: number; energy: number }>()
    .x((d) => sx(d.volume))
    .y((d) => sy(d.energy))(curve);
  const cur = Math.min(active, pts.length - 1);
  const tipOf = (i: number) => {
    const p = pts[i]!;
    return `${p.label ? `${p.label}: ` : ''}V = ${p.volume} Å³, E = ${p.energy} eV, fit ${p.fit.toFixed(5)} eV, residual ${(p.residual * 1000).toFixed(2)} meV`;
  };
  const move = (to: number) => {
    const n = Math.max(0, Math.min(pts.length - 1, to));
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
      End: pts.length - 1,
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
        aria-label="Energy-volume fit"
        aria-describedby="eos-desc"
        className="cv-svg"
        onKeyDown={onKey}
      >
        <title>Energy-volume fit</title>
        <desc id="eos-desc">{description}</desc>
        {eTicks.map((t) => (
          <g key={`e${t}`}>
            <line className="cv-grid" x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} />
            <text className="cv-tick" x={M.l - 8} y={sy(t) + 4} textAnchor="end">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {rTicks.map((t) => (
          <g key={`r${t}`}>
            <line className={t === 0 ? 'cv-axis' : 'cv-grid'} x1={M.l} x2={W - M.r} y1={sr(t)} y2={sr(t)} />
            <text className="cv-tick" x={M.l - 8} y={sr(t) + 4} textAnchor="end">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {vTicks.map((t) => (
          <g key={`v${t}`}>
            <line className="cv-axis" x1={sx(t)} x2={sx(t)} y1={H - M.b} y2={H - M.b + 5} />
            <text className="cv-tick" x={sx(t)} y={H - M.b + 20} textAnchor="middle">
              {formatTick(t)}
            </text>
          </g>
        ))}
        <line className="cv-axis" x1={M.l} x2={W - M.r} y1={TOP_B} y2={TOP_B} />
        <line className="cv-axis" x1={M.l} x2={M.l} y1={M.t} y2={TOP_B} />
        <line className="cv-axis" x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} />
        <line className="cv-axis" x1={M.l} x2={M.l} y1={RES_T} y2={H - M.b} />
        <text className="cv-label" x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle">
          Volume per cell (Å³)
        </text>
        <text
          className="cv-label"
          transform={`translate(16 ${(M.t + TOP_B) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          Energy per cell (eV)
        </text>
        <text
          className="cv-label"
          transform={`translate(16 ${(RES_T + H - M.b) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          Residual (meV)
        </text>
        {path && <path className="cv-line" d={path} fill="none" data-testid="eos-curve" />}
        <line
          className="cv-marker"
          x1={sx(fit.params.v0)}
          x2={sx(fit.params.v0)}
          y1={M.t}
          y2={TOP_B}
          data-testid="v0-marker"
        />
        <text className="cv-mlabel" x={sx(fit.params.v0) + 6} y={M.t + 12}>
          V0 = {fit.params.v0.toFixed(3)} Å³
        </text>
        {pts.map((p, i) => (
          <line
            key={`rl${i}`}
            className="cv-line"
            x1={sx(p.volume)}
            x2={sx(p.volume)}
            y1={sr(0)}
            y2={sr(p.residual * 1000)}
          />
        ))}
        {pts.map((p, i) => (
          <rect
            key={`rs${i}`}
            className="cv-pt"
            x={sx(p.volume) - 3.5}
            y={sr(p.residual * 1000) - 3.5}
            width={7}
            height={7}
            aria-hidden="true"
          />
        ))}
        {pts.map((p, i) => (
          <circle
            key={`p${i}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="cv-pt"
            cx={sx(p.volume)}
            cy={sy(p.energy)}
            r={i === cur ? 7 : 5}
            tabIndex={i === cur ? 0 : -1}
            role="img"
            aria-label={tipOf(i)}
            data-testid="plot-point"
            onFocus={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
          />
        ))}
      </svg>
      <figcaption className="cv-tip" aria-live="polite">
        {pts.length ? tipOf(cur) : ''}
      </figcaption>
    </figure>
  );
});

export default EosPlot;
