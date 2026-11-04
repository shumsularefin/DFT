import { useCallback, useEffect, useMemo, useState } from 'react';
import LabShell from './LabShell';
import Lazy3D, { type SceneModule } from './Lazy3D';
import SolidFallback, { type FlatPoint } from './SolidFallback';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import { cellAtoms } from '../../lib/crystal/cellAtoms';
import { readStructure } from '../../lib/crystal/io';
import { speciesColors } from '../../lib/three/palette';
import { parallelepiped } from '../../lib/three/solid';
import type { CellScene, CellSummary } from '../../lib/three/CellScene';
import type { SceneController } from '../../lib/three/SceneController';
import type { Structure } from '../../lib/crystal/types';

const load = (): Promise<SceneModule> => import('../../lib/three/CellScene');
const isCell = (c: SceneController | null): c is CellScene =>
  !!c && typeof (c as CellScene).setStructure === 'function';

// Example cells are drawing demos taken from the repo's parser fixtures. The lattice constants are the ones used
// elsewhere in the handbook as worked examples; this page makes no claim about them.
const EXAMPLES: Record<string, { label: string; text: string }> = {
  cu: {
    label: 'fcc Cu, conventional cell',
    text: `Cu fcc
3.61
1 0 0
0 1 0
0 0 1
Cu
4
Direct
0 0 0
0 0.5 0.5
0.5 0 0.5
0.5 0.5 0
`,
  },
  nacl: {
    label: 'NaCl rock salt, conventional cell',
    text: `NaCl rock salt
5.64
1 0 0
0 1 0
0 0 1
Na Cl
4 4
Direct
0 0 0
0 0.5 0.5
0.5 0 0.5
0.5 0.5 0
0.5 0.5 0.5
0.5 0 0
0 0.5 0
0 0 0.5
`,
  },
};

const outlineColor = (): string => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#222222';
  } catch {
    return '#222222';
  }
};

