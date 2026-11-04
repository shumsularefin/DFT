import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LabShell from './LabShell';
import Lazy3D, { type SceneModule } from './Lazy3D';
import Slider from '../ui/Slider';
import Badge from '../ui/Badge';
import ConvergencePlot from '../tools/convergence/ConvergencePlot';
import '../tools/convergence/convergence.css';
import { parsePoscar } from '../../lib/crystal/poscar';
import type { Mat3 } from '../../lib/crystal/types';
import {
  gVectorsWithin,
  reciprocalCell,
  relativeBasisSize,
  tooLargeToEnumerate,
  type PlaneWaveSet,
} from '../../lib/physics/planewaves';
import type { CurvePoint, Potential1D } from '../../lib/physics/kp1d';
import { ToyClient } from '../../lib/physics/kp1d-client';
import { analyzeSeries } from '../../lib/vasp/convergence';
import { energyView } from '../../lib/vasp/convergenceView';
import type { SceneController } from '../../lib/three/SceneController';
import type { EncutScene } from '../../lib/three/EncutScene';

const load = (): Promise<SceneModule> => import('../../lib/three/EncutScene');
const isEncutScene = (c: SceneController | null): c is EncutScene =>
  !!c && typeof (c as EncutScene).setBasis === 'function';

const fcc = (a: number): Mat3 => [
  [0, a / 2, a / 2],
  [a / 2, 0, a / 2],
  [a / 2, a / 2, 0],
];
const CELLS: Record<string, { label: string; lattice: Mat3 }> = {
  sc: {
    label: 'Simple cubic, a = 4.0 Å',
    lattice: [
      [4, 0, 0],
      [0, 4, 0],
      [0, 0, 4],
    ],
  },
  fcc: { label: 'fcc Cu primitive cell, a = 3.61 Å', lattice: fcc(3.61) },
  bcc: {
    label: 'bcc primitive cell, a = 3.0 Å',
    lattice: [
      [-1.5, 1.5, 1.5],
      [1.5, -1.5, 1.5],
      [1.5, 1.5, -1.5],
    ],
  },
  hex: {
    label: 'Hexagonal, a = 3.0 Å, c = 5.0 Å',
    lattice: [
      [3, 0, 0],
      [-1.5, (3 * Math.sqrt(3)) / 2, 0],
      [0, 0, 5],
    ],
  },
};
const REFERENCE_ENCUT = 400;
const ENCUT_DEFAULT = 400;
const CUTOFFS = Array.from({ length: 40 }, (_, i) => 20 * (i + 1));
const ENUM_LIMIT = 3_000_000;
const MAX_DRAWN = 20_000;
const POTENTIALS: Record<string, { label: string; potential: Potential1D }> = {
  kp: { label: 'Sharp barrier (Kronig-Penney)', potential: { kind: 'kronig-penney', v0: 6, width: 1 } },
  cos: { label: 'Smooth cosine', potential: { kind: 'cosine', v0: 2 } },
};

/** Orthonormal 2D coordinates of the vectors with third index 0, in the plane of b1 and b2. */
function slice(set: PlaneWaveSet, cell: Mat3): { x: number; y: number }[] {
  const b1 = cell[0];
  const n1 = Math.hypot(...b1) || 1;
  const e1 = [b1[0] / n1, b1[1] / n1, b1[2] / n1] as const;
  const b2 = cell[1];
  const d = b2[0] * e1[0] + b2[1] * e1[1] + b2[2] * e1[2];
  const r = [b2[0] - d * e1[0], b2[1] - d * e1[1], b2[2] - d * e1[2]] as const;
  const nr = Math.hypot(...r) || 1;
  const e2 = [r[0] / nr, r[1] / nr, r[2] / nr] as const;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < set.indices.length / 3; i++) {
    if (set.indices[3 * i + 2] !== 0) continue;
    const v = [set.vectors[3 * i]!, set.vectors[3 * i + 1]!, set.vectors[3 * i + 2]!] as const;
    out.push({
      x: v[0] * e1[0] + v[1] * e1[1] + v[2] * e1[2],
      y: v[0] * e2[0] + v[1] * e2[1] + v[2] * e2[2],
    });
  }
  return out;
}

function SliceView({ set, cell }: { set: PlaneWaveSet; cell: Mat3 }) {
  const pts = useMemo(() => slice(set, cell), [set, cell]);
  const R = Math.max(set.gCut, 0.1) * 1.1;
  const S = 300;
  const k = S / 2 / R;
  return (
    <figure className="encut-slice">
      <svg
        viewBox={`0 0 ${S} ${S}`}
        width="100%"
        style={{ maxWidth: 320 }}
        role="img"
        aria-label={`Slice of the plane waves in the plane of the first two reciprocal vectors: ${pts.length} points inside a circle of radius ${set.gCut.toFixed(2)} per angstrom.`}
      >
        <circle
          cx={S / 2}
          cy={S / 2}
          r={set.gCut * k}
          fill="rgba(25,113,194,0.1)"
          stroke="#1971c2"
          strokeWidth="1.5"
        />
        {pts.map((p, i) => (
          <circle key={i} cx={S / 2 + p.x * k} cy={S / 2 - p.y * k} r={2.5} fill="#e8590c" />
        ))}
      </svg>
      <figcaption>
        Flat slice (third index zero). Each dot is a plane wave, the circle is the cutoff radius G
        <sub>cut</sub>.
      </figcaption>
    </figure>
  );
}

