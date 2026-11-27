// Module 5 (practical choices: the electronic settings) scenes. Pure generators on tested libraries, honest badges.
// Magnetism topics of module 5 live in m05s.ts. Reciprocal space is in 1/Angstrom with the 2 pi factor.
// @source S-036, S-050 (Brillouin zone), S-005 (Setyawan-Curtarolo points), S-007 (Monkhorst-Pack), S-032 (orbit counting)
// @source S-049, S-031, S-040 (plane-wave cutoff), S-015, S-016, S-019 (smearing), S-008, S-009 (PAW idea, schematic)
// @source S-014 (Dudarev DFT+U), S-013, S-146, S-147 (PBE, PW92, PBEsol), S-148 (DFT-D2)
import {
  irreducibleCount,
  meshPoints,
  meshSymmetryReport,
  qToCartesian,
  type Centering,
} from '../../crystal/kmesh';
import { reciprocalLattice } from '../../crystal/lattice';
import { latticePointGroup, type IntMat3 } from '../../crystal/pointgroup';
import type { Mat3 } from '../../crystal/types';
import { HBAR2_OVER_2M_EV_A2, BOHR_RADIUS_ANGSTROM } from '../../physics/constants';
import { dudarevEnergy, dudarevPotential } from '../../physics/dftu';
import { BOND, GRAPHENE_A, bilayerEnergy, layerSites, stackingName } from '../../physics/dispersion';
import { allElectronLike, augmentation, nodeCount, pseudo } from '../../physics/paw';
import {
  XC_FORMS,
  densityFromRs,
  enhancement,
  exchangeEnhancement,
  MU_PBE,
  MU_PBESOL,
  type XcForm,
} from '../../physics/pbe';
import { cutoffRadius, gVectorsWithin, type PlaneWaveSet } from '../../physics/planewaves';
import { SMEARINGS, delta, occupation, type SmearingId } from '../../physics/smearing';
import structures from '../../../data/scene-structures.json';
import {
  arrows,
  atoms,
  axesLayers,
  brillouinLayers,
  cellEdges,
  curve,
  fmt,
  gridIsosurfaceLayer,
  labels,
  lines,
  points,
  quadLayer,
  sphereLayer,
  surfaceLayer,
} from '../kit';
import { norm, sub, type Vec3 } from '../math';
import { elementRadius, elementTone, twoToneBonds } from './bondsTwoTone';
import type { Color, Layer, MeshLayer, SceneDef } from '../types';

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const mat = (rows: readonly (readonly number[])[]): Mat3 => [v3(rows[0]!), v3(rows[1]!), v3(rows[2]!)];

/* ------------------------------------------------------------------------------------------------------------------ */
/* Primitive cells of the four lattices, in the Setyawan-Curtarolo setting (S-005), from scene-structures.json.        */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface LatticeCase {
  id: 'sc' | 'fcc' | 'bcc' | 'hcp';
  label: string;
  /** Element and conventional lattice constant, for the description. */
  what: string;
  lattice: Mat3;
  /** High-symmetry points in fractional coordinates of the reciprocal primitive basis (S-005). */
  points: Record<string, Vec3>;
  path: string[][];
}

function structureLattice(id: string): Mat3 {
  // read straight from the named structures (scene/library.ts would also pull in every preset scene)
  const s = (structures as unknown as Record<string, { lattice: number[][] } | undefined>)[id];
  if (!s) throw new Error(`scene-structures.json has no "${id}"`);
  return mat(s.lattice);
}

function latticeCases(): LatticeCase[] {
  const sc = structureLattice('sc');
  const fcc = structureLattice('fcc-primitive');
  const aB = structureLattice('bcc')[0][0];
  const h = structureLattice('hcp');
  const aH = norm(v3(h[0]));
  const cH = norm(v3(h[2]));
  const r3 = Math.sqrt(3);
  const G = 'Γ';
  return [
    {
      id: 'sc',
      label: 'Simple cubic (Po)',
      what: `simple cubic Po, a = ${fmt(sc[0][0], 2)} Angstrom`,
      lattice: sc,
      points: { [G]: [0, 0, 0], X: [0, 0.5, 0], M: [0.5, 0.5, 0], R: [0.5, 0.5, 0.5] },
      path: [
        [G, 'X', 'M', G, 'R', 'X'],
        ['M', 'R'],
      ],
    },
    {
      id: 'fcc',
      label: 'Face-centred cubic (Cu)',
      what: `face-centred cubic Cu, a = ${fmt(2 * fcc[0][1], 2)} Angstrom`,
      lattice: fcc,
      points: {
        [G]: [0, 0, 0],
        X: [0.5, 0, 0.5],
        W: [0.5, 0.25, 0.75],
        K: [0.375, 0.375, 0.75],
        L: [0.5, 0.5, 0.5],
        U: [0.625, 0.25, 0.625],
      },
      path: [
        [G, 'X', 'W', 'K', G, 'L', 'U', 'W', 'L', 'K'],
        ['U', 'X'],
      ],
    },
    {
      id: 'bcc',
      label: 'Body-centred cubic (Fe)',
      what: `body-centred cubic Fe, a = ${fmt(aB, 2)} Angstrom`,
      lattice: mat([
        [-aB / 2, aB / 2, aB / 2],
        [aB / 2, -aB / 2, aB / 2],
        [aB / 2, aB / 2, -aB / 2],
      ]),
      points: { [G]: [0, 0, 0], H: [0.5, -0.5, 0.5], N: [0, 0, 0.5], P: [0.25, 0.25, 0.25] },
      path: [
        [G, 'H', 'N', G, 'P', 'H'],
        ['P', 'N'],
      ],
    },
    {
      id: 'hcp',
      label: 'Hexagonal close-packed (Mg)',
      what: `hexagonal close-packed Mg, a = ${fmt(aH, 2)} and c = ${fmt(cH, 2)} Angstrom`,
      lattice: mat([
        [aH / 2, (-aH * r3) / 2, 0],
        [aH / 2, (aH * r3) / 2, 0],
        [0, 0, cH],
      ]),
      points: {
        [G]: [0, 0, 0],
        M: [0.5, 0, 0],
        K: [1 / 3, 1 / 3, 0],
        A: [0, 0, 0.5],
        L: [0.5, 0, 0.5],
        H: [1 / 3, 1 / 3, 0.5],
      },
      path: [
        [G, 'M', 'K', G, 'A', 'L', 'H', 'A'],
        ['L', 'M'],
        ['K', 'H'],
      ],
    },
  ];
}

export const LATTICES: LatticeCase[] = latticeCases();
const latticeCase = (id: unknown): LatticeCase => LATTICES.find((l) => l.id === id) ?? LATTICES[1]!;

const groupMemo = new Map<string, IntMat3[]>();
const pointGroup = (c: LatticeCase): IntMat3[] => {
  let g = groupMemo.get(c.id);
  if (!g) groupMemo.set(c.id, (g = latticePointGroup(c.lattice)));
  return g;
};

/** Divisions along b1, b2, b3 in proportion to their lengths, the longest getting n (as KSPACING would). */
export function meshDivisions(rec: readonly Vec3[], n: number): [number, number, number] {
  const len = rec.map((b) => norm(b));
  const top = Math.max(...len);
  return len.map((l) => Math.max(1, Math.round((n * l) / top))) as [number, number, number];
}

/** Bring k (inside the reciprocal cell centred on Gamma) into the first Brillouin zone: subtract the nearest of the 26 neighbouring G. */
export function foldToZone(k: Vec3, rec: readonly Vec3[]): Vec3 {
  let best = k;
  let bestN = norm(k);
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (let l = -1; l <= 1; l++) {
        if (!i && !j && !l) continue;
        const g: Vec3 = [
          i * rec[0]![0] + j * rec[1]![0] + l * rec[2]![0],
          i * rec[0]![1] + j * rec[1]![1] + l * rec[2]![1],
          i * rec[0]![2] + j * rec[1]![2] + l * rec[2]![2],
        ];
        const q = sub(k, g);
        const nq = norm(q);
        if (nq < bestN - 1e-9) {
          best = q;
          bestN = nq;
        }
      }
  return best;
}

