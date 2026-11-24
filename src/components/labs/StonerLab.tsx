import { useState } from 'react';
import LabShell from './LabShell';
import MiniPlot from './MiniPlot';
import Slider from '../ui/Slider';
import { solveStoner, stonerDosCurves, stonerEnergy } from '../../lib/physics/stoner';

const MOMENTS = Array.from({ length: 81 }, (_, i) => -2 + (4 * i) / 80);

export default function StonerLab() {
  const [dos, setDos] = useState(1.2);
  const [stonerI, setStonerI] = useState(1.0);
  const params = { dosPerSpin: dos, stonerI };
  const res = solveStoner(params);
  const dosPts = stonerDosCurves(params);
  const energies = MOMENTS.map((m) => stonerEnergy(params, m));
  const eMin = Math.min(-0.05, ...energies);
  const eMax = Math.max(0.25, ...energies);

  return (
    <LabShell
      title="Stoner criterion toy model"
      goal="Adjust the density of states at the Fermi level N(E_F) and the Stoner exchange parameter I to see when splitting up and down spins lowers the energy."
      badge="toy-model"
      onReset={() => {
        setDos(1.2);
        setStonerI(1.0);
      }}
      controls={
        <>
          <Slider
            label="DOS at Fermi level N(E_F) per spin"
            min={0.4}
            max={2.0}
            step={0.05}
            value={dos}
            unit="states/eV"
            onChange={setDos}
          />
          <Slider
            label="Stoner parameter I"
            min={0.2}
            max={1.6}
            step={0.05}
            value={stonerI}
            unit="eV"
            onChange={setStonerI}
          />
        </>
      }
      readouts={[
        {
          label: 'Product I * N(E_F)',
          value: res.productIN.toFixed(2),
          unit: res.isMagnetic ? '> 1' : '<= 1',
        },
        { label: 'Ground state', value: res.isMagnetic ? 'Spin-split' : 'Non-magnetic' },
        { label: 'Equilibrium moment m*', value: res.equilibriumMoment.toFixed(2), unit: 'mu_B' },
        { label: 'Energy change', value: res.energyGainEv.toFixed(3), unit: 'eV' },
      ]}
      notice="Toy model with a flat rectangular band (Blundell, S-059). When I * N(E_F) exceeds 1, the exchange gain outweighs the kinetic energy cost of moving electrons into one spin channel, so a spin-polarized state sits lower in energy than the non-magnetic state. Real metals have structured bands and self-consistent potentials."
      description={`N(E_F) = ${dos.toFixed(2)} states/eV per spin, I = ${stonerI.toFixed(2)} eV, I*N = ${res.productIN.toFixed(2)}. ${res.isMagnetic ? `Above the Stoner threshold 1: the spin-split state has lower energy by ${Math.abs(res.energyGainEv).toFixed(3)} eV at moment ${res.equilibriumMoment.toFixed(2)} mu_B.` : 'At or below the Stoner threshold 1: the non-magnetic state at m = 0 has the lowest energy.'}`}
    >
      <div className="mp-plots">
        <MiniPlot
          title="Energy change Delta E(m)"
          xLabel="moment m (mu_B)"
          yLabel="Delta E (eV)"
          xMin={-2}
          xMax={2}
          yMin={eMin}
          yMax={eMax}
          hlines={[0]}
          marks={[{ x: res.equilibriumMoment, label: 'm*' }]}
          curves={[
            {
              xs: MOMENTS,
              ys: energies,
              label: 'Delta E(m)',
              color: '#0072B2',
            },
          ]}
        />
        <MiniPlot
          title="Mirrored toy DOS (up positive, down negative)"
          xLabel="E - E_F (eV)"
          yLabel="DOS (states/eV)"
          xMin={-3.5}
          xMax={3.5}
          yMin={-2.2}
          yMax={2.2}
          hlines={[0]}
          marks={[{ x: 0, label: 'E_F' }]}
          curves={[
            {
              xs: dosPts.map((p) => p.energyEv),
              ys: dosPts.map((p) => p.up),
              label: 'spin up',
              color: '#0072B2',
            },
            {
              xs: dosPts.map((p) => p.energyEv),
              ys: dosPts.map((p) => p.down),
              label: 'spin down',
              color: '#D55E00',
              dash: '6 3',
            },
          ]}
        />
      </div>
    </LabShell>
  );
}
