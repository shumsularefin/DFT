import { useState } from 'react';
import LabShell from './LabShell';
import Slider from '../ui/Slider';
import { penaltyEnergy, penaltyPotential } from '../../lib/physics/dftu';
import './LabPlots.css';

const W = 480;
const H = 220;
const P = { l: 44, r: 12, t: 12, b: 34 };
const UMAX = 8;

/** Lab "dft-plus-u": the Dudarev penalty for one orbital and the potential it adds. */
export default function DftuLab() {
  const [u, setU] = useState(4);
  const [n, setN] = useState(0.5);
  const E = penaltyEnergy(u, n);
  const V = penaltyPotential(u, n);
  const px = (x: number) => P.l + x * (W - P.l - P.r);
  // shared vertical scale: -UMAX/2 .. +UMAX/2 eV
  const py = (v: number) => P.t + ((UMAX / 2 - v) / UMAX) * (H - P.t - P.b);
  const ns = Array.from({ length: 101 }, (_, i) => i / 100);
  const pE = ns
    .map((x, i) => `${i ? 'L' : 'M'}${px(x).toFixed(1)},${py(penaltyEnergy(u, x)).toFixed(1)}`)
    .join('');
  const pV = `M${px(0)},${py(penaltyPotential(u, 0))}L${px(1)},${py(penaltyPotential(u, 1))}`;
  return (
    <LabShell
      title="The DFT+U penalty"
      goal="See how the Hubbard U term penalises a half-filled orbital and pushes occupations towards empty or full."
      badge="computed"
      onReset={() => {
        setU(4);
        setN(0.5);
      }}
      controls={
        <>
          <Slider label="U_eff = U - J" min={0} max={UMAX} step={0.5} value={u} unit="eV" onChange={setU} />
          <Slider
            label="Occupation n of the orbital"
            min={0}
            max={1}
            step={0.05}
            value={n}
            onChange={(v) => setN(Math.round(v * 100) / 100)}
          />
        </>
      }
      readouts={[
        { label: 'Penalty energy E_U', value: E.toFixed(3), unit: 'eV' },
        { label: 'Potential shift V', value: V.toFixed(3), unit: 'eV' },
        {
          label: 'Effect',
          value:
            Math.abs(V) < 1e-12
              ? 'none at half filling'
              : V < 0
                ? 'pulls the orbital down (fills it)'
                : 'pushes the orbital up (empties it)',
        },
      ]}
      notice="The penalty is zero for an empty or full orbital and largest at half filling. The potential is negative for orbitals more than half full and positive for those less than half full, so occupied d or f states move down and empty ones up: the gap opens."
      description={`U_eff = ${u} eV, occupation ${n}. The plot shows the penalty energy E_U, a parabola from 0 at n = 0 to a maximum of ${(u / 8).toFixed(2)} eV at n = 0.5 and back to 0 at n = 1, and the straight line V = U_eff (1/2 - n). The current point has E_U = ${E.toFixed(3)} eV and V = ${V.toFixed(3)} eV.`}
    >
      <figure className="lp-fig">
        <figcaption>Penalty energy and potential (eV) against occupation n</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true">
          {[-4, -2, 0, 2, 4].map((v) => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={py(v)} y2={py(v)} stroke="var(--border)" />
              <text x={P.l - 6} y={py(v) + 4} textAnchor="end" fontSize="12" fill="currentColor">
                {v}
              </text>
            </g>
          ))}
          <path d={pV} fill="none" stroke="var(--text-muted)" strokeDasharray="5 4" strokeWidth="2" />
          <path d={pE} fill="none" stroke="var(--accent)" strokeWidth="2.6" />
          <circle cx={px(n)} cy={py(E)} r="5" fill="var(--accent)" />
          <circle cx={px(n)} cy={py(V)} r="5" fill="var(--text)" />
          {[0, 0.5, 1].map((x) => (
            <text key={x} x={px(x)} y={H - 12} textAnchor="middle" fontSize="12" fill="currentColor">
              {x}
            </text>
          ))}
        </svg>
        <p className="lp-legend">
          <span className="lp-key lp-solid" /> E_U = (U_eff / 2) n (1 - n) <span className="lp-key lp-dash" />{' '}
          V = U_eff (1/2 - n)
        </p>
      </figure>
      <p className="lp-muted">
        Toy: one orbital and the simplified (Dudarev) form. In VASP the occupations come from projections onto
        d or f orbitals of each atom, and U_eff is set per species with LDAUU and LDAUJ.
      </p>
    </LabShell>
  );
}
