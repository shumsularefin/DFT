import { useMemo, useState, type MouseEvent } from 'react';
import Badge from '../../ui/Badge';
import StructureView from '../../structure/StructureView';
import { createHistory, push, undo, redo, canUndo, canRedo, type History } from '../../../lib/history';
import {
  expandHydrogens,
  graphToSmiles,
  type BondOrder,
  type MolAtom,
  type MolBond,
  type MolGraph,
} from '../../../lib/chem/molgraph';
import { GEOMETRY_LABEL, geometry3d, type Geom3dResult } from '../../../lib/chem/geom3d';
import { DEFAULT_MOLECULE_VACUUM, moleculeInBox, writeMolBlock, writeXyz } from '../../../lib/chem/molexport';
import { writePoscar } from '../../../lib/crystal/poscar';
import { sendHandoff } from '../../../lib/handoff';
import './builder.css';

const QUICK_ELEMENTS = ['C', 'N', 'O', 'H', 'S', 'P', 'F', 'Cl', 'Br', 'I'] as const;

const ETHANOL: MolGraph = {
  atoms: [
    { el: 'C', charge: 0, hCount: 3 },
    { el: 'C', charge: 0, hCount: 2 },
    { el: 'O', charge: 0, hCount: 1 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1 },
    { a: 1, b: 2, order: 1 },
  ],
  coords2d: [
    [1.0, 0.0],
    [2.4, 0.6],
    [3.8, 0.0],
  ],
};

const WATER: MolGraph = {
  atoms: [
    { el: 'H', charge: 0, hCount: 0 },
    { el: 'O', charge: 0, hCount: 0 },
    { el: 'H', charge: 0, hCount: 0 },
  ],
  bonds: [
    { a: 0, b: 1, order: 1 },
    { a: 1, b: 2, order: 1 },
  ],
  coords2d: [
    [1.2, 0.8],
    [2.2, 0.0],
    [3.2, 0.8],
  ],
};

const CO2: MolGraph = {
  atoms: [
    { el: 'O', charge: 0, hCount: 0 },
    { el: 'C', charge: 0, hCount: 0 },
    { el: 'O', charge: 0, hCount: 0 },
  ],
  bonds: [
    { a: 0, b: 1, order: 2 },
    { a: 1, b: 2, order: 2 },
  ],
  coords2d: [
    [0.8, 0.5],
    [2.2, 0.5],
    [3.6, 0.5],
  ],
};

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getCoord(graph: MolGraph, idx: number): [number, number] {
  return graph.coords2d?.[idx] ?? [1 + idx * 1.1, 0];
}