/** Lab "encut-sphere": the plane-wave sphere of one ENCUT, exact counts, and a toy-model convergence curve. */
export default function EncutLab({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const SubHeading = (headingLevel === 2 ? 'h3' : 'h4') as 'h3' | 'h4';
  const [cellId, setCellId] = useState('fcc');
  const [custom, setCustom] = useState<Mat3 | null>(null);
  const [poscar, setPoscar] = useState('');
  const [poscarError, setPoscarError] = useState('');
  const [encut, setEncut] = useState(ENCUT_DEFAULT);
  const [potId, setPotId] = useState('kp');
  const [scene, setScene] = useState<EncutScene | null>(null);
  const [curve, setCurve] = useState<CurvePoint[] | null>(null);

  const lattice: Mat3 =
    cellId === 'custom' && custom ? custom : CELLS[cellId === 'custom' ? 'fcc' : cellId]!.lattice;
  const cell = useMemo(() => reciprocalCell(lattice), [lattice]);
  const tooBig = tooLargeToEnumerate(lattice, encut, ENUM_LIMIT);
  const set = useMemo(() => (tooBig ? null : gVectorsWithin(lattice, encut)), [lattice, encut, tooBig]);
  const refCount = useMemo(
    () =>
      tooLargeToEnumerate(lattice, REFERENCE_ENCUT, ENUM_LIMIT)
        ? null
        : gVectorsWithin(lattice, REFERENCE_ENCUT).count,
    [lattice],
  );

  const onController = useCallback((c: SceneController | null) => setScene(isEncutScene(c) ? c : null), []);

  useEffect(() => {
    if (!scene || !set || set.truncated) return;
    let v = set.vectors;
    if (set.count > MAX_DRAWN) {
      const step = Math.ceil(set.count / MAX_DRAWN);
      const keep: number[] = [];
      for (let i = 0; i < set.count; i += step) keep.push(v[3 * i]!, v[3 * i + 1]!, v[3 * i + 2]!);
      v = Float64Array.from(keep);
    }
    scene.setBasis(v, set.gCut, cell);
  }, [scene, set, cell]);

  const client = useRef<ToyClient | null>(null);
  useEffect(() => {
    const c = new ToyClient();
    client.current = c;
    return () => {
      c.dispose();
      client.current = null;
    };
  }, []);
  useEffect(() => {
    const c = client.current;
    if (!c) return;
    let live = true;
    setCurve(null);
    void c
      .request({ a: 4, potential: POTENTIALS[potId]!.potential, k: 0, cutoffs: CUTOFFS, nOcc: 2 })
      .then((p) => {
        if (live && p) setCurve(p);
      });
    return () => {
      live = false;
    };
  }, [potId]);

  const analysis = useMemo(() => {
    if (!curve) return null;
    const r = analyzeSeries(
      curve.map((p) => ({ x: p.encut, energy: p.energy, natoms: 1 })),
      { thresholdEvPerAtom: 1e-3 },
    );
    return { r, view: energyView(r, 1e-3, true) };
  }, [curve]);

  const applyPoscar = () => {
    try {
      const res = parsePoscar(poscar);
      setCustom(res.structure.lattice);
      setCellId('custom');
      setPoscarError('');
    } catch (e) {
      setPoscarError(e instanceof Error ? e.message : 'Could not read this POSCAR.');
    }
  };

  const reset = () => {
    setCellId('fcc');
    setEncut(ENCUT_DEFAULT);
    setPotId('kp');
  };

  const err = set && set.continuum > 0 ? ((set.continuum - set.count) / set.count) * 100 : 0;
  const rel = set && refCount ? relativeBasisSize(set.count, refCount) : null;
  const exactText = set
    ? `${set.count} exact vs ${set.continuum.toFixed(1)} estimate: the estimate treats the G vectors as a smooth fluid, the real ones sit on a lattice and the count jumps in steps.`
    : '';

  return (
    <LabShell
      title="The ENCUT sphere"
      goal="Raise ENCUT and watch the sphere of plane waves grow: every dot inside is one more function the calculation must carry."
      badge="computed"
      headingLevel={headingLevel}
      controls={
        <>
          <div className="orbitals-select">
            <label htmlFor="encut-cell" className="slider-label">
              Cell
            </label>
            <select
              id="encut-cell"
              value={cellId}
              onChange={(e) => setCellId(e.target.value)}
              className="orbitals-select-input"
            >
              {Object.entries(CELLS).map(([id, c]) => (
                <option key={id} value={id}>
                  {c.label}
                </option>
              ))}
              {custom && <option value="custom">Your POSCAR</option>}
            </select>
          </div>
          <Slider label="ENCUT" min={50} max={800} step={10} value={encut} unit="eV" onChange={setEncut} />
          <div className="cv-field">
            <label htmlFor="encut-number">ENCUT (type a value, eV)</label>
            <input
              id="encut-number"
              type="number"
              min={50}
              max={800}
              step={10}
              value={encut}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setEncut(Math.min(800, Math.max(50, n)));
              }}
            />
          </div>
          <details>
            <summary>Use your own POSCAR cell</summary>
            <div className="cv-field">
              <label htmlFor="encut-poscar">
                Paste a POSCAR (only the lattice is used, nothing is uploaded)
              </label>
              <textarea
                id="encut-poscar"
                rows={8}
                value={poscar}
                onChange={(e) => setPoscar(e.target.value)}
              />
            </div>
            <button type="button" onClick={applyPoscar}>
              Use this cell
            </button>
            {poscarError && (
              <p className="cv-note" role="alert">
                {poscarError}
              </p>
            )}
          </details>
        </>
      }
      readouts={[
        {
          label: 'G cutoff radius',
          value: set ? set.gCut.toFixed(3) : Math.sqrt(encut / 3.80998).toFixed(3),
          unit: '1/Å',
        },
        {
          label: 'Plane waves (exact)',
          value: set ? (set.truncated ? `more than ${200000}` : set.count) : 'too many to count here',
        },
        { label: 'Smooth estimate', value: set ? set.continuum.toFixed(1) : 'n/a' },
        { label: 'Estimate error', value: set ? `${err >= 0 ? '+' : ''}${err.toFixed(1)}%` : 'n/a' },
        {
          label: `Memory and work vs ${REFERENCE_ENCUT} eV`,
          value: rel ? `${rel.toFixed(2)}x basis, about ${(rel ** 1.5).toFixed(2)}x work` : 'n/a',
        },
      ]}
      onReset={reset}
      notice="Scaling estimate, not a runtime prediction: memory grows with the number of plane waves, and the work of the heaviest steps grows faster. Real timings depend on the code, the machine, the k-points and the bands."
      description={`A sphere of plane waves for the chosen cell at ENCUT ${encut} electron volts. The sphere radius is ${set ? set.gCut.toFixed(2) : 'large'} per angstrom and it holds ${set ? set.count : 'many'} reciprocal lattice points, each one a plane wave. The number grows roughly as the cutoff to the power three halves. Below it, a toy one-dimensional model shows how a total energy settles as the cutoff is raised.`}
    >
      {set ? (
        <p role="status" className="encut-exact">
          {set.truncated
            ? 'This cell and cutoff give more plane waves than this lab can list. The count is exact; the picture is skipped.'
            : exactText}
        </p>
      ) : (
        <p role="alert" className="cv-note">
          This cell at this ENCUT has too many plane waves to enumerate in the browser. Lower ENCUT or use a
          smaller cell.
        </p>
      )}
      <Lazy3D
        load={load}
        onController={onController}
        posterText="This view uses WebGL. It loads only when you ask for it. The flat slice below works without it."
        fallback={set && !set.truncated ? <SliceView set={set} cell={cell} /> : null}
      />
      {set && !set.truncated && !scene && <SliceView set={set} cell={cell} />}
      {scene && (
        <div className="cv-actions">
          <button type="button" onClick={() => scene.rotate(-15)}>
            Turn left
          </button>
          <button type="button" onClick={() => scene.rotate(15)}>
            Turn right
          </button>
        </div>
      )}
      <section aria-labelledby="encut-toy">
        <SubHeading id="encut-toy">
          Why a higher ENCUT changes the energy <Badge variant="toy-model" />
        </SubHeading>
        <p>
          A one-dimensional toy crystal (a = 4 Å) is solved with plane waves at every cutoff, and the energy
          of the two lowest states is compared. It is a toy: it shows the shape of convergence, not a real
          material or real numbers.
        </p>
        <div className="orbitals-select">
          <label htmlFor="encut-pot" className="slider-label">
            Toy potential
          </label>
          <select
            id="encut-pot"
            value={potId}
            onChange={(e) => setPotId(e.target.value)}
            className="orbitals-select-input"
          >
            {Object.entries(POTENTIALS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {analysis ? (
          <ConvergencePlot
            title="Toy-model energy against ENCUT"
            xLabel="ENCUT (eV)"
            yLabel={analysis.view.yLabel}
            points={analysis.view.points}
            band={{ ...analysis.view.band, label: 'Threshold band: +/- 1.0 meV around the last point' }}
            convergedIndex={analysis.view.convergedIndex}
            description={`Toy model, ${CUTOFFS.length} cutoffs from 20 to 800 eV. A sharp feature in the potential needs many plane waves, so the energy keeps moving longer; a smooth one settles quickly.`}
          />
        ) : (
          <p role="status">Computing the toy curve...</p>
        )}
      </section>
    </LabShell>
  );
}
