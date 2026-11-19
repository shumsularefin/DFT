import { useMemo, useState } from 'react';
import LabShell from './LabShell';
import MiniPlot from './MiniPlot';
import Slider from '../ui/Slider';
import { SMEARINGS, TOY_DOS, delta, occupation, toyMetal, type SmearingId } from '../../lib/physics/smearing';

const COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#6c6c00'];
const DASHES = [undefined, '6 3', '2 3', '8 3 2 3', '1 4'];
const xs = Array.from({ length: 301 }, (_, i) => -5 + (i * 10) / 300);
const es = Array.from({ length: 241 }, (_, i) => -1.2 + (i * 2.4) / 240);

/** Heuristic from the author's protocol (S-042): T*S per atom below about 1 meV. */
const EENTRO_MEV = 1;

export default function SmearingLab() {
  const [id, setId] = useState<SmearingId>('gaussian');
  const [sigma, setSigma] = useState(0.1);
  const idx = SMEARINGS.findIndex((s) => s.id === id);
  const scheme = SMEARINGS[idx]!;
  const res = useMemo(() => toyMetal(id, sigma), [id, sigma]);
  const f = useMemo(() => xs.map((x) => occupation(id, x)), [id]);
  const d = useMemo(() => xs.map((x) => delta(id, x)), [id]);
  const fE = useMemo(() => es.map((e) => occupation(id, (e - res.mu) / sigma)), [id, res.mu, sigma]);
  const gE = useMemo(() => es.map((e) => TOY_DOS.g(e)), []);
  const entropyMeV = Math.abs(res.entropyTerm) * 1000;
  const fMin = Math.min(...f);
  const fMax = Math.max(...f);
  const outside = fMin < -1e-3 || fMax > 1 + 1e-3;
  const tag =
    scheme.ismear === null
      ? 'No ISMEAR value is claimed for this scheme on this page (open question Q-045).'
      : `In VASP this is ISMEAR = ${scheme.ismear === -1 ? '-1' : scheme.ismear}, with SIGMA set to the width.`;
  return (
    <LabShell
      title="Smearing and the entropy term"
      goal="See how each smearing scheme spreads electrons over energy, and what a wider SIGMA does to the energy of a toy metal."
      badge="toy-model"
      onReset={() => (setId('gaussian'), setSigma(0.1))}
      controls={
        <>
          <fieldset className="mp-choice">
            <legend>Smearing scheme</legend>
            {SMEARINGS.map((s) => (
              <label key={s.id}>
                <input
                  type="radio"
                  name="smearing-scheme"
                  checked={s.id === id}
                  onChange={() => setId(s.id)}
                />
                {s.label}
              </label>
            ))}
          </fieldset>
          <Slider
            label="SIGMA (width)"
            min={0.01}
            max={0.5}
            step={0.01}
            value={sigma}
            unit="eV"
            onChange={setSigma}
          />
        </>
      }
      readouts={[
        { label: 'Band energy shift', value: (res.bandShift * 1000).toFixed(2), unit: 'meV/atom' },
        { label: 'Entropy term -sigma S', value: (res.entropyTerm * 1000).toFixed(2), unit: 'meV/atom' },
        { label: 'Free energy shift', value: (res.freeShift * 1000).toFixed(2), unit: 'meV/atom' },
        { label: 'T S below 1 meV/atom? (heuristic)', value: entropyMeV < EENTRO_MEV ? 'yes' : 'no' },
      ]}
      notice={`${tag} The upper plot is in units of x = (energy - Fermi level) / SIGMA, so every scheme can be compared on one axis. The lower plot uses a made-up toy DOS (a flat band with a peak just below the Fermi level), not a real metal; its numbers show the trend only. ${outside ? `For this scheme the occupation goes below 0 or above 1 (range ${fMin.toFixed(3)} to ${fMax.toFixed(3)}). That is a known property of Methfessel-Paxton and cold smearing, not a mistake. ` : ''}The "1 meV per atom" line is the handbook rule of thumb for the EENTRO check, a heuristic and not a law.`}
      description={`Scheme ${scheme.label}, SIGMA ${sigma} eV. For the toy metal the band energy shifts by ${(res.bandShift * 1000).toFixed(2)} meV per atom, the entropy term is ${(res.entropyTerm * 1000).toFixed(2)} meV per atom and the free energy shifts by ${(res.freeShift * 1000).toFixed(2)} meV per atom. The occupation ranges from ${fMin.toFixed(3)} to ${fMax.toFixed(3)}. The first plot shows the occupation and the broadened delta function against x. The second shows the toy density of states with the occupation drawn over it, against energy in eV.`}
    >
      <div className="mp-plots">
        <MiniPlot
          title="Occupation and broadened delta function against x"
          xLabel="x = (energy - Fermi level) / SIGMA"
          yLabel="f (solid), delta (dashed)"
          xMin={-5}
          xMax={5}
          yMin={-0.2}
          yMax={1.2}
          hlines={[0, 1]}
          curves={[
            { xs, ys: f, label: 'occupation f', color: COLORS[idx]! },
            { xs, ys: d, label: 'delta = -df/dx', color: COLORS[idx]!, dash: '6 3' },
          ]}
        />
        <MiniPlot
          title="Toy density of states with the occupation drawn over it"
          xLabel="energy (eV), Fermi level at 0"
          yLabel="states per eV per atom"
          xMin={-1.2}
          xMax={1.2}
          yMin={0}
          yMax={1.6}
          marks={[{ x: 0, label: 'E_F' }]}
          curves={[
            { xs: es, ys: gE, label: 'toy DOS g(e)', color: '#555555', fill: true },
            {
              xs: es,
              ys: fE.map((v) => v * 1.5),
              label: 'occupation (scaled by 1.5)',
              color: COLORS[idx]!,
              dash: DASHES[idx],
            },
          ]}
        />
      </div>
    </LabShell>
  );
}
