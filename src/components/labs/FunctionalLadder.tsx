import { useState } from 'react';
import LabShell from './LabShell';
import './LabPlots.css';

interface Rung {
  id: string;
  name: string;
  adds: string;
  examples: string;
  vasp: string;
  cost: string;
  note: string;
}
// Ingredients and examples: S-046 (ladder), S-013 (PBE), S-026 (SCAN), S-025 (HSE06). The only numbers shown are
// the lattice-constant tendencies from the author's handbook (S-042).
const RUNGS: Rung[] = [
  {
    id: 'rpa',
    name: '5. Fifth rung (RPA and beyond)',
    adds: 'Unoccupied orbitals as well',
    examples: 'Random-phase approximation',
    vasp: 'Specialist setup; see the VASP wiki pages on ACFDT and RPA',
    cost: 'Highest: research use',
    note: 'Rarely the first choice for a project.',
  },
  {
    id: 'hybrid',
    name: '4. Hybrid',
    adds: 'A fraction of exact (Hartree-Fock) exchange',
    examples: 'HSE06, PBE0',
    vasp: 'LHFCALC = .TRUE. with HFSCREEN = 0.2 for HSE06',
    cost: 'High: much more than a GGA run',
    note: 'Better band gaps than GGA for many semiconductors.',
  },
  {
    id: 'meta',
    name: '3. Meta-GGA',
    adds: 'The kinetic-energy density',
    examples: 'SCAN, r2SCAN',
    vasp: 'METAGGA = R2SCAN (and LASPH = .TRUE.)',
    cost: 'Moderate: more than a GGA run',
    note: 'Improves many structural and energetic properties.',
  },
  {
    id: 'gga',
    name: '2. GGA',
    adds: 'The gradient of the density',
    examples: 'PBE, PBEsol',
    vasp: 'GGA = PE (the default with PBE POTCARs)',
    cost: 'Low: the everyday choice',
    note: 'PBE lattice constants are typically about 1 to 2 % too large.',
  },
  {
    id: 'lda',
    name: '1. LDA',
    adds: 'The density at each point only',
    examples: 'LDA (Ceperley-Alder, Perdew-Zunger)',
    vasp: 'Needs LDA POTCARs or GGA = CA',
    cost: 'Lowest',
    note: 'LDA lattice constants are typically about 1 to 2 % too small.',
  },
];

/** Lab "functional-ladder" (illustrative): Jacob's ladder of exchange-correlation approximations. */
export default function FunctionalLadder() {
  const [sel, setSel] = useState('gga');
  const r = RUNGS.find((x) => x.id === sel)!;
  return (
    <LabShell
      title="Jacob's ladder of functionals"
      goal="Climb the ladder: see what each rung adds, what it costs, and how to ask VASP for it."
      badge="illustrative"
      onReset={() => setSel('gga')}
      readouts={[
        { label: 'Rung', value: r.name },
        { label: 'Adds', value: r.adds },
        { label: 'Relative cost', value: r.cost },
      ]}
      notice="Each rung adds an ingredient and usually costs more. Higher is not automatically better for every property: test the property you care about, and say which functional you used."
      description={`A ladder of five rungs from LDA at the bottom to the fifth rung at the top. Selected: ${r.name}. Adds ${r.adds}. Examples: ${r.examples}. In VASP: ${r.vasp}. ${r.note}`}
    >
      <ol className="ladder" aria-label="Rungs, top to bottom">
        {RUNGS.map((x) => (
          <li key={x.id}>
            <button
              type="button"
              className={`ladder-rung${x.id === sel ? ' is-sel' : ''}`}
              aria-pressed={x.id === sel}
              onClick={() => setSel(x.id)}
            >
              {x.name}
            </button>
          </li>
        ))}
      </ol>
      <dl className="ladder-detail">
        <dt>Examples</dt>
        <dd>{r.examples}</dd>
        <dt>In VASP (6.x)</dt>
        <dd>{r.vasp}</dd>
        <dt>Note</dt>
        <dd>{r.note}</dd>
      </dl>
      <p className="lp-muted">
        Illustrative diagram. Costs are described in words only; the percentages are rules of thumb from the
        author's handbook.
      </p>
    </LabShell>
  );
}
