import { useId, useState } from 'react';
import LabShell from './LabShell';
import { compressRepeats } from '../../lib/vasp/builder';
import './LabPlots.css';

type Order = 'fm' | 'afm' | 'nm';
// A 2 x 2 checkerboard of magnetic Fe sites with an O site beside each, written Fe first then O as in a POSCAR.
const FE = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;
const MOMENT = '5.0';

function moments(order: Order): string[] {
  const fe = FE.map(([x, y]) =>
    order === 'nm' ? '0.0' : order === 'fm' ? MOMENT : (x + y) % 2 === 0 ? MOMENT : `-${MOMENT}`,
  );
  return [...fe, '0.6', '0.6', '0.6', '0.6'];
}

/** Lab "spin-cartoon" (illustrative): ferro- and antiferromagnetic orders and the MAGMOM line they need. */
export default function SpinCartoon() {
  const uid = useId();
  const [order, setOrder] = useState<Order>('fm');
  const m = moments(order);
  const S = 80;
  return (
    <LabShell
      title="Spin arrangements and MAGMOM"
      goal="Pick a magnetic order and see the MAGMOM line VASP needs: one starting moment per atom, in POSCAR order."
      badge="illustrative"
      onReset={() => setOrder('fm')}
      controls={
        <fieldset className="lp-radios">
          <legend>Magnetic order</legend>
          {(
            [
              ['fm', 'Ferromagnetic'],
              ['afm', 'Antiferromagnetic (checkerboard)'],
              ['nm', 'Non-magnetic start'],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="lp-radio">
              <input type="radio" name={`${uid}-o`} checked={order === id} onChange={() => setOrder(id)} />
              {label}
            </label>
          ))}
        </fieldset>
      }
      readouts={[
        { label: 'MAGMOM', value: compressRepeats(m) },
        { label: 'Values', value: `${m.length} for 8 atoms (4 Fe, 4 O)` },
        { label: 'ISPIN', value: '2' },
      ]}
      notice="The count must equal the number of atoms (here 8), in the order of the POSCAR, or VASP puts moments on the wrong atoms. An antiferromagnet needs opposite signs on neighbouring sites, and its cell must be large enough to hold both directions. Small starting moments on O (0.6 here) are a common convention; the converged moments come from the calculation."
      description={`A 2 by 2 grid of Fe sites with arrows: ${order === 'fm' ? 'all up' : order === 'afm' ? 'alternating up and down in a checkerboard' : 'no arrows'}. MAGMOM = ${compressRepeats(m)}.`}
    >
      <svg viewBox={`0 0 ${2 * S + 40} ${2 * S + 40}`} width="220" aria-hidden="true">
        {FE.map(([x, y], i) => {
          const cx = 20 + x * S + S / 2;
          const cy = 20 + y * S + S / 2;
          const up = m[i]!.startsWith('-') ? false : true;
          const has = order !== 'nm';
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r="22" fill="var(--surface-2)" stroke="var(--border-strong)" />
              <text x={cx - 26} y={cy - 24} fontSize="12" fill="currentColor">
                Fe{i + 1}
              </text>
              {has && (
                <path
                  d={
                    up
                      ? `M${cx},${cy + 14}L${cx},${cy - 14}M${cx - 6},${cy - 8}L${cx},${cy - 14}L${cx + 6},${cy - 8}`
                      : `M${cx},${cy - 14}L${cx},${cy + 14}M${cx - 6},${cy + 8}L${cx},${cy + 14}L${cx + 6},${cy + 8}`
                  }
                  stroke={up ? 'var(--accent)' : 'var(--danger)'}
                  strokeWidth="3"
                  fill="none"
                />
              )}
            </g>
          );
        })}
      </svg>
      <ol className="spin-list" aria-label="Starting moment per atom in POSCAR order">
        {m.map((v, i) => (
          <li key={i}>
            {i < 4 ? `Fe${i + 1}` : `O${i - 3}`}: {v}
          </li>
        ))}
      </ol>
      <p className="lp-muted">Illustrative layout, not a real crystal structure.</p>
    </LabShell>
  );
}
