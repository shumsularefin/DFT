// Module 8 (convergence and errors) scenes: pure generators on tested toy models and crystal libraries (M16.9).
// @source S-049 (plane-wave cutoff and k-point sampling), S-050 (Kronig-Penney toy), S-007 (Monkhorst-Pack meshes)
// @source S-155 (Kerker mixing), S-156 (optimisers), S-021 (covalent radii), S-041 (error families)
import { THRESHOLDS } from '../../chem/rules';
import { contacts } from '../../chem/geometry';
import { covalentRadius } from '../../crystal/covalent';
import {
  meshPoints,
  qToCartesian,
  reciprocalActions,
  shiftFlags,
  type MeshDivisions,
} from '../../crystal/kmesh';
import { reciprocalLattice } from '../../crystal/lattice';
import { latticePointGroup, type IntMat3 } from '../../crystal/pointgroup';
import type { Mat3, Structure } from '../../crystal/types';
import { convergenceGrid, meshEnergy, type BandCache } from '../../physics/kp1dmesh';
import {
  LANDSCAPES,
  relax,
  type LandscapeId,
  type Method,
  type RelaxResult,
} from '../../physics/landscape2d';
import { cutoffRadius, gVectorsWithin } from '../../physics/planewaves';
import { errorAt, gain, slosh, stableAmix, type Mixer, type SloshResult } from '../../physics/sloshing1d';
import { energyPerSite, erf, referenceEnergy } from '../../physics/tightbinding2d';
import { lookupStructure } from '../../scene/library';
import {
  arrows,
  atoms,
  axesLayers,
  brillouinLayers,
  crystalLayers,
  curve,
  fmt,
  labels,
  lines,
  points,
  quadLayer,
  sphereLayer,
  surfaceLayer,
} from '../kit';
import type { Layer, MeshLayer, SceneDef, Vec3 } from '../types';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const log10 = (x: number) => Math.log10(Math.max(x, 1e-300));
/** A small number in words: fixed digits above 0.01, otherwise one significant digit in e-notation. */
const small = (x: number) =>
  x === 0 ? '0' : Math.abs(x) >= 1000 || Math.abs(x) < 0.01 ? x.toExponential(1) : fmt(x, 3);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function memo<T>(m: Map<string, T>, key: string, make: () => T): T {
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const v = make();
  if (m.size > 64) m.delete(m.keys().next().value as string);
  m.set(key, v);
  return v;
}

