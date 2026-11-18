import { useEffect, useId, useMemo, useState } from 'react';
import LabShell from './LabShell';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import { prefersReducedMotion } from '../../lib/three/capabilities';
import { HARTREE_EV, runScf, type ScfBehaviour } from '../../lib/physics/scf1d';
import reference from '../../../tests/reference/scf1d_reference.json';
import './ScfLab.css';

const MAX_IT = 200;
const XWIN = 8; // bohr shown on each side
const W = 480;
const H = 220;
const PAD = { l: 52, r: 12, t: 12, b: 36 };

const STEPS = [
  ['Guess', 'Start from a density: here, two electrons in the lowest orbital of the bare well.'],
  ['Build the potential', 'Add the repulsion from that density to the attraction of the nucleus.'],
  ['Solve', 'Find the lowest orbital in that potential.'],
  ['New density', 'Put both electrons in it: n = 2 |phi|^2.'],
  ['Mix', 'Take a step from the old density towards the new one, of size alpha.'],
  ['Check', 'If old and new densities agree, stop; otherwise go round again.'],
] as const;

const BEHAVIOUR: Record<ScfBehaviour, string> = {
  converged: 'converged',
  slow: 'still converging (slow)',
  oscillating: 'oscillating, not converging',
  diverging: 'diverging',
};

const fmt = (x: number, d = 6) => (Math.abs(x) < 1e-12 ? '0' : x.toFixed(d));

function linePath(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  sx: (x: number) => number,
  sy: (y: number) => number,
) {
  const pts: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    if (x < -XWIN || x > XWIN) continue;
    pts.push(`${sx(x).toFixed(1)},${sy(ys[i]!).toFixed(1)}`);
  }
  return pts.length ? `M${pts.join('L')}` : '';
}

interface CurvePlotProps {
  title: string;
  x: Float64Array;
  curves: { y: ArrayLike<number>; color: string; dash?: string; label: string }[];
  yMin: number;
  yMax: number;
  yLabel: string;
}

