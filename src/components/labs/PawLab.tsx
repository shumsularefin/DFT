import { useMemo, useState } from 'react';
import LabShell from './LabShell';
import MiniPlot from './MiniPlot';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import { allElectronLike, augmentation, nodeCount, pseudo } from '../../lib/physics/paw';

const rs = Array.from({ length: 401 }, (_, i) => (i * 6) / 400);

export default function PawLab() {
  const [rc, setRc] = useState(2);
  const [diff, setDiff] = useState(false);
  const ae = useMemo(() => rs.map((r) => allElectronLike(r, rc)), [rc]);
  const ps = useMemo(() => rs.map((r) => pseudo(r)), []);
  const au = useMemo(() => rs.map((r) => augmentation(r, rc)), [rc]);
  const nAE = nodeCount((r) => allElectronLike(r, rc), 6);
  const yMax = Math.max(...ae, ...ps) * 1.1;
  const yMin = Math.min(...ae, ...ps, ...au) * 1.1;
  return (
    <LabShell
      title="The PAW picture"
      goal="See why a wavefunction that wiggles near the nucleus needs a smooth stand-in, and what the stand-in has to match."
      badge="illustrative"
      onReset={() => (setRc(2), setDiff(false))}
      controls={
        <>
          <Slider
            label="Cutoff radius r_c"
            min={0.6}
            max={3.5}
            step={0.1}
            value={rc}
            unit="bohr"
            onChange={setRc}
          />
          <Toggle label="Show what the augmentation adds back" checked={diff} onChange={setDiff} />
        </>
      }
      readouts={[
        { label: 'Nodes of the all-electron-like curve', value: String(nAE) },
        { label: 'Nodes of the smooth curve', value: '0' },
        { label: 'Curves agree for r', value: `at or beyond ${rc.toFixed(1)}`, unit: 'bohr' },
      ]}
      notice="Schematic. Both curves are invented shapes that show the idea. They are not the wavefunction of any real atom, and the radius is in made-up units. Inside the sphere of radius r_c the all-electron-like curve oscillates (it has nodes) because it must stay orthogonal to the core electrons. A plane-wave basis would need very many short waves to follow that. The smooth curve needs few, and matches the other one outside r_c. PAW keeps the smooth function for the plane-wave part and adds back the difference inside each sphere, so the real wiggles are still accounted for."
      description={`Cutoff radius ${rc.toFixed(1)}. The all-electron-like curve has ${nAE} nodes and oscillates inside the radius; the smooth curve has none; outside the radius they are identical. ${diff ? 'A third curve shows their difference, which is zero outside the radius.' : ''}`}
    >
      <MiniPlot
        title="Radial function against distance from the nucleus"
        xLabel="distance r (made-up units)"
        yLabel="amplitude"
        xMin={0}
        xMax={6}
        yMin={yMin}
        yMax={yMax}
        hlines={[0]}
        marks={[{ x: rc, label: 'r_c' }]}
        curves={[
          { xs: rs, ys: ae, label: 'all-electron-like (nodes inside r_c)', color: '#0072B2' },
          { xs: rs, ys: ps, label: 'smooth stand-in', color: '#D55E00', dash: '6 3' },
          ...(diff
            ? [{ xs: rs, ys: au, label: 'difference (augmentation)', color: '#009E73', dash: '2 3' }]
            : []),
        ]}
      />
    </LabShell>
  );
}
