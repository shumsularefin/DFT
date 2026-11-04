import { useCallback, useEffect, useMemo, useState } from 'react';
import LabShell from './LabShell';
import Lazy3D, { type SceneModule } from './Lazy3D';
import LatticeChooser, { latticeOf } from './LatticeChooser';
import MetalInsulatorPanel from './MetalInsulatorPanel';
import Slider from '../ui/Slider';
import Toggle from '../ui/Toggle';
import { reciprocalLattice } from '../../lib/crystal/lattice';
import {
  irreducibleCount,
  meshPoints,
  meshSymmetryReport,
  qToCartesian,
  type Centering,
} from '../../lib/crystal/kmesh';
import { latticePointGroup } from '../../lib/crystal/pointgroup';
import type { Mat3 } from '../../lib/crystal/types';
import type { SceneController } from '../../lib/three/SceneController';
import type { KmeshScene } from '../../lib/three/KmeshScene';

const load = (): Promise<SceneModule> => import('../../lib/three/KmeshScene');
const isKmeshScene = (c: SceneController | null): c is KmeshScene =>
  !!c && typeof (c as KmeshScene).setMesh === 'function';

// Okabe-Ito colour-blind-safe palette (rgb 0..1). Colour only helps; the counts are in the readouts.
const PALETTE: [number, number, number][] = [
  [0.0, 0.447, 0.698],
  [0.835, 0.369, 0.0],
  [0.0, 0.62, 0.451],
  [0.8, 0.475, 0.655],
  [0.941, 0.894, 0.259],
  [0.337, 0.706, 0.914],
  [0.9, 0.62, 0.0],
  [0.35, 0.35, 0.35],
];
const HEX = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#f0e442', '#56b4e9', '#e69f00', '#595959'];

function SliceView({
  coords,
  n,
  b,
  colors,
}: {
  coords: Float64Array;
  n: readonly [number, number, number];
  b: Mat3;
  colors: number[] | null;
}) {
  const e1 = (() => {
    const l = Math.hypot(...b[0]) || 1;
    return [b[0][0] / l, b[0][1] / l, b[0][2] / l] as const;
  })();
  const e2 = (() => {
    const d = b[1][0] * e1[0] + b[1][1] * e1[1] + b[1][2] * e1[2];
    const r = [b[1][0] - d * e1[0], b[1][1] - d * e1[1], b[1][2] - d * e1[2]] as const;
    const l = Math.hypot(...r) || 1;
    return [r[0] / l, r[1] / l, r[2] / l] as const;
  })();
  const proj = (q: readonly [number, number, number]) => {
    const k = qToCartesian(q, b);
    return { x: k[0] * e1[0] + k[1] * e1[1] + k[2] * e1[2], y: k[0] * e2[0] + k[1] * e2[1] + k[2] * e2[2] };
  };
  const S = 300;
  const corners = [proj([-0.5, -0.5, 0]), proj([0.5, -0.5, 0]), proj([0.5, 0.5, 0]), proj([-0.5, 0.5, 0])];
  const R = Math.max(...corners.flatMap((c) => [Math.abs(c.x), Math.abs(c.y)]), 0.1) * 1.15;
  const k = S / 2 / R;
  const tx = (x: number) => S / 2 + x * k;
  const ty = (y: number) => S / 2 - y * k;
  const layer: { x: number; y: number; c: number }[] = [];
  for (let i = 0; i < n[0] * n[1] * n[2]; i += n[2]) {
    // third index 0: the first layer, i.e. the plane through Gamma (or the shifted plane)
    const p = proj([coords[3 * i]!, coords[3 * i + 1]!, coords[3 * i + 2]!]);
    layer.push({ ...p, c: colors ? colors[i]! : 0 });
  }
  return (
    <figure>
      <svg
        viewBox={`0 0 ${S} ${S}`}
        width="100%"
        style={{ maxWidth: 320 }}
        role="img"
        aria-label={`Flat slice of the k-mesh in the plane of the first two reciprocal vectors: ${layer.length} points inside the reciprocal cell.`}
      >
        <polygon
          points={corners.map((c) => `${tx(c.x)},${ty(c.y)}`).join(' ')}
          fill="none"
          stroke="#7b8494"
          strokeWidth="1.5"
        />
        {layer.map((p, i) => (
          <circle
            key={i}
            cx={tx(p.x)}
            cy={ty(p.y)}
            r={Math.max(2, Math.min(5, 90 / Math.max(n[0], n[1])))}
            fill={colors ? HEX[p.c % HEX.length] : '#e8590c'}
          />
        ))}
        <circle cx={tx(0)} cy={ty(0)} r="6" fill="none" stroke="#d6336c" strokeWidth="2" />
      </svg>
      <figcaption>
        Flat slice (first layer of the third direction). The ring marks Gamma, the corner of the mesh.
      </figcaption>
    </figure>
  );
}