function CurvePlot({ title, x, curves, yMin, yMax, yLabel }: CurvePlotProps) {
  const id = useId();
  const sx = (v: number) => PAD.l + ((v + XWIN) / (2 * XWIN)) * (W - PAD.l - PAD.r);
  const sy = (v: number) =>
    H - PAD.b - ((Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  return (
    <figure className="scf-plot">
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
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" />
            <text x={PAD.l - 6} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {[-XWIN, -4, 0, 4, XWIN].map((t) => (
          <text
            key={t}
            x={sx(t)}
            y={H - PAD.b + 15}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
          >
            {t}
          </text>
        ))}
        {curves.map((c) => (
          <path
            key={c.label}
            d={linePath(x, c.y, sx, sy)}
            fill="none"
            stroke={c.color}
            strokeWidth="2.4"
            strokeDasharray={c.dash}
          />
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--text)">
          x (bohr)
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
      <figcaption className="scf-legend">
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

function ResidualPlot({ residuals, current, tol }: { residuals: number[]; current: number; tol: number }) {
  const id = useId();
  const lo = -14;
  const hi = 1;
  const n = Math.max(residuals.length, 2);
  const sx = (i: number) => PAD.l + ((i - 1) / (n - 1)) * (W - PAD.l - PAD.r);
  const sy = (r: number) => {
    const e = Math.min(Math.max(Math.log10(Math.max(r, 1e-16)), lo), hi);
    return H - PAD.b - ((e - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  };
  const d = residuals.map((r, i) => `${sx(i + 1).toFixed(1)},${sy(r).toFixed(1)}`).join('L');
  const cur = residuals[current - 1];
  return (
    <figure className="scf-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`}>
        <title id={`${id}-t`}>Density residual against iteration, logarithmic axis</title>
        <rect
          x={PAD.l}
          y={PAD.t}
          width={W - PAD.l - PAD.r}
          height={H - PAD.t - PAD.b}
          fill="var(--surface)"
          stroke="var(--border)"
        />
        {[0, -4, -8, -12].map((e) => (
          <g key={e}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(10 ** e)} y2={sy(10 ** e)} stroke="var(--border)" />
            <text x={PAD.l - 6} y={sy(10 ** e) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
              {`1e${e}`}
            </text>
          </g>
        ))}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={sy(tol)}
          y2={sy(tol)}
          stroke="var(--text-muted)"
          strokeDasharray="4 3"
        />
        {d && <path d={`M${d}`} fill="none" stroke="var(--accent)" strokeWidth="2.4" />}
        {cur !== undefined && (
          <circle
            cx={sx(current)}
            cy={sy(cur)}
            r="5"
            fill="var(--accent)"
            stroke="var(--bg)"
            strokeWidth="2"
          />
        )}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--text)">
          Iteration (1 to {residuals.length})
        </text>
        <text
          transform={`translate(13 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="12"
          fill="var(--text)"
        >
          Residual (log)
        </text>
      </svg>
      <figcaption className="scf-legend">Dashed line: the stopping threshold, 1e-12.</figcaption>
    </figure>
  );
}

/** Lab "scf-loop": a 1D two-electron Hartree-Fock toy that shows the self-consistency loop. Not Kohn-Sham DFT. */
export default function ScfLab() {
  const [Z, setZ] = useState<1 | 2>(2);
  const [alpha, setAlpha] = useState(0.3);
  const [nonInteracting, setNonInteracting] = useState(false);
  const [step, setStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const reduced = typeof window !== 'undefined' && prefersReducedMotion();
  const zid = useId();

  const res = useMemo(
    () => runScf({ Z, alpha, nonInteracting, maxIterations: MAX_IT }),
    [Z, alpha, nonInteracting],
  );
  const N = res.iterations.length;
  const k = Math.min(step, N);
  const it = res.iterations[k - 1]!;
  const residuals = useMemo(() => res.iterations.map((i) => i.residual), [res]);

  useEffect(() => setStep((s) => Math.min(s, N)), [N]);
  useEffect(() => {
    if (!playing || reduced) return;
    if (k >= N) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setStep((s) => s + 1), 140);
    return () => window.clearTimeout(t);
  }, [playing, reduced, k, N]);

  const atEnd = k === N;
  const ref = reference.cases.find((c) => c.Z === Z)!;
  const showExact = atEnd && res.converged && !nonInteracting;
  const nMax = Z === 2 ? 1.2 : 0.8;

  const readouts = [
    { label: 'Iteration', value: `${k} of ${N}` },
    { label: 'Residual', value: it.residual.toExponential(2) },
    { label: 'Total energy', value: `${fmt(it.totalEnergy)} Ha (${fmt(it.totalEnergy * HARTREE_EV, 4)} eV)` },
    { label: 'Orbital energy', value: `${fmt(it.orbitalEnergy)} Ha` },
    { label: 'Loop behaviour (heuristic)', value: BEHAVIOUR[res.behaviour] },
    ...(showExact
      ? [
          {
            label: 'Exact two-electron energy on the same grid',
            value: `${fmt(ref.E_exact_two_electron_same_grid)} Ha`,
          },
          {
            label: 'Correlation energy (exact minus this)',
            value: `${fmt(ref.E_exact_two_electron_same_grid - res.energy)} Ha`,
          },
        ]
      : []),
  ];

  const reset = () => {
    setZ(2);
    setAlpha(0.3);
    setNonInteracting(false);
    setStep(1);
    setPlaying(false);
  };

  return (
    <LabShell
      title="The self-consistency loop"
      goal="Watch a density and its potential chase each other until they agree, and see what the mixing step does to the chase."
      badge="toy-model"
      headingLevel={3}
      onReset={reset}
      controls={
        <>
          <fieldset className="scf-z">
            <legend className="slider-label">Nuclear charge Z</legend>
            {([1, 2] as const).map((z) => (
              <label key={z} className="scf-z-option">
                <input
                  type="radio"
                  name={`${zid}-z`}
                  checked={Z === z}
                  onChange={() => (setZ(z), setStep(1))}
                />{' '}
                Z = {z}
              </label>
            ))}
          </fieldset>
          <Slider
            label="Mixing alpha"
            min={0.05}
            max={1}
            step={0.05}
            value={alpha}
            onChange={(v) => (setAlpha(Math.round(v * 100) / 100), setStep(1))}
          />
          <Toggle
            label="Non-interacting (no repulsion)"
            checked={nonInteracting}
            onChange={(v) => (setNonInteracting(v), setStep(1))}
          />
          <Slider
            label="Show iteration"
            min={1}
            max={N}
            step={1}
            value={k}
            onChange={(v) => (setStep(v), setPlaying(false))}
          />
          {!reduced && (
            <Toggle
              label="Play the iterations"
              checked={playing}
              onChange={(v) => (v && atEnd && setStep(1), setPlaying(v))}
            />
          )}
        </>
      }
      readouts={readouts}
      notice={`This is a toy: one dimension, two electrons sharing one orbital, and Hartree-Fock (exact exchange, no correlation). It is not Kohn-Sham DFT and has no exchange-correlation functional; it is here because the loop is the same. Real VASP runs mix with Pulay or Broyden methods (AMIX, BMIX), not with this simple linear step. ${
        showExact
          ? "The exact energy comes from a separate exact two-electron calculation on the same grid, made by the site's reference script; it lies lower, as the variational principle requires."
          : ''
      }`}
      description={`Z = ${Z}, mixing ${alpha}${nonInteracting ? ', repulsion switched off' : ''}. Iteration ${k} of ${N}: residual ${it.residual.toExponential(2)}, total energy ${fmt(it.totalEnergy)} hartree, orbital energy ${fmt(it.orbitalEnergy)} hartree. The loop is ${BEHAVIOUR[res.behaviour]}. The first plot shows the density that went in and the density that came out; the second the bare nuclear potential and the effective potential; the third the residual of every iteration on a logarithmic axis.`}
    >
      <ol className="scf-cycle" aria-label="The steps of one iteration">
        {STEPS.map(([name, text], i) => (
          <li key={name}>
            <strong>
              {i + 1}. {name}
            </strong>{' '}
            <span>{text}</span>
          </li>
        ))}
      </ol>
      <div className="scf-plots">
        <CurvePlot
          title={`Density in and out at iteration ${k}`}
          x={res.x}
          yMin={0}
          yMax={nMax}
          yLabel="Density (1/bohr)"
          curves={[
            { y: it.densityIn, color: 'var(--text-muted)', dash: '5 4', label: 'density in' },
            { y: it.densityOut, color: 'var(--accent)', label: 'density out' },
          ]}
        />
        <CurvePlot
          title={`Potentials at iteration ${k}`}
          x={res.x}
          yMin={-Z}
          yMax={0.5}
          yLabel="Potential (Ha)"
          curves={[
            { y: res.vext, color: 'var(--text-muted)', dash: '5 4', label: 'nucleus only' },
            { y: it.potential, color: 'var(--accent)', label: 'effective (with repulsion)' },
          ]}
        />
        <ResidualPlot residuals={residuals} current={k} tol={1e-12} />
      </div>
    </LabShell>
  );
}
