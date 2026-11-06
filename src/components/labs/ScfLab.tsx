import { useEffect, useId, useMemo, useRef, useState } from 'react';
import LabShell from './LabShell';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import { runScf, type ScfResult } from '../../lib/physics/scf1d';
import './ScfLab.css';

const W = 480;
const PAD = { l: 52, r: 12 };
const XMIN = -8;
const XMAX = 8;
const MAX_IT = 400;
const TOL = 1e-10;

const STEPS = [
  'Guess a density',
  'Build the potential from it',
  'Solve for the orbital',
  'New density from the orbital',
  'Mix old and new',
  'Check: did the density change?',
] as const;

const px = (x: number) => PAD.l + ((x - XMIN) / (XMAX - XMIN)) * (W - PAD.l - PAD.r);

function path(x: Float64Array, y: ArrayLike<number>, sy: (v: number) => number): string {
  let s = '';
  for (let i = 0; i < x.length; i++) {
    if (x[i]! < XMIN || x[i]! > XMAX) continue;
    s += `${s ? 'L' : 'M'}${px(x[i]!).toFixed(1)},${sy(y[i]!).toFixed(1)}`;
  }
  return s;
}

const BEHAVIOUR: Record<ScfResult['behaviour'], string> = {
  converged: 'Converged',
  oscillating: 'Oscillating (jumps between two densities)',
  slow: `Not converged after ${MAX_IT} iterations (slow)`,
  diverging: 'Diverging',
};

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Lab "scf-loop": the self-consistency loop of a 1D two-electron toy model, iteration by iteration. */
export default function ScfLab() {
  const uid = useId();
  const [alpha, setAlpha] = useState(0.3);
  const [Z, setZ] = useState<1 | 2>(2);
  const [interacting, setInteracting] = useState(true);
  const [step, setStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  const run = useMemo(
    () => runScf({ Z, alpha, interacting, tol: TOL, maxIterations: MAX_IT }),
    [Z, alpha, interacting],
  );
  const n = run.iterations.length;
  const cur = run.iterations[Math.min(step, n) - 1]!;

  useEffect(() => setStep(1), [Z, alpha, interacting]);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(
      () => {
        setStep((s) => {
          if (s >= n) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        });
      },
      reducedMotion() ? 900 : 250,
    );
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, n]);

  // Density plot scale: the largest density in the whole run, so frames are comparable.
  const dMax = useMemo(() => {
    let m = 0;
    for (const it of run.iterations) for (const v of it.densityOut) m = Math.max(m, v);
    return m * 1.1 || 1;
  }, [run]);
  const vRange = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const it of run.iterations)
      for (let i = 0; i < run.x.length; i++) {
        if (run.x[i]! < XMIN || run.x[i]! > XMAX) continue;
        lo = Math.min(lo, it.potential[i]!, run.vext[i]!);
        hi = Math.max(hi, it.potential[i]!, run.vext[i]!);
      }
    return { lo: lo - 0.05 * (hi - lo), hi: hi + 0.05 * (hi - lo) };
  }, [run]);

  const D = { t: 14, b: 150 };
  const V = { t: 14, b: 150 };
  const R = { t: 14, b: 150 };
  const yD = (v: number) => D.b - (v / dMax) * (D.b - D.t);
  const yV = (v: number) => V.b - ((v - vRange.lo) / (vRange.hi - vRange.lo)) * (V.b - V.t);
  const res = run.iterations.map((i) => Math.max(i.residual, 1e-14));
  const lo = Math.floor(Math.log10(Math.min(...res, TOL)));
  const hi = Math.ceil(Math.log10(Math.max(...res)));
  const rx = (k: number) => PAD.l + ((k - 1) / Math.max(n - 1, 1)) * (W - PAD.l - PAD.r);
  const ry = (r: number) => R.b - ((Math.log10(Math.max(r, 1e-14)) - lo) / (hi - lo || 1)) * (R.b - R.t);
  const decades: number[] = [];
  for (let e = lo; e <= hi; e++) decades.push(e);
  const dstep = decades.length > 7 ? 2 : 1;
  let resPath = '';
  run.iterations.forEach(
    (it, i) => (resPath += `${i ? 'L' : 'M'}${rx(it.index).toFixed(1)},${ry(it.residual).toFixed(1)}`),
  );

  const reset = () => {
    setAlpha(0.3);
    setZ(2);
    setInteracting(true);
    setStep(1);
    setPlaying(false);
  };

  const fmt = (v: number, d = 6) => (Number.isFinite(v) ? v.toFixed(d) : 'not finite');
  return (
    <LabShell
      title="The self-consistency loop"
      goal="Watch a density and its potential chase each other until they agree, and see what the mixing parameter does."
      badge="toy-model"
      onReset={reset}
      controls={
        <>
          <Slider
            label="Mixing parameter alpha (share of the new density)"
            min={0.05}
            max={1}
            step={0.05}
            value={alpha}
            onChange={(v) => setAlpha(Math.round(v * 100) / 100)}
          />
          <fieldset className="scf-z">
            <legend>Nuclear charge Z</legend>
            {([1, 2] as const).map((z) => (
              <label key={z} className="scf-radio">
                <input type="radio" name={`${uid}-z`} checked={Z === z} onChange={() => setZ(z)} />Z = {z}
              </label>
            ))}
          </fieldset>
          <Toggle
            label="Electrons repel each other (Hartree potential)"
            checked={interacting}
            onChange={setInteracting}
          />
          <div className="scf-play">
            <button
              type="button"
              className="btn"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={playing}
              onClick={() => {
                if (!playing && step >= n) setStep(1);
                setPlaying(!playing);
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setStep((s) => Math.min(n, s + 1))}
              disabled={step >= n}
            >
              Next
            </button>
            <button type="button" className="btn" onClick={() => setStep(n)} disabled={step >= n}>
              Last
            </button>
          </div>
          <Slider
            label="Iteration"
            min={1}
            max={n}
            step={1}
            value={Math.min(step, n)}
            onChange={(v) => setStep(v)}
          />
        </>
      }
      readouts={[
        { label: 'Iteration', value: `${cur.index} of ${n}` },
        { label: 'Residual', value: cur.residual.toExponential(2) },
        { label: 'Orbital energy', value: fmt(cur.orbitalEnergy), unit: 'hartree' },
        { label: 'Total energy', value: fmt(cur.totalEnergy), unit: 'hartree' },
        { label: 'Outcome', value: BEHAVIOUR[run.behaviour] },
      ]}
      notice="With alpha around 0.3 the residual falls in a straight line on the log axis. Very small alpha is safe but slow. For Z = 1, alpha = 1 gets close and then flips back and forth between two densities: too much mixing. Without repulsion the loop is done in one step, because the potential no longer depends on the density."
      description={`Iteration ${cur.index} of ${n}. Top plot: input density (dashed) and output density (solid). Middle plot: external potential (dashed) and effective potential (solid). Bottom plot: residual against iteration on a logarithmic axis, ${BEHAVIOUR[run.behaviour].toLowerCase()}.`}
    >
      <ol className="scf-cycle" aria-label="The steps of one iteration">
        {STEPS.map((s, i) => (
          <li key={s} className={i === 5 && cur.residual < TOL ? 'scf-done' : undefined}>
            {s}
            {i === 5 && (
              <span className="scf-check"> {cur.residual < TOL ? 'No: stop.' : 'Yes: go round again.'}</span>
            )}
          </li>
        ))}
      </ol>
      <figure className="scf-fig">
        <figcaption>Density n(x), electrons per bohr</figcaption>
        <svg viewBox={`0 0 ${W} 170`} width="100%" aria-hidden="true">
          <line x1={PAD.l} x2={W - PAD.r} y1={D.b} y2={D.b} stroke="var(--border)" />
          <path
            d={path(run.x, cur.densityIn, yD)}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <path d={path(run.x, cur.densityOut, yD)} fill="none" stroke="var(--accent)" strokeWidth="2.6" />
          <text x={PAD.l - 6} y={D.t + 8} textAnchor="end" fontSize="12" fill="currentColor">
            {dMax.toFixed(2)}
          </text>
          <text x={PAD.l - 6} y={D.b} textAnchor="end" fontSize="12" fill="currentColor">
            0
          </text>
          <text x={px(0)} y={D.b + 16} textAnchor="middle" fontSize="12" fill="currentColor">
            x (bohr), from {XMIN} to {XMAX}
          </text>
        </svg>
        <p className="scf-legend">
          <span className="scf-key scf-key-dash" /> input density <span className="scf-key scf-key-solid" />{' '}
          output density
        </p>
      </figure>
      <figure className="scf-fig">
        <figcaption>Potential (hartree)</figcaption>
        <svg viewBox={`0 0 ${W} 170`} width="100%" aria-hidden="true">
          <path
            d={path(run.x, run.vext, yV)}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <path d={path(run.x, cur.potential, yV)} fill="none" stroke="var(--accent)" strokeWidth="2.6" />
          <text x={PAD.l - 6} y={V.t + 8} textAnchor="end" fontSize="12" fill="currentColor">
            {vRange.hi.toFixed(2)}
          </text>
          <text x={PAD.l - 6} y={V.b} textAnchor="end" fontSize="12" fill="currentColor">
            {vRange.lo.toFixed(2)}
          </text>
        </svg>
        <p className="scf-legend">
          <span className="scf-key scf-key-dash" /> nucleus only <span className="scf-key scf-key-solid" />{' '}
          nucleus plus half the Hartree potential
        </p>
      </figure>
      <figure className="scf-fig">
        <figcaption>Residual (how much the density changed), logarithmic axis</figcaption>
        <svg viewBox={`0 0 ${W} 175`} width="100%" aria-hidden="true">
          {decades
            .filter((_, i) => i % dstep === 0)
            .map((e) => (
              <g key={e}>
                <line x1={PAD.l} x2={W - PAD.r} y1={ry(10 ** e)} y2={ry(10 ** e)} stroke="var(--border)" />
                <text x={PAD.l - 6} y={ry(10 ** e) + 4} textAnchor="end" fontSize="12" fill="currentColor">
                  {`1e${e}`}
                </text>
              </g>
            ))}
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={ry(TOL)}
            y2={ry(TOL)}
            stroke="var(--ok)"
            strokeDasharray="3 3"
          />
          <path d={resPath} fill="none" stroke="var(--accent)" strokeWidth="2" />
          <circle cx={rx(cur.index)} cy={ry(cur.residual)} r="5" fill="var(--text)" />
          <text x={px(0)} y={R.b + 18} textAnchor="middle" fontSize="12" fill="currentColor">
            iteration 1 to {n}; dashed line: stop at 1e-10
          </text>
        </svg>
      </figure>
      <p className="scf-honest">
        Toy model: two electrons in one dimension, solved with restricted Hartree-Fock. It shows the loop that
        Kohn-Sham DFT also uses, but it is not Kohn-Sham DFT: there is no exchange-correlation functional.
        VASP mixes with Pulay or Broyden schemes (AMIX, BMIX), not the simple linear mixing used here.
      </p>
    </LabShell>
  );
}
