import { useId } from 'react';
import { BOHR_RADIUS_ANGSTROM as A0_A } from '../../lib/physics/constants';
import {
  mostProbableRadius,
  radialNodeRadii,
  radialProbability,
  radialQuantile,
} from '../../lib/physics/hydrogen';

interface Props {
  n: number;
  l: number;
  label: string;
}

const W = 480;
const H = 240;
const PAD = { l: 52, r: 14, t: 12, b: 40 };

function niceStep(max: number): number {
  const raw = max / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
}

/** Radial probability r^2 R^2 against r for a hydrogen-like orbital: the 2D view of the orbitals lab. */
export default function RadialPlot({ n, l, label }: Props) {
  const uid = useId();
  const xmax = radialQuantile(n, l, 0.999) * 1.1;
  const step = niceStep(xmax);
  const xs = Array.from({ length: 241 }, (_, i) => (xmax * i) / 240);
  const ys = xs.map((r) => radialProbability(n, l, r));
  const ymax = Math.max(...ys) * 1.1;
  const nodes = radialNodeRadii(n, l);
  const rp = mostProbableRadius(n, l);
  const px = (x: number) => PAD.l + (x / xmax) * (W - PAD.l - PAD.r);
  const py = (y: number) => H - PAD.b - (y / ymax) * (H - PAD.t - PAD.b);
  const xticks: number[] = [];
  for (let t = 0; t <= xmax; t += step) xticks.push(Number(t.toFixed(6)));
  const path = `M${xs.map((x, i) => `${px(x).toFixed(1)},${py(ys[i]!).toFixed(1)}`).join('L')}`;
  const ystep = niceStep(ymax);
  const yticks: number[] = [];
  for (let t = 0; t <= ymax; t += ystep) yticks.push(Number(t.toFixed(6)));
  return (
    <figure className="radial-plot">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${uid}-t`}
        style={{ width: '100%', height: 'auto', maxWidth: '40rem' }}
      >
        <title id={`${uid}-t`}>
          {`Radial probability of the ${label} orbital against distance from the nucleus. Peak at ${rp.toFixed(2)} Bohr radii. ${nodes.length} radial node${nodes.length === 1 ? '' : 's'}.`}
        </title>
        {yticks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} stroke="var(--border)" />
            <text x={PAD.l - 6} y={py(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
              {t.toPrecision(2)}
            </text>
          </g>
        ))}
        {xticks.map((t) => (
          <g key={`x${t}`}>
            <line x1={px(t)} x2={px(t)} y1={H - PAD.b} y2={H - PAD.b + 4} stroke="var(--text-muted)" />
            <text x={px(t)} y={H - PAD.b + 16} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
              {t}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--text-muted)" />
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-muted)" />
        {nodes.map((r) => (
          <g key={r}>
            <line
              x1={px(r)}
              x2={px(r)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="var(--text-muted)"
              strokeDasharray="4 3"
            />
            <text x={px(r) + 3} y={PAD.t + 10} fontSize="11" fill="var(--text)">
              node
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        <circle
          cx={px(rp)}
          cy={py(radialProbability(n, l, rp))}
          r="5"
          fill="var(--accent)"
          stroke="var(--bg)"
          strokeWidth="2"
        />
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" fontSize="12" fill="var(--text)">
          Distance from the nucleus r (Bohr radii a0; 1 a0 = {A0_A.toFixed(3)} Angstrom)
        </text>
        <text
          transform={`translate(12 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="12"
          fill="var(--text)"
        >
          Probability per a0
        </text>
      </svg>
      <figcaption className="muted">
        Radial probability r² R(r)² for {label}. The dot marks the most probable distance; dashed lines mark
        radial nodes. The angular shape is not shown here.
      </figcaption>
    </figure>
  );
}