/** Real-space unit cell viewer: atoms sized by covalent radius, coloured by element, optional bonds, supercell repeat. */
export default function UnitCellLab({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const [exampleId, setExampleId] = useState('cu');
  const [pasted, setPasted] = useState<Structure | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [repeat, setRepeat] = useState<[number, number, number]>([1, 1, 1]);
  const [bonds, setBonds] = useState(false);
  const [scene, setScene] = useState<CellScene | null>(null);
  const [summary, setSummary] = useState<CellSummary | null>(null);

  const structure = useMemo<Structure>(() => {
    if (exampleId === 'custom' && pasted) return pasted;
    return readStructure('example.vasp', EXAMPLES[exampleId === 'custom' ? 'cu' : exampleId]!.text).structure;
  }, [exampleId, pasted]);

  const onController = useCallback((c: SceneController | null) => {
    setScene(isCell(c) ? c : null);
    if (!c) setSummary(null);
  }, []);
  useEffect(() => {
    if (scene) setSummary(scene.setStructure(structure, { repeat, bonds, outline: outlineColor() }));
  }, [scene, structure, repeat, bonds]);

  const setAxis = (i: 0 | 1 | 2, v: number) =>
    setRepeat((r) => r.map((x, j) => (j === i ? v : x)) as [number, number, number]);
  const apply = () => {
    try {
      setPasted(readStructure('pasted.vasp', text).structure);
      setExampleId('custom');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this POSCAR.');
    }
  };

  const colors = useMemo(() => speciesColors(structure.species), [structure]);
  const flat = useMemo(() => {
    const atoms = cellAtoms(structure, repeat, true);
    const pts: FlatPoint[] = atoms.map((a) => ({ at: a.cart, color: colors.get(a.species) ?? '#777777' }));
    const block: Structure['lattice'] = [
      structure.lattice[0].map((x) => x * repeat[0]) as unknown as Structure['lattice'][0],
      structure.lattice[1].map((x) => x * repeat[1]) as unknown as Structure['lattice'][0],
      structure.lattice[2].map((x) => x * repeat[2]) as unknown as Structure['lattice'][0],
    ];
    return { pts, solid: parallelepiped(block) };
  }, [structure, repeat, colors]);

  const legend = [...colors].map(([symbol, color]) => ({ symbol, color }));
  const generic = summary?.legend.filter((l) => !l.tabulated).map((l) => l.symbol) ?? [];

  return (
    <LabShell
      title="Unit cell viewer"
      goal="See the atoms in a unit cell, repeat the cell, and turn bonds on to read the structure."
      badge="computed"
      headingLevel={headingLevel}
      controls={
        <>
          <div className="orbitals-select">
            <label htmlFor="uc-ex" className="slider-label">
              Structure
            </label>
            <select
              id="uc-ex"
              className="orbitals-select-input"
              value={exampleId}
              onChange={(e) => setExampleId(e.target.value)}
            >
              {Object.entries(EXAMPLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
              {pasted && <option value="custom">Your POSCAR</option>}
            </select>
          </div>
          <details>
            <summary>Use your own POSCAR</summary>
            <div className="cv-field">
              <label htmlFor="uc-poscar">Paste a POSCAR (read in your browser, nothing is uploaded)</label>
              <textarea id="uc-poscar" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <button type="button" onClick={apply}>
              Use this structure
            </button>
            {error && (
              <p className="cv-note" role="alert">
                {error}
              </p>
            )}
          </details>
          <Slider label="Repeat along a" min={1} max={3} value={repeat[0]} onChange={(v) => setAxis(0, v)} />
          <Slider label="Repeat along b" min={1} max={3} value={repeat[1]} onChange={(v) => setAxis(1, v)} />
          <Slider label="Repeat along c" min={1} max={3} value={repeat[2]} onChange={(v) => setAxis(2, v)} />
          <Toggle label="Show bonds" checked={bonds} onChange={setBonds} />
          {scene && (
            <div className="cv-actions" role="group" aria-label="Preset views">
              <button type="button" onClick={() => scene.viewAlongLattice(0)}>
                Along a
              </button>
              <button type="button" onClick={() => scene.viewAlongLattice(1)}>
                Along b
              </button>
              <button type="button" onClick={() => scene.viewAlongLattice(2)}>
                Along c
              </button>
            </div>
          )}
        </>
      }
      readouts={[
        { label: 'Atoms in the cell', value: structure.frac.length },
        { label: 'Atoms drawn', value: flat.pts.length },
        {
          label: 'Bonds',
          value: summary
            ? summary.bondsSkipped
              ? 'too many atoms to compute'
              : summary.bonds
            : 'start 3D to count',
        },
        { label: 'Elements', value: legend.map((l) => l.symbol).join(', ') },
      ]}
      onReset={() => {
        setExampleId('cu');
        setRepeat([1, 1, 1]);
        setBonds(false);
        scene?.resetView();
      }}
      notice="Atoms on a face, edge or corner of the cell are drawn again on the opposite side, so a conventional fcc cell shows 14 atoms although it holds 4. Sphere size follows the covalent radius and is only a drawing aid, not an atomic size. Bonds join atoms closer than 1.15 times the sum of their covalent radii, which is a drawing rule, not a calculation of bonding."
      description={`A ${repeat[0]} by ${repeat[1]} by ${repeat[2]} block of the ${structure.frac.length}-atom cell with ${flat.pts.length} atoms drawn. Elements: ${legend.map((l) => l.symbol).join(', ')}.`}
    >
      <ul
        className="cv-note"
        aria-label="Colour key"
        style={{ listStyle: 'none', display: 'flex', gap: '1rem', padding: 0 }}
      >
        {legend.map((l) => (
          <li key={l.symbol}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '0.9em',
                height: '0.9em',
                borderRadius: '50%',
                background: l.color,
                border: '1px solid currentColor',
                marginRight: '0.4em',
              }}
            />
            {l.symbol}
          </li>
        ))}
      </ul>
      {generic.length > 0 && (
        <p className="cv-note">
          No tabulated covalent radius for {generic.join(', ')}; a generic radius is drawn.
        </p>
      )}
      <Lazy3D
        load={load}
        onController={onController}
        posterText="This view uses WebGL. It loads only when you ask for it. A flat view with rotation sliders works without it."
        fallback={<SolidFallback solid={flat.solid} points={flat.pts} label="Flat view of the unit cell" />}
      />
      {!scene && <SolidFallback solid={flat.solid} points={flat.pts} label="Flat view of the unit cell" />}
    </LabShell>
  );
}