/** Lab "kpoint-mesh": Monkhorst-Pack and Gamma-centred meshes, irreducible points and mesh symmetry, plus a toy panel. */
export default function KmeshLab({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const [cellId, setCellId] = useState('fcc');
  const [custom, setCustom] = useState<Mat3 | null>(null);
  const [n, setN] = useState<[number, number, number]>([6, 6, 6]);
  const [linked, setLinked] = useState(true);
  const [mp, setMp] = useState(false);
  const [byOrbit, setByOrbit] = useState(true);
  const [scene, setScene] = useState<KmeshScene | null>(null);

  const lattice = latticeOf(cellId, custom);
  const centering: Centering = mp ? 'monkhorst-pack' : 'gamma';
  const b = useMemo(() => reciprocalLattice(lattice), [lattice]);
  const group = useMemo(() => latticePointGroup(lattice), [lattice]);
  const pts = useMemo(() => meshPoints(n, centering), [n, centering]);
  const red = useMemo(() => irreducibleCount(n, centering, group), [n, centering, group]);
  const sym = useMemo(() => meshSymmetryReport(n, centering, group), [n, centering, group]);
  const colorIndex = useMemo(() => {
    const rank = new Map<number, number>();
    red.representatives.forEach((r, i) => rank.set(r.index, i));
    return Array.from(red.classOf, (c) => rank.get(c) ?? 0);
  }, [red]);

  const onController = useCallback((c: SceneController | null) => setScene(isKmeshScene(c) ? c : null), []);
  useEffect(() => {
    if (!scene) return;
    const cart = new Float64Array(3 * pts.count);
    const rgb = new Float32Array(3 * pts.count);
    for (let i = 0; i < pts.count; i++) {
      const k = qToCartesian([pts.coords[3 * i]!, pts.coords[3 * i + 1]!, pts.coords[3 * i + 2]!], b);
      cart.set(k, 3 * i);
      const c = byOrbit ? PALETTE[colorIndex[i]! % PALETTE.length]! : [0.9, 0.35, 0.05];
      rgb.set(c, 3 * i);
    }
    scene.setMesh(cart, rgb, b);
  }, [scene, pts, b, byOrbit, colorIndex]);

  const setDivision = (axis: 0 | 1 | 2, v: number) =>
    setN((old) =>
      linked ? [v, v, v] : (old.map((x, i) => (i === axis ? v : x)) as [number, number, number]),
    );
  const reset = () => {
    setCellId('fcc');
    setCustom(null);
    setN([6, 6, 6]);
    setLinked(true);
    setMp(false);
    setByOrbit(true);
  };
  const saving = red.irreducible > 0 ? pts.count / red.irreducible : 1;

  return (
    <LabShell
      title="k-point meshes"
      goal="Choose a mesh, then see how many of its points are really different once the crystal's symmetry is used."
      badge="computed"
      headingLevel={headingLevel}
      controls={
        <>
          <LatticeChooser
            cellId={cellId}
            custom={custom}
            onChange={(id, c) => {
              setCellId(id);
              setCustom(c);
            }}
          />
          <Slider label="Divisions n1" min={1} max={24} value={n[0]} onChange={(v) => setDivision(0, v)} />
          <Slider label="Divisions n2" min={1} max={24} value={n[1]} onChange={(v) => setDivision(1, v)} />
          <Slider label="Divisions n3" min={1} max={24} value={n[2]} onChange={(v) => setDivision(2, v)} />
          <Toggle label="Keep the three divisions equal" checked={linked} onChange={setLinked} />
          <Toggle label="Monkhorst-Pack instead of Gamma-centred" checked={mp} onChange={setMp} />
          <Toggle label="Colour points by symmetry orbit" checked={byOrbit} onChange={setByOrbit} />
        </>
      }
      readouts={[
        { label: 'Mesh', value: `${n[0]} x ${n[1]} x ${n[2]}, ${mp ? 'Monkhorst-Pack' : 'Gamma-centred'}` },
        { label: 'Total points', value: pts.count },
        { label: 'Irreducible points', value: red.irreducible },
        { label: 'Lattice symmetry operations', value: group.length },
        { label: 'Mesh has the lattice symmetry', value: sym.symmetric ? 'yes' : 'no' },
        {
          label: 'Relative cost',
          value: `${red.irreducible} k-points to compute (symmetry saves ${saving.toFixed(1)}x)`,
        },
      ]}
      onReset={reset}
      notice="Time per run grows in proportion to the number of irreducible k-points, so this is a scaling estimate, not a runtime prediction. The counts use the symmetry of the lattice only (a real crystal can have less if the atoms break it) and time reversal. The cell drawn is the parallelepiped spanned by the reciprocal vectors, not the Wigner-Seitz Brillouin zone."
      description={`A ${n[0]} by ${n[1]} by ${n[2]} ${mp ? 'Monkhorst-Pack' : 'Gamma-centred'} mesh in the reciprocal cell: ${pts.count} points, of which ${red.irreducible} are different once the ${group.length} symmetry operations of the lattice are used. ${sym.symmetric ? 'The mesh keeps the full lattice symmetry.' : 'The mesh does not keep the full lattice symmetry.'} Below, a toy model compares how fast a metal and an insulator converge with mesh size.`}
    >
      <p role="status" className={sym.symmetric ? 'kmesh-sym' : 'kmesh-sym cv-note'}>
        {sym.reason}
      </p>
      <Lazy3D
        load={load}
        onController={onController}
        posterText="This view uses WebGL. It loads only when you ask for it. The flat slice below works without it."
        fallback={<SliceView coords={pts.coords} n={n} b={b} colors={byOrbit ? colorIndex : null} />}
      />
      {!scene && <SliceView coords={pts.coords} n={n} b={b} colors={byOrbit ? colorIndex : null} />}
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
      <MetalInsulatorPanel headingLevel={headingLevel === 2 ? 3 : 4} />
    </LabShell>
  );
}