/** A mesh from a regular grid of points (row by row, nx + 1 points a row), coloured by `values` when given. */
function gridMesh(
  pts: Vec3[],
  nx: number,
  ny: number,
  o: Partial<MeshLayer> & { group: string },
  values?: number[],
): MeshLayer {
  const positions = pts.flatMap((p) => [p[0], p[1], p[2]]);
  const indices: number[] = [];
  const id = (i: number, j: number) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      indices.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
  const layer: MeshLayer = { kind: 'mesh', positions, indices, color: 'accent', ...o };
  if (values) {
    layer.values = values;
    layer.colormap = layer.colormap ?? 'sequential';
  }
  return layer;
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Why converge: the energy error over (ENCUT, k-mesh) of the 1D Kronig-Penney toy, with a tolerance plane.

export const TOY = { a: 4, potential: { kind: 'kronig-penney', v0: 6, width: 1 } as const };
export const FILLING = { insulator: 1, metal: 0.5 } as const;
export const CUTS = Array.from({ length: 20 }, (_, i) => 20 + 20 * i);
export const MESHES = Array.from({ length: 24 }, (_, i) => i + 1);
/**
 * The converged reference of the surface, far above the largest cutoff and mesh drawn. It differs from a 2000 eV,
 * 300-point result by less than 0.04 meV (tested), below the 0.1 meV floor of the drawing.
 */
export const SURFACE_REF = { encutEv: 1000, nk: 200 };
export const SURFACE_FLOOR = -4;

export interface ConvSurface {
  ref: number;
  /** err[i][j]: |E - E_ref| in eV at CUTS[i], MESHES[j]. */
  err: number[][];
  /** Plane waves at Gamma for each cutoff. */
  npw: number[];
}

const surfaceMemo = new Map<string, ConvSurface>();
/** Band energies shared by both systems (they fill the same two lowest bands differently). */
const surfaceBands: BandCache = new Map();
export function convSurface(system: keyof typeof FILLING): ConvSurface {
  return memo(surfaceMemo, system, () => {
    const cache = surfaceBands;
    const filling = FILLING[system];
    const ref = meshEnergy({ ...TOY, ...SURFACE_REF, encutEv: SURFACE_REF.encutEv, filling }, cache).energy!;
    const grid = convergenceGrid({ ...TOY, filling }, CUTS, MESHES, cache);
    const err = CUTS.map(() => MESHES.map(() => NaN));
    const npw = CUTS.map(() => 0);
    for (const g of grid) {
      const i = CUTS.indexOf(g.encut);
      err[i]![MESHES.indexOf(g.nk)] = Math.abs(g.energy - ref);
      npw[i] = g.nPw;
    }
    return { ref, err, npw };
  });
}

/** The cheapest (plane waves x k-points) setting from which every finer setting is within tolerance, or null. */
export function cheapestSafe(s: ConvSurface, tolEv: number): { i: number; j: number } | null {
  let best: { i: number; j: number; cost: number } | null = null;
  for (let i = 0; i < CUTS.length; i++)
    for (let j = 0; j < MESHES.length; j++) {
      let safe = true;
      for (let a = i; a < CUTS.length && safe; a++)
        for (let b = j; b < MESHES.length && safe; b++) if (!(s.err[a]![b]! < tolEv)) safe = false;
      if (!safe) continue;
      const cost = s.npw[i]! * MESHES[j]!;
      if (!best || cost < best.cost) best = { i, j, cost };
    }
  return best ? { i: best.i, j: best.j } : null;
}

const SX = (encut: number) => encut / 40;
const SY = (nk: number) => ((nk - 1) * 9) / 23;
const SZ = (err: number) => (clamp(log10(err), SURFACE_FLOOR, 0) - SURFACE_FLOOR) * 2;

const convergenceSurface: SceneDef = {
  id: 'm08-convergence-surface',
  title: 'Energy error over ENCUT and the k-mesh',
  badge: 'toy-model',
  sources: ['S-050', 'S-049', 'S-007', 'S-042'],
  banner:
    'A one-dimensional Kronig-Penney crystal solved in plane waves, not a real material: the shape of the surface is what carries over, not the numbers.',
  params: [
    {
      kind: 'select',
      id: 'system',
      label: 'System',
      physics: true,
      value: 'insulator',
      options: [
        { value: 'insulator', label: 'Insulator (one full band)' },
        { value: 'metal', label: 'Metal (half-filled band)' },
      ],
    },
    {
      kind: 'slider',
      id: 'encut',
      label: 'ENCUT',
      min: 20,
      max: 400,
      step: 20,
      value: 120,
      unit: 'eV',
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'kmesh',
      label: 'k-points',
      min: 1,
      max: 24,
      step: 1,
      value: 4,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'tol',
      label: 'Tolerance',
      min: 0.1,
      max: 20,
      step: 0.1,
      value: 1,
      unit: 'meV',
      digits: 1,
      physics: true,
    },
    { kind: 'toggle', id: 'scans', label: 'One-at-a-time scans', value: true },
  ],
  build(p) {
    const system = p.system === 'metal' ? 'metal' : 'insulator';
    const s = convSurface(system);
    const i0 = clamp(Math.round((Number(p.encut) - 20) / 20), 0, CUTS.length - 1);
    const j0 = clamp(Math.round(Number(p.kmesh)) - 1, 0, MESHES.length - 1);
    const tolMeV = Number(p.tol);
    const tol = tolMeV / 1000;
    const at = (i: number, j: number): Vec3 => [SX(CUTS[i]!), SY(MESHES[j]!), SZ(s.err[i]![j]!)];
    const pts: Vec3[] = [];
    const vals: number[] = [];
    for (let j = 0; j < MESHES.length; j++)
      for (let i = 0; i < CUTS.length; i++) {
        pts.push(at(i, j));
        vals.push(clamp(log10(s.err[i]![j]!), SURFACE_FLOOR, 0));
      }
    const nx = CUTS.length - 1;
    const ny = MESHES.length - 1;
    const zt = SZ(tol);
    const x0 = SX(CUTS[0]!);
    const x1 = SX(CUTS[nx]!);
    const y1 = SY(MESHES[ny]!);
    const layers: Layer[] = [
      gridMesh(
        pts,
        nx,
        ny,
        { group: 'surface', name: 'Energy error', opacity: 0.85, range: [SURFACE_FLOOR, 0] },
        vals,
      ),
      quadLayer([x0, 0, zt], [x1 - x0, 0, 0], [0, y1, 0], {
        group: 'tolerance',
        name: 'Tolerance plane',
        color: 'muted',
        opacity: 0.22,
      }),
      lines(
        [
          [
            [x0, 0, zt],
            [x1, 0, zt],
          ],
          [
            [x0, y1, zt],
            [x1, y1, zt],
          ],
        ],
        'muted',
        'tolerance',
        { dashed: true },
      ),
    ];
    // the lit region: grid cells whose four corners are all within tolerance, drawn on the tolerance plane
    const lit: number[] = [];
    let inside = 0;
    for (let i = 0; i < CUTS.length; i++)
      for (let j = 0; j < MESHES.length; j++) if (s.err[i]![j]! < tol) inside++;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const ok = [s.err[i]![j]!, s.err[i + 1]![j]!, s.err[i]![j + 1]!, s.err[i + 1]![j + 1]!].every(
          (e) => e < tol,
        );
        if (!ok) continue;
        const [xa, xb, ya, yb] = [SX(CUTS[i]!), SX(CUTS[i + 1]!), SY(MESHES[j]!), SY(MESHES[j + 1]!)];
        const z = zt + 0.02;
        lit.push(xa, ya, z, xb, ya, z, xb, yb, z, xa, ya, z, xb, yb, z, xa, yb, z);
      }
    if (lit.length)
      layers.push({
        kind: 'mesh',
        group: 'converged',
        name: 'Converged region',
        positions: lit,
        color: 'accent',
        opacity: 0.8,
      });
    // the reader's test point and the two one-at-a-time scans through it
    const here = at(i0, j0);
    layers.push(
      atoms([[here[0], here[1], here[2] + 0.12]], 0.22, 'ink', 'test-point', {
        name: 'Test point',
        labels: [`ENCUT ${CUTS[i0]} eV, ${MESHES[j0]} k`],
        highlight: [0],
      }),
    );
    if (p.scans) {
      layers.push(
        curve(
          CUTS.map((_, i) => {
            const q = at(i, j0);
            return [q[0], q[1], q[2] + 0.05] as Vec3;
          }),
          'c1',
          'scans',
          { name: 'One-at-a-time scans', tube: 0.04 },
        ),
        lines(
          MESHES.slice(1).map((_, j) => {
            const a = at(i0, j);
            const b = at(i0, j + 1);
            return [
              [a[0], a[1], a[2] + 0.05],
              [b[0], b[1], b[2] + 0.05],
            ] as [Vec3, Vec3];
          }),
          'c2',
          'scans',
          { dashed: true, tube: 0.03 },
        ),
      );
    }
    const best = cheapestSafe(s, tol);
    const tick: { text: string; at: Vec3 }[] = [
      { text: '100 eV', at: [SX(100), -0.7, 0] },
      { text: '400 eV', at: [SX(400), -0.7, 0] },
      { text: '12 k', at: [-0.8, SY(12), 0] },
      { text: '24 k', at: [-0.8, SY(24), 0] },
      { text: '1 eV', at: [-0.6, -0.6, SZ(1)] },
      { text: '0.1 meV', at: [-0.6, -0.6, SZ(1e-4)] },
      { text: `${fmt(tolMeV, 1)} meV`, at: [x1 + 0.6, 0, zt] },
    ];
    if (best) {
      const b = at(best.i, best.j);
      layers.push(
        atoms([[b[0], b[1], zt + 0.15]], 0.2, 'pos', 'cheapest', {
          name: 'Cheapest safe setting',
          labels: [`cheapest safe: ${CUTS[best.i]} eV, ${MESHES[best.j]} k`],
        }),
      );
      tick.push({ text: 'cheapest safe', at: [b[0], b[1], zt + 0.7] });
    }
    layers.push(labels(tick, 'ticks'), ...axesLayers([10.8, 9.8, 8.6], ['ENCUT', 'k-points', 'log error']));
    const e0 = s.err[i0]![j0]!;
    const within = e0 < tol;
    const total = CUTS.length * MESHES.length;
    const bestText = best
      ? `The cheapest setting from which every finer one stays within tolerance is ${CUTS[best.i]} eV with ${plural(MESHES[best.j]!, 'k-point')}.`
      : `No setting on this grid stays within ${fmt(tolMeV, 1)} meV for every finer setting; it would need a higher ENCUT or more than ${MESHES.at(-1)} k-points.`;
    const describe =
      `Energy error of a toy 1D ${system} on a log scale over ENCUT (20 to 400 eV) and the number of k-points (1 to 24), with a tolerance plane at ${fmt(tolMeV, 1)} meV; ${inside} of ${total} settings lie under it. ` +
      `At ${CUTS[i0]} eV and ${plural(MESHES[j0]!, 'k-point')} the error is ${small(e0 * 1000)} meV, ${within ? 'within' : 'outside'} tolerance. ` +
      bestText;
    return {
      layers,
      describe,
      camera: { eye: [1.1, -1.4, 0.9] },
      readouts: [
        { label: 'Test point', value: `${CUTS[i0]} eV, ${MESHES[j0]} k` },
        { label: 'Energy error', value: `${small(e0 * 1000)} meV` },
        { label: 'Plane waves', value: `${s.npw[i0]} per k-point` },
        {
          label: 'Cheapest safe',
          value: best ? `${CUTS[best.i]} eV, ${MESHES[best.j]} k` : 'none on this grid',
        },
      ],
      axes: ['ENCUT (eV, 40 per unit)', 'k-points in the mesh', 'log10 of the energy error (eV)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 2. ENCUT: the cutoff sphere of silicon's primitive cell in G-space beside the toy energy error.

const SI_A = lookupStructure('diamond')!.lattice[0]![0]!;
/** Primitive fcc cell of silicon (diamond lattice constant from the scene library), strained isotropically by s. */
export const siliconPrimitive = (strain = 0): Mat3 => {
  const h = (SI_A * (1 + strain)) / 2;
  return [
    [0, h, h],
    [h, 0, h],
    [h, h, 0],
  ];
};
export const ENCUT_GRID = Array.from({ length: 56 }, (_, i) => 50 + 10 * i);
const toyEncutMemo = new Map<string, number[]>();
/** Toy energy error (eV) of the 8-point insulator mesh against the same mesh at 2000 eV, for each cutoff. */
export function toyEncutErrors(): number[] {
  return memo(toyEncutMemo, 'insulator', () => {
    const cache: BandCache = new Map();
    const o = { ...TOY, nk: 8, filling: 1 };
    const ref = meshEnergy({ ...o, encutEv: 2000 }, cache).energy!;
    return ENCUT_GRID.map((e) => Math.abs(meshEnergy({ ...o, encutEv: e }, cache).energy! - ref));
  });
}

const cutoffSphere: SceneDef = {
  id: 'm08-cutoff-sphere',
  title: 'The cutoff sphere and the energy it buys',
  badge: 'toy-model',
  sources: ['S-049', 'S-031', 'S-040', 'S-050'],
  banner:
    'The plane-wave count is exact for the silicon primitive cell; the energy error beside it comes from a one-dimensional toy crystal, not from silicon.',
  params: [
    {
      kind: 'slider',
      id: 'encut',
      label: 'ENCUT',
      min: 50,
      max: 600,
      step: 10,
      value: 250,
      unit: 'eV',
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'strain',
      label: 'Cell strain',
      min: -6,
      max: 6,
      step: 0.5,
      value: 0,
      unit: '%',
      digits: 1,
      physics: true,
    },
    { kind: 'toggle', id: 'outside', label: 'Next shell outside the sphere', value: false },
  ],
  build(p) {
    const encut = clamp(Number(p.encut), 50, 600);
    const strain = Number(p.strain) / 100;
    const L = siliconPrimitive(strain);
    const pw = gVectorsWithin(L, encut);
    const pw0 = strain === 0 ? pw : gVectorsWithin(siliconPrimitive(0), encut);
    const kc = cutoffRadius(encut);
    const inside: Vec3[] = [];
    for (let i = 0; i < pw.vectors.length; i += 3)
      inside.push([pw.vectors[i]!, pw.vectors[i + 1]!, pw.vectors[i + 2]!]);
    const layers: Layer[] = [
      points(inside, 'accent', 0.12, 'basis', { name: 'Plane waves in the basis' }),
      sphereLayer([0, 0, 0], kc, {
        group: 'sphere',
        name: 'Cutoff sphere',
        color: 'pos',
        opacity: 0.12,
        segments: 28,
      }),
    ];
    if (p.outside) {
      const outer = gVectorsWithin(L, encut * 1.25);
      const shell: Vec3[] = [];
      for (let i = 0; i < outer.vectors.length; i += 3) {
        const v: Vec3 = [outer.vectors[i]!, outer.vectors[i + 1]!, outer.vectors[i + 2]!];
        if (Math.hypot(...v) > kc * (1 + 1e-12)) shell.push(v);
      }
      if (shell.length)
        layers.push(points(shell, 'muted', 0.07, 'outside', { name: 'Left out of the basis' }));
    }
    const B = reciprocalLattice(L);
    layers.push(
      arrows(
        [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
        B.map((b) => [b[0], b[1], b[2]] as Vec3),
        'ink',
        'reciprocal',
        { name: 'Reciprocal vectors b1, b2, b3', thickness: 0.03 },
      ),
    );
    // the energy error on a wall behind the sphere, with the same radial axis: x = k_c of each cutoff
    const errs = toyEncutErrors();
    const kMax = cutoffRadius(600);
    const yw = -(kMax + 2);
    const zE = (e: number) => (clamp(log10(e), -5, 0) + 5) * 1.3;
    const k = ENCUT_GRID.findIndex((e) => e >= encut - 1e-9);
    const e0 = errs[Math.max(0, k)]!;
    const wallPts = ENCUT_GRID.map((e, i) => [cutoffRadius(e), yw, zE(errs[i]!)] as Vec3);
    const kLo = cutoffRadius(50);
    layers.push(
      quadLayer([kLo - 0.5, yw - 0.02, 0], [kMax - kLo + 1, 0, 0], [0, 0, zE(1)], {
        group: 'energy',
        name: 'Toy energy error',
        color: 'muted',
        opacity: 0.1,
      }),
      curve(wallPts, 'c1', 'energy', { tube: 0.07 }),
      lines(
        [
          [
            [kLo - 0.5, yw, zE(1e-3)],
            [kMax + 0.5, yw, zE(1e-3)],
          ],
        ],
        'muted',
        'energy',
        { dashed: true },
      ),
      atoms([[kc, yw, zE(e0)]], 0.3, 'pos', 'energy', { labels: [`error ${small(e0 * 1000)} meV`] }),
      lines(
        [
          [
            [kc, 0, 0],
            [kc, yw, 0],
          ],
          [
            [kc, yw, 0],
            [kc, yw, zE(e0)],
          ],
        ],
        'pos',
        'energy',
        { dashed: true },
      ),
      labels(
        [
          { text: `k_c = ${fmt(kc, 2)} 1/Å`, at: [0, 0, kc + 1] },
          { text: 'toy energy error (log)', at: [(kLo + kMax) / 2, yw, zE(1) + 0.9] },
          { text: '1 meV', at: [kMax + 1.4, yw, zE(1e-3)] },
          { text: '50 eV', at: [kLo, yw, -0.6] },
          { text: '600 eV', at: [kMax, yw, -0.6] },
        ],
        'labels',
      ),
      ...axesLayers(kMax + 1.5, ['Gx', 'Gy', 'Gz']),
    );
    const change = pw.count - pw0.count;
    const strainText =
      strain === 0
        ? 'The cell is unstrained.'
        : `Straining the cell by ${fmt(strain * 100, 1)} percent at the same cutoff changes the basis from ${pw0.count} to ${pw.count} plane waves (${change > 0 ? '+' : ''}${change}): the basis jumps as the cell changes, which is the origin of Pulay stress.`;
    const describe =
      `Reciprocal lattice vectors of the silicon primitive cell inside the cutoff sphere of ENCUT ${encut} eV (radius ${fmt(kc, 2)} per Angstrom): ${pw.count} plane waves, against the continuum estimate ${fmt(pw.continuum, 0)}. ` +
      `On the wall behind, a toy crystal's energy error at this cutoff is ${small(e0 * 1000)} meV and falls as the sphere grows. ${strainText}`;
    return {
      layers,
      describe,
      camera: { eye: [1.2, -1.6, 0.7] },
      readouts: [
        { label: 'ENCUT', value: `${encut} eV` },
        { label: 'Cutoff radius', value: `${fmt(kc, 2)} 1/Å` },
        {
          label: 'Plane waves',
          value: strain === 0 ? `${pw.count}` : `${pw.count} (unstrained ${pw0.count})`,
        },
        { label: 'Toy energy error', value: `${small(e0 * 1000)} meV` },
      ],
      axes: ['Gx (1/Å)', 'Gy (1/Å)', 'Gz (1/Å)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 3. k-points: a 2D tight-binding band over its zone, the mesh that samples it, and the energy error of each mesh.

export const TB_DELTA = { metal: 0, insulator: 1 } as const;
export const TB_SIZES = Array.from({ length: 23 }, (_, i) => i + 2);
/** Reference mesh for the smeared and the insulating cases (the unsmeared metal uses the exact -8/pi^2). */
export const TB_REFERENCE_MESH = 300;
const tbMemo = new Map<string, { ref: number; ref0: number; errors: number[] }>();
export function tbErrors(system: keyof typeof TB_DELTA, sigma: number) {
  return memo(tbMemo, `${system}|${sigma}`, () => {
    const d = TB_DELTA[system];
    const ref = referenceEnergy(d, sigma, TB_REFERENCE_MESH);
    const ref0 = referenceEnergy(d, 0, TB_REFERENCE_MESH);
    return { ref, ref0, errors: TB_SIZES.map((n) => Math.abs(energyPerSite(n, d, sigma) - ref)) };
  });
}

const kmeshError: SceneDef = {
  id: 'm08-kmesh-error',
  title: 'A k-mesh sampling a band, and its energy error',
  badge: 'toy-model',
  sources: ['S-049', 'S-053', 'S-007', 'S-015'],
  banner:
    'A two-dimensional square-lattice tight-binding band (energies in units of the hopping t), not a material; the insulator has a staggered potential that opens a gap of 2t.',
  params: [
    {
      kind: 'select',
      id: 'system',
      label: 'System',
      physics: true,
      value: 'metal',
      options: [
        { value: 'metal', label: 'Metal (half-filled band)' },
        { value: 'insulator', label: 'Insulator (gap 2t)' },
      ],
    },
    {
      kind: 'slider',
      id: 'mesh',
      label: 'Mesh N x N',
      min: 2,
      max: 24,
      step: 1,
      value: 6,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'sigma',
      label: 'Smearing width',
      min: 0,
      max: 0.4,
      step: 0.05,
      value: 0,
      unit: 't',
      digits: 2,
      physics: true,
    },
    { kind: 'toggle', id: 'band', label: 'Band surface', value: true },
  ],
  build(p) {
    const system = p.system === 'insulator' ? 'insulator' : 'metal';
    const N = clamp(Math.round(Number(p.mesh)), 2, 24);
    const sigma = Math.round(Number(p.sigma) * 100) / 100;
    const d = TB_DELTA[system];
    const zs = 0.7;
    const zf = -3.6;
    const eps = (kx: number, ky: number) => -2 * (Math.cos(kx) + Math.cos(ky));
    const lower = (kx: number, ky: number) => (d ? -Math.hypot(d, eps(kx, ky)) : eps(kx, ky));
    const P = Math.PI;
    const layers: Layer[] = [
      lines(
        [
          [
            [-P, -P, zf],
            [P, -P, zf],
          ],
          [
            [P, -P, zf],
            [P, P, zf],
          ],
          [
            [P, P, zf],
            [-P, P, zf],
          ],
          [
            [-P, P, zf],
            [-P, -P, zf],
          ],
        ],
        'ink',
        'zone',
        { name: 'Brillouin zone' },
      ),
    ];
    if (p.band) {
      layers.push(
        surfaceLayer(lower, [-P, P], [-P, P], 36, 36, {
          group: 'band',
          name: d ? 'Bands' : 'Band',
          zScale: zs,
          colormap: 'diverging',
          opacity: 0.55,
        }),
      );
      if (d)
        layers.push(
          surfaceLayer((x, y) => -lower(x, y), [-P, P], [-P, P], 24, 24, {
            group: 'band',
            zScale: zs,
            colormap: 'diverging',
            opacity: 0.25,
          }),
        );
    }
    layers.push(
      quadLayer([-P, -P, 0], [2 * P, 0, 0], [0, 2 * P, 0], {
        group: 'fermi',
        name: d ? 'Middle of the gap' : 'Fermi level',
        color: 'muted',
        opacity: 0.12,
      }),
    );
    if (!d)
      layers.push(
        curve(
          [
            [P, 0, zf],
            [0, P, zf],
            [-P, 0, zf],
            [0, -P, zf],
          ],
          'pos',
          'fermi',
          { closed: true, tube: 0.025 },
        ),
      );
    // the mesh (Gamma-centred N x N, folded into the zone) and the occupation of each point
    const mesh = meshPoints([N, N, 1], 'gamma');
    const occ: Vec3[] = [];
    const part: Vec3[] = [];
    const empty: Vec3[] = [];
    const onBand: Vec3[] = [];
    const stalks: [Vec3, Vec3][] = [];
    let filled = 0;
    for (let i = 0; i < mesh.count; i++) {
      const kx = 2 * P * mesh.coords[3 * i]!;
      const ky = 2 * P * mesh.coords[3 * i + 1]!;
      const e = lower(kx, ky);
      const f = d
        ? 1
        : sigma > 0
          ? 0.5 * (1 - erf(e / (Math.SQRT2 * sigma)))
          : e < -1e-12
            ? 1
            : e > 1e-12
              ? 0
              : 0.5;
      filled += f;
      const fp: Vec3 = [kx, ky, zf];
      (f > 0.9 ? occ : f < 0.1 ? empty : part).push(fp);
      onBand.push([kx, ky, zs * e]);
      if (N <= 8) stalks.push([fp, [kx, ky, zs * e]]);
    }
    if (occ.length) layers.push(points(occ, 'pos', 0.1, 'mesh', { name: 'k-mesh (filled, part, empty)' }));
    if (part.length) layers.push(points(part, 'accent', 0.08, 'mesh'));
    if (empty.length) layers.push(points(empty, 'neg', 0.05, 'mesh'));
    if (p.band) layers.push(points(onBand, 'ink', 0.06, 'samples', { name: 'Sampled energies' }));
    if (stalks.length) layers.push(lines(stalks, 'muted', 'samples', { dashed: true }));
    // the energy error of every mesh on a wall beside the zone; this mesh is marked
    const { ref, ref0, errors } = tbErrors(system, sigma);
    const xw = P + 1.2;
    const yN = (n: number) => -P + ((n - 2) / 22) * 2 * P;
    const zE = (e: number) => zf + (clamp(log10(e), -8, 0) + 8) * 0.6;
    const tops = TB_SIZES.map((n, i) => [xw, yN(n), zE(errors[i]!)] as Vec3);
    const e0 = errors[N - 2]!;
    layers.push(
      lines(
        TB_SIZES.map((n, i) => [[xw, yN(n), zf], tops[i]!] as [Vec3, Vec3]),
        'muted',
        'error',
        { name: 'Energy error of each mesh' },
      ),
      curve(tops, 'c1', 'error', { tube: 0.03 }),
      lines(
        [
          [
            [xw, -P, zE(1e-3)],
            [xw, P, zE(1e-3)],
          ],
        ],
        'muted',
        'error',
        { dashed: true },
      ),
      atoms([[xw, yN(N), zE(e0)]], 0.14, 'pos', 'error', { labels: [`${N} x ${N}: error ${small(e0)} t`] }),
      labels(
        [
          { text: 'N = 2', at: [xw, yN(2), zf - 0.5] },
          { text: 'N = 24', at: [xw, yN(24), zf - 0.5] },
          { text: '1e-3 t', at: [xw, P + 0.6, zE(1e-3)] },
          { text: 'error (log)', at: [xw, 0, zE(1) + 0.6] },
          { text: 'Gamma', at: [0, 0, zf - 0.4] },
        ],
        'labels',
      ),
      ...axesLayers([P + 0.6, P + 0.6, 3.4], ['kx', 'ky', 'E'], [0, 0, zf]),
    );
    const shift = ref - ref0;
    const occText = d
      ? `The lower band is full at every one of the ${mesh.count} mesh points.`
      : `${fmt(filled, sigma > 0 ? 1 : 0)} of ${mesh.count} mesh points are filled; the Fermi line ${sigma > 0 ? 'is softened by the smearing' : 'cuts the mesh sharply'}.`;
    const describe =
      `A ${N} x ${N} Gamma-centred mesh over the square zone of a 2D tight-binding ${system}, under its band surface. ${occText} ` +
      `The energy error per site of this mesh is ${small(e0)} t against a converged reference${sigma > 0 ? `; the smearing of ${fmt(sigma, 2)} t itself moves the converged energy by ${small(shift)} t` : ''}.`;
    return {
      layers,
      describe,
      camera: 'iso',
      readouts: [
        { label: 'Mesh', value: `${N} x ${N} (${mesh.count} points)` },
        { label: 'Energy error', value: `${small(e0)} t per site` },
        { label: 'Smearing shift', value: sigma > 0 ? `${small(shift)} t` : 'none (no smearing)' },
        { label: 'Filled points', value: d ? `${mesh.count} (insulator)` : fmt(filled, sigma > 0 ? 1 : 0) },
      ],
      axes: ['kx (1/a)', 'ky (1/a)', 'E (t)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 4. SCF trouble: charge sloshing of a long metallic cell under simple, Kerker and Pulay mixing.

export const SLOSH_KTF = 1.5;
export const SLOSH_ITERATIONS = 30;
const sloshMemo = new Map<string, SloshResult>();
export function sloshRun(mixer: Mixer, amix: number, bmix: number, length: number): SloshResult {
  return memo(sloshMemo, `${mixer}|${amix}|${bmix}|${length}`, () =>
    slosh({ length, kTF: SLOSH_KTF, amix, bmix, mixer, iterations: SLOSH_ITERATIONS }),
  );
}

const chargeSloshing: SceneDef = {
  id: 'm08-charge-sloshing',
  title: 'Charge sloshing in a long cell',
  badge: 'toy-model',
  sources: ['S-036', 'S-155', 'S-010'],
  banner:
    'Linear response of a metal with one Thomas-Fermi screening length (kTF = 1.5 per Angstrom) to a density mixer; VASP adds a metric and history on top, but the long waves misbehave the same way.',
  params: [
    {
      kind: 'select',
      id: 'mixer',
      label: 'Mixer',
      physics: true,
      value: 'linear',
      options: [
        { value: 'linear', label: 'Simple (linear or Kerker)' },
        { value: 'pulay', label: 'Pulay (history of 7)' },
      ],
    },
    {
      kind: 'slider',
      id: 'amix',
      label: 'AMIX',
      min: 0.02,
      max: 1,
      step: 0.02,
      value: 0.4,
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'bmix',
      label: 'BMIX (0 = none)',
      min: 0,
      max: 2,
      step: 0.1,
      value: 0,
      unit: '1/Å',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'length',
      label: 'Cell length',
      min: 10,
      max: 60,
      step: 5,
      value: 40,
      unit: 'Å',
      digits: 0,
      physics: true,
    },
    {
      kind: 'step',
      id: 'iter',
      label: 'SCF iteration',
      min: 0,
      max: SLOSH_ITERATIONS,
      value: 3,
      interval: 0.6,
    },
  ],
  build(p) {
    const mixer: Mixer = p.mixer === 'pulay' ? 'pulay' : 'linear';
    const amix = Math.round(Number(p.amix) * 100) / 100;
    const bmix = Math.round(Number(p.bmix) * 10) / 10;
    const L = Number(p.length);
    const r = sloshRun(mixer, amix, bmix, L);
    const last = r.errors.length - 1;
    const it = clamp(Math.round(Number(p.iter)), 0, last);
    const X = (z: number) => -6 + (12 * z) / L;
    const ns = 120;
    const zs = Array.from({ length: ns + 1 }, (_, i) => (L * i) / ns);
    const prof = (n: number) => zs.map((z) => errorAt(r.q, r.errors[n]!, z));
    const peak0 = Math.max(...prof(0).map(Math.abs)) || 1;
    const S = 2.2 / peak0;
    const H = (v: number) => clamp(S * v, -3.5, 3.5);
    const cur = prof(it);
    // the density slab of this iteration: its top sits at the converged density (z = 1) plus the error
    const slab: Vec3[] = [];
    const vals: number[] = [];
    for (const y of [-0.8, 0.8])
      zs.forEach((z, i) => {
        slab.push([X(z), y, 1 + H(cur[i]!)]);
        vals.push(cur[i]! / peak0);
      });
    const layers: Layer[] = [
      gridMesh(
        slab,
        ns,
        1,
        { group: 'slab', name: 'Density of this iteration', colormap: 'diverging', range: [-1, 1] },
        vals,
      ),
      quadLayer([-6, -0.8, 1], [12, 0, 0], [0, 1.6, 0], {
        group: 'slab',
        color: 'muted',
        opacity: 0.18,
      }),
    ];
    const nAtoms = Math.round(L / 2.5);
    layers.push(
      atoms(
        Array.from({ length: nAtoms }, (_, i) => [X((i + 0.5) * 2.5), 0, -0.5] as Vec3),
        0.16,
        'c0',
        'cell',
        { name: 'Atoms of the long cell' },
      ),
      lines(
        [
          [
            [-6, -0.9, -1],
            [6, -0.9, -1],
          ],
          [
            [-6, 0.9, -1],
            [6, 0.9, -1],
          ],
          [
            [-6, -0.9, -1],
            [-6, 0.9, -1],
          ],
          [
            [6, -0.9, -1],
            [6, 0.9, -1],
          ],
        ],
        'muted',
        'cell',
      ),
    );
    // waterfall: every earlier iteration behind the slab, this one drawn as a tube
    const yi = (n: number) => 1.6 + 0.38 * n;
    const segs: [Vec3, Vec3][] = [];
    for (let n = 0; n < it; n++) {
      const pr = prof(n);
      for (let i = 0; i < ns; i += 2)
        segs.push([
          [X(zs[i]!), yi(n), H(pr[i]!)],
          [X(zs[i + 2]!), yi(n), H(pr[i + 2]!)],
        ]);
    }
    if (segs.length) layers.push(lines(segs, 'muted', 'waterfall', { name: 'Earlier iterations' }));
    layers.push(
      curve(
        zs.map((z, i) => [X(z), yi(it), H(cur[i]!)] as Vec3),
        'accent',
        'waterfall',
        { tube: 0.04 },
      ),
    );
    // the residual of each iteration as a path up the right-hand end
    const zr = (x: number) => clamp(0.5 * log10(x), -5, 4) + 1;
    const spine = r.residuals.slice(0, it + 1).map((x, n) => [6.9, yi(n), zr(x)] as Vec3);
    if (spine.length > 1) layers.push(curve(spine, 'c1', 'residual', { name: 'Residual', tube: 0.03 }));
    layers.push(
      atoms([spine.at(-1)!], 0.12, 'c1', 'residual', { labels: [`residual ${small(r.residuals[it]!)}`] }),
      labels(
        [
          { text: 'z = 0', at: [-6, -1.4, -1] },
          { text: `z = ${L} Å`, at: [6, -1.4, -1] },
          { text: 'iteration 0', at: [-7.2, yi(0), 0] },
          { text: `iteration ${it}`, at: [-7.2, yi(it), 0] },
          { text: 'log residual', at: [6.9, yi(it) + 0.6, zr(r.residuals[it]!) + 0.6] },
        ],
        'labels',
      ),
    );
    const g0 = gain(r.q[0]!, SLOSH_KTF, amix, bmix);
    const aMax = stableAmix(L, SLOSH_KTF, bmix);
    const growing = r.residuals[it]! > 1;
    const res = r.residuals[it]!;
    const flips =
      it > 0 &&
      Math.sign(errorAt(r.q, r.errors[it]!, L / 4)) !== Math.sign(errorAt(r.q, r.errors[it - 1]!, L / 4));
    const scheme = mixer === 'pulay' ? 'Pulay mixing' : bmix > 0 ? 'Kerker mixing' : 'plain linear mixing';
    const verdict = r.diverged
      ? `The loop runs away and stops after iteration ${last}.`
      : growing
        ? 'The error is growing: the loop is diverging.'
        : res < 1e-6
          ? 'The density has settled.'
          : 'The error is shrinking.';
    const describe =
      `A ${L} Angstrom metallic cell after ${plural(it, 'SCF iteration')} of ${scheme} with AMIX ${fmt(amix, 2)}${bmix > 0 ? ` and BMIX ${fmt(bmix, 1)} per Angstrom` : ''}: the slab shows the error of the input density along the cell${flips ? ', which has just swapped ends' : ''}, and earlier iterations stand behind it. ` +
      `The residual is ${small(res)} of its first value. ${verdict}` +
      (mixer === 'linear'
        ? ` The longest wave is multiplied by ${fmt(g0, 2)} each step; plain mixing here would need AMIX below ${small(stableAmix(L, SLOSH_KTF, 0))}.`
        : '');
    return {
      layers,
      describe,
      camera: { eye: [0.9, -1.5, 1.0] },
      readouts: [
        { label: 'Iteration', value: `${it} of ${SLOSH_ITERATIONS}` },
        { label: 'Residual', value: `${small(res)} of the first` },
        {
          label: 'Longest wave per step',
          value: mixer === 'linear' ? `x ${fmt(g0, 2)}` : 'Pulay: mixed by history',
        },
        { label: 'Stable AMIX limit', value: `${small(aMax)} at this BMIX` },
      ],
      axes: ['position along the cell (12 units = L)', 'iteration', 'density error (scaled)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 5. Relaxation trouble: a ball on a 2D energy landscape, step by step, under three optimisers.

export const RELAX_STEPS = 30;
const relaxMemo = new Map<string, RelaxResult>();
export function relaxRun(land: LandscapeId, method: Method, potim: number, noise: number, rattle: boolean) {
  return memo(relaxMemo, `${land}|${method}|${potim}|${noise}|${rattle}`, () => {
    const l = LANDSCAPES[land];
    const start: [number, number] = rattle ? [l.start[0] + 0.05, l.start[1] + 0.03] : l.start;
    return relax(l, { method, step: potim, steps: RELAX_STEPS, noise, start });
  });
}

const METHOD_NAMES: Record<Method, string> = {
  sd: 'steepest descent with a fixed step',
  cg: 'conjugate gradient with line searches',
  damped: 'damped dynamics',
};

const relaxationLandscape: SceneDef = {
  id: 'm08-relaxation-landscape',
  title: 'A relaxation on an energy landscape',
  badge: 'toy-model',
  sources: ['S-156', 'S-157', 'S-041'],
  banner:
    'One point on a two-dimensional model landscape in place of all the atoms; the optimisers follow textbook forms, not VASP code, so step counts are only indicative.',
  params: [
    {
      kind: 'select',
      id: 'landscape',
      label: 'Landscape',
      physics: true,
      value: 'valley',
      options: [
        { value: 'valley', label: 'Narrow valley' },
        { value: 'double-well', label: 'Two wells and a saddle' },
      ],
    },
    {
      kind: 'select',
      id: 'method',
      label: 'Optimiser',
      physics: true,
      value: 'sd',
      options: [
        { value: 'sd', label: 'Steepest descent' },
        { value: 'cg', label: 'Conjugate gradient (IBRION = 2)' },
        { value: 'damped', label: 'Damped dynamics (IBRION = 3)' },
      ],
    },
    {
      kind: 'slider',
      id: 'potim',
      label: 'Step size',
      min: 0.01,
      max: 0.2,
      step: 0.01,
      value: 0.15,
      unit: 'Å²/eV',
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'noise',
      label: 'Force noise',
      min: 0,
      max: 0.3,
      step: 0.05,
      value: 0,
      unit: 'eV/Å',
      digits: 2,
      physics: true,
    },
    { kind: 'toggle', id: 'rattle', label: 'Rattle the start', value: false, physics: true },
    { kind: 'step', id: 'step', label: 'Ionic step', min: 0, max: RELAX_STEPS, value: 12, interval: 0.5 },
  ],
  build(p) {
    const land: LandscapeId = p.landscape === 'double-well' ? 'double-well' : 'valley';
    const method: Method = p.method === 'cg' ? 'cg' : p.method === 'damped' ? 'damped' : 'sd';
    const potim = Math.round(Number(p.potim) * 100) / 100;
    const noise = Math.round(Number(p.noise) * 100) / 100;
    const l = LANDSCAPES[land];
    const r = relaxRun(land, method, potim, noise, Boolean(p.rattle));
    const last = r.path.length - 1;
    const n = clamp(Math.round(Number(p.step)), 0, last);
    const [[x0, x1], [y0, y1]] = l.range;
    const EMAX = 3.2;
    const zf = -0.5;
    const ez = (x: number, y: number) => Math.min(l.energy(x, y), EMAX);
    const inBox = (x: number, y: number): [number, number] => [clamp(x, x0, x1), clamp(y, y0, y1)];
    const layers: Layer[] = [
      surfaceLayer(ez, [x0, x1], [y0, y1], 44, 44, {
        group: 'landscape',
        name: 'Energy landscape',
        opacity: 0.75,
      }),
    ];
    const shown = r.path.slice(0, n + 1);
    const lifted = shown.map((s) => {
      const [x, y] = inBox(s.x, s.y);
      return [x, y, ez(x, y) + 0.05] as Vec3;
    });
    if (lifted.length > 1) {
      layers.push(curve(lifted, 'ink', 'path', { name: 'Path', tube: 0.025 }));
      layers.push(
        lines(
          lifted.slice(1).map(
            (q, i) =>
              [
                [lifted[i]![0], lifted[i]![1], zf],
                [q[0], q[1], zf],
              ] as [Vec3, Vec3],
          ),
          'muted',
          'path',
          { dashed: true },
        ),
      );
    }
    const cur = r.path[n]!;
    const [cx, cy] = inBox(cur.x, cur.y);
    const ball: Vec3 = [cx, cy, ez(cx, cy) + 0.12];
    layers.push(
      atoms([ball], 0.12, 'pos', 'ball', { name: 'The atom', labels: [`step ${n}`], highlight: [0] }),
    );
    const g = l.gradient(cur.x, cur.y);
    const fl = Math.hypot(g[0], g[1]);
    if (fl > 1e-6) {
      const s = Math.min(0.15, 0.8 / fl);
      layers.push(
        arrows([ball], [[-g[0] * s, -g[1] * s, 0]], 'accent', 'force', { name: 'Force', thickness: 0.06 }),
      );
    }
    const trials = (r.path[n]?.trials ?? []).map(([x, y]) => {
      const [a, b] = inBox(x, y);
      return [a, b, ez(a, b) + 0.06] as Vec3;
    });
    if (trials.length)
      layers.push(points(trials, 'muted', 0.05, 'trials', { name: 'Line-search trial points' }));
    const tags = l.stationary.map((s) => ({ text: s.kind, at: [s.x, s.y, s.energy + 0.45] as Vec3 }));
    const st = r.path[0]!;
    (tags as { text: string; at: Vec3 }[]).push({ text: 'start', at: [st.x, st.y, ez(st.x, st.y) + 0.45] });
    layers.push(labels(tags, 'labels'), ...axesLayers([1.2, 1.2, 1.2], ['x', 'y', 'E'], [x0, y0, zf]));
    // what the reader is looking at
    const conv = r.convergedAt >= 0 && r.convergedAt <= n;
    const onSaddle = land === 'double-well' && cur.energy > 0.5 && cur.force < 0.01;
    let reversals = 0;
    for (let k = 2; k <= n; k++) {
      const a = r.path[k - 1]!;
      const b = r.path[k - 2]!;
      const c = r.path[k]!;
      if ((c.x - a.x) * (a.x - b.x) + (c.y - a.y) * (a.y - b.y) < 0) reversals++;
    }
    const [status, verb] =
      r.diverged && n === last
        ? ['runs away', 'runs away: the step is too large for the stiff direction']
        : onSaddle
          ? ['stuck on the saddle', 'is stuck on the saddle, where by symmetry there is no force to leave it']
          : conv
            ? [
                `converged at step ${r.convergedAt}`,
                `converged at step ${r.convergedAt} (force below 0.01 eV per Angstrom)`,
              ]
            : noise > 0 && cur.energy < 0.05
              ? [
                  'wanders near the minimum',
                  'wanders near the minimum: the noisy forces never drop below 0.01 eV per Angstrom',
                ]
              : reversals >= Math.max(2, (n - 1) / 2)
                ? ['zig-zags', 'zig-zags: each step overshoots the floor of the valley']
                : ['still going downhill', 'is still going downhill'];
    const describe =
      `A ${land === 'valley' ? 'narrow valley' : 'double well with a saddle between the wells'} relaxed by ${METHOD_NAMES[method]} (step size ${fmt(potim, 2)} Angstrom squared per eV${noise ? `, force noise ${fmt(noise, 2)} eV per Angstrom` : ''}). ` +
      `After ${plural(n, 'step')} the atom is at energy ${fmt(cur.energy, 3)} eV with a force of ${fmt(cur.force, 3)} eV per Angstrom; it ${verb}.` +
      (r.bracketFailed
        ? ' At least one line search failed to bracket a minimum, the toy version of ZBRENT.'
        : '');
    return {
      layers,
      describe,
      camera: { eye: [0.6, -1.4, 1.3] },
      readouts: [
        { label: 'Step', value: `${n} of ${last}` },
        { label: 'Energy', value: `${fmt(cur.energy, 3)} eV` },
        { label: 'Force', value: `${fmt(cur.force, 3)} eV/Å` },
        { label: 'Status', value: status },
      ],
      axes: ['x (Å)', 'y (Å)', 'E (eV)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 6. Common errors: the configurations behind four messages (overlap, IBZKPT, MAGMOM count, thin vacuum).

const DIAMOND = lookupStructure('diamond')!;
const HCP = lookupStructure('hcp')!;
const FCC = lookupStructure('fcc')!;
const BCC = lookupStructure('bcc')!;
let hcpGroup: IntMat3[] | null = null;
const hcpRotations = () => (hcpGroup ??= latticePointGroup(HCP.lattice));

/** Nearest contact of a structure and its ratio to the sum of covalent radii (the builder's B001 and B002 rules). */
export function nearestContact(s: Structure): {
  distance: number;
  ratio: number;
  rule: 'B001' | 'B002' | null;
} {
  const c = contacts(s, 4)[0]!;
  const sum = covalentRadius(s.species[c.i]!).radius + covalentRadius(s.species[c.j]!).radius;
  const ratio = c.distance / sum;
  return {
    distance: c.distance,
    ratio,
    rule: ratio < THRESHOLDS.overlapFactor ? 'B001' : ratio < THRESHOLDS.shortContactFactor ? 'B002' : null,
  };
}

/** Scale a structure's lattice (the POSCAR scale factor). */
export const scaled = (s: Structure, f: number): Structure => ({
  ...s,
  lattice: s.lattice.map((r) => r.map((x) => x * f)) as unknown as Mat3,
});

/** Monkhorst-Pack mesh of the hcp cell: n x n in plane, round(n a / c) (at least 1) along c, as VASP's Automatic grid. */
export const hcpMesh = (n: number): MeshDivisions => {
  const c = HCP.lattice[2]![2]!;
  const a = HCP.lattice[0]![0]!;
  return [n, n, Math.max(1, Math.round((n * a) / c))];
};

/** Mesh points of a mesh whose image under some lattice rotation is not a mesh point. */
export function brokenMeshPoints(
  n: MeshDivisions,
  rotations: readonly IntMat3[],
): { bad: boolean[]; failing: number } {
  const shift = shiftFlags(n, 'monkhorst-pack');
  const mesh = meshPoints(n, 'monkhorst-pack');
  const acts = reciprocalActions(rotations, false);
  const onMesh = (q: number[]) =>
    q.every((x, c) => {
      const v = x * n[c]! - (shift[c] ? 0.5 : 0);
      return Math.abs(v - Math.round(v)) < 1e-9;
    });
  const bad: boolean[] = [];
  const failingOps = new Set<number>();
  for (let i = 0; i < mesh.count; i++) {
    const q = [mesh.coords[3 * i]!, mesh.coords[3 * i + 1]!, mesh.coords[3 * i + 2]!];
    let b = false;
    acts.forEach((m, k) => {
      const img = [0, 1, 2].map((c) => q[0]! * m[0]![c]! + q[1]! * m[1]![c]! + q[2]! * m[2]![c]!);
      if (!onMesh(img)) {
        b = true;
        failingOps.add(k);
      }
    });
    bad.push(b);
  }
  return { bad, failing: failingOps.size };
}

/** fcc(001) slab of copper: `layers` atomic layers of a 1 x 1 conventional cell with `vacuum` Angstrom above. */
export function copperSlab(vacuum: number, nLayers = 4): Structure {
  const a = FCC.lattice[0]![0]!;
  const d = a / 2;
  const thick = (nLayers - 1) * d;
  const c = thick + vacuum;
  const frac: [number, number, number][] = [];
  for (let l = 0; l < nLayers; l++) {
    const z = (l * d) / c;
    if (l % 2 === 0) frac.push([0, 0, z], [0.5, 0.5, z]);
    else frac.push([0.5, 0, z], [0, 0.5, z]);
  }
  return {
    lattice: [
      [a, 0, 0],
      [0, a, 0],
      [0, 0, c],
    ],
    species: frac.map(() => FCC.species[0]!),
    frac,
  };
}

/** bcc iron in a 2 x 2 x 1 supercell: 8 atoms, so MAGMOM needs 8 values. */
export function ironSupercell(): Structure {
  const a = BCC.lattice[0]![0]!;
  const frac: [number, number, number][] = [];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) frac.push([i / 2, j / 2, 0], [(i + 0.5) / 2, (j + 0.5) / 2, 0.5]);
  return {
    lattice: [
      [2 * a, 0, 0],
      [0, 2 * a, 0],
      [0, 0, a],
    ],
    species: frac.map(() => BCC.species[0]!),
    frac,
  };
}

const errorCauses: SceneDef = {
  id: 'm08-error-causes',
  title: 'What is behind four common VASP errors',
  badge: 'computed',
  sources: ['S-021', 'S-007', 'S-032', 'S-036', 'S-041'],
  params: [
    {
      kind: 'select',
      id: 'case',
      label: 'Error',
      physics: true,
      value: 'overlap',
      options: [
        { value: 'overlap', label: 'Distance between ions very small' },
        { value: 'kmesh', label: 'IBZKPT: mesh breaks the symmetry' },
        { value: 'magmom', label: 'Error reading item MAGMOM' },
        { value: 'vacuum', label: 'Slab touching its own image' },
      ],
    },
    {
      kind: 'slider',
      id: 'scale',
      label: 'POSCAR scale factor',
      min: 0.4,
      max: 1.1,
      step: 0.01,
      value: 0.6,
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'kmesh',
      label: 'Mesh divisions n',
      min: 2,
      max: 9,
      step: 1,
      value: 4,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'magmom',
      label: 'Values in MAGMOM',
      min: 1,
      max: 12,
      step: 1,
      value: 2,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'vacuum',
      label: 'Vacuum',
      min: 0,
      max: 20,
      step: 0.5,
      value: 2,
      unit: 'Å',
      digits: 1,
      physics: true,
    },
  ],
  build(p) {
    const which = String(p.case);
    if (which === 'kmesh') {
      const n = clamp(Math.round(Number(p.kmesh)), 2, 9);
      const div = hcpMesh(n);
      const { bad, failing } = brokenMeshPoints(div, hcpRotations());
      const mesh = meshPoints(div, 'monkhorst-pack');
      const zone = brillouinLayers(HCP.lattice, { group: 'zone' });
      const B = zone.reciprocal as [Vec3, Vec3, Vec3];
      const good: Vec3[] = [];
      const broken: Vec3[] = [];
      for (let i = 0; i < mesh.count; i++) {
        const k = qToCartesian([mesh.coords[3 * i]!, mesh.coords[3 * i + 1]!, mesh.coords[3 * i + 2]!], B);
        (bad[i] ? broken : good).push([k[0], k[1], k[2]]);
      }
      const acts = reciprocalActions(hcpRotations(), false).length;
      const shifted = shiftFlags(div, 'monkhorst-pack').some(Boolean);
      const layers: Layer[] = [...zone.layers];
      if (good.length)
        layers.push(points(good, 'neg', 0.045, 'mesh', { name: 'Mesh points (kept by every rotation)' }));
      if (broken.length)
        layers.push(
          atoms(broken, 0.06, 'pos', 'broken', { name: 'Mesh points a rotation sends off the mesh' }),
        );
      layers.push(
        labels([{ text: 'Gamma', at: [0, 0, 0] }], 'labels'),
        ...axesLayers(1.6, ['kx', 'ky', 'kz']),
      );
      const describe =
        `The hexagonal Brillouin zone of hcp magnesium with a ${div.join(' x ')} Monkhorst-Pack mesh (${mesh.count} points), ${shifted ? 'shifted off Gamma because n is even' : 'which contains Gamma because n is odd'}. ` +
        (failing
          ? `${failing} of ${acts} rotations of the lattice send ${broken.length} of the points off the mesh (drawn as larger orange spheres), so the mesh has lower symmetry than the crystal: this is what IBZKPT complains about. A Gamma-centred mesh fixes it.`
          : `Every one of the ${acts} rotations maps the mesh onto itself, so the k-point setup agrees with the crystal symmetry.`);
      return {
        layers,
        describe,
        camera: 'iso',
        readouts: [
          { label: 'Mesh', value: `${div.join(' x ')} Monkhorst-Pack` },
          { label: 'Symmetric', value: failing ? 'no' : 'yes' },
          { label: 'Rotations that fail', value: `${failing} of ${acts}` },
          { label: 'Points sent off the mesh', value: `${broken.length} of ${mesh.count}` },
        ],
        axes: ['kx (1/Å)', 'ky (1/Å)', 'kz (1/Å)'],
      };
    }
    if (which === 'magmom') {
      const s = ironSupercell();
      const m = clamp(Math.round(Number(p.magmom)), 1, 12);
      const cr = crystalLayers(s, { radiusScale: 0.45 });
      const pos = s.frac.map((f) => {
        const L = s.lattice;
        return [0, 1, 2].map((c) => f[0] * L[0][c]! + f[1] * L[1][c]! + f[2] * L[2][c]!) as Vec3;
      });
      const nA = s.frac.length;
      const given = Math.min(m, nA);
      const missing = Array.from({ length: nA - given }, (_, i) => given + i);
      const layers: Layer[] = cr.layers.filter((l) => l.kind !== 'atoms');
      layers.push(
        atoms(pos, 0.55, 'c0', 'atoms', {
          name: 'Fe atoms in POSCAR order',
          labels: pos.map((_, i) => `Fe ${i + 1}${i < given ? '' : ' (no value)'}`),
          highlight: missing,
        }),
      );
      if (given)
        layers.push(
          arrows(
            pos.slice(0, given).map((q) => [q[0], q[1], q[2] - 0.6] as Vec3),
            pos.slice(0, given).map(() => [0, 0, 1.2] as Vec3),
            'pos',
            'moments',
            { name: 'Moments read from MAGMOM' },
          ),
        );
      layers.push(
        labels(
          pos
            .slice(0, Math.min(nA, 8))
            .map((q, i) => ({ text: String(i + 1), at: [q[0], q[1], q[2] + 0.9] as Vec3 })),
          'labels',
        ),
      );
      const ok = m === nA;
      const describe =
        `A 2 x 2 x 1 supercell of bcc iron with ${nA} atoms, numbered in POSCAR order; MAGMOM lists ${plural(m, 'value')}. ` +
        (ok
          ? 'One value per atom: every atom gets its moment (the arrows) and the list is read without complaint.'
          : m < nA
            ? `Atoms ${given + 1} to ${nA} have no value (outlined, no arrow): the list is too short for the ${nA} atoms, the input mistake behind an error reading MAGMOM.`
            : `The list has ${m - nA} more ${m - nA === 1 ? 'value' : 'values'} than there are atoms, so it no longer matches POSCAR; a list of the wrong length is the input mistake to check first.`);
      return {
        layers,
        describe,
        lattice: s.lattice.map((r) => [r[0], r[1], r[2]]) as [Vec3, Vec3, Vec3],
        ortho: true,
        camera: 'iso',
        readouts: [
          { label: 'Atoms in POSCAR', value: String(nA) },
          { label: 'Values in MAGMOM', value: String(m) },
          { label: 'Atoms without a value', value: String(missing.length) },
          { label: 'Matches', value: ok ? 'yes' : 'no' },
        ],
      };
    }
    if (which === 'vacuum') {
      const vac = Number(p.vacuum);
      const s = copperSlab(vac);
      const cr = crystalLayers(s, { repeat: [2, 2, 2], radiusScale: 0.45 });
      const d = FCC.lattice[0]![0]! / 2;
      const thick = 3 * d;
      const c = s.lattice[2][2];
      const layers: Layer[] = [...cr.layers];
      const a2 = 2 * s.lattice[0][0];
      layers.push(
        quadLayer([0, 0, thick], [a2, 0, 0], [0, a2, 0], {
          group: 'gap',
          name: 'Vacuum gap',
          color: 'neg',
          opacity: 0.12,
        }),
        quadLayer([0, 0, c], [a2, 0, 0], [0, a2, 0], { group: 'gap', color: 'neg', opacity: 0.12 }),
        lines(
          [
            [
              [-0.6, 0, thick],
              [-0.6, 0, c],
            ],
          ],
          'ink',
          'gap',
          { tube: 0.03 },
        ),
        labels(
          [
            { text: `vacuum ${fmt(vac, 1)} Å`, at: [-1.2, 0, (thick + c) / 2] },
            { text: 'slab', at: [-1.2, 0, thick / 2] },
            { text: 'its periodic image', at: [-1.2, 0, c + thick / 2] },
          ],
          'labels',
        ),
      );
      const bulkLike = Math.abs(vac - d) < 0.05;
      const describe =
        `A four-layer copper (001) slab, ${fmt(thick, 2)} Angstrom thick, drawn with its periodic image above it; the vacuum between them is ${fmt(vac, 1)} Angstrom. ` +
        (bulkLike
          ? 'At exactly one layer spacing the slab and its image join into bulk copper: there is no surface at all.'
          : vac < 10
            ? 'The two surfaces face each other across a thin gap and still interact through it, so the energy depends on the vacuum. No message warns about this: it is a silent error.'
            : `The image is well separated; the structure builder's default is 15 Angstrom.`);
      return {
        layers,
        describe,
        lattice: [
          [s.lattice[0][0], 0, 0],
          [0, s.lattice[1][1], 0],
          [0, 0, c],
        ],
        ortho: true,
        camera: 'a',
        readouts: [
          { label: 'Vacuum', value: `${fmt(vac, 1)} Å` },
          { label: 'Slab thickness', value: `${fmt(thick, 2)} Å` },
          { label: 'Cell height c', value: `${fmt(c, 2)} Å` },
          { label: 'Builder default', value: '15 Å' },
        ],
      };
    }
    // overlap: diamond silicon with a wrong POSCAR scale factor; spheres at the full covalent radius
    const f = Number(p.scale);
    const s = scaled(DIAMOND, f);
    const near = nearestContact(s);
    const cr = crystalLayers(s, { boundary: true, radiusScale: 1, bonds: false });
    const layers: Layer[] = cr.layers.map((l) =>
      l.kind === 'atoms' && near.rule ? { ...l, highlight: l.positions.map((_, i) => i), opacity: 0.85 } : l,
    );
    const sum = 2 * covalentRadius('Si').radius;
    const verdict =
      near.rule === 'B001'
        ? 'below half the sum of covalent radii, so the atoms overlap and the structure builder flags B001; this is the input behind the message that the distance between ions is very small'
        : near.rule === 'B002'
          ? 'below 0.75 of the sum of covalent radii: a short contact (B002); the first forces will be huge'
          : 'a normal contact';
    const describe =
      `Diamond silicon with a POSCAR scale factor of ${fmt(f, 2)}, drawn with spheres of the full covalent radius so overlaps show. ` +
      `The nearest neighbours are ${fmt(near.distance, 2)} Angstrom apart, ${fmt(near.ratio, 2)} of the sum of covalent radii (${fmt(sum, 2)} Angstrom): ${verdict}.`;
    return {
      layers,
      describe,
      lattice: s.lattice.map((r) => [r[0], r[1], r[2]]) as [Vec3, Vec3, Vec3],
      ortho: true,
      camera: 'iso',
      readouts: [
        { label: 'Scale factor', value: fmt(f, 2) },
        { label: 'Nearest distance', value: `${fmt(near.distance, 2)} Å` },
        { label: 'Distance / radius sum', value: fmt(near.ratio, 2) },
        { label: 'Builder rule', value: near.rule ?? 'none' },
      ],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [convergenceSurface.id]: convergenceSurface,
  [cutoffSphere.id]: cutoffSphere,
  [kmeshError.id]: kmeshError,
  [chargeSloshing.id]: chargeSloshing,
  [relaxationLandscape.id]: relaxationLandscape,
  [errorCauses.id]: errorCauses,
};
