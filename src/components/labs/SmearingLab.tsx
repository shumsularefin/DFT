import { useId, useMemo, useState } from 'react';
import LabShell from './LabShell';
import Slider from '../ui/Slider';
import { METHODS, delta, occupation, toyMetal, type SmearingMethod } from '../../lib/physics/smearing';
import './LabPlots.css';

const W = 480;
const H = 200;
const P = { l: 44, r: 12, t: 12, b: 34 };
const EMAX = 1; // eV either side of the Fermi level

/** Lab "smearing": occupation and broadened delta functions, and what SIGMA does to a toy metal's energy. */
export default function SmearingLab() {
  const uid = useId();
  const [method, setMethod] = useState<SmearingMethod>('gaussian');
  const [sigma, setSigma] = useState(0.1);
  const meta = METHODS.find((m) => m.id === method)!;

  const curves = useMemo(() => {
    const xs: number[] = [];
    for (let e = -EMAX; e <= EMAX + 1e-9; e += 0.005) xs.push(e);
    const f = xs.map((e) => occupation(method, e / sigma));
    const d = xs.map((e) => delta(method, e / sigma));
    return { xs, f, d };
  }, [method, sigma]);
  const metal = useMemo(() => {
    const r = toyMetal(method, sigma);
    const exact = 3; // (3/5) eF for eF = 5 eV
    return { ...r, dE: (r.E - exact) * 1000, TSmeV: r.TS * 1000, dF: (r.E - r.TS - exact) * 1000 };
  }, [method, sigma]);

  const px = (e: number) => P.l + ((e + EMAX) / (2 * EMAX)) * (W - P.l - P.r);
  const yF = (v: number) => P.t + ((1.15 - v) / 1.3) * (H - P.t - P.b);
  const dmax = Math.max(...curves.d, 0.6);
  const dmin = Math.min(...curves.d, 0);
  const yD = (v: number) => P.t + ((dmax - v) / (dmax - dmin)) * (H - P.t - P.b);
  const line = (ys: number[], sy: (v: number) => number) =>
    curves.xs.map((e, i) => `${i ? 'L' : 'M'}${px(e).toFixed(1)},${sy(ys[i]!).toFixed(1)}`).join('');
  const ok = metal.TSmeV < 1;
  const minF = Math.min(...curves.f);
  const maxF = Math.max(...curves.f);

  return (
    <LabShell
      title="Smearing"
      goal="See how each smearing method spreads the occupations around the Fermi level, and what SIGMA costs in energy."
      badge="computed"
      onReset={() => {
        setMethod('gaussian');
        setSigma(0.1);
      }}
      controls={
        <>
          <fieldset className="lp-radios">
            <legend>Method</legend>
            {METHODS.map((m) => (
              <label key={m.id} className="lp-radio">
                <input
                  type="radio"
                  name={`${uid}-m`}
                  checked={method === m.id}
                  onChange={() => setMethod(m.id)}
                />
                {m.label}
                {m.ismear && <span className="lp-muted"> (ISMEAR = {m.ismear})</span>}
              </label>
            ))}
          </fieldset>
          <Slider
            label="SIGMA"
            min={0.01}
            max={0.5}
            step={0.01}
            value={sigma}
            unit="eV"
            onChange={(v) => setSigma(Math.round(v * 100) / 100)}
          />
        </>
      }
      readouts={[
        { label: 'Occupation range', value: `${minF.toFixed(3)} to ${maxF.toFixed(3)}` },
        { label: 'Band energy error E - E(0)', value: metal.dE.toFixed(3), unit: 'meV' },
        { label: 'Entropy term T*S', value: metal.TSmeV.toFixed(3), unit: 'meV' },
        { label: 'F - E(0)', value: metal.dF.toFixed(3), unit: 'meV' },
        { label: 'Heuristic check T*S below 1 meV per atom', value: ok ? 'passes' : 'fails' },
      ]}
      notice="Gaussian and Fermi-Dirac occupations stay between 0 and 1. Methfessel-Paxton goes slightly below 0 and above 1, which is the price of its small energy error in metals; cold smearing never goes negative. The entropy term grows with SIGMA squared: double SIGMA and it roughly quadruples."
      description={`${meta.label} smearing with SIGMA = ${sigma.toFixed(2)} eV. Top plot: occupation from 1 to 0 across the Fermi level between -1 and +1 eV, compared with the sharp step. Bottom plot: the broadened delta function. Toy metal: band energy error ${metal.dE.toFixed(3)} meV, entropy term ${metal.TSmeV.toFixed(3)} meV per electron.`}
    >
      <figure className="lp-fig">
        <figcaption>Occupation f against energy minus Fermi level (eV)</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true">
          {[0, 1].map((v) => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={yF(v)} y2={yF(v)} stroke="var(--border)" />
              <text x={P.l - 6} y={yF(v) + 4} textAnchor="end" fontSize="12" fill="currentColor">
                {v}
              </text>
            </g>
          ))}
          <path
            d={`M${px(-EMAX)},${yF(1)}L${px(0)},${yF(1)}L${px(0)},${yF(0)}L${px(EMAX)},${yF(0)}`}
            fill="none"
            stroke="var(--text-muted)"
            strokeDasharray="5 4"
            strokeWidth="2"
          />
          <path d={line(curves.f, yF)} fill="none" stroke="var(--accent)" strokeWidth="2.6" />
          {[-1, -0.5, 0, 0.5, 1].map((e) => (
            <text key={e} x={px(e)} y={H - 12} textAnchor="middle" fontSize="12" fill="currentColor">
              {e}
            </text>
          ))}
        </svg>
        <p className="lp-legend">
          <span className="lp-key lp-dash" /> no smearing (step) <span className="lp-key lp-solid" />{' '}
          {meta.label}
        </p>
      </figure>
      <figure className="lp-fig">
        <figcaption>Broadened delta function (per unit of x = (e - mu) / SIGMA)</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true">
          <line x1={P.l} x2={W - P.r} y1={yD(0)} y2={yD(0)} stroke="var(--border)" />
          <text x={P.l - 6} y={yD(0) + 4} textAnchor="end" fontSize="12" fill="currentColor">
            0
          </text>
          <path d={line(curves.d, yD)} fill="none" stroke="var(--accent)" strokeWidth="2.6" />
          {[-1, -0.5, 0, 0.5, 1].map((e) => (
            <text key={e} x={px(e)} y={H - 12} textAnchor="middle" fontSize="12" fill="currentColor">
              {e}
            </text>
          ))}
        </svg>
      </figure>
      <p className="lp-muted">
        Toy metal: one electron per atom with a free-electron density of states and a 5 eV Fermi energy, so
        the exact band energy is 3 eV. The Fermi level is moved to keep the electron count fixed, as VASP
        does. Real values of T*S are in OUTCAR (grep EENTRO). The 1 meV per atom limit is a rule of thumb from
        the author's handbook.
      </p>
    </LabShell>
  );
}