export default function MoleculeBuilder() {
  const [hist, setHist] = useState<History<MolGraph>>(() => createHistory(ETHANOL, 100, 'Ethanol'));
  const [activeEl, setActiveEl] = useState<string>('C');
  const [selectedAtom, setSelectedAtom] = useState<number | null>(null);
  const [vacuumA, setVacuumA] = useState(DEFAULT_MOLECULE_VACUUM);
  const [geom3d, setGeom3d] = useState<Geom3dResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const graph = hist.present.state;

  const smiles = useMemo(() => {
    try {
      return graph.atoms.length > 0 ? graphToSmiles(graph).smiles : '';
    } catch {
      return '(unconverted)';
    }
  }, [graph]);

  function commit(next: MolGraph, label: string) {
    setHist((h) => push(h, next, label));
    setGeom3d(null);
    setErr(null);
  }

  function addAtomAt(x: number, y: number) {
    const atom: MolAtom = { el: activeEl, charge: 0, hCount: 0 };
    const nextIdx = graph.atoms.length;
    const bonds: MolBond[] =
      selectedAtom !== null && selectedAtom < graph.atoms.length
        ? [...graph.bonds, { a: selectedAtom, b: nextIdx, order: 1 }]
        : [...graph.bonds];
    const coords2d: [number, number][] = [
      ...(graph.coords2d ?? graph.atoms.map((_, i) => getCoord(graph, i))),
      [x, y],
    ];
    commit({ atoms: [...graph.atoms, atom], bonds, coords2d }, `Add ${activeEl}`);
    setSelectedAtom(nextIdx);
  }

  function onCanvasClick(e: MouseEvent<SVGSVGElement>) {
    if ((e.target as Element).tagName !== 'svg') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 6;
    const y = ((e.clientY - rect.top) / rect.height) * 4 - 1.5;
    addAtomAt(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  }

  function onAtomClick(idx: number) {
    if (selectedAtom === null) {
      setSelectedAtom(idx);
      return;
    }
    if (selectedAtom === idx) {
      setSelectedAtom(null);
      return;
    }
    const exists = graph.bonds.findIndex(
      (b) => (b.a === selectedAtom && b.b === idx) || (b.a === idx && b.b === selectedAtom),
    );
    if (exists >= 0) {
      setSelectedAtom(idx);
      return;
    }
    commit(
      {
        atoms: graph.atoms,
        bonds: [...graph.bonds, { a: selectedAtom, b: idx, order: 1 }],
        coords2d: graph.coords2d,
      },
      `Bond ${selectedAtom + 1}-${idx + 1}`,
    );
    setSelectedAtom(idx);
  }

  function cycleBond(bondIdx: number) {
    const nextOrder = (o: BondOrder): BondOrder => (o === 1 ? 2 : o === 2 ? 3 : 1);
    const bonds = graph.bonds.map((b, i) => (i === bondIdx ? { ...b, order: nextOrder(b.order) } : b));
    commit({ atoms: graph.atoms, bonds, coords2d: graph.coords2d }, `Cycle bond ${bondIdx + 1}`);
  }

  function deleteSelected() {
    if (selectedAtom === null) return;
    const atoms = graph.atoms.filter((_, i) => i !== selectedAtom);
    const coords2d = (graph.coords2d ?? graph.atoms.map((_, i) => getCoord(graph, i))).filter(
      (_, i) => i !== selectedAtom,
    );
    const bonds = graph.bonds
      .filter((b) => b.a !== selectedAtom && b.b !== selectedAtom)
      .map((b) => ({
        ...b,
        a: b.a > selectedAtom ? b.a - 1 : b.a,
        b: b.b > selectedAtom ? b.b - 1 : b.b,
      }));
    commit({ atoms, bonds, coords2d }, `Delete atom ${selectedAtom + 1}`);
    setSelectedAtom(null);
  }

  function adjustCharge(delta: number) {
    if (selectedAtom === null) return;
    const atoms = graph.atoms.map((a, i) => (i === selectedAtom ? { ...a, charge: a.charge + delta } : a));
    commit({ atoms, bonds: graph.bonds, coords2d: graph.coords2d }, `Charge ${delta > 0 ? '+' : ''}${delta}`);
  }

  function run3DCleanup() {
    try {
      setErr(null);
      const expanded = expandHydrogens(graph);
      const res = geometry3d(expanded, { seed: 42 });
      setGeom3d(res);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  const boxed = useMemo(() => {
    if (!geom3d) return null;
    return moleculeInBox(
      geom3d.graph.atoms.map((a) => a.el),
      geom3d.positions,
      { vacuumA },
    );
  }, [geom3d, vacuumA]);

  return (
    <div className="mb-root" data-tool-id="molecule-builder">
      <div className="mb-toolbar" role="toolbar" aria-label="Molecule editing operations">
        <button type="button" className="mb-btn" onClick={() => commit(ETHANOL, 'Load Ethanol')}>
          Ethanol
        </button>
        <button type="button" className="mb-btn" onClick={() => commit(WATER, 'Load Water')}>
          Water
        </button>
        <button type="button" className="mb-btn" onClick={() => commit(CO2, 'Load CO2')}>
          CO2
        </button>
        <button type="button" className="mb-btn" disabled={!canUndo(hist)} onClick={() => setHist(undo)}>
          Undo
        </button>
        <button type="button" className="mb-btn" disabled={!canRedo(hist)} onClick={() => setHist(redo)}>
          Redo
        </button>
        <button type="button" className="mb-btn" onClick={() => addAtomAt(2 + graph.atoms.length * 0.4, 0)}>
          Add {activeEl} (keyboard)
        </button>
        <button
          type="button"
          className="mb-btn"
          disabled={selectedAtom === null}
          onClick={() => adjustCharge(1)}
        >
          Charge +
        </button>
        <button
          type="button"
          className="mb-btn"
          disabled={selectedAtom === null}
          onClick={() => adjustCharge(-1)}
        >
          Charge -
        </button>
        <button type="button" className="mb-btn" disabled={selectedAtom === null} onClick={deleteSelected}>
          Delete atom
        </button>
        <button type="button" className="mb-btn" onClick={run3DCleanup}>
          Clean up in 3D
        </button>
      </div>

      <div className="mb-toolbar" role="group" aria-label="Quick elements">
        <span>Active element:</span>
        {QUICK_ELEMENTS.map((el) => (
          <button
            key={el}
            type="button"
            className="mb-btn"
            aria-pressed={activeEl === el}
            onClick={() => setActiveEl(el)}
          >
            {el}
          </button>
        ))}
      </div>

      {err && <p role="alert">{err}</p>}

      <div className="mb-layout">
        <div className="mb-panel">
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--step--1)' }}>
            SMILES: <code>{smiles}</code> | {graph.atoms.length} heavy/explicit atom(s), {graph.bonds.length}{' '}
            bond(s)
          </p>
          <svg
            viewBox="0 -1.5 6 4"
            width="100%"
            height="280"
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius)',
              cursor: 'crosshair',
            }}
            role="img"
            aria-label="2D molecule drawing canvas. Click empty space to add atoms, click atoms to bond, click bonds to cycle order."
            onClick={onCanvasClick}
          >
            {graph.bonds.map((b, i) => {
              const [x1, y1] = getCoord(graph, b.a);
              const [x2, y2] = getCoord(graph, b.b);
              return (
                <line
                  key={`b-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={b.order === 2 ? '#D55E00' : b.order === 3 ? '#009E73' : 'currentColor'}
                  strokeWidth={b.order === 1 ? 0.06 : b.order === 2 ? 0.11 : 0.15}
                  style={{ cursor: 'pointer' }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    cycleBond(i);
                  }}
                />
              );
            })}
            {graph.atoms.map((a, i) => {
              const [cx, cy] = getCoord(graph, i);
              return (
                <g
                  key={`a-${i}`}
                  style={{ cursor: 'pointer' }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onAtomClick(i);
                  }}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={0.28}
                    fill={selectedAtom === i ? '#0072B2' : 'var(--surface)'}
                    stroke="currentColor"
                    strokeWidth={0.04}
                  />
                  <text
                    x={cx}
                    y={cy + 0.09}
                    textAnchor="middle"
                    fontSize="0.24"
                    fill={selectedAtom === i ? '#ffffff' : 'currentColor'}
                  >
                    {a.el}
                    {a.hCount > 0 ? `H${a.hCount > 1 ? a.hCount : ''}` : ''}
                    {a.charge ? (a.charge > 0 ? `+${a.charge}` : String(a.charge)) : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mb-panel">
          <h2 style={{ margin: 0, fontSize: 'var(--step-1)' }}>
            3D clean-up &amp; VASP box export <Badge variant="heuristic" />
          </h2>
          <p style={{ margin: 0, fontSize: 'var(--step--1)', color: 'var(--text-muted)' }}>
            {GEOMETRY_LABEL} Water H-O-H idealizes to 109.47 deg in this steric-4 model (experimental 104.5
            deg).
          </p>
          <label style={{ fontSize: 'var(--step--1)' }}>
            Vacuum padding (A, min 10 A):{' '}
            <input
              type="number"
              min={8}
              max={25}
              step={1}
              value={vacuumA}
              onChange={(e) => setVacuumA(Math.max(8, Number(e.target.value) || 10))}
              style={{ width: '5rem' }}
            />
          </label>

          {geom3d && boxed ? (
            <>
              <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--step--1)' }}>
                3D clean-up ready ({geom3d.graph.atoms.length} atoms with explicit H). Use Gamma-only k-points
                and ISIF = 2 for molecules in a box (V023).
              </p>
              <StructureView structure={boxed.structure} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="mb-btn"
                  onClick={() =>
                    downloadText(
                      writeXyz(
                        geom3d.graph.atoms.map((a) => a.el),
                        geom3d.positions,
                        smiles || 'molecule',
                      ),
                      'molecule.xyz',
                    )
                  }
                >
                  Export XYZ
                </button>
                <button
                  type="button"
                  className="mb-btn"
                  onClick={() =>
                    downloadText(
                      writeMolBlock(geom3d.graph, geom3d.positions, smiles || 'molecule'),
                      'molecule.mol',
                    )
                  }
                >
                  Export MOL
                </button>
                <button
                  type="button"
                  className="mb-btn"
                  onClick={() => downloadText(writePoscar(boxed.structure).text, 'POSCAR')}
                >
                  Export POSCAR (in box)
                </button>
                <button
                  type="button"
                  className="mb-btn"
                  onClick={() =>
                    sendHandoff(
                      {
                        v: 1,
                        kind: 'structure',
                        from: 'builder',
                        structure: boxed.structure,
                        label: `${smiles} in box`,
                      },
                      '/tools/input-builder/',
                    )
                  }
                >
                  Send to Input Builder
                </button>
                <button
                  type="button"
                  className="mb-btn"
                  onClick={() =>
                    sendHandoff(
                      {
                        v: 1,
                        kind: 'structure',
                        from: 'builder',
                        structure: boxed.structure,
                        label: `${smiles} in box`,
                      },
                      '/dft-studio/',
                    )
                  }
                >
                  Open in DFT Studio
                </button>
              </div>
            </>
          ) : (
            <p style={{ margin: 0 }}>
              Click "Clean up in 3D" to generate explicit hydrogens and 3D coordinates.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
