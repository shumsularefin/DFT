import { useState } from 'react';
import LabShell from './LabShell';
import MiniPlot from './MiniPlot';
import Slider from '../ui/Slider';
import { dudarevEnergy, dudarevPotential } from '../../lib/physics/dftu';

const ns = Array.from({ length: 101 }, (_, i) => i / 100);

export default function DftuLab() {
  const [u, setU] = useState(4);
  const [n, setN] = useState(0.5);
  const e = dudarevEnergy(u, n);
  const v = dudarevPotential(u, n);
  const uMax = 8;
  return (
    <LabShell
      title="The DFT+U penalty for one orbital"
      goal="Move the occupation of one orbital and see which values the Dudarev penalty favours, and which way it pushes the level."
      badge="computed"
      onReset={() => (setU(4), setN(0.5))}
      controls={
        <>
          <Slider label="U_eff = U - J" min={0} max={uMax} step={0.1} value={u} unit="eV" onChange={setU} />
          <Slider label="Occupation n of the orbital" min={0} max={1} step={0.01} value={n} onChange={setN} />
        </>
      }
      readouts={[
        { label: 'Penalty E_U', value: e.toFixed(3), unit: 'eV' },
        { label: 'Potential shift V', value: v.toFixed(3), unit: 'eV' },
      ]}
      notice="This is the formula for a single orbital and a single spin, in the simple Dudarev form. It is a toy: a real calculation sums it over every correlated orbital of every marked atom and uses the occupation matrix from the calculation. The penalty is zero when the orbital is empty or full and largest at half filling, so it favours integer occupations. Where the potential is negative the level is pushed down (more electrons); where it is positive the level is pushed up (fewer)."
      description={`U_eff ${u.toFixed(1)} eV, occupation ${n.toFixed(2)}. The penalty is ${e.toFixed(3)} eV and the potential shift is ${v.toFixed(3)} eV. The first plot shows the penalty against occupation: an arch that is zero at 0 and 1 and highest at 0.5. The second shows the potential shift against occupation: a straight line from plus half of U_eff at 0 to minus half of U_eff at 1. A marker sits at the chosen occupation.`}
    >
      <div className="mp-plots">
        <MiniPlot
          title="Penalty E_U against occupation"
          xLabel="occupation n"
          yLabel="E_U (eV)"
          xMin={0}
          xMax={1}
          yMin={0}
          yMax={uMax / 8 + 0.0001}
          marks={[{ x: n, label: 'n' }]}
          curves={[
            {
              xs: ns,
              ys: ns.map((x) => dudarevEnergy(u, x)),
              label: 'E_U = (U_eff/2) n (1 - n)',
              color: '#0072B2',
            },
          ]}
        />
        <MiniPlot
          title="Potential shift V against occupation"
          xLabel="occupation n"
          yLabel="V (eV)"
          xMin={0}
          xMax={1}
          yMin={-uMax / 2}
          yMax={uMax / 2}
          hlines={[0]}
          marks={[{ x: n, label: 'n' }]}
          curves={[
            {
              xs: ns,
              ys: ns.map((x) => dudarevPotential(u, x)),
              label: 'V = U_eff (1/2 - n)',
              color: '#D55E00',
              dash: '6 3',
            },
          ]}
        />
      </div>
    </LabShell>
  );
}
