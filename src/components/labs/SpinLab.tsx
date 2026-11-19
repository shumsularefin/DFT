import { useState } from 'react';
import LabShell from './LabShell';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import { compressMagmom } from '../../lib/magnetism/magmom';

const N = 4;
type Pattern = 'fm' | 'afm' | 'stripe' | 'layers';
const PATTERNS: { id: Pattern; label: string; sign: (i: number, j: number) => number }[] = [
  { id: 'fm', label: 'Ferromagnetic (all the same way)', sign: () => 1 },
  {
    id: 'afm',
    label: 'Antiferromagnetic, checkerboard (every neighbour opposite)',
    sign: (i, j) => ((i + j) % 2 === 0 ? 1 : -1),
  },
  {
    id: 'stripe',
    label: 'Antiferromagnetic, stripes (columns alternate)',
    sign: (_i, j) => (j % 2 === 0 ? 1 : -1),
  },
  { id: 'layers', label: 'Antiferromagnetic, layers (rows alternate)', sign: (i) => (i % 2 === 0 ? 1 : -1) },
];

export default function SpinLab() {
  const [pat, setPat] = useState<Pattern>('fm');
  const [mag, setMag] = useState(3);
  const [drop, setDrop] = useState(false);
  const p = PATTERNS.find((x) => x.id === pat)!;
  const values: number[] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) values.push(p.sign(i, j) * mag);
  const written = drop ? values.slice(0, -1) : values;
  const net = values.reduce((a, b) => a + b, 0);
  const cell = 56;
  return (
    <LabShell
      title="Spins and MAGMOM"
      goal="Pick an arrangement of up and down moments on a small square lattice and see the MAGMOM line that describes it, one value per atom in POSCAR order."
      badge="illustrative"
      onReset={() => (setPat('fm'), setMag(3), setDrop(false))}
      controls={
        <>
          <fieldset className="mp-choice">
            <legend>Arrangement</legend>
            {PATTERNS.map((x) => (
              <label key={x.id}>
                <input
                  type="radio"
                  name="spin-pattern"
                  checked={x.id === pat}
                  onChange={() => setPat(x.id)}
                />
                {x.label}
              </label>
            ))}
          </fieldset>
          <Slider
            label="Starting moment per atom"
            min={1}
            max={5}
            step={0.5}
            value={mag}
            unit="muB"
            onChange={setMag}
          />
          <Toggle label="Leave out the last atom's value" checked={drop} onChange={setDrop} />
        </>
      }
      readouts={[
        { label: 'Atoms in the cell', value: String(N * N) },
        { label: 'Values in MAGMOM', value: String(written.length) },
        {
          label: 'Count matches the atoms?',
          value: written.length === N * N ? 'yes' : 'no: one value per atom is required',
        },
        { label: 'Net starting moment', value: net.toFixed(1), unit: 'muB' },
        { label: 'MAGMOM line', value: `MAGMOM = ${compressMagmom(written)}` },
      ]}
      notice="A cartoon: signs are set by hand and the moments are starting guesses you choose, not computed values. VASP relaxes the moments during the run, and a collinear arrangement is only a starting point. A real antiferromagnetic cell often needs a larger cell than the chemical one, and all arrangements you compare should use the same cell. The rule shown here (one MAGMOM value per atom, in POSCAR order) comes from the author's tag card for MAGMOM."
      description={`A ${N} by ${N} lattice of atoms numbered row by row, arrangement: ${p.label}. Up arrows have a solid head and a plus sign, down arrows an open head and a minus sign. Starting moment ${mag} muB. MAGMOM has ${written.length} values for ${N * N} atoms.`}
    >
      <svg
        viewBox={`0 0 ${N * cell + 20} ${N * cell + 20}`}
        role="img"
        aria-label={`Spin arrangement: ${p.label}`}
        style={{ maxWidth: 320, width: '100%' }}
      >
        {values.map((v, k) => {
          const i = Math.floor(k / N);
          const j = k % N;
          const x = 10 + j * cell + cell / 2;
          const y = 10 + i * cell + cell / 2;
          const up = v > 0;
          return (
            <g key={k}>
              <circle cx={x} cy={y} r={20} fill="none" stroke="currentColor" strokeWidth={1} opacity={0.35} />
              <line
                x1={x}
                y1={up ? y + 12 : y - 12}
                x2={x}
                y2={up ? y - 10 : y + 10}
                stroke="currentColor"
                strokeWidth={2.5}
              />
              <path
                d={up ? `M${x} ${y - 14} l-6 9 h12 z` : `M${x} ${y + 14} l-6 -9 h12 z`}
                fill={up ? 'currentColor' : 'var(--bg, #fff)'}
                stroke="currentColor"
                strokeWidth={1.5}
              />
              <text x={x + 12} y={y - 12} fontSize={11} fill="currentColor">
                {up ? '+' : '-'}
              </text>
              <text x={x - 17} y={y + 22} fontSize={9} fill="currentColor" opacity={0.7}>
                {k + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </LabShell>
  );
}