export interface MeshResult {
  divisions: [number, number, number];
  total: number;
  irreducible: number;
  symmetric: boolean;
  /** Cartesian points folded into the zone. */
  points: Vec3[];
  /** Index into `points` of each representative, with its class size. */
  representatives: { index: number; size: number }[];
  operations: number;
}

const meshMemo = new Map<string, MeshResult>();
export function meshFor(c: LatticeCase, n: number, centering: Centering): MeshResult {
  const key = `${c.id}|${n}|${centering}`;
  const hit = meshMemo.get(key);
  if (hit) return hit;
  const rec = reciprocalLattice(c.lattice).map(v3);
  const div = meshDivisions(rec, n);
  const m = meshPoints(div, centering);
  const b = rec as unknown as readonly [Vec3, Vec3, Vec3];
  const pts: Vec3[] = [];
  for (let i = 0; i < m.count; i++)
    pts.push([
      ...foldToZone(
        [...qToCartesian([m.coords[3 * i]!, m.coords[3 * i + 1]!, m.coords[3 * i + 2]!], b)] as Vec3,
        rec,
      ),
    ] as Vec3);
  const group = pointGroup(c);
  const red = irreducibleCount(div, centering, group);
  const out: MeshResult = {
    divisions: div,
    total: m.count,
    irreducible: red.irreducible,
    symmetric: meshSymmetryReport(div, centering, group).symmetric,
    points: pts,
    representatives: red.representatives.map((r) => ({ index: r.index, size: r.size })),
    operations: group.length,
  };
  meshMemo.set(key, out);
  return out;
}

