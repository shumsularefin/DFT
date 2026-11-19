import { useState } from 'react';
import LabShell from './LabShell';

interface Rung {
  id: string;
  name: string;
  examples: string;
  adds: string;
  cost: string;
  tags: string;
}
// Rungs follow Perdew and Schmidt's picture of the ladder (S-046). Only the VASP tags below come from the author's tag cards (S-042).
const RUNGS: Rung[] = [
  {
    id: 'rpa',
    name: '5. Unoccupied orbitals (for example RPA)',
    examples: 'random-phase approximation',
    adds: 'Uses the empty orbitals as well, to describe correlation more completely.',
    cost: 'The most expensive rung shown here.',
    tags: 'LRPA appears in the tag list; see the VASP wiki before using it.',
  },
  {
    id: 'hybrid',
    name: '4. Hybrid',
    examples: 'HSE06, PBE0',
    adds: 'Mixes in a fraction of exact (Hartree-Fock) exchange.',
    cost: 'Far more expensive than a semilocal functional.',
    tags: 'LHFCALC = .TRUE., HFSCREEN (0.2 for HSE06, 0 for PBE0) and AEXX (0.25 in both).',
  },
  {
    id: 'meta',
    name: '3. Meta-GGA',
    examples: 'SCAN, r2SCAN',
    adds: 'Also depends on the kinetic-energy density of the orbitals.',
    cost: 'Somewhat more than a GGA.',
    tags: 'METAGGA = R2SCAN or SCAN (remove any GGA tag); LASPH needed; LMIXTAU can help the SCF.',
  },
  {
    id: 'gga',
    name: '2. Generalized gradient approximation (GGA)',
    examples: 'PBE',
    adds: 'Also depends on how fast the density changes (its gradient).',
    cost: 'Cheap; the usual starting point.',
    tags: 'Set by the POTCAR family (PE for PBE).',
  },
  {
    id: 'lda',
    name: '1. Local density approximation (LDA)',
    examples: 'LDA',
    adds: 'Depends only on the density at each point.',
    cost: 'The cheapest rung.',
    tags: 'Set by the POTCAR family; do not mix LDA and PBE files.',
  },
];

export default function LadderLab() {
  const [sel, setSel] = useState('gga');
  const r = RUNGS.find((x) => x.id === sel)!;
  return (
    <LabShell
      title="Jacob's ladder of functionals"
      goal="See what each rung adds to the exchange-correlation functional, what it costs and which VASP tags switch it on."
      badge="illustrative"
      onReset={() => setSel('gga')}
      controls={
        <fieldset className="mp-choice">
          <legend>Rung (top is most complete)</legend>
          {RUNGS.map((x) => (
            <label key={x.id}>
              <input type="radio" name="ladder-rung" checked={x.id === sel} onChange={() => setSel(x.id)} />
              {x.name}
            </label>
          ))}
        </fieldset>
      }
      readouts={[
        { label: 'Examples', value: r.examples },
        { label: 'What it adds', value: r.adds },
        { label: 'Cost', value: r.cost },
        { label: 'In VASP', value: r.tags },
      ]}
      notice="A diagram, not a ranking of results. Climbing the ladder adds ingredients and cost, but it does not guarantee a better answer for every material. The only numbers on this page come from the author's handbook: compared with experiment, PBE tends to overestimate lattice constants by about 1 to 2 percent and LDA to underestimate them by about 1 to 2 percent, with PBEsol and r2SCAN closer (S-042). That is a rule of thumb, not a law."
      description={`Selected rung: ${r.name}. Examples: ${r.examples}. ${r.adds} ${r.cost} In VASP: ${r.tags}`}
    >
      <ol className="ladder" aria-label="The five rungs, top to bottom">
        {RUNGS.map((x) => (
          <li
            key={x.id}
            aria-current={x.id === sel ? 'true' : undefined}
            style={{ fontWeight: x.id === sel ? 700 : 400 }}
          >
            {x.name}
          </li>
        ))}
      </ol>
    </LabShell>
  );
}