const kmesh: SceneDef = {
  id: 'm05-kmesh',
  title: 'Brillouin zone, k-path and k-mesh',
  badge: 'computed',
  sources: ['S-036', 'S-050', 'S-005', 'S-007', 'S-032'],
  params: [
    {
      kind: 'select',
      id: 'lattice',
      label: 'Lattice',
      physics: true,
      value: 'fcc',
      options: LATTICES.map((l) => ({ value: l.id, label: l.label })),
    },
    {
      kind: 'slider',
      id: 'n',
      label: 'Mesh divisions (longest b)',
      min: 1,
      max: 8,
      step: 1,
      value: 4,
      digits: 0,
      physics: true,
    },
    {
      kind: 'select',
      id: 'centering',
      label: 'Mesh type',
      physics: true,
      value: 'monkhorst-pack',
      options: [
        { value: 'gamma', label: 'Gamma-centred' },
        { value: 'monkhorst-pack', label: 'Monkhorst-Pack' },
      ],
    },
    { kind: 'toggle', id: 'reduce', label: 'Mark irreducible points', value: true },
    { kind: 'toggle', id: 'path', label: 'High-symmetry path', value: true },
  ],
  build(p) {
    const c = latticeCase(p.lattice);
    const n = Math.round(Number(p.n));
    const centering: Centering = p.centering === 'gamma' ? 'gamma' : 'monkhorst-pack';
    const res = meshFor(c, n, centering);
    const rec = reciprocalLattice(c.lattice).map(v3);
    const bmax = Math.max(...rec.map((b) => norm(b)));
    const zone = brillouinLayers(c.lattice).layers;
    const layers: Layer[] = [...zone];
    const repSet = new Set(res.representatives.map((r) => r.index));
    const others = res.points.filter((_, i) => !(p.reduce && repSet.has(i)));
    layers.push(
      points(others, 'muted', bmax * 0.018, 'mesh', {
        name: 'k-mesh',
        labels: others.map((_, i) => `mesh point ${i + 1}`),
      }),
    );
    if (p.reduce)
      layers.push(
        atoms(
          res.representatives.map((r) => res.points[r.index]!),
          bmax * 0.032,
          'accent',
          'irreducible',
          {
            name: 'Irreducible points',
            labels: res.representatives.map((r, i) => `irreducible ${i + 1}, weight ${r.size}/${res.total}`),
          },
        ),
      );
    const pt = (lab: string): Vec3 =>
      [...qToCartesian(c.points[lab]!, rec as unknown as readonly [Vec3, Vec3, Vec3])] as Vec3;
    if (p.path) {
      for (const seg of c.path)
        layers.push(curve(seg.map(pt), 'pos', 'path', { name: 'High-symmetry path', tube: bmax * 0.008 }));
      const names = Object.keys(c.points);
      layers.push(
        points(names.map(pt), 'pos', bmax * 0.022, 'path', { labels: names }),
        labels(
          names.map((l) => ({
            text: l,
            at: pt(l).map((x) => x * 1.12 + (l === 'Γ' ? 0.08 * bmax : 0)) as Vec3,
          })),
          'path',
        ),
      );
    }
    layers.push(
      arrows(
        [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
        rec.map((b) => b.map((x) => x * 0.5) as Vec3),
        'muted',
        'axes',
        { name: 'Half reciprocal vectors', thickness: 0.02 },
      ),
      labels(
        rec.map((b, i) => ({ text: `b${i + 1}/2`, at: b.map((x) => x * 0.56) as Vec3 })),
        'axes',
      ),
    );
    const [n1, n2, n3] = res.divisions;
    const kind = centering === 'gamma' ? 'Gamma-centred' : 'Monkhorst-Pack';
    const spacing = Math.max(...rec.map((b, i) => norm(b) / res.divisions[i]!));
    const pathText = c.path.map((s) => s.join('-')).join(' and ');
    const describe =
      `The first Brillouin zone of ${c.what}, in 1/Angstrom, with a ${kind} ${n1} x ${n2} x ${n3} mesh folded into the zone: ` +
      `${res.total} k-points, of which ${res.irreducible} are irreducible under the ${res.operations} point-group operations and time reversal. ` +
      (res.symmetric
        ? 'Every symmetry operation maps this mesh onto itself. '
        : 'This mesh does not have the full symmetry of the lattice, so some operations send points off the mesh; a Gamma-centred mesh would keep it. ') +
      `The high-symmetry path runs ${pathText}.`;
    return {
      layers,
      describe,
      lattice: c.lattice.map(v3) as [Vec3, Vec3, Vec3],
      ortho: true,
      camera: 'iso',
      readouts: [
        { label: 'Mesh', value: `${n1} x ${n2} x ${n3} ${centering === 'gamma' ? 'Gamma' : 'MP'}` },
        { label: 'k-points', value: String(res.total) },
        { label: 'Irreducible', value: String(res.irreducible) },
        { label: 'Largest spacing', value: `${fmt(spacing, 3)} 1/Å` },
      ],
    };
  },
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Plane-wave cutoff sphere.                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export const ENCUT_MAX = 400;
const pwMemo = new Map<string, PlaneWaveSet>();
export function planeWavesUpTo(c: LatticeCase, encut: number): PlaneWaveSet {
  const key = `${c.id}|${encut}`;
  let s = pwMemo.get(key);
  if (!s) pwMemo.set(key, (s = gVectorsWithin(c.lattice, encut)));
  return s;
}

/**
 * The sharpest bump the basis can build at an atom: f(r) = (1 / N) sum over the N plane waves of cos(G . r), on an
 * n^3 grid over the cell centred on the atom (fractional f - 1/2). Separable sums keep it fast. f(0) = 1.
 */
export function sharpestBump(c: LatticeCase, encut: number, n: number): Float64Array {
  const pw = planeWavesUpTo(c, encut);
  const idx = pw.indices;
  const N = pw.count;
  let m = 0;
  for (let i = 0; i < idx.length; i++) m = Math.max(m, Math.abs(idx[i]!));
  const span = 2 * m + 1;
  // phase tables e^{2 pi i k (f - 1/2)} for k = -m..m and grid index g
  const cosT = new Float64Array(span * n);
  const sinT = new Float64Array(span * n);
  for (let k = -m; k <= m; k++)
    for (let g = 0; g < n; g++) {
      const ph = 2 * Math.PI * k * (g / n - 0.5);
      cosT[(k + m) * n + g] = Math.cos(ph);
      sinT[(k + m) * n + g] = Math.sin(ph);
    }
  // A[k1][k2][g3] = sum_{k3} e3, over the vectors present
  const A_re = new Float64Array(span * span * n);
  const A_im = new Float64Array(span * span * n);
  for (let v = 0; v < N; v++) {
    const a = idx[3 * v]! + m;
    const b = idx[3 * v + 1]! + m;
    const k = idx[3 * v + 2]! + m;
    const base = (a * span + b) * n;
    for (let g = 0; g < n; g++) {
      A_re[base + g] = A_re[base + g]! + cosT[k * n + g]!;
      A_im[base + g] = A_im[base + g]! + sinT[k * n + g]!;
    }
  }
  // B[k1][g2][g3] = sum_{k2} A e2
  const B_re = new Float64Array(span * n * n);
  const B_im = new Float64Array(span * n * n);
  for (let a = 0; a < span; a++)
    for (let b = 0; b < span; b++) {
      const base = (a * span + b) * n;
      let any = false;
      for (let g = 0; g < n; g++) if (A_re[base + g] || A_im[base + g]) any = true;
      if (!any) continue;
      for (let g2 = 0; g2 < n; g2++) {
        const c2 = cosT[b * n + g2]!;
        const s2 = sinT[b * n + g2]!;
        const out = (a * n + g2) * n;
        for (let g3 = 0; g3 < n; g3++) {
          const ar = A_re[base + g3]!;
          const ai = A_im[base + g3]!;
          B_re[out + g3] = B_re[out + g3]! + ar * c2 - ai * s2;
          B_im[out + g3] = B_im[out + g3]! + ar * s2 + ai * c2;
        }
      }
    }
  // f[g1][g2][g3] = Re sum_{k1} B e1, stored with x (g1) fastest for the isosurface
  const f = new Float64Array(n * n * n);
  for (let a = 0; a < span; a++)
    for (let g1 = 0; g1 < n; g1++) {
      const c1 = cosT[a * n + g1]!;
      const s1 = sinT[a * n + g1]!;
      for (let g2 = 0; g2 < n; g2++)
        for (let g3 = 0; g3 < n; g3++) {
          const bi = (a * n + g2) * n + g3;
          f[g1 + n * (g2 + n * g3)] = f[g1 + n * (g2 + n * g3)]! + (B_re[bi]! * c1 - B_im[bi]! * s1) / N;
        }
    }
  return f;
}

/** Distance from the atom along the shortest lattice direction where the bump first falls to half its height. */
export function halfHeightRadius(c: LatticeCase, encut: number): number {
  const pw = planeWavesUpTo(c, encut);
  const a = c.lattice.map(v3).reduce((x, y) => (norm(y) < norm(x) ? y : x));
  const u = a.map((x) => x / norm(a)) as Vec3;
  const f = (t: number) => {
    let s = 0;
    for (let v = 0; v < pw.count; v++)
      s += Math.cos(
        t * (pw.vectors[3 * v]! * u[0] + pw.vectors[3 * v + 1]! * u[1] + pw.vectors[3 * v + 2]! * u[2]),
      );
    return s / pw.count;
  };
  const tMax = norm(a) / 2;
  for (let t = 0.005; t <= tMax; t += 0.005) if (f(t) < 0.5) return t;
  return tMax;
}

const bumpMemo = new Map<string, { bump: MeshLayer; ripples: MeshLayer; r50: number }>();
const BUMP_GRID = 24;

const encutScene: SceneDef = {
  id: 'm05-encut',
  title: 'Plane-wave cutoff sphere',
  badge: 'computed',
  sources: ['S-049', 'S-031', 'S-040', 'S-036'],
  params: [
    {
      kind: 'slider',
      id: 'encut',
      label: 'ENCUT',
      min: 20,
      max: ENCUT_MAX,
      step: 10,
      value: 200,
      unit: 'eV',
      digits: 0,
      physics: true,
    },
    {
      kind: 'select',
      id: 'cell',
      label: 'Crystal',
      physics: true,
      value: 'fcc',
      options: LATTICES.filter((l) => l.id !== 'hcp').map((l) => ({ value: l.id, label: l.label })),
    },
    {
      kind: 'select',
      id: 'space',
      label: 'Show',
      physics: true,
      value: 'reciprocal',
      options: [
        { value: 'reciprocal', label: 'G vectors in reciprocal space' },
        { value: 'real', label: 'Sharpest bump in real space' },
      ],
    },
    { kind: 'toggle', id: 'outside', label: 'G vectors outside the sphere', value: true },
  ],
  build(p) {
    const c = latticeCase(p.cell === 'hcp' ? 'fcc' : p.cell);
    const encut = Number(p.encut);
    const pw = planeWavesUpTo(c, encut);
    const gc = cutoffRadius(encut);
    const lattice = c.lattice.map(v3) as [Vec3, Vec3, Vec3];
    const element = c.id === 'sc' ? 'Po' : c.id === 'bcc' ? 'Fe' : 'Cu';
    const head =
      `ENCUT = ${fmt(encut, 0)} eV for ${c.what} (primitive cell, ${fmt(Math.abs(det(lattice)), 2)} cubic Angstrom): ` +
      `the cutoff sphere has radius k_c = ${fmt(gc, 2)} 1/Angstrom and holds ${pw.count} plane waves ` +
      `(the continuum estimate V k_c^3 / 6 pi^2 gives ${fmt(pw.continuum, 1)}).`;
    if (p.space === 'real') {
      const key = `${c.id}|${encut}`;
      const n = BUMP_GRID;
      const toScene = (g: Vec3): Vec3 => {
        const fr = g.map((x) => x / n - 0.5);
        return [0, 1, 2].map(
          (k) => fr[0]! * lattice[0][k]! + fr[1]! * lattice[1][k]! + fr[2]! * lattice[2][k]!,
        ) as Vec3;
      };
      let iso = bumpMemo.get(key);
      if (!iso) {
        const f = sharpestBump(c, encut, n);
        iso = {
          bump: gridIsosurfaceLayer(f, [n, n, n], toScene, 0.5, {
            group: 'bump',
            name: 'Half-height surface',
            color: 'pos',
            opacity: 0.85,
          }),
          ripples: gridIsosurfaceLayer(
            Array.from(f, (x) => -x),
            [n, n, n],
            toScene,
            0.1,
            { group: 'ringing', name: 'Negative ripples', color: 'neg', opacity: 0.4 },
          ),
          r50: halfHeightRadius(c, encut),
        };
        bumpMemo.set(key, iso);
      }
      const r50 = iso.r50;
      const origin = lattice.reduce((s, a) => s.map((x, k) => x - a[k]! / 2) as Vec3, [0, 0, 0] as Vec3);
      const layers: Layer[] = [
        iso.bump,
        iso.ripples,
        lines(cellEdges(lattice, origin), 'muted', 'cell', { name: 'Primitive cell' }),
        // small on purpose, so the half-height surface around the site stays visible
        atoms([[0, 0, 0]], 0.12, elementTone(element), 'atoms', { name: 'Atom', labels: [element] }),
        labels([{ text: `${element} site`, at: [0, 0, -0.35] }], 'atoms'),
      ];
      return {
        layers,
        describe:
          head +
          ` In real space the plane waves add up, at best, to a bump at the ${element} site whose half-height surface (orange) reaches ` +
          `${fmt(r50, 2)} Angstrom along the shortest cell edge; blue shows the negative ripples. A higher cutoff makes the bump narrower.`,
        lattice,
        ortho: true,
        readouts: [
          { label: 'ENCUT', value: `${fmt(encut, 0)} eV` },
          { label: 'Plane waves', value: String(pw.count) },
          { label: 'k_c', value: `${fmt(gc, 2)} 1/Å` },
          { label: 'Half-height radius', value: `${fmt(r50, 2)} Å` },
        ],
      };
    }
    const all = planeWavesUpTo(c, ENCUT_MAX);
    const inside: Vec3[] = [];
    const insideLab: string[] = [];
    const outside: Vec3[] = [];
    const kc2 = gc * gc * (1 + 1e-12);
    for (let v = 0; v < all.count; v++) {
      const g: Vec3 = [all.vectors[3 * v]!, all.vectors[3 * v + 1]!, all.vectors[3 * v + 2]!];
      const q2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
      if (q2 <= kc2) {
        inside.push(g);
        insideLab.push(
          `G (${all.indices[3 * v]}, ${all.indices[3 * v + 1]}, ${all.indices[3 * v + 2]}), ${fmt(HBAR2_OVER_2M_EV_A2 * q2, 0)} eV`,
        );
      } else outside.push(g);
    }
    const rec = reciprocalLattice(c.lattice).map(v3);
    const bmin = Math.min(...rec.map((b) => norm(b)));
    const layers: Layer[] = [
      atoms(inside, bmin * 0.07, 'accent', 'inside', { name: 'Plane waves in the basis', labels: insideLab }),
      sphereLayer([0, 0, 0], Math.max(gc, 1e-3), {
        group: 'sphere',
        name: 'Cutoff sphere',
        color: 'pos',
        opacity: 0.14,
        segments: 28,
      }),
      sphereLayer([0, 0, 0], Math.max(gc, 1e-3), {
        group: 'sphere',
        color: 'pos',
        wireframe: true,
        opacity: 0.3,
        segments: 14,
      }),
      lines(cellEdges(rec), 'muted', 'cell', { name: 'Reciprocal cell', dashed: true }),
      labels(
        [
          { text: 'G = 0', at: [0, 0, -bmin * 0.25] },
          { text: `k_c = ${fmt(gc, 2)} 1/Å`, at: [0, 0, gc * 1.08 + 0.1] },
        ],
        'labels',
      ),
    ];
    if (p.outside && outside.length)
      layers.push(points(outside, 'muted', bmin * 0.025, 'outside', { name: 'Outside the cutoff' }));
    return {
      layers,
      describe:
        head +
        ` Each ball is one reciprocal lattice vector G inside the sphere, so one coefficient per band and k-point; ` +
        `${p.outside ? `the ${outside.length} small grey dots are the vectors that a ${ENCUT_MAX} eV cutoff would add.` : 'vectors outside the sphere are hidden.'}`,
      lattice,
      ortho: true,
      readouts: [
        { label: 'ENCUT', value: `${fmt(encut, 0)} eV` },
        { label: 'Plane waves', value: String(pw.count) },
        { label: 'k_c', value: `${fmt(gc, 2)} 1/Å` },
        { label: 'Continuum estimate', value: fmt(pw.continuum, 1) },
      ],
    };
  },
};

function det(m: readonly Vec3[]): number {
  const [a, b, c] = m as [Vec3, Vec3, Vec3];
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0])
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Smearing: occupation over energy and sigma.                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export const SMEAR = { eRange: 1, sMin: 0.02, sMax: 0.5, xScale: 4, yScale: 16, zOcc: 3, zDelta: 5 } as const;

/** Width (in units of sigma) between the occupations 0.9 and 0.1 closest to the Fermi level. */
export function occupationWidth(id: SmearingId): number {
  const cross = (level: number, side: -1 | 1): number => {
    // walk away from x = 0 on one side until f crosses the level, then bisect
    let a = 0;
    for (let x = 0.001; x < 8; x += 0.001) {
      const xs = side * x;
      if ((occupation(id, xs) - level) * (occupation(id, side * a) - level) <= 0) {
        let lo = side * a;
        let hi = xs;
        for (let k = 0; k < 60; k++) {
          const mid = 0.5 * (lo + hi);
          if ((occupation(id, mid) - level) * (occupation(id, lo) - level) <= 0) hi = mid;
          else lo = mid;
        }
        return 0.5 * (lo + hi);
      }
      a = x;
    }
    return side * 8;
  };
  return cross(0.1, 1) - cross(0.9, -1);
}

const smearMemo = new Map<string, MeshLayer>();
const smearing: SceneDef = {
  id: 'm05-smearing',
  title: 'Smearing: occupation over energy and width',
  badge: 'computed',
  sources: ['S-015', 'S-016', 'S-019', 'S-049'],
  params: [
    {
      kind: 'select',
      id: 'scheme',
      label: 'Smearing (ISMEAR)',
      physics: true,
      value: 'gaussian',
      options: SMEARINGS.map((s) => ({
        value: s.id,
        label: s.ismear === null ? s.label : `${s.label} (ISMEAR = ${s.ismear})`,
      })),
    },
    {
      kind: 'slider',
      id: 'sigma',
      label: 'SIGMA',
      min: SMEAR.sMin,
      max: SMEAR.sMax,
      step: 0.01,
      value: 0.1,
      unit: 'eV',
      digits: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'quantity',
      label: 'Surface',
      physics: true,
      value: 'occupation',
      options: [
        { value: 'occupation', label: 'Occupation f' },
        { value: 'delta', label: 'Broadened delta (times sigma)' },
      ],
    },
    { kind: 'toggle', id: 'levels', label: 'Levels at this SIGMA', value: true },
  ],
  build(p) {
    const id = (SMEARINGS.find((s) => s.id === p.scheme)?.id ?? 'gaussian') as SmearingId;
    const info = SMEARINGS.find((s) => s.id === id)!;
    const sigma = Number(p.sigma);
    const occ = p.quantity !== 'delta';
    const zs = occ ? SMEAR.zOcc : SMEAR.zDelta;
    const fn = (e: number, s: number) => (occ ? occupation(id, e / s) : delta(id, e / s));
    const X = (e: number) => e * SMEAR.xScale;
    const Y = (s: number) => s * SMEAR.yScale;
    const key = `${id}|${occ}`;
    let surf = smearMemo.get(key);
    if (!surf) {
      const raw = surfaceLayer(fn, [-SMEAR.eRange, SMEAR.eRange], [SMEAR.sMin, SMEAR.sMax], 120, 48, {
        group: 'surface',
        name: occ ? 'Occupation surface' : 'Broadened delta surface',
        zScale: zs,
        opacity: 0.88,
      });
      for (let i = 0; i < raw.positions.length; i += 3) {
        raw.positions[i] = X(raw.positions[i]!);
        raw.positions[i + 1] = Y(raw.positions[i + 1]!);
      }
      raw.range = occ ? [-0.1, 1.1] : [0, 0.6];
      smearMemo.set(key, (surf = raw));
    }
    const slice = Array.from({ length: 201 }, (_, i) => {
      const e = -SMEAR.eRange + (2 * SMEAR.eRange * i) / 200;
      return [X(e), Y(sigma), zs * fn(e, sigma)] as Vec3;
    });
    const layers: Layer[] = [
      surf,
      curve(slice, 'ink', 'slice', { name: 'Slice at this SIGMA', tube: 0.035 }),
      lines(
        [
          [
            [0, 0, 0],
            [0, Y(SMEAR.sMax) + 0.4, 0],
          ],
        ],
        'ink',
        'guides',
        { name: 'Fermi level and f = 1', dashed: true },
      ),
      ...axesLayers(
        [8.8, Y(SMEAR.sMax) + 0.8, zs * (occ ? 1.25 : 0.75)],
        ['energy minus E_F (eV)', 'SIGMA (eV)', occ ? 'occupation f' : 'delta x sigma'],
        [-4, 0, 0],
      ),
      labels(
        [
          { text: '-1 eV', at: [X(-1), -0.5, 0] },
          { text: 'E_F', at: [0, -0.5, 0] },
          { text: '+1 eV', at: [X(1), -0.5, 0] },
          { text: '0.5 eV', at: [X(-1) - 0.6, Y(0.5), 0] },
        ],
        'ticks',
      ),
    ];
    if (occ)
      layers.push(
        lines(
          [
            [
              [X(-1), Y(sigma), zs],
              [X(1), Y(sigma), zs],
            ],
          ],
          'muted',
          'guides',
          { dashed: true },
        ),
      );
    if (p.levels) {
      const es = Array.from({ length: 21 }, (_, i) => -1 + i * 0.1);
      const pos = es.map((e) => [X(e), Y(sigma), zs * fn(e, sigma)] as Vec3);
      layers.push(
        atoms(pos, 0.09, 'accent', 'levels', {
          name: 'Levels',
          labels: es.map(
            (e) => `level at ${fmt(e, 1)} eV, ${occ ? 'f' : 'delta x sigma'} = ${fmt(fn(e, sigma), 3)}`,
          ),
        }),
        lines(
          pos.map((q) => [[q[0], q[1], 0] as Vec3, q]),
          'muted',
          'levels',
        ),
      );
    }
    // numbers at this sigma, from the closed forms
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const f = occupation(id, -8 + (16 * i) / 400);
      lo = Math.min(lo, f);
      hi = Math.max(hi, f);
    }
    const fAbove = occupation(id, 1);
    const width = occupationWidth(id) * sigma;
    const ismear = info.ismear === null ? 'no ISMEAR value claimed' : `ISMEAR = ${info.ismear}`;
    const describe =
      `${info.label} smearing (${ismear}): the surface shows the ${occ ? 'occupation' : 'broadened delta function times sigma'} of a level ` +
      `against its energy from 1 eV below to 1 eV above the Fermi level (across) and SIGMA from ${SMEAR.sMin} to ${SMEAR.sMax} eV (back). ` +
      `At SIGMA = ${fmt(sigma, 2)} eV a level sigma above E_F holds ${fmt(fAbove, 3)} electrons per state, the step from 0.9 to 0.1 is ` +
      `${fmt(width, 3)} eV wide, and the occupation ranges from ${fmt(lo, 3)} to ${fmt(hi, 3)}` +
      (lo < -1e-4 || hi > 1 + 1e-4 ? ', so it leaves 0 to 1, as this scheme does by design.' : '.');
    return {
      layers,
      describe,
      axes: ['energy minus E_F (eV)', 'SIGMA (eV)', occ ? 'occupation' : 'delta x sigma'],
      readouts: [
        { label: 'Scheme', value: info.ismear === null ? info.label : `ISMEAR = ${info.ismear}` },
        { label: 'f at E_F + SIGMA', value: fmt(fAbove, 3) },
        { label: '0.9 to 0.1 width', value: `${fmt(width, 3)} eV` },
        { label: 'Occupation range', value: `${fmt(lo, 3)} to ${fmt(hi, 3)}` },
      ],
    };
  },
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* PAW: radial functions as surfaces of revolution (schematic shapes from paw.ts).                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export const PAW = { rMax: 5, nr: 110, nphi: 64, z: 3 } as const;

/** A surface of revolution z = zScale g(r) over the disk r <= rMax, from angle 0 to `phiMax`. */
export function revolvedLayer(
  g: (r: number) => number,
  phiMax: number,
  o: { group: string; name: string; color: Color; opacity?: number; wireframe?: boolean },
): MeshLayer {
  const { rMax, nr, nphi, z } = PAW;
  const nph = Math.max(4, Math.round((nphi * phiMax) / (2 * Math.PI)));
  const positions: number[] = [];
  const values: number[] = [];
  for (let j = 0; j <= nph; j++) {
    const ph = (phiMax * j) / nph;
    for (let i = 0; i <= nr; i++) {
      // denser near the nucleus, where the all-electron function oscillates
      const t = i / nr;
      const r = rMax * t * t * (1.6 - 0.6 * t);
      const val = g(r);
      positions.push(r * Math.cos(ph), r * Math.sin(ph), z * val);
      values.push(val);
    }
  }
  const indices: number[] = [];
  const w = nr + 1;
  for (let j = 0; j < nph; j++)
    for (let i = 0; i < nr; i++) {
      const a = j * w + i;
      indices.push(a, a + 1, a + w + 1, a, a + w + 1, a + w);
    }
  const layer: MeshLayer = {
    kind: 'mesh',
    group: o.group,
    name: o.name,
    positions,
    indices,
    color: o.color,
  };
  if (o.opacity !== undefined) layer.opacity = o.opacity;
  if (o.wireframe) layer.wireframe = true;
  return layer;
}

const paw: SceneDef = {
  id: 'm05-paw',
  title: 'PAW: all-electron and pseudo functions around an atom',
  badge: 'toy-model',
  banner:
    'Schematic shapes: the smooth function and its oscillating all-electron partner are invented to show the PAW idea, not computed for any real atom.',
  sources: ['S-008', 'S-009'],
  params: [
    {
      kind: 'slider',
      id: 'rc',
      label: 'Augmentation radius r_c',
      min: 0.8,
      max: 2.5,
      step: 0.05,
      value: 1.5,
      unit: 'a0',
      digits: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'show',
      label: 'Functions',
      physics: true,
      value: 'both',
      options: [
        { value: 'both', label: 'All-electron and pseudo' },
        { value: 'all-electron', label: 'All-electron only' },
        { value: 'pseudo', label: 'Pseudo only' },
        { value: 'augmentation', label: 'What the sphere adds back' },
      ],
    },
    { kind: 'toggle', id: 'sphere', label: 'Augmentation sphere', value: true },
    { kind: 'toggle', id: 'cutaway', label: 'Cut away a quarter', value: true },
  ],
  build(p) {
    const rc = Number(p.rc);
    const phiMax = p.cutaway ? 1.5 * Math.PI : 2 * Math.PI;
    const ae = (r: number) => allElectronLike(r, rc);
    const aug = (r: number) => augmentation(r, rc);
    const show = String(p.show);
    const layers: Layer[] = [];
    const prof = (g: (r: number) => number) =>
      Array.from({ length: 241 }, (_, i) => {
        const r = (PAW.rMax * i) / 240;
        return [r, 0, PAW.z * g(r)] as Vec3;
      });
    if (show === 'both' || show === 'all-electron') {
      layers.push(
        revolvedLayer(ae, phiMax, {
          group: 'all-electron',
          name: 'All-electron function',
          color: 'pos',
          opacity: 0.85,
        }),
        curve(prof(ae), 'pos', 'profile', { name: 'Radial profiles', tube: 0.03 }),
      );
    }
    if (show === 'both' || show === 'pseudo') {
      layers.push(
        revolvedLayer(pseudo, phiMax, {
          group: 'pseudo',
          name: 'Pseudo function (wire)',
          color: 'neg',
          opacity: 0.7,
          wireframe: true,
        }),
        curve(prof(pseudo), 'neg', 'profile', { name: 'Radial profiles', tube: 0.03 }),
      );
    }
    if (show === 'augmentation') {
      layers.push(
        revolvedLayer(aug, phiMax, {
          group: 'augmentation',
          name: 'All-electron minus pseudo',
          color: 'accent',
          opacity: 0.85,
        }),
        curve(prof(aug), 'accent', 'profile', { name: 'Radial profiles', tube: 0.03 }),
      );
    }
    if (p.sphere) {
      const ring: [Vec3, Vec3][] = [];
      for (let k = 0; k < 72; k++) {
        const a = (2 * Math.PI * k) / 72;
        const b = (2 * Math.PI * (k + 1)) / 72;
        ring.push([
          [rc * Math.cos(a), rc * Math.sin(a), 0],
          [rc * Math.cos(b), rc * Math.sin(b), 0],
        ]);
      }
      layers.push(
        sphereLayer([0, 0, 0], rc, {
          group: 'sphere',
          name: 'Augmentation sphere',
          color: 'muted',
          wireframe: true,
          opacity: 0.35,
          segments: 18,
        }),
        lines(ring, 'ink', 'sphere', { dashed: true }),
        labels([{ text: `r_c = ${fmt(rc, 2)} a0`, at: [rc * 0.72, -rc * 0.72, -0.25] }], 'sphere'),
      );
    }
    layers.push(
      atoms([[0, 0, 0]], 0.08, 'ink', 'nucleus', { name: 'Nucleus', labels: ['nucleus'] }),
      ...axesLayers([PAW.rMax + 0.5, PAW.rMax + 0.5, 4.2], ['x (a0)', 'y (a0)', 'radial function']),
    );
    const nodesAE = nodeCount(ae, rc);
    let maxOut = 0;
    for (let i = 0; i <= 400; i++) {
      const r = rc + ((PAW.rMax - rc) * i) / 400;
      maxOut = Math.max(maxOut, Math.abs(ae(r) - pseudo(r)));
    }
    const shown =
      show === 'both'
        ? 'the all-electron function (orange, solid) and the smooth pseudo function (blue, wire)'
        : show === 'all-electron'
          ? 'the all-electron function (orange, solid)'
          : show === 'pseudo'
            ? 'the smooth pseudo function (blue, wire)'
            : 'the difference that the augmentation sphere adds back (all-electron minus pseudo)';
    const describe =
      `A schematic radial function around one atom, turned into a surface of revolution: height is the function value, the floor is a plane through the nucleus. ` +
      `Shown: ${shown}. Inside the augmentation sphere of radius r_c = ${fmt(rc, 2)} a0 the all-electron function has ${nodesAE} nodes ` +
      `and the pseudo function none; outside it the two agree exactly (largest difference ${fmt(maxOut, 6)}).`;
    return {
      layers,
      describe,
      axes: ['x (a0)', 'y (a0)', 'radial function (schematic)'],
      readouts: [
        { label: 'r_c', value: `${fmt(rc, 2)} a0` },
        { label: 'Nodes inside r_c (all-electron)', value: String(nodesAE) },
        { label: 'Nodes (pseudo)', value: String(nodeCount(pseudo, PAW.rMax)) },
        { label: 'Difference outside r_c', value: fmt(maxOut, 6) },
      ],
    };
  },
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* DFT+U: the Dudarev penalty over occupation and U_eff.                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export const DFTU = { uMax: 8, xScale: 8, zEnergy: 4, zPotential: 1 } as const;
const dftuMemo = new Map<string, MeshLayer>();

const dftu: SceneDef = {
  id: 'm05-dftu',
  title: 'DFT+U penalty over occupation and U',
  badge: 'toy-model',
  banner:
    'One orbital and one spin: real DFT+U sums this Dudarev penalty over the whole occupation matrix of the d or f shell.',
  sources: ['S-014', 'S-019'],
  params: [
    {
      kind: 'slider',
      id: 'u',
      label: 'U',
      min: 0,
      max: DFTU.uMax,
      step: 0.1,
      value: 4,
      unit: 'eV',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'j',
      label: 'J',
      min: 0,
      max: 1,
      step: 0.1,
      value: 0,
      unit: 'eV',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'n',
      label: 'Occupation n',
      min: 0,
      max: 1,
      step: 0.01,
      value: 0.3,
      digits: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'quantity',
      label: 'Surface',
      physics: true,
      value: 'energy',
      options: [
        { value: 'energy', label: 'Energy penalty E_U' },
        { value: 'potential', label: 'Potential shift V' },
      ],
    },
  ],
  build(p) {
    const ueff = Math.max(0, Number(p.u) - Number(p.j));
    const n = Number(p.n);
    const energy = p.quantity !== 'potential';
    const zs = energy ? DFTU.zEnergy : DFTU.zPotential;
    const fn = (x: number, u: number) => (energy ? dudarevEnergy(u, x) : dudarevPotential(u, x));
    const X = (x: number) => x * DFTU.xScale;
    let surf = dftuMemo.get(String(energy));
    if (!surf) {
      const raw = surfaceLayer(fn, [0, 1], [0, DFTU.uMax], 50, 40, {
        group: 'surface',
        name: energy ? 'Penalty surface' : 'Potential surface',
        zScale: zs,
        colormap: energy ? 'sequential' : 'diverging',
        opacity: 0.85,
      });
      for (let i = 0; i < raw.positions.length; i += 3) raw.positions[i] = X(raw.positions[i]!);
      dftuMemo.set(String(energy), (surf = raw));
    }
    const slice = Array.from({ length: 121 }, (_, i) => {
      const x = i / 120;
      return [X(x), ueff, zs * fn(x, ueff)] as Vec3;
    });
    const eU = dudarevEnergy(ueff, n);
    const vU = dudarevPotential(ueff, n);
    const here: Vec3 = [X(n), ueff, zs * fn(n, ueff)];
    const layers: Layer[] = [
      surf,
      curve(slice, 'ink', 'slice', { name: `Slice at U_eff`, tube: 0.04 }),
      atoms([here], 0.16, 'accent', 'marker', {
        name: 'This occupation',
        labels: [`n = ${fmt(n, 2)}, E_U = ${fmt(eU, 3)} eV, V = ${fmt(vU, 3)} eV`],
      }),
      ...axesLayers(
        [X(1) + 0.8, DFTU.uMax + 0.8, energy ? 4.8 : 4.6],
        ['occupation n', 'U_eff = U - J (eV)', energy ? 'E_U (eV, x4)' : 'V (eV)'],
      ),
      labels(
        [
          { text: 'n = 0', at: [0, -0.5, 0] },
          { text: 'n = 1', at: [X(1), -0.5, 0] },
          { text: energy ? '1 eV' : '+4 eV', at: [-0.6, 0, 4] },
        ],
        'ticks',
      ),
    ];
    if (energy) {
      const dir = n < 0.5 ? -1 : n > 0.5 ? 1 : 0;
      if (dir && ueff > 0)
        layers.push(
          arrows([here], [[dir * 1.2, 0, 0]], 'neg', 'push', { name: 'Push toward an integer' }),
          labels(
            [
              {
                text: dir < 0 ? 'pushed toward n = 0' : 'pushed toward n = 1',
                at: [X(n) + dir * 1.6, ueff, here[2] + 0.4],
              },
            ],
            'push',
          ),
        );
    } else if (ueff > 0) {
      layers.push(
        arrows(
          [
            [X(0), ueff, 0],
            [X(1), ueff, 0],
          ],
          [
            [0, 0, (zs * ueff) / 2],
            [0, 0, (-zs * ueff) / 2],
          ],
          ['pos', 'neg'],
          'push',
          { name: 'Level shifts', head: ['solid', 'open'] },
        ),
        labels(
          [
            { text: `empty level up ${fmt(ueff / 2, 2)} eV`, at: [X(0) - 0.4, ueff, (zs * ueff) / 2 + 0.4] },
            {
              text: `filled level down ${fmt(ueff / 2, 2)} eV`,
              at: [X(1) + 0.4, ueff, (-zs * ueff) / 2 - 0.4],
            },
          ],
          'push',
        ),
      );
    }
    const describe =
      `The Dudarev DFT+U ${energy ? 'energy penalty E_U = (U_eff / 2) n (1 - n)' : 'potential V = U_eff (1/2 - n)'} for one orbital, as a surface over ` +
      `its occupation n (across, 0 to 1) and U_eff = U - J (back, 0 to ${DFTU.uMax} eV). At U = ${fmt(Number(p.u), 1)} eV and J = ${fmt(Number(p.j), 1)} eV, ` +
      `U_eff = ${fmt(ueff, 1)} eV; at n = ${fmt(n, 2)} the penalty is ${fmt(eU, 3)} eV and the potential shift ${fmt(vU, 3)} eV. ` +
      (energy
        ? 'The penalty vanishes for an empty or full orbital and is largest at n = 1/2, so it favours integer occupations.'
        : `A filled level moves down and an empty one up by U_eff / 2, so a gap of ${fmt(ueff, 2)} eV opens between them.`);
    return {
      layers,
      describe,
      axes: ['occupation n', 'U_eff (eV)', energy ? 'E_U (eV)' : 'V (eV)'],
      readouts: [
        { label: 'U_eff', value: `${fmt(ueff, 1)} eV` },
        { label: 'n', value: fmt(n, 2) },
        { label: 'E_U', value: `${fmt(eU, 3)} eV` },
        { label: 'V', value: `${fmt(vU, 3)} eV` },
      ],
    };
  },
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Functionals: the enhancement factor F_xc over density (r_s) and reduced gradient (s).                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export const XC = { sMax: 3, rsMin: 0.25, rsMax: 10, xScale: 3, zScale: 8 } as const;
const xcMemo = new Map<string, MeshLayer>();
const xcSurface = (form: XcForm, o: { wire?: boolean } = {}): MeshLayer => {
  const key = `${form}|${o.wire ? 1 : 0}`;
  let m = xcMemo.get(key);
  if (!m) {
    m = surfaceLayer((s, rs) => enhancement(form, rs, s) - 1, [0, XC.sMax], [XC.rsMin, XC.rsMax], 60, 39, {
      group: o.wire ? 'lda' : 'surface',
      name: o.wire ? 'LDA for comparison' : 'Enhancement factor',
      zScale: XC.zScale,
      colormap: o.wire ? false : 'sequential',
      color: o.wire ? 'muted' : 'accent',
      opacity: o.wire ? 0.5 : 0.88,
    });
    for (let i = 0; i < m.positions.length; i += 3) m.positions[i] = m.positions[i]! * XC.xScale;
    if (o.wire) m.wireframe = true;
    else m.range = [0, 0.9];
    xcMemo.set(key, m);
  }
  return m;
};

const functional: SceneDef = {
  id: 'm05-functional',
  title: 'Exchange-correlation enhancement factor',
  badge: 'computed',
  sources: ['S-013', 'S-146', 'S-147', 'S-046'],
  params: [
    {
      kind: 'select',
      id: 'form',
      label: 'Functional',
      physics: true,
      value: 'pbe',
      options: XC_FORMS.map((f) => ({ value: f.id, label: f.label })),
    },
    {
      kind: 'slider',
      id: 'rs',
      label: 'Density as r_s',
      min: 0.5,
      max: XC.rsMax,
      step: 0.5,
      value: 2,
      unit: 'bohr',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 's',
      label: 'Reduced gradient s',
      min: 0,
      max: XC.sMax,
      step: 0.1,
      value: 1,
      digits: 1,
      physics: true,
    },
    { kind: 'toggle', id: 'lda', label: 'LDA for comparison', value: false },
    { kind: 'toggle', id: 'cap', label: 'Exchange cap 1 + kappa', value: false },
  ],
  build(p) {
    const form = (XC_FORMS.find((f) => f.id === p.form)?.id ?? 'pbe') as XcForm;
    const rs = Number(p.rs);
    const s = Number(p.s);
    const Z = (F: number) => (F - 1) * XC.zScale;
    const F = enhancement(form, rs, s);
    const fx = form === 'lda' ? 1 : exchangeEnhancement(s, form === 'pbesol' ? MU_PBESOL : MU_PBE);
    const label = XC_FORMS.find((f) => f.id === form)!.label;
    const layers: Layer[] = [
      xcSurface(form),
      curve(
        Array.from({ length: 121 }, (_, i) => {
          const x = (XC.sMax * i) / 120;
          return [x * XC.xScale, rs, Z(enhancement(form, rs, x))] as Vec3;
        }),
        'ink',
        'slice',
        { name: 'Slices through this point', tube: 0.04 },
      ),
      curve(
        Array.from({ length: 121 }, (_, i) => {
          const r = XC.rsMin + ((XC.rsMax - XC.rsMin) * i) / 120;
          return [s * XC.xScale, r, Z(enhancement(form, r, s))] as Vec3;
        }),
        'pos',
        'slice',
        { tube: 0.04 },
      ),
      atoms([[s * XC.xScale, rs, Z(F)]], 0.16, 'accent', 'marker', {
        name: 'This density and gradient',
        labels: [`r_s = ${fmt(rs, 1)}, s = ${fmt(s, 1)}: F_xc = ${fmt(F, 3)}`],
      }),
      ...axesLayers(
        [XC.sMax * XC.xScale + 0.8, XC.rsMax + 0.8, Z(1.85)],
        ['s (reduced gradient)', 'r_s (bohr, lower density back)', 'F_xc'],
      ),
      labels(
        [
          { text: 'F = 1.0', at: [-0.9, 0, 0] },
          { text: 'F = 1.5', at: [-0.9, 0, Z(1.5)] },
        ],
        'ticks',
      ),
    ];
    if (p.lda && form !== 'lda') layers.push(xcSurface('lda', { wire: true }));
    if (p.cap) {
      const zc = Z(1.804);
      layers.push(
        quadLayer([0, XC.rsMin, zc], [XC.sMax * XC.xScale, 0, 0], [0, XC.rsMax - XC.rsMin, 0], {
          group: 'cap',
          name: 'Exchange cap',
          color: 'muted',
          opacity: 0.18,
        }),
        labels([{ text: 'cap 1 + kappa = 1.804', at: [XC.sMax * XC.xScale + 0.4, XC.rsMax, zc] }], 'cap'),
      );
    }
    const nA3 = densityFromRs(rs) / BOHR_RADIUS_ANGSTROM ** 3;
    const describe =
      `${label}: the enhancement factor F_xc, exchange-correlation energy per electron divided by the exchange of the uniform gas, ` +
      `as a surface over the reduced density gradient s (across, 0 to ${XC.sMax}) and the density written as r_s (back, ${XC.rsMin} to ${XC.rsMax} bohr). ` +
      `At r_s = ${fmt(rs, 1)} bohr (${fmt(nA3, 3)} electrons per cubic Angstrom) and s = ${fmt(s, 1)}, F_xc = ${fmt(F, 3)} and the exchange part F_x = ${fmt(fx, 3)}. ` +
      (form === 'lda'
        ? 'LDA ignores the gradient, so the surface does not change across.'
        : 'Meta-GGAs and hybrids also use the kinetic-energy density or exact exchange, which this surface over n and its gradient cannot show.');
    return {
      layers,
      describe,
      axes: ['s', 'r_s (bohr)', 'F_xc'],
      readouts: [
        { label: 'F_xc', value: fmt(F, 3) },
        { label: 'F_x (exchange)', value: fmt(fx, 3) },
        { label: 'Correlation part', value: fmt(F - fx, 3) },
        { label: 'Density', value: `${fmt(nA3, 3)} e/Å³` },
      ],
    };
  },
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* van der Waals: the D2 correction between two graphene layers over spacing and sliding.                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export const VDW = {
  dMin: 2.8,
  dMax: 5,
  /** Landscape placement: beside the bilayer, sliding across and spacing back, energy up. */
  x0: 8,
  y0: -4.5,
  xLen: 8,
  yLen: 9,
  /** meV per scene unit and the height of E = 0. */
  meVPerUnit: 8,
  zTop: 7.5,
  patch: 5.2,
} as const;

const vdwMemo = new Map<string, MeshLayer>();
const LX = (slideBonds: number) => VDW.x0 + (slideBonds / 3) * VDW.xLen;
const LY = (d: number) => VDW.y0 + ((d - VDW.dMin) / (VDW.dMax - VDW.dMin)) * VDW.yLen;
const LZ = (eV: number) => VDW.zTop + (1000 * eV) / VDW.meVPerUnit;

const vdw: SceneDef = {
  id: 'm05-vdw',
  title: 'Dispersion correction between two graphene layers',
  badge: 'computed',
  sources: ['S-148', 'S-019', 'S-031'],
  params: [
    {
      kind: 'slider',
      id: 'spacing',
      label: 'Layer spacing',
      min: VDW.dMin,
      max: VDW.dMax,
      step: 0.05,
      value: 3.35,
      unit: 'Å',
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'slide',
      label: 'Sliding along the bond',
      min: 0,
      max: 3,
      step: 0.05,
      value: 1,
      unit: 'bond lengths',
      digits: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'correction',
      label: 'Correction',
      physics: true,
      value: 'd2',
      options: [
        { value: 'd2', label: 'DFT-D2 pair sum' },
        { value: 'none', label: 'No correction' },
      ],
    },
    { kind: 'toggle', id: 'damping', label: 'Short-range damping', value: true, physics: true },
  ],
  build(p) {
    const d = Number(p.spacing);
    const sb = Number(p.slide);
    const slide = sb * BOND;
    const on = p.correction !== 'none';
    const damped = p.damping !== false;
    const E = (dd: number, sl: number) => (on ? bilayerEnergy(dd, sl, damped) : 0);
    const key = `${on}|${damped}`;
    let surf = vdwMemo.get(key);
    if (!surf) {
      const raw = surfaceLayer((xb, dd) => E(dd, xb * BOND), [0, 3], [VDW.dMin, VDW.dMax], 24, 24, {
        group: 'landscape',
        name: 'Energy landscape',
        colormap: 'sequential',
        opacity: 0.88,
      });
      const vals = raw.values!;
      for (let i = 0, k = 0; i < raw.positions.length; i += 3, k++) {
        raw.positions[i] = LX(raw.positions[i]!);
        raw.positions[i + 1] = LY(raw.positions[i + 1]!);
        raw.positions[i + 2] = LZ(vals[k]!);
      }
      raw.range = [-0.06, 0];
      vdwMemo.set(key, (surf = raw));
    }
    // the bilayer itself: bottom layer at z = 0, top layer at z = d slid along y (the bond)
    const sites = layerSites(VDW.patch + 3);
    const inPatch = (x: number, y: number) => Math.abs(x) <= VDW.patch && Math.abs(y) <= VDW.patch;
    const bottom: Vec3[] = sites.filter(([x, y]) => inPatch(x, y)).map(([x, y]) => [x, y, 0]);
    const top: Vec3[] = sites
      .map(([x, y]) => [x, y + slide] as [number, number])
      .filter(([x, y]) => inPatch(x, y))
      .map(([x, y]) => [x, y, d]);
    const bonds = (layer: Vec3[]): [Vec3, Vec3][] => {
      const out: [Vec3, Vec3][] = [];
      for (let i = 0; i < layer.length; i++)
        for (let j = i + 1; j < layer.length; j++)
          if (Math.abs(norm(sub(layer[i]!, layer[j]!)) - BOND) < 0.05) out.push([layer[i]!, layer[j]!]);
      return out;
    };
    const eHere = E(d, slide);
    const eAA = E(d, 0);
    const eAB = E(d, BOND);
    const binding = Array.from({ length: 45 }, (_, i) => {
      const dd = VDW.dMin + ((VDW.dMax - VDW.dMin) * i) / 44;
      return [LX(sb), LY(dd), LZ(E(dd, slide))] as Vec3;
    });
    const here: Vec3 = [LX(sb), LY(d), LZ(eHere)];
    const stack = stackingName(slide) ?? `slid ${fmt(sb, 2)} bond lengths`;
    const layers: Layer[] = [
      // both layers are carbon, in the carbon colour (D-122); the top layer is told apart by its outline and labels
      atoms(bottom, elementRadius('C'), elementTone('C'), 'bottom', {
        name: 'Bottom layer',
        labels: bottom.map((_, i) => `C bottom ${i + 1}`),
      }),
      atoms(top, elementRadius('C'), elementTone('C'), 'top', {
        name: 'Top layer (outlined)',
        labels: top.map((_, i) => `C top ${i + 1}`),
        highlight: top.map((_, i) => i),
      }),
      ...twoToneBonds([...bonds(bottom), ...bonds(top)].map(([a, b]) => ({ a, b, ea: 'C', eb: 'C' }))),
      arrows([[VDW.patch + 0.8, 0, 0]], [[0, 0, d]], 'ink', 'gap', { name: 'Spacing', thickness: 0.02 }),
      labels([{ text: `d = ${fmt(d, 2)} Å`, at: [VDW.patch + 1.2, 0, d / 2] }], 'gap'),
      surf,
      curve(binding, 'ink', 'curve', { name: 'Energy against spacing here', tube: 0.05 }),
      atoms([here], 0.18, 'accent', 'marker', {
        name: 'This geometry',
        labels: [`d = ${fmt(d, 2)} Å, ${stack}: ${fmt(1000 * eHere, 1)} meV per atom`],
      }),
      ...axesLayers(
        [VDW.xLen + 0.6, VDW.yLen + 0.6, VDW.zTop + 0.6],
        ['sliding (AA, AB, BA, AA)', 'spacing (Å)', 'E (meV per atom)'],
        [VDW.x0, VDW.y0, 0],
      ),
      labels(
        [
          { text: '0 meV', at: [VDW.x0 - 0.7, VDW.y0, VDW.zTop] },
          { text: `-${fmt(VDW.zTop * VDW.meVPerUnit, 0)} meV`, at: [VDW.x0 - 0.9, VDW.y0, 0] },
          { text: `${VDW.dMin} Å`, at: [VDW.x0 - 0.7, LY(VDW.dMin), -0.4] },
          { text: `${VDW.dMax} Å`, at: [VDW.x0 - 0.7, LY(VDW.dMax), -0.4] },
        ],
        'ticks',
      ),
    ];
    const describe = on
      ? `Two graphene layers (a = ${GRAPHENE_A} Angstrom), the top one ${fmt(d, 2)} Angstrom above the bottom and ${stack === 'AA' || stack === 'AB' || stack === 'BA' ? `in ${stack} stacking` : stack}. ` +
        `Beside them, the DFT-D2 correction energy between the layers${damped ? '' : ' without its damping function'} as a surface over sliding (across) and spacing (back): ` +
        `here it adds ${fmt(1000 * eHere, 1)} meV per atom, and AB minus AA at this spacing is ${fmt(1000 * (eAB - eAA), 2)} meV per atom. ` +
        'It is only the attractive correction; the repulsion that keeps the layers apart, and most of the preference for one stacking, come from the functional itself.'
      : `Two graphene layers ${fmt(d, 2)} Angstrom apart, ${stack}. With no correction the semilocal functional adds no dispersion attraction, so the landscape is flat at zero: ` +
        'plain PBE leaves graphite layers almost unbound.';
    return {
      layers,
      describe,
      axes: ['sliding (bond lengths)', 'spacing (Å)', 'E (meV per atom)'],
      readouts: [
        { label: 'Spacing', value: `${fmt(d, 2)} Å` },
        { label: 'Stacking', value: stack },
        { label: 'E_disp', value: `${fmt(1000 * eHere, 1)} meV/atom` },
        { label: 'AB minus AA', value: `${fmt(1000 * (eAB - eAA), 2)} meV/atom` },
      ],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [kmesh.id]: kmesh,
  [encutScene.id]: encutScene,
  [smearing.id]: smearing,
  [paw.id]: paw,
  [dftu.id]: dftu,
  [functional.id]: functional,
  [vdw.id]: vdw,
};
