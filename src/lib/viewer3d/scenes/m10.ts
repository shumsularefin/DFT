// Module 10 (the worked example on LaCuO3) scenes. D-101: the author's results do not exist yet, so no scene shows a
// computed result for RCuO3 (no relaxed lattice parameter, energy, moment, gap, bands or DOS). Every number on these
// stages is an input of the example (the POSCAR, MAGMOM, KPOINTS and INCAR lines of the topic pages) or comes from a
// tested library applied to those inputs (Shannon radii and tolerance factors, plane-wave and k-point counts, the
// Brillouin zone and its path). Where a topic needs results, the state is an "awaiting results" picture.
// @source S-001 (Shannon radii), S-002 (Goldschmidt t), S-022 (octahedral radius-ratio limits), S-101 (Glazer tilts)
// @source S-049, S-031, S-040 (plane-wave cutoff sphere), S-019 (VASP wiki: POSCAR, MAGMOM, KSPACING, ISIF, LDAU)
// @source S-007, S-032 (k-meshes and their irreducible points), S-005 (cubic band path), S-042 (author's protocol)
// @source S-047 (real spherical harmonics), S-170 (Unsold: the full d shell is spherical), S-058 (G-type order)
import { brillouinZone } from '../../crystal/brillouin';
import { meshPoints, qToCartesian } from '../../crystal/kmesh';
import { reciprocalLattice } from '../../crystal/lattice';
import type { IntMat3 } from '../../crystal/pointgroup';
import { parsePoscar } from '../../crystal/poscar';
import { buildSupercell, determinant } from '../../crystal/supercell';
import type { Mat3, Structure } from '../../crystal/types';
import { realYlm } from '../../physics/hydrogen';
import { cutoffRadius, gVectorsWithin } from '../../physics/planewaves';
import { MU_MIN } from '../../perovskite/checks';
import { familySweep, FAMILY_ELEMENTS, type FamilySweepRow } from '../../perovskite/maps';
import { getRadius } from '../../perovskite/shannon';
import type { Occupant } from '../../perovskite/sites';
import type { LnCnPolicy } from '../../perovskite/urlState';
import { expandRepeats } from '../../vasp/incar';
import { meshFromKspacing } from '../../vasp/kpoints';
import {
  arrows,
  atoms,
  axesLayers,
  brillouinLayers,
  cellEdges,
  crystalLayers,
  curve,
  fmt,
  hullLayer,
  labels,
  lines,
  points,
  quadLayer,
  sphereLayer,
} from '../kit';
import { add, cross, dot, norm, normalize, scale, sub } from '../math';
import type { Color, Layer, MeshLayer, SceneDef, SceneFrame, Vec3 } from '../types';

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const rowsOf = (m: Mat3): [Vec3, Vec3, Vec3] => [v3(m[0]), v3(m[1]), v3(m[2])];
const DEG = Math.PI / 180;
const E: [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const DIAG: Vec3 = normalize([1, 1, 1]);
const TONE = { La: 'c0', Cu: 'c1', O: 'c2' } as const satisfies Record<string, Color>;

function memo<T>(m: Map<string, T>, key: string, make: () => T): T {
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const v = make();
  if (m.size > 64) m.clear();
  m.set(key, v);
  return v;
}

/** Rotation of v by `ang` (radians) about the unit axis n (Rodrigues). */
export function rotateAbout(n: Vec3, ang: number, v: Vec3): Vec3 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return add(add(scale(v, c), scale(cross(n, v), s)), scale(n, dot(n, v) * (1 - c)));
}

/** Move every layer by t (stations of the pipeline). */
function shifted(layers: Layer[], t: Vec3): Layer[] {
  const mv = (p: Vec3): Vec3 => add(p, t);
  return layers.map((l): Layer => {
    switch (l.kind) {
      case 'atoms':
      case 'points':
        return { ...l, positions: l.positions.map(mv) };
      case 'lines':
        return { ...l, segments: l.segments.map(([a, b]) => [mv(a), mv(b)] as [Vec3, Vec3]) };
      case 'curve':
        return { ...l, points: l.points.map(mv) };
      case 'arrows':
        return { ...l, from: l.from.map(mv) };
      case 'labels':
        return { ...l, items: l.items.map((it) => ({ ...it, at: mv(it.at) })) };
      case 'mesh':
        return { ...l, positions: l.positions.map((x, i) => x + t[i % 3]!) };
    }
  });
}

/** Several meshes of one colour as one layer (one draw call). */
function mergeMeshes(parts: MeshLayer[], o: { group: string; name: string; color: Color; opacity: number }) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const m of parts) {
    const base = positions.length / 3;
    positions.push(...m.positions);
    for (const i of m.indices ?? []) indices.push(base + i);
  }
  const out: MeshLayer = { kind: 'mesh', positions, indices, edges: true, ...o };
  return out;
}

/**
 * The angular shape of a real orbital Y_lm as a polar surface r = size Y^2 / max Y^2 around `center`, each vertex
 * coloured by the sign of Y (orange positive, blue negative). A drawing of the shape, not a computed orbital.
 */
export function lobeMesh(
  l: number,
  m: number,
  center: Vec3,
  size: number,
  o: { group: string; name?: string; opacity?: number },
): MeshLayer {
  const seg = 20;
  const dirs: Vec3[] = [];
  for (let j = 0; j <= seg; j++) {
    const th = (Math.PI * j) / seg;
    for (let i = 0; i <= 2 * seg; i++) {
      const ph = (Math.PI * i) / seg;
      dirs.push([Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]);
    }
  }
  const y = dirs.map((d) => realYlm(l, m, d[0], d[1], d[2]));
  const peak = Math.max(...y.map((x) => x * x)) || 1;
  const positions: number[] = [];
  const values: number[] = [];
  dirs.forEach((d, i) => {
    const r = (size * y[i]! * y[i]!) / peak;
    positions.push(center[0] + r * d[0], center[1] + r * d[1], center[2] + r * d[2]);
    values.push(y[i]! >= 0 ? 1 : -1);
  });
  const w = 2 * seg + 1;
  const indices: number[] = [];
  for (let j = 0; j < seg; j++)
    for (let i = 0; i < 2 * seg; i++) {
      const a = j * w + i;
      indices.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  const layer: MeshLayer = {
    kind: 'mesh',
    group: o.group,
    positions,
    indices,
    color: 'pos',
    values,
    colormap: 'diverging',
    range: [-1, 1],
    opacity: o.opacity ?? 0.85,
  };
  if (o.name) layer.name = o.name;
  return layer;
}

// ---------------------------------------------------------------------------------------------------------------------
// The example's inputs, exactly as the structure-and-inputs and relaxation pages write them (m10.test.ts checks).

export const POSCAR_TEXT = `LaCuO3 ideal cubic; a is a starting guess, 2(r_Cu + r_O) from Shannon radii
3.88
1.0 0.0 0.0
0.0 1.0 0.0
0.0 0.0 1.0
La Cu O
1 1 3
Direct
0.0 0.0 0.0
0.5 0.5 0.5
0.5 0.5 0.0
0.5 0.0 0.5
0.0 0.5 0.5`;

/** The spin starts of the structure page (5-atom cell) and of the relaxation page (10-atom cell). */
export const STARTS = {
  'fm-high': { magmom: '0 3 3*0', text: 'ferromagnetic, high-moment start' },
  'fm-low': { magmom: '0 1 3*0', text: 'ferromagnetic, low-moment start' },
  nm: { magmom: '', text: 'non-magnetic (ISPIN = 1)' },
} as const;
export const DOUBLED_STARTS = {
  fm: { magmom: '2*0 2*3 6*0', text: 'ferromagnetic start' },
  g: { magmom: '2*0 3 -3 6*0', text: 'G-type antiferromagnetic start' },
  nm: { magmom: '', text: 'non-magnetic (ISPIN = 1)' },
} as const;
/** KPOINTS of the structure page: Gamma-centred 8 x 8 x 8. LDAU block: one entry per species (La, Cu, O). */
export const KPOINTS_MESH: [number, number, number] = [8, 8, 8];
export const LDAU = { LDAUL: '-1 2 -1', LDAUU: '0 4 0', LDAUTYPE: 2 };
/** The supercell matrix of the relaxation page (a-a-a- tilts and G-type order), det = 2. */
export const DOUBLING: IntMat3 = [
  [0, 1, 1],
  [1, 0, 1],
  [1, 1, 0],
];

export const CUBIC: Structure = parsePoscar(POSCAR_TEXT).structure;
export const A_CUBIC = CUBIC.lattice[0][0];
const CUBIC_ROWS = rowsOf(CUBIC.lattice);

/** Cu3+ (CN 6, LS) and O2- (CN 6), the radii of the tolerance factor and of the starting edge 2(rB + rX). */
const radius = (el: string, ox: number, cn: number, spin?: 'LS') => {
  const r = getRadius({ el, ox, cn, kind: 'ionic', ...(spin ? { spin } : {}) });
  if (!r.ok) throw new Error(r.message);
  return r.value;
};
export const R_CU = radius('Cu', 3, 6, 'LS');
export const R_O = radius('O', -2, 6);
const B_SITE: Occupant[] = [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS', fraction: 1 }];
const X_SITE: Occupant[] = [{ el: 'O', ox: -2, cn: 6, fraction: 1 }];

/** The atoms of the cubic POSCAR (with boundary copies) and the CuO6 octahedron around the Cu at the body centre. */
function cubicCell(o: { highlightFile?: boolean } = {}) {
  const c = crystalLayers(CUBIC, { boundary: true, radiusScale: 0.4 });
  const cu = v3(scale([1, 1, 1], A_CUBIC / 2));
  const ox = c.positions.filter(
    (p, i) => c.species[i] === 'O' && Math.abs(norm(sub(p, cu)) - A_CUBIC / 2) < 1e-6,
  );
  const oct = hullLayer(ox, { group: 'octahedra', name: 'CuO6 octahedron', color: 'c1', opacity: 0.3 });
  // the five atoms written in the file, as opposed to the copies drawn on the far faces and corners
  const file = CUBIC.frac.map((f) => v3(scale(v3(f), A_CUBIC)));
  const inFile = c.positions
    .map((p, i) => (file.some((q) => norm(sub(p, q)) < 1e-6) ? i : -1))
    .filter((i) => i >= 0);
  if (o.highlightFile) {
    const a = c.layers[0];
    if (a?.kind === 'atoms') a.highlight = inFile;
  }
  return { layers: [...c.layers, oct], positions: c.positions, species: c.species, cu, inFile };
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Choosing the system: the R site in the cavity of eight CuO6 octahedra, t from the tested library across La..Lu,
//    and a separate tilt slider that draws the a-a-a- pattern (rigid octahedra rotated about the body diagonal).

export const LANTHANIDES = FAMILY_ELEMENTS.filter((e) => e !== 'Y');
const POLICIES: { value: LnCnPolicy; label: string; short: string; say: string }[] = [
  { value: 'cn12', label: 'Strict CN 12', short: 'CN 12', say: 'strict CN 12' },
  { value: 'cn9', label: 'CN 9 for all', short: 'CN 9', say: 'uniform CN 9' },
  { value: 'cn8', label: 'CN 8 for all', short: 'CN 8', say: 'uniform CN 8' },
];
const sweepMemo = new Map<string, FamilySweepRow[]>();
export const sweepRow = (el: string, policy: LnCnPolicy): FamilySweepRow =>
  memo(sweepMemo, policy, () => familySweep(B_SITE, X_SITE, policy, 'ionic')).find((r) => r.el === el)!;

/**
 * Corner-sharing rigid octahedra (Cu-O = d) on a 2 x 2 x 2 block, each rotated by +phi or -phi about [111] in the
 * rock-salt (G) pattern of the Glazer a-a-a- system (S-101). Rigid rotation forces the Cu framework onto the lattice
 * a_i = 2d [cos(phi) e_i + (1 - cos(phi)) (n . e_i) n], n = [111]/sqrt(3), so every shared oxygen is exactly shared.
 */
export function tiltedBlock(d: number, phiDeg: number) {
  const phi = phiDeg * DEG;
  const c = Math.cos(phi);
  const lattice = E.map((e) => scale(add(scale(e, c), scale(DIAG, (1 - c) * dot(DIAG, e))), 2 * d)) as [
    Vec3,
    Vec3,
    Vec3,
  ];
  const cu: Vec3[] = [];
  const signs: number[] = [];
  const octahedra: Vec3[][] = [];
  const oxygen = new Map<string, Vec3>();
  for (const n1 of [0, 1])
    for (const n2 of [0, 1])
      for (const n3 of [0, 1]) {
        const p = add(add(scale(lattice[0], n1), scale(lattice[1], n2)), scale(lattice[2], n3));
        const s = (n1 + n2 + n3) % 2 === 0 ? 1 : -1;
        cu.push(p);
        signs.push(s);
        const six: Vec3[] = [];
        for (const e of E)
          for (const sg of [1, -1]) {
            const o = add(p, scale(rotateAbout(DIAG, s * phi, e), sg * d));
            six.push(o);
            oxygen.set(o.map((x) => x.toFixed(4)).join(','), o);
          }
        octahedra.push(six);
      }
  const rSite = scale(add(add(lattice[0], lattice[1]), lattice[2]), 0.5);
  return { lattice, cu, signs, octahedra, oxygen: [...oxygen.values()], rSite };
}

/** Cu-O-Cu angle (degrees) of two rigid octahedra rotated by +phi and -phi about [111]: cos = -(cos 2phi + (1 - cos 2phi)/3). */
export const cuOCuAngle = (phiDeg: number): number => {
  const c2 = Math.cos(2 * phiDeg * DEG);
  return Math.acos(-(c2 + (1 - c2) / 3)) / DEG;
};

const tolerance: SceneDef = {
  id: 'm10-tolerance',
  title: 'RCuO3: the R site, its cavity and the tolerance factor',
  badge: 'computed',
  sources: ['S-001', 'S-002', 'S-022', 'S-101'],
  banner:
    'The tolerance factor is computed from Shannon radii. The tilt slider draws the a-a-a- pattern at an angle you choose: a picture of tilting, not a computed tilt.',
  params: [
    {
      kind: 'select',
      id: 'r',
      label: 'Rare earth R',
      physics: true,
      value: 'La',
      options: LANTHANIDES.map((e) => ({ value: e, label: e })),
    },
    {
      kind: 'select',
      id: 'policy',
      label: 'A-site coordination policy',
      physics: true,
      value: 'cn12',
      options: POLICIES.map(({ value, label }) => ({ value, label })),
    },
    {
      kind: 'slider',
      id: 'tilt',
      label: 'Octahedral tilt (picture)',
      min: 0,
      max: 15,
      step: 0.5,
      value: 0,
      unit: 'degree',
      digits: 1,
      physics: true,
    },
    { kind: 'toggle', id: 'room', label: 'Room for R', value: true },
  ],
  build(p) {
    const el = String(p.r);
    const pol = POLICIES.find((x) => x.value === p.policy) ?? POLICIES[0]!;
    const row = sweepRow(el, pol.value);
    const tilt = Number(p.tilt);
    const d = R_CU + R_O;
    const blk = tiltedBlock(d, tilt);
    const room = Math.min(...blk.oxygen.map((o) => norm(sub(o, blk.rSite)))) - R_O;
    const layers: Layer[] = [
      mergeMeshes(
        blk.octahedra.map((six) => hullLayer(six)),
        { group: 'octahedra', name: 'CuO6 octahedra', color: 'c1', opacity: 0.32 },
      ),
      atoms(blk.cu, 0.32, TONE.Cu, 'atoms', {
        name: 'Atoms',
        labels: blk.cu.map((_, i) => `Cu ${i + 1}`),
      }),
      atoms(blk.oxygen, 0.26, TONE.O, 'atoms', { labels: blk.oxygen.map((_, i) => `O ${i + 1}`) }),
      lines(cellEdges(blk.lattice), 'muted', 'cell', { name: 'Cu framework cell' }),
    ];
    if (row.ok && row.rA !== undefined)
      layers.push(
        atoms([blk.rSite], row.rA, TONE.La, 'r-site', {
          name: `${el} at its Shannon radius`,
          labels: [`${el}3+ (${pol.short}), radius ${fmt(row.rA, 3)} Å`],
          opacity: 0.9,
        }),
      );
    else
      layers.push(
        atoms([blk.rSite], 0.3, 'muted', 'r-site', {
          name: `${el} (no radius under this policy)`,
          labels: [`${el}3+: no ${pol.short} radius`],
        }),
      );
    if (p.room)
      layers.push(
        sphereLayer(blk.rSite, room, {
          group: 'room',
          name: 'Room for R (touching the nearest oxygen)',
          color: 'muted',
          wireframe: true,
          segments: 18,
        }),
      );
    if (tilt > 0) {
      const ext = norm(blk.rSite) * 1.25;
      layers.push(
        lines([[scale(DIAG, -0.25 * ext), scale(DIAG, 2 * ext)]], 'accent', 'axis', {
          name: 'Tilt axis [111]',
          dashed: true,
        }),
      );
    }
    layers.push(
      labels(
        [
          {
            text: row.ok ? `${el}, t = ${fmt(row.t!, 3)}` : `${el}, no t (${pol.short})`,
            at: add(blk.rSite, [0, 0, 1.9]),
          },
          { text: 'CuO6', at: add(blk.cu[7]!, [0, 0, d + 0.5]) },
          ...(tilt > 0
            ? [{ text: `tilt ${fmt(tilt, 1)}° about [111]`, at: scale(DIAG, 2.1 * norm(blk.rSite)) }]
            : []),
        ],
        'labels',
      ),
    );
    const mu = R_CU / R_O;
    const angle = cuOCuAngle(tilt);
    const tText = row.ok
      ? `Under the ${pol.say} policy ${el}3+ has a Shannon radius of ${fmt(row.rA!, 3)} Å, so the Goldschmidt tolerance factor is ${fmt(row.t!, 3)}${row.t! < 1 ? ', below 1: the R ion is smaller than its cavity, the condition under which the octahedra are expected to tilt' : ', at or above 1: the R ion fills its cavity'}.`
      : `Shannon lists no radius for ${el}3+ at ${pol.short}, so no tolerance factor is given; switch to a uniform CN policy rather than mixing policies.`;
    const tiltText =
      tilt > 0
        ? ` The octahedra are drawn rotated by ${fmt(tilt, 1)} degrees about the body diagonal, alternating in sense (the a-a-a- pattern): the Cu-O-Cu angle drops to ${fmt(angle, 1)} degrees and the room for R shrinks to ${fmt(room, 2)} Å. The angle is your choice, not a prediction.`
        : ` The octahedra are untilted (Cu-O-Cu 180 degrees); the wire sphere shows the room for R, ${fmt(room, 2)} Å, the radius that would make t exactly 1.`;
    const describe =
      `Eight corner-sharing CuO6 octahedra (Cu-O ${fmt(d, 2)} Å from Shannon radii) with ${el} in the cavity between them, drawn at its ionic radius. ` +
      tText +
      tiltText;
    return {
      layers,
      describe,
      lattice: blk.lattice,
      ortho: true,
      camera: 'iso',
      readouts: [
        { label: 'Tolerance factor t', value: row.ok ? fmt(row.t!, 3) : 'no radius' },
        {
          label: 'Octahedral factor mu',
          value: `${fmt(mu, 3)} (limit ${fmt(MU_MIN, 3)})`,
        },
        { label: `${el} radius (${pol.short})`, value: row.ok ? `${fmt(row.rA!, 3)} Å` : 'not listed' },
        { label: 'Cu-O-Cu angle (picture)', value: `${fmt(angle, 1)}°` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 2. Structure and inputs: the page's POSCAR on the stage, its MAGMOM starts, the KPOINTS mesh and the +U on Cu d.

export const MAGMOM_SCALE = 0.5; // Angstrom of arrow per mu_B
const meshMemo = new Map<string, { ks: Vec3[]; rep: boolean[]; irreducible: number }>();

/**
 * Irreducible points of a Gamma-centred n x n x n mesh of a cubic lattice under its 48 operations with time reversal:
 * two points are equivalent exactly when their folded integer coordinates have the same sorted absolute values (the
 * operations are the signed permutations). O(n^3), so a slider never waits; m10.test.ts checks it against the tested
 * `irreducibleCount` with `latticePointGroup` for every n the stage can show. The representative of a class is its
 * first point in mesh order, as in `irreducibleCount`.
 */
export function cubicIrreducible(n: number): { rep: boolean[]; irreducible: number } {
  const fold = (g: number) => Math.abs(g <= n / 2 ? g : g - n);
  const seen = new Set<string>();
  const rep: boolean[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        const key = [fold(i), fold(j), fold(k)].sort((a, b) => a - b).join(',');
        rep.push(!seen.has(key));
        seen.add(key);
      }
  return { rep, irreducible: seen.size };
}

/** The Gamma-centred n x n x n mesh of the cubic cell in Cartesian 1/Angstrom, with its irreducible representatives. */
export function cubicMesh(n: [number, number, number]) {
  return memo(meshMemo, n.join('x'), () => {
    const mesh = meshPoints(n, 'gamma');
    const red = cubicIrreducible(n[0]);
    const b = rowsOf(reciprocalLattice(CUBIC.lattice));
    const ks: Vec3[] = [];
    for (let i = 0; i < mesh.count; i++)
      ks.push(v3(qToCartesian([mesh.coords[3 * i]!, mesh.coords[3 * i + 1]!, mesh.coords[3 * i + 2]!], b)));
    return { ks, rep: red.rep, irreducible: red.irreducible };
  });
}

function meshLayers(n: [number, number, number], group: string): Layer[] {
  const m = cubicMesh(n);
  const zone = brillouinLayers(CUBIC.lattice, { group: 'zone' }).layers;
  const repPts = m.ks.filter((_, i) => m.rep[i]);
  const rest = m.ks.filter((_, i) => !m.rep[i]);
  const bLen = (2 * Math.PI) / A_CUBIC;
  const size = Math.min(0.05, (0.18 * bLen) / Math.max(...n));
  const out: Layer[] = [...zone];
  if (rest.length)
    out.push(points(rest, 'muted', size * 0.7, group, { name: 'k-points (equivalent by symmetry)' }));
  out.push(points(repPts, 'accent', size, `${group}-irreducible`, { name: 'Irreducible k-points' }));
  return out;
}

const INPUT_VIEWS = [
  { value: 'poscar', label: 'POSCAR: the cell' },
  { value: 'magmom', label: 'MAGMOM: the spin start' },
  { value: 'kpoints', label: 'KPOINTS: the mesh' },
  { value: 'ldau', label: 'LDAU: +U on Cu d' },
];

const inputs: SceneDef = {
  id: 'm10-inputs',
  title: 'The LaCuO3 input files on the stage',
  badge: 'computed',
  sources: ['S-019', 'S-042', 'S-001', 'S-002', 'S-007', 'S-032', 'S-047', 'S-170', 'S-014'],
  params: [
    {
      kind: 'select',
      id: 'input',
      label: 'Input file',
      physics: true,
      value: 'poscar',
      options: INPUT_VIEWS,
    },
    {
      kind: 'select',
      id: 'start',
      label: 'Spin start',
      physics: true,
      value: 'fm-high',
      options: Object.entries(STARTS).map(([value, s]) => ({ value, label: s.text })),
    },
    { kind: 'toggle', id: 'eg', label: 'e_g lobes on Cu', value: true },
  ],
  build(p) {
    const view = String(p.input);
    const start = STARTS[p.start as keyof typeof STARTS] ?? STARTS['fm-high'];
    const layers: Layer[] = [];
    const readouts: SceneFrame['readouts'] = [];
    let describe: string;
    if (view === 'kpoints') {
      layers.push(...meshLayers(KPOINTS_MESH, 'mesh'));
      const b = rowsOf(reciprocalLattice(CUBIC.lattice));
      layers.push(
        arrows(
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          b.map((x) => scale(x, 0.5)),
          'ink',
          'reciprocal',
          {
            name: 'Half reciprocal vectors b/2',
            thickness: 0.02,
          },
        ),
        labels(
          [
            { text: 'Γ', at: [0.06, 0.06, 0.06] },
            { text: 'b1/2', at: scale(b[0], 0.58) },
            { text: 'b2/2', at: scale(b[1], 0.58) },
            { text: 'b3/2', at: scale(b[2], 0.58) },
          ],
          'labels',
        ),
      );
      const m = cubicMesh(KPOINTS_MESH);
      const total = KPOINTS_MESH[0] * KPOINTS_MESH[1] * KPOINTS_MESH[2];
      const bLen = norm(b[0]);
      describe =
        `The KPOINTS file of the example: a Gamma-centred 8 x 8 x 8 mesh, ${total} points inside the cubic Brillouin zone of the 3.88 Å cell ` +
        `(reciprocal vectors ${fmt(bLen, 3)} per Angstrom, point spacing ${fmt(bLen / 8, 3)} per Angstrom). ` +
        `The cubic symmetry joins them into ${m.irreducible} irreducible points, drawn larger in the accent colour; the convergence page tests this mesh.`;
      readouts.push(
        { label: 'Mesh', value: '8 x 8 x 8, Gamma-centred' },
        { label: 'k-points in the zone', value: String(total) },
        { label: 'Irreducible (cubic, 48 operations)', value: String(m.irreducible) },
        { label: 'Spacing |b|/8', value: `${fmt(bLen / 8, 3)} 1/Å` },
      );
      return { layers, describe, readouts, lattice: b, ortho: true, camera: 'iso' };
    }
    const cell = cubicCell({ highlightFile: view === 'poscar' });
    layers.push(...cell.layers);
    const L = CUBIC_ROWS;
    if (view === 'poscar') {
      layers.push(
        arrows(
          [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ],
          L,
          'ink',
          'vectors',
          {
            name: 'Lattice vectors (lines 3 to 5, times line 2)',
            thickness: 0.02,
          },
        ),
        labels(
          [
            { text: 'line 9: La (A site)', at: [-0.4, -0.4, -0.5] },
            { text: 'line 10: Cu (B site)', at: add(cell.cu, [0.5, 0.5, 0.45]) },
            { text: 'lines 11 to 13: O', at: [A_CUBIC / 2, A_CUBIC / 2, -0.55] },
            { text: `a = ${fmt(A_CUBIC, 2)} Å (line 2)`, at: [A_CUBIC * 0.55, -0.6, -0.4] },
          ],
          'labels',
        ),
      );
      describe =
        `The POSCAR of the example built on the stage: the ideal cubic perovskite cell with edge ${fmt(A_CUBIC, 2)} Å (the scale factor, a starting guess from 2 times the Cu and O Shannon radii), ` +
        `La at the corner, Cu at the body centre and three O on the face centres, five atoms in the order La, Cu, O. ` +
        `The five atoms written in the file have an outline; the others are copies on the far faces that complete the CuO6 octahedron.`;
      readouts.push(
        { label: 'Atoms in the file', value: '5 (La 1, Cu 1, O 3)' },
        { label: 'Scale factor (line 2)', value: `${fmt(A_CUBIC, 2)} Å, a guess` },
        { label: 'Cu-O distance', value: `${fmt(A_CUBIC / 2, 2)} Å` },
        { label: 'Species order', value: 'La Cu O' },
      );
    } else if (view === 'magmom') {
      const values = start.magmom ? expandRepeats(start.magmom) : [];
      const file = CUBIC.frac.map((f) => v3(scale(v3(f), A_CUBIC)));
      const from: Vec3[] = [];
      const vec: Vec3[] = [];
      values.forEach((m, i) => {
        if (m !== 0) {
          from.push(file[i]!);
          vec.push([0, 0, m * MAGMOM_SCALE]);
        }
      });
      if (from.length)
        layers.push(
          arrows(from, vec, 'pos', 'spins', { name: 'MAGMOM start on Cu', head: 'solid', thickness: 0.06 }),
        );
      const tick = add(cell.cu, [0, 0, 2 * MAGMOM_SCALE]);
      layers.push(
        lines(
          [
            [add(tick, [-0.45, 0, 0]), add(tick, [0.45, 0, 0])],
            [add(tick, [0, -0.45, 0]), add(tick, [0, 0.45, 0])],
          ],
          'muted',
          'nominal',
          { name: 'Nominal d8 moment (2 mu_B)', dashed: true },
        ),
        labels(
          [
            {
              text: start.magmom ? `MAGMOM = ${start.magmom}` : 'ISPIN = 1: no MAGMOM',
              at: [A_CUBIC / 2, -0.8, A_CUBIC + 0.9],
            },
            { text: 'nominal 2 mu_B (d8, S = 1)', at: add(tick, [0.6, 0, 0.15]) },
          ],
          'labels',
        ),
      );
      const cuStart = values[1] ?? 0;
      describe = start.magmom
        ? `The ${start.text}: MAGMOM = ${start.magmom} expands to ${values.join(', ')}, one value per atom in POSCAR order, so only Cu starts with a moment, ${cuStart} mu_B, drawn as an arrow ${fmt(cuStart * MAGMOM_SCALE, 1)} Å long. ` +
          `The dashed cross marks the nominal 2 mu_B of high-spin d8, so this start lies ${cuStart > 2 ? 'above' : 'below'} it. What the run converges to is a result of the calculation, not shown here.`
        : 'The non-magnetic start: ISPIN = 1 forces both spin channels to be equal, so no moment can form and no MAGMOM line is written. The dashed cross marks the nominal 2 mu_B of high-spin d8 for comparison.';
      readouts.push(
        { label: 'Spin start', value: start.text },
        { label: 'MAGMOM', value: start.magmom || 'none (ISPIN = 1)' },
        { label: 'Entries', value: start.magmom ? `${values.length} for 5 atoms` : '0' },
        { label: 'Cu start', value: `${cuStart} mu_B` },
      );
    } else {
      // LDAU: U acts on the Cu d shell only (LDAUL = -1 2 -1). The full d shell is spherical (Unsold, S-170).
      layers.push(
        sphereLayer(cell.cu, 0.95, {
          group: 'dshell',
          name: 'Cu 3d shell where U acts (drawn size)',
          color: 'pos',
          opacity: 0.18,
          segments: 24,
        }),
      );
      if (p.eg)
        layers.push(
          lobeMesh(2, 2, cell.cu, 1.45, { group: 'lobes', name: 'Cu e_g shapes (angular part)' }),
          lobeMesh(2, 0, cell.cu, 1.45, { group: 'lobes', opacity: 0.6 }),
        );
      const a = layers[0];
      if (a?.kind === 'atoms')
        a.highlight = cell.species.map((s, i) => (s === 'Cu' ? i : -1)).filter((i) => i >= 0);
      layers.push(
        labels(
          [
            { text: `LDAUL = ${LDAU.LDAUL}: d shell of Cu only`, at: [A_CUBIC / 2, -0.8, A_CUBIC + 0.9] },
            { text: `LDAUU = ${LDAU.LDAUU} (one point of a scan)`, at: [A_CUBIC / 2, -0.8, A_CUBIC + 0.4] },
          ],
          'labels',
        ),
      );
      describe =
        `The DFT+U block of the example: LDAUL = ${LDAU.LDAUL} and LDAUU = ${LDAU.LDAUU} give one entry per species in POSCAR order, so the correction acts on the Cu 3d shell only, drawn as a translucent sphere (the five d orbitals together are spherical). ` +
        (p.eg
          ? 'Inside it the two e_g shapes, d_x2-y2 and d_z2, point straight at the six oxygen neighbours. '
          : '') +
        `In Dudarev's form (LDAUTYPE = 2) only U - J enters; the value 4 eV is one point of a scan, not a recommendation or a result.`;
      readouts.push(
        { label: 'LDAUTYPE', value: '2 (Dudarev, U - J)' },
        { label: 'LDAUL (La, Cu, O)', value: LDAU.LDAUL },
        { label: 'LDAUU (La, Cu, O)', value: `${LDAU.LDAUU} eV, a scan point` },
        { label: 'LMAXMIX', value: '4 (d elements)' },
      );
    }
    return { layers, describe, readouts, lattice: L, ortho: true, camera: 'iso' };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 3. Convergence: the cutoff sphere and the k-mesh of the example cell from the tested libraries, and the energy
//    curve as an "awaiting results" state (the planned series and the convergence rule band, no data).

const gMemo = new Map<string, ReturnType<typeof gVectorsWithin>>();
export const examplePlaneWaves = (encut: number) =>
  memo(gMemo, String(encut), () => gVectorsWithin(CUBIC.lattice, encut));
export const exampleMesh = (ks: number) =>
  meshFromKspacing(CUBIC.lattice, ks).mesh as [number, number, number];
export const ENCUT_SERIES = [400, 450, 500, 550, 600, 650, 700];
export const MESH_SERIES = [4, 6, 8, 10, 12, 14, 16];

const convergence: SceneDef = {
  id: 'm10-convergence',
  title: 'Convergence tests for the LaCuO3 cell',
  badge: 'computed',
  sources: ['S-049', 'S-031', 'S-040', 'S-019', 'S-042', 'S-007', 'S-032'],
  params: [
    {
      kind: 'select',
      id: 'view',
      label: 'Show',
      physics: true,
      value: 'basis',
      options: [
        { value: 'basis', label: 'Cutoff sphere (ENCUT)' },
        { value: 'mesh', label: 'k-mesh (KSPACING)' },
        { value: 'series', label: 'Energy curve: awaiting results' },
      ],
    },
    {
      kind: 'slider',
      id: 'encut',
      label: 'ENCUT',
      min: 400,
      max: 700,
      step: 10,
      value: 520,
      unit: 'eV',
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'kspacing',
      label: 'KSPACING',
      min: 0.1,
      max: 0.5,
      step: 0.01,
      value: 0.2,
      unit: '1/Å',
      digits: 2,
      physics: true,
    },
  ],
  build(p) {
    const view = String(p.view);
    const encut = Math.round(Number(p.encut));
    const ksp = Number(p.kspacing);
    const n = exampleMesh(ksp);
    const pw = examplePlaneWaves(encut);
    const kc = cutoffRadius(encut);
    const nText = `${n[0]} x ${n[1]} x ${n[2]}`;
    const common = [
      { label: 'ENCUT', value: `${encut} eV` },
      { label: 'Plane waves at Gamma', value: String(pw.count) },
    ];
    if (view === 'mesh') {
      const m = cubicMesh(n);
      const layers = meshLayers(n, 'mesh');
      layers.push(...axesLayers(1.2 * (Math.PI / A_CUBIC), ['kx', 'ky', 'kz']));
      const total = n[0] * n[1] * n[2];
      const describe =
        `KSPACING ${fmt(ksp, 2)} per Angstrom on the ${fmt(A_CUBIC, 2)} Å cubic cell gives a Gamma-centred ${nText} mesh (N = ceil(|b| / KSPACING), |b| = ${fmt((2 * Math.PI) / A_CUBIC, 3)} per Angstrom): ` +
        `${total} k-points in the zone, ${m.irreducible} of them irreducible under the cubic symmetry (drawn larger). The k-mesh series of the page uses n = 4 to 16.`;
      return {
        layers,
        describe,
        ortho: true,
        camera: 'iso',
        axes: ['kx (1/Å)', 'ky (1/Å)', 'kz (1/Å)'],
        readouts: [
          { label: 'KSPACING', value: `${fmt(ksp, 2)} 1/Å` },
          { label: 'Mesh (ceil rule)', value: nText },
          { label: 'k-points', value: `${total} (irreducible ${m.irreducible})` },
          ...common.slice(1),
        ],
      };
    }
    if (view === 'series') {
      // the plan of the page: series 1 over ENCUT at 8 x 8 x 8, series 2 over n at the ENCUT chosen; energies pending
      const X = (e: number) => ((e - 400) / 300) * 9;
      const Y = (k: number) => ((k - 4) / 12) * 9;
      const zBand = 4.5;
      const s1 = ENCUT_SERIES.map((e) => [X(e), Y(8), 0] as Vec3);
      const s2 = MESH_SERIES.map((k) => [X(encut), Y(k), 0] as Vec3);
      const here: Vec3 = [X(encut), Y(Math.min(16, Math.max(4, n[0]))), 0];
      const layers: Layer[] = [
        quadLayer([0, 0, 0], [9, 0, 0], [0, 9, 0], {
          group: 'plane',
          name: 'Settings plane (ENCUT, mesh)',
          color: 'muted',
          opacity: 0.08,
        }),
        quadLayer([0, 0, zBand], [9, 0, 0], [0, 9, 0], {
          group: 'band',
          name: 'Convergence rule band (1 meV per atom)',
          color: 'accent',
          opacity: 0.22,
        }),
        points(s1, 'c3', 0.22, 'series1', { name: 'Series 1: ENCUT 400 to 700 eV at 8 x 8 x 8' }),
        points(s2, 'c4', 0.22, 'series2', { name: 'Series 2: n = 4 to 16 at the chosen ENCUT' }),
        lines(
          [...s1, ...s2].map((q) => [q, add(q, [0, 0, zBand + 1.5])] as [Vec3, Vec3]),
          'muted',
          'pending',
          { name: 'Energy per atom: awaiting results', dashed: true },
        ),
        atoms([here], 0.3, 'pos', 'setting', {
          labels: [`ENCUT ${encut} eV, ${nText}`],
          name: 'Your setting',
        }),
        ...axesLayers([10, 10, 7.5], ['ENCUT', 'k-mesh n', 'energy per atom']),
        labels(
          [
            { text: 'awaiting results (ongoing research)', at: [4.5, 4.5, zBand + 2.2] },
            { text: 'rule: every later point within 1 meV per atom', at: [9.6, 9, zBand] },
            { text: '400 eV', at: [0, -0.8, 0] },
            { text: '700 eV', at: [9, -0.8, 0] },
            { text: 'n = 4', at: [-0.9, 0, 0] },
            { text: 'n = 16', at: [-0.9, 9, 0] },
          ],
          'labels',
        ),
      ];
      const describe =
        `The plan of the convergence page on the plane of settings: series 1 (${ENCUT_SERIES.length} static runs, ENCUT 400 to 700 eV at 8 x 8 x 8) and series 2 (${MESH_SERIES.length} meshes, n = 4 to 16, at ENCUT ${encut} eV). ` +
        `The dashed stems carry no energies: the energy per atom of each run is awaiting results from ongoing research. The band shows the rule only: accept the first setting from which every later point stays within 1 meV per atom.`;
      return {
        layers,
        describe,
        camera: { eye: [1.3, -1.6, 0.9] },
        axes: ['ENCUT (eV)', 'k-mesh n', 'energy per atom (awaiting results)'],
        readouts: [
          { label: 'Series 1', value: `${ENCUT_SERIES.length} runs, 400 to 700 eV` },
          { label: 'Series 2', value: `${MESH_SERIES.length} meshes at ${encut} eV` },
          { label: 'Tolerance', value: '1 meV per atom' },
          { label: 'Energies', value: 'awaiting results' },
        ],
      };
    }
    const inside: Vec3[] = [];
    for (let i = 0; i < pw.vectors.length; i += 3)
      inside.push([pw.vectors[i]!, pw.vectors[i + 1]!, pw.vectors[i + 2]!]);
    const b = rowsOf(reciprocalLattice(CUBIC.lattice));
    const layers: Layer[] = [
      points(inside, 'accent', 0.16, 'basis', { name: 'Plane waves in the basis' }),
      sphereLayer([0, 0, 0], kc, {
        group: 'sphere',
        name: 'Cutoff sphere',
        color: 'pos',
        opacity: 0.12,
        segments: 28,
      }),
      lines(cellEdges(b), 'ink', 'reciprocal', { name: 'Reciprocal cell' }),
      ...axesLayers(kc + 2, ['Gx', 'Gy', 'Gz']),
      labels([{ text: `k_c = ${fmt(kc, 2)} 1/Å`, at: [0, 0, kc + 1.2] }], 'labels'),
    ];
    const describe =
      `The plane-wave basis of the LaCuO3 cell (cubic, ${fmt(A_CUBIC, 2)} Å) at ENCUT ${encut} eV: every reciprocal lattice vector inside the cutoff sphere of radius ${fmt(kc, 2)} per Angstrom, ` +
      `${pw.count} plane waves at Gamma against the continuum estimate ${fmt(pw.continuum, 0)}. The small cube at the centre is one reciprocal cell. ` +
      `The page's series runs ENCUT from 400 to 700 eV; the relaxation uses 1.3 times ENMAX whatever the energy test says.`;
    return {
      layers,
      describe,
      camera: { eye: [1.2, -1.6, 0.7] },
      axes: ['Gx (1/Å)', 'Gy (1/Å)', 'Gz (1/Å)'],
      readouts: [
        ...common,
        { label: 'Cutoff radius', value: `${fmt(kc, 2)} 1/Å` },
        { label: 'Mesh at this KSPACING', value: nText },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 4. Relaxation as a method: which degrees of freedom ISIF frees, the seed that breaks the cubic symmetry, the spin
//    starts of the doubled cell. No trajectory and no relaxed number (D-101).

export const DOUBLED = (() => {
  const sc = buildSupercell(CUBIC, DOUBLING);
  const order = ['La', 'Cu', 'O'];
  const idx = sc.structure.species
    .map((_, i) => i)
    .sort(
      (i, j) => order.indexOf(sc.structure.species[i]!) - order.indexOf(sc.structure.species[j]!) || i - j,
    );
  // cubic Cartesian position of each site (the supercell keeps the cubic frame: rows of M L)
  const cart = idx.map((i) => {
    const f = CUBIC.frac[sc.parentIndex[i]!]!;
    const T = sc.translations[i]!;
    return scale([f[0] + T[0], f[1] + T[1], f[2] + T[2]], A_CUBIC) as Vec3;
  });
  const species = idx.map((i) => sc.structure.species[i]!);
  // G pattern: the sign of a Cu is the parity of its cubic translation (first Cu up, as in MAGMOM = 2*0 3 -3 6*0)
  const parity = idx.map((i) => {
    const T = sc.translations[i]!;
    return (((T[0] + T[1] + T[2]) % 2) + 2) % 2;
  });
  const cuPar = parity.filter((_, k) => species[k] === 'Cu');
  const firstCu = cuPar[0] ?? 0;
  const gSign = parity.map((q, k) => (species[k] !== 'Cu' ? 0 : q === firstCu ? 1 : -1));
  return { lattice: rowsOf(sc.structure.lattice), species, cart, gSign, det: determinant(DOUBLING) };
})();

/**
 * The seed displacement of an oxygen at cubic position x (Angstrom) in the a-a-a- pattern: the first-order motion of a
 * rigid rotation about [111], d sin(phi) n x e, with e the unit bond from the Cu of + sense, scaled so its length is
 * `amp` lattice units. The sense of a Cu at (1/2, 1/2, 1/2) + T is the parity of T.
 */
export function oxygenSeed(x: Vec3, amp: number): Vec3 {
  const f = scale(x, 1 / A_CUBIC);
  const k = [0, 1, 2].find((i) => Math.abs(f[i]! - Math.round(f[i]!)) < 1e-6) ?? 0;
  const lo = sub(x, scale(E[k]!, A_CUBIC / 2));
  const T = scale(lo, 1 / A_CUBIC).map((q) => Math.round(q - 0.5));
  const plus = (((T[0]! + T[1]! + T[2]!) % 2) + 2) % 2 === 0;
  const e = plus ? E[k]! : scale(E[k]!, -1);
  return scale(normalize(cross(DIAG, e)), amp * A_CUBIC);
}

/** Rigid tilt (degrees) that a seed of `amp` lattice units corresponds to: |delta| = d sin(phi) sqrt(2/3), a = 2d. */
export const seedTiltDeg = (amp: number): number =>
  Math.asin(Math.min(1, (2 * amp) / Math.sqrt(2 / 3))) / DEG;

const ISIF = {
  '2': { text: 'ions only', ions: true, shape: false, volume: false },
  '4': { text: 'ions and cell shape, fixed volume', ions: true, shape: true, volume: false },
  '3': { text: 'ions, cell shape and volume', ions: true, shape: true, volume: true },
} as const;
const ARROW_GAIN = 15;

/** Handles on the cell: outward arrows on the faces (volume), arrows along the faces (shape). */
function cellHandles(L: [Vec3, Vec3, Vec3], o: { shape: boolean; volume: boolean }): Layer[] {
  const centre = scale(add(add(L[0], L[1]), L[2]), 0.5);
  const out: Layer[] = [];
  const nFrom: Vec3[] = [];
  const nVec: Vec3[] = [];
  const tFrom: Vec3[] = [];
  const tVec: Vec3[] = [];
  for (let k = 0; k < 3; k++) {
    const a = L[k]!;
    const face = add(centre, scale(a, 0.5));
    const normal = normalize(a);
    if (o.volume) {
      nFrom.push(face, sub(centre, scale(a, 0.5)));
      nVec.push(scale(normal, 1.0), scale(normal, -1.0));
    }
    if (o.shape) {
      const along = normalize(L[(k + 1) % 3]!);
      tFrom.push(face, sub(centre, scale(a, 0.5)));
      tVec.push(scale(along, 0.9), scale(along, -0.9));
    }
  }
  if (nFrom.length)
    out.push(
      arrows(nFrom, nVec, 'accent', 'handles', { name: 'Cell handles: volume may change', thickness: 0.05 }),
    );
  if (tFrom.length)
    out.push(
      arrows(tFrom, tVec, 'c5', 'handles', {
        name: 'Cell handles: shape may change',
        head: 'open',
        thickness: 0.05,
      }),
    );
  return out;
}

const relaxation: SceneDef = {
  id: 'm10-relaxation',
  title: 'Relaxing LaCuO3: what ISIF lets move',
  badge: 'illustrative',
  sources: ['S-019', 'S-042', 'S-101', 'S-058', 'S-041'],
  params: [
    {
      kind: 'select',
      id: 'cell',
      label: 'Stage',
      physics: true,
      value: 'cubic',
      options: [
        { value: 'cubic', label: 'Stage 1: cubic cell, 5 atoms' },
        { value: 'doubled', label: 'Stage 2: doubled cell, 10 atoms' },
      ],
    },
    {
      kind: 'select',
      id: 'isif',
      label: 'ISIF',
      physics: true,
      value: '3',
      options: Object.entries(ISIF).map(([value, s]) => ({ value, label: `ISIF = ${value}: ${s.text}` })),
    },
    {
      kind: 'select',
      id: 'start',
      label: 'Spin start',
      physics: true,
      value: 'fm',
      options: [
        { value: 'fm', label: 'Ferromagnetic' },
        { value: 'g', label: 'G-type antiferromagnetic' },
        { value: 'nm', label: 'Non-magnetic' },
      ],
    },
    {
      kind: 'slider',
      id: 'seed',
      label: 'Oxygen seed (tilt pattern)',
      min: 0,
      max: 0.05,
      step: 0.005,
      value: 0.02,
      unit: 'lattice units',
      digits: 3,
      physics: true,
    },
  ],
  build(p) {
    const doubled = p.cell === 'doubled';
    const isifKey = (String(p.isif) in ISIF ? String(p.isif) : '3') as keyof typeof ISIF;
    const isif = ISIF[isifKey];
    const startKey = String(p.start) as 'fm' | 'g' | 'nm';
    const amp = doubled ? Number(p.seed) : 0;
    const layers: Layer[] = [];
    const readouts: SceneFrame['readouts'] = [];
    let describe: string;
    if (!doubled) {
      const cell = cubicCell();
      layers.push(...cell.layers);
      // by symmetry only the lattice parameter can change; ISIF 4 keeps the volume, so nothing moves
      const moves = isifKey === '3';
      if (moves) layers.push(...cellHandles(CUBIC_ROWS, { shape: false, volume: true }));
      const mag = startKey === 'fm' ? STARTS['fm-high'].magmom : '';
      if (mag)
        layers.push(arrows([cell.cu], [[0, 0, 3 * MAGMOM_SCALE]], 'pos', 'spins', { name: 'MAGMOM start' }));
      layers.push(
        labels(
          [
            { text: 'forces zero by symmetry', at: [A_CUBIC / 2, -0.9, A_CUBIC + 0.9] },
            {
              text: moves ? 'only a may change' : 'nothing can change',
              at: [A_CUBIC / 2, -0.9, A_CUBIC + 0.4],
            },
            ...(startKey === 'g'
              ? [{ text: 'G-type needs two Cu: stage 2', at: add(cell.cu, [0, 0, 1.6]) }]
              : []),
          ],
          'labels',
        ),
      );
      describe =
        `Stage 1: the five-atom cubic cell of the structure page with ISIF = ${isifKey} (${isif.text}). Every atom sits on a position fixed by the cubic symmetry, so all forces are zero by symmetry and no atom arrow is drawn. ` +
        (moves
          ? 'The stress is the same along every axis, so only the lattice parameter can change: the handles on the faces push in and out together. '
          : isifKey === '4'
            ? 'The shape stays cubic by symmetry and the volume is held, so nothing can change in this run. '
            : 'With the cell held fixed, nothing can change in this run. ') +
        (startKey === 'g'
          ? 'A G-type start needs two Cu atoms, so it comes with the doubled cell of stage 2.'
          : startKey === 'fm'
            ? 'The arrow on Cu is the high-moment start MAGMOM = 0 3 3*0 of the input page.'
            : 'The non-magnetic run uses ISPIN = 1, so no moment is drawn.');
      readouts.push(
        { label: 'Cell', value: '5 atoms, cubic' },
        { label: 'ISIF', value: `${isifKey}: ${isif.text}` },
        { label: 'May change', value: moves ? 'lattice parameter only' : 'nothing' },
        {
          label: 'MAGMOM',
          value: startKey === 'g' ? 'needs stage 2' : mag || 'none (ISPIN = 1)',
        },
      );
      return { layers, describe, readouts, lattice: CUBIC_ROWS, ortho: true, camera: 'iso' };
    }
    const D = DOUBLED;
    const pos = D.cart.map((x, i) => (D.species[i] === 'O' ? add(x, oxygenSeed(x, amp)) : x));
    const rad = (s: string) => (s === 'La' ? 0.8 : s === 'Cu' ? 0.5 : 0.35);
    layers.push(
      atoms(
        pos,
        D.species.map(rad),
        D.species.map((s) => TONE[s as keyof typeof TONE]),
        'atoms',
        {
          name: 'Atoms',
          labels: D.species.map((s, i) => `${s} ${i + 1}`),
        },
      ),
      lines(cellEdges(D.lattice), 'muted', 'cell', {
        name: 'Doubled cell',
        dashed: !isif.shape && !isif.volume,
      }),
    );
    // the two CuO6 octahedra, built from the six bonds of each Cu (images included), with the seed applied
    const octs: MeshLayer[] = [];
    D.cart.forEach((x, i) => {
      if (D.species[i] !== 'Cu') return;
      const six: Vec3[] = [];
      for (const e of E)
        for (const sg of [1, -1]) {
          const o = add(x, scale(e, (sg * A_CUBIC) / 2));
          six.push(add(o, oxygenSeed(o, amp)));
        }
      octs.push(hullLayer(six));
    });
    layers.push(mergeMeshes(octs, { group: 'octahedra', name: 'CuO6 octahedra', color: 'c1', opacity: 0.3 }));
    if (amp > 0) {
      const from: Vec3[] = [];
      const vec: Vec3[] = [];
      D.cart.forEach((x, i) => {
        if (D.species[i] === 'O') {
          from.push(pos[i]!);
          vec.push(scale(oxygenSeed(x, amp), ARROW_GAIN));
        }
      });
      layers.push(
        arrows(from, vec, 'c3', 'seed', {
          name: `Oxygen seed (drawn ${ARROW_GAIN} times longer)`,
          thickness: 0.06,
        }),
      );
    }
    layers.push(...cellHandles(D.lattice, isif));
    const mm = startKey === 'nm' ? '' : DOUBLED_STARTS[startKey].magmom;
    if (mm) {
      const vals = expandRepeats(mm);
      const from: Vec3[] = [];
      const vec: Vec3[] = [];
      const head: ('solid' | 'open')[] = [];
      vals.forEach((m, i) => {
        if (m !== 0) {
          from.push(pos[i]!);
          vec.push([0, 0, m * MAGMOM_SCALE]);
          head.push(m > 0 ? 'solid' : 'open');
        }
      });
      layers.push(
        arrows(
          from,
          vec,
          vals.filter((m) => m !== 0).map((m) => (m > 0 ? 'pos' : 'neg')),
          'spins',
          {
            name: 'MAGMOM start (open head: spin down)',
            head,
            thickness: 0.06,
          },
        ),
      );
    }
    const tiltDeg = seedTiltDeg(amp);
    layers.push(
      labels(
        [
          {
            text: mm ? `MAGMOM = ${mm}` : 'ISPIN = 1',
            at: add(scale(add(D.lattice[0], D.lattice[1]), 0.5), [0, 0, 6.5]),
          },
          {
            text: amp > 0 ? 'seed in the a-a-a- pattern' : 'no seed: stays cubic by symmetry',
            at: add(scale(add(D.lattice[0], D.lattice[1]), 0.5), [0, 0, 6]),
          },
        ],
        'labels',
      ),
    );
    const handleText = isif.volume
      ? 'The face handles show that shape and volume may both change.'
      : isif.shape
        ? 'The handles along the faces show that the shape may change at fixed volume.'
        : 'The cell is held fixed (dashed edges).';
    describe =
      `Stage 2: the ten-atom doubled cell (M with rows 0 1 1, 1 0 1, 1 1 0, determinant ${D.det}) in the order La, La, Cu, Cu, then six O, with ISIF = ${isifKey} (${isif.text}). ` +
      (amp > 0
        ? `Each oxygen is pushed by ${fmt(amp, 3)} lattice units in the a-a-a- tilt pattern, the same as a rigid tilt of ${fmt(tiltDeg, 1)} degrees; the arrows are drawn ${ARROW_GAIN} times longer. The seed is an input that breaks the cubic symmetry, not a computed force. `
        : 'With no seed every force that would start a tilt is zero by symmetry, so the run stays cubic. ') +
      `${handleText} ` +
      (mm
        ? `The ${DOUBLED_STARTS[startKey].text} MAGMOM = ${mm} puts ${startKey === 'g' ? 'opposite moments on the two Cu (open head: spin down)' : 'equal moments on both Cu'}.`
        : 'The non-magnetic run uses ISPIN = 1.') +
      ' How far the atoms move is a result of the calculation and is not shown.';
    readouts.push(
      { label: 'Cell', value: `10 atoms, det M = ${D.det}` },
      { label: 'ISIF', value: `${isifKey}: ${isif.text}` },
      { label: 'Seed', value: amp > 0 ? `${fmt(amp, 3)} a (rigid tilt ${fmt(tiltDeg, 1)}°)` : 'none' },
      { label: 'MAGMOM', value: mm || 'none (ISPIN = 1)' },
    );
    return { layers, describe, readouts, lattice: D.lattice, ortho: true, camera: 'iso' };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 5. Electronic structure: the cubic zone and the band path of the page, the Cu d and O p shapes on the octahedron
//    (illustrative), and an "awaiting results" bands panel.

/** Setyawan-Curtarolo cubic path (S-005) as the electronic-structure page writes it: Gamma-X-M-Gamma-R-X, then M-R. */
export const CUBIC_PATH = {
  points: { G: [0, 0, 0], X: [0, 0.5, 0], M: [0.5, 0.5, 0], R: [0.5, 0.5, 0.5] } as Record<string, Vec3>,
  path: [
    ['G', 'X', 'M', 'G', 'R', 'X'],
    ['M', 'R'],
  ],
};
const show = (l: string) => (l === 'G' ? 'Γ' : l);
const say = (l: string) => (l === 'G' ? 'Gamma' : l);
export function pathSegments(): { from: string; to: string; a: Vec3; b: Vec3; length: number }[] {
  const b = rowsOf(reciprocalLattice(CUBIC.lattice));
  const cart = (q: Vec3) => v3(qToCartesian(q, b));
  const out: { from: string; to: string; a: Vec3; b: Vec3; length: number }[] = [];
  for (const chain of CUBIC_PATH.path)
    for (let i = 0; i + 1 < chain.length; i++) {
      const A = cart(CUBIC_PATH.points[chain[i]!]!);
      const B = cart(CUBIC_PATH.points[chain[i + 1]!]!);
      out.push({ from: chain[i]!, to: chain[i + 1]!, a: A, b: B, length: norm(sub(B, A)) });
    }
  return out;
}
const SEGMENTS = pathSegments();

const ORBITAL_SETS = {
  x2y2: {
    label: 'Cu d_x2-y2 (e_g) with O p sigma',
    cu: [2, 2],
    // O p lobes pointing at Cu: p_x on the +-x oxygens, p_y on the +-y oxygens (m = 1 is p_x, m = -1 is p_y)
    o: [
      { at: 0, sg: 1, m: 1 },
      { at: 0, sg: -1, m: 1 },
      { at: 1, sg: 1, m: -1 },
      { at: 1, sg: -1, m: -1 },
    ],
    text: 'd_x2-y2, one of the two e_g orbitals, points its lobes straight at the four oxygens in the xy plane, whose 2p orbitals point back along the bonds (sigma overlap): these are the states that mix most strongly.',
  },
  z2: {
    label: 'Cu d_z2 (e_g) with O p sigma',
    cu: [2, 0],
    o: [
      { at: 2, sg: 1, m: 0 },
      { at: 2, sg: -1, m: 0 },
    ],
    text: 'd_z2, the other e_g orbital, points along z at the two apical oxygens, whose 2p_z orbitals point back along the bonds (sigma overlap).',
  },
  xy: {
    label: 'Cu d_xy (t_2g) with O p pi',
    cu: [2, -2],
    o: [
      { at: 0, sg: 1, m: -1 },
      { at: 0, sg: -1, m: -1 },
      { at: 1, sg: 1, m: 1 },
      { at: 1, sg: -1, m: 1 },
    ],
    text: 'd_xy, a t_2g orbital, points between the oxygens; it meets their 2p orbitals only side on (pi overlap), so it mixes less than the e_g pair.',
  },
} as const;

const electronic: SceneDef = {
  id: 'm10-electronic',
  title: 'LaCuO3 electronic structure: the zone, the orbitals and the bands to come',
  badge: 'computed',
  sources: ['S-005', 'S-019', 'S-042', 'S-047', 'S-100'],
  banner:
    'The zone and path are computed for the example cell. The orbitals are angular shapes drawn on the octahedron to show which states can mix, not computed orbital characters; the bands are awaiting results.',
  params: [
    {
      kind: 'select',
      id: 'panel',
      label: 'Show',
      physics: true,
      value: 'zone',
      options: [
        { value: 'zone', label: 'Brillouin zone and path' },
        { value: 'orbitals', label: 'Cu d and O p on the octahedron' },
        { value: 'bands', label: 'Bands: awaiting results' },
      ],
    },
    {
      kind: 'select',
      id: 'orbital',
      label: 'Orbital pair',
      physics: true,
      value: 'x2y2',
      options: Object.entries(ORBITAL_SETS).map(([value, o]) => ({ value, label: o.label })),
    },
    {
      kind: 'step',
      id: 'segment',
      label: 'Path segment',
      min: 0,
      max: SEGMENTS.length,
      value: 0,
      physics: true,
    },
  ],
  build(p) {
    const panel = String(p.panel);
    const seg = Math.round(Number(p.segment));
    const cur = seg > 0 ? SEGMENTS[seg - 1] : undefined;
    const pathText = 'Γ-X-M-Γ-R-X | M-R';
    const total = SEGMENTS.reduce((s, x) => s + x.length, 0);
    if (panel === 'orbitals') {
      const set = ORBITAL_SETS[p.orbital as keyof typeof ORBITAL_SETS] ?? ORBITAL_SETS.x2y2;
      const d = A_CUBIC / 2;
      const ox: Vec3[] = [];
      for (const e of E) for (const sg of [1, -1]) ox.push(scale(e, sg * d));
      const layers: Layer[] = [
        hullLayer(ox, { group: 'octahedra', name: 'CuO6 octahedron', color: 'c1', opacity: 0.15 }),
        atoms([[0, 0, 0]], 0.3, TONE.Cu, 'atoms', { name: 'Atoms', labels: ['Cu'] }),
        atoms(ox, 0.24, TONE.O, 'atoms', { labels: ox.map((_, i) => `O ${i + 1}`) }),
        lobeMesh(set.cu[0], set.cu[1], [0, 0, 0], 1.35, { group: 'cu-d', name: 'Cu 3d shape' }),
        ...set.o.map((o, i) =>
          lobeMesh(1, o.m, scale(E[o.at]!, o.sg * d), 0.85, {
            group: 'o-p',
            ...(i === 0 ? { name: 'O 2p shapes' } : {}),
            opacity: 0.75,
          }),
        ),
        ...axesLayers(d + 1.2, ['x', 'y', 'z']),
        labels([{ text: set.label, at: [0, 0, d + 1.6] }], 'labels'),
      ];
      const describe =
        `The CuO6 octahedron of the cubic cell (Cu-O ${fmt(d, 2)} Å) with angular shapes of the orbitals the projected DOS separates. ${set.text} ` +
        "Orange and blue mark the sign of each shape. These are drawings of orbital shapes, not computed characters of LaCuO3; the projections come from the author's runs, awaiting results.";
      return {
        layers,
        describe,
        camera: 'iso',
        ortho: true,
        lattice: CUBIC_ROWS,
        readouts: [
          { label: 'Orbital pair', value: set.label },
          { label: 'Cu-O bond', value: `${fmt(d, 2)} Å` },
          { label: 'Projection tag', value: 'LORBIT = 11' },
          { label: 'Computed characters', value: 'awaiting results' },
        ],
      };
    }
    if (panel === 'bands') {
      // the path unrolled along x (real lengths, 1/Angstrom, times 4), spin up and spin down panels side by side in y
      const sx = 4;
      const H = 6;
      const layers: Layer[] = [];
      const ticks: [Vec3, Vec3][] = [];
      const items: { text: string; at: Vec3 }[] = [];
      let x = 0;
      const mark = (at: number, text: string) => {
        for (const y of [0, 2])
          ticks.push([
            [at, y, -H / 2],
            [at, y, H / 2],
          ]);
        items.push({ text, at: [at, -0.6, -H / 2 - 0.4] });
      };
      SEGMENTS.forEach((s, i) => {
        const prev = SEGMENTS[i - 1];
        const joined = prev && prev.to !== s.from;
        if (i === 0) mark(0, show(s.from));
        else if (joined) items[items.length - 1]!.text = `${show(prev.to)}|${show(s.from)}`;
        x += s.length * sx;
        mark(x, show(s.to));
      });
      for (const [y, name] of [
        [0, 'Spin up panel'],
        [2, 'Spin down panel'],
      ] as const)
        layers.push(
          quadLayer([0, y, -H / 2], [x, 0, 0], [0, 0, H], {
            group: 'panels',
            name,
            color: 'muted',
            opacity: 0.1,
          }),
        );
      layers.push(
        lines(ticks, 'muted', 'ticks', { name: 'High-symmetry points' }),
        lines(
          [
            [
              [0, 0, 0],
              [x, 0, 0],
            ],
            [
              [0, 2, 0],
              [x, 2, 0],
            ],
          ],
          'accent',
          'fermi',
          { name: 'Fermi level (E - E_F = 0)', dashed: true },
        ),
      );
      if (cur) {
        const start = SEGMENTS.slice(0, seg - 1).reduce((s, q) => s + q.length * sx, 0);
        layers.push(
          quadLayer([start, -0.01, -H / 2], [cur.length * sx, 0, 0], [0, 0, H], {
            group: 'segment',
            name: 'Highlighted segment',
            color: 'pos',
            opacity: 0.18,
          }),
        );
      }
      items.push({ text: 'awaiting results (ongoing research)', at: [x / 2, 1, H / 2 + 0.7] });
      layers.push(
        labels(items.slice(0, 12), 'labels'),
        ...axesLayers([x + 1, 3, H / 2 + 0.5], ['k along the path', 'spin up, then down', 'E - E_F']),
      );
      const describe =
        `The panel the band structure will fill: the path ${pathText} unrolled along x with its real segment lengths (${fmt(total, 2)} per Angstrom in all), one panel for spin up and one for spin down, the Fermi level dashed. ` +
        'No bands are drawn: the band structure of LaCuO3 is awaiting results from ongoing research.' +
        (cur ? ` The ${say(cur.from)} to ${say(cur.to)} segment is shaded.` : '');
      return {
        layers,
        describe,
        camera: { eye: [0.2, -1.6, 0.5] },
        axes: ['k along the path (1/Å, x4)', 'spin channel', 'E - E_F (awaiting results)'],
        readouts: [
          { label: 'Path', value: pathText },
          { label: 'Path length', value: `${fmt(total, 3)} 1/Å` },
          { label: 'Segment', value: cur ? `${say(cur.from)} to ${say(cur.to)}` : 'whole path' },
          { label: 'Bands', value: 'awaiting results' },
        ],
      };
    }
    const bz = brillouinLayers(CUBIC.lattice, { group: 'zone' }).layers;
    const segPts = SEGMENTS.map((s) => [s.a, s.b] as [Vec3, Vec3]);
    const layers: Layer[] = [
      ...bz,
      lines(segPts, 'accent', 'path', { name: 'Band path', tube: 0.012 }),
      points(
        Object.values(CUBIC_PATH.points).map((q) =>
          v3(qToCartesian(q, rowsOf(reciprocalLattice(CUBIC.lattice)))),
        ),
        'ink',
        0.035,
        'points',
        { name: 'High-symmetry points', labels: Object.keys(CUBIC_PATH.points).map(say) },
      ),
      labels(
        Object.entries(CUBIC_PATH.points).map(([k, q]) => ({
          text: show(k),
          at: add(v3(qToCartesian(q, rowsOf(reciprocalLattice(CUBIC.lattice)))), [0.05, -0.05, 0.08]),
        })),
        'labels',
      ),
      ...axesLayers(1.25 * (Math.PI / A_CUBIC), ['kx', 'ky', 'kz']),
    ];
    if (cur)
      layers.push(
        arrows([cur.a], [sub(cur.b, cur.a)], 'pos', 'segment', {
          name: 'Highlighted segment',
          thickness: 0.03,
        }),
      );
    const zone = brillouinZone(reciprocalLattice(CUBIC.lattice));
    const describe =
      `The Brillouin zone of the cubic LaCuO3 cell, a cube with ${zone.faces.length} faces and edge ${fmt((2 * Math.PI) / A_CUBIC, 3)} per Angstrom, with the band path of the page: ${pathText}, ${SEGMENTS.length} segments and ${fmt(total, 3)} per Angstrom in all. ` +
      (cur
        ? `The arrow marks segment ${seg}, from ${say(cur.from)} to ${say(cur.to)}, ${fmt(cur.length, 3)} per Angstrom long.`
        : 'Step through the segments to follow the path.') +
      ' The bands along it are awaiting results.';
    return {
      layers,
      describe,
      camera: 'iso',
      ortho: true,
      axes: ['kx (1/Å)', 'ky (1/Å)', 'kz (1/Å)'],
      readouts: [
        { label: 'Path', value: pathText },
        { label: 'Zone edge 2 pi/a', value: `${fmt((2 * Math.PI) / A_CUBIC, 3)} 1/Å` },
        {
          label: 'Segment',
          value: cur ? `${say(cur.from)} to ${say(cur.to)}, ${fmt(cur.length, 3)} 1/Å` : 'whole path',
        },
        { label: 'Bands', value: 'awaiting results' },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// 6. What the example teaches: the pipeline as five stations on a path, the LaCuO3 cell at each one, and the loops that
//    send you back. Every readout names a check, never a result.

export const STATIONS = [
  {
    name: 'Structure',
    check: 'tolerance and octahedral factors screened, Cu3+ flagged as uncommon',
    uses: 'Shannon radii and the lanthanide sweep',
    back: 'never: it is the start',
  },
  {
    name: 'Inputs',
    check: 'POSCAR order, MAGMOM count and LDAU entries per species',
    uses: 'the cubic cell and the PAW set La, Cu_pv, O',
    back: 'a later step finds the wrong spin state',
  },
  {
    name: 'Convergence',
    check: 'ENCUT, k-mesh and the magnetic energy difference within 1 meV per atom',
    uses: 'static runs on the unrelaxed cell',
    back: 'the Cu moment jumps between settings',
  },
  {
    name: 'Relaxation',
    check: 'reached required accuracy, forces below EDIFFG, moments kept their signs',
    uses: 'converged settings, cubic then doubled cell',
    back: 'a G-type start flipped or collapsed',
  },
  {
    name: 'Electronic structure',
    check: 'same ISPIN, MAGMOM, LMAXMIX and LDAU as the SCF; gap judged against the reported metal',
    uses: 'the relaxed cell and its lowest-energy spin state',
    back: 'a wide gap in a reported metal sends you back to U',
  },
] as const;
const SPACING = 9;
const stationAt = (i: number): Vec3 => [i * SPACING, 0, i * 1.2];

function stationLayers(i: number, active: boolean): Layer[] {
  const op = active ? 1 : 0.35;
  const dim = (ls: Layer[]): Layer[] =>
    ls.map((l) =>
      l.kind === 'atoms'
        ? { ...l, opacity: op }
        : l.kind === 'mesh'
          ? { ...l, opacity: (l.opacity ?? 0.4) * op }
          : l,
    );
  const g = `station-${i + 1}`;
  const out: Layer[] = [];
  if (i === 3) {
    const D = DOUBLED;
    const pos = D.cart.map((x, k) => (D.species[k] === 'O' ? add(x, oxygenSeed(x, 0.02)) : x));
    out.push(
      atoms(
        pos,
        D.species.map((s) => (s === 'La' ? 0.7 : s === 'Cu' ? 0.45 : 0.3)),
        D.species.map((s) => TONE[s as keyof typeof TONE]),
        g,
        {
          labels: D.species.map((s, k) => `${s} ${k + 1}`),
        },
      ),
      lines(cellEdges(D.lattice), 'muted', g),
      arrows(
        pos.filter((_, k) => D.gSign[k] !== 0),
        D.gSign.filter((s) => s !== 0).map((s) => [0, 0, 1.4 * s] as Vec3),
        D.gSign.filter((s) => s !== 0).map((s) => (s > 0 ? 'pos' : 'neg')),
        g,
        { head: D.gSign.filter((s) => s !== 0).map((s) => (s > 0 ? 'solid' : 'open')), thickness: 0.06 },
      ),
    );
    return shifted(dim(out), sub(stationAt(i), [A_CUBIC, A_CUBIC / 2, 0]));
  }
  const c = crystalLayers(CUBIC, {
    boundary: true,
    radiusScale: 0.4,
    bonds: false,
    groups: { atoms: g, cell: g },
  });
  out.push(...c.layers);
  const cu: Vec3 = [A_CUBIC / 2, A_CUBIC / 2, A_CUBIC / 2];
  if (i === 0) {
    const ox = c.positions.filter(
      (q, k) => c.species[k] === 'O' && Math.abs(norm(sub(q, cu)) - A_CUBIC / 2) < 1e-6,
    );
    out.push(hullLayer(ox, { group: g, color: 'c1', opacity: 0.35 }));
  }
  if (i === 1) out.push(arrows([cu], [[0, 0, 3 * MAGMOM_SCALE]], 'pos', g, { thickness: 0.06 }));
  if (i === 2) {
    out.push(sphereLayer(cu, 1.1, { group: g, color: 'pos', opacity: 0.12, wireframe: true, segments: 14 }));
    const grid: Vec3[] = [];
    for (const a of [0, 1, 2, 3])
      for (const b of [0, 1, 2, 3])
        for (const z of [0, 1, 2, 3]) grid.push(add([A_CUBIC + 1, 0.4, 0.4], scale([a, b, z], 0.45)));
    out.push(points(grid, 'accent', 0.07, g));
  }
  if (i === 4) {
    const zone = brillouinLayers(CUBIC.lattice, { group: g, faces: false }).layers;
    const s = 1.4; // the zone as a glyph beside the cell, magnified
    const glyph = zone.map((l) =>
      l.kind === 'lines'
        ? { ...l, segments: l.segments.map(([a, b]) => [scale(a, s), scale(b, s)] as [Vec3, Vec3]) }
        : l,
    );
    const pts = SEGMENTS.flatMap((q) => [scale(q.a, s), scale(q.b, s)]);
    out.push(
      ...shifted(glyph, [A_CUBIC + 1.6, A_CUBIC / 2, A_CUBIC / 2]),
      ...shifted([curve(pts, 'accent', g, { tube: 0.03 })], [A_CUBIC + 1.6, A_CUBIC / 2, A_CUBIC / 2]),
    );
  }
  return shifted(dim(out), sub(stationAt(i), [A_CUBIC / 2, A_CUBIC / 2, 0]));
}

const pipeline: SceneDef = {
  id: 'm10-pipeline',
  title: 'The worked example as a pipeline of checks',
  badge: 'illustrative',
  sources: ['S-042', 'S-001', 'S-002', 'S-101', 'S-005'],
  params: [
    {
      kind: 'step',
      id: 'station',
      label: 'Station',
      min: 0,
      max: STATIONS.length - 1,
      value: 0,
      physics: true,
      interval: 1.5,
    },
    { kind: 'toggle', id: 'loops', label: 'Loops back', value: false, physics: true },
  ],
  build(p) {
    const k = Math.max(0, Math.min(STATIONS.length - 1, Math.round(Number(p.station))));
    const st = STATIONS[k]!;
    const layers: Layer[] = [];
    STATIONS.forEach((_, i) => layers.push(...stationLayers(i, i === k)));
    const road: Vec3[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * (STATIONS.length - 1);
      road.push([t * SPACING, 0, t * 1.2 - 1.2]);
    }
    layers.push(
      curve(road, 'muted', 'path', { name: 'The decision chain', tube: 0.08 }),
      ...STATIONS.map((_, i) =>
        quadLayer(add(stationAt(i), [-3.2, -3.2, -1.25]), [6.4, 0, 0], [0, 6.4, 0], {
          group: 'platforms',
          ...(i === 0 ? { name: 'Stations' } : {}),
          color: i === k ? 'accent' : 'muted',
          opacity: i === k ? 0.3 : 0.1,
        }),
      ),
      labels(
        STATIONS.map((s, i) => ({ text: `${i + 1} ${s.name}`, at: add(stationAt(i), [0, -3.8, -1.2]) })),
        'labels',
      ),
    );
    if (p.loops) {
      const arc = (from: number, to: number, h: number): Vec3[] =>
        Array.from({ length: 61 }, (_, j) => {
          const t = j / 60;
          const a = stationAt(from);
          const b = stationAt(to);
          return [a[0] + (b[0] - a[0]) * t, 1.5, a[2] + (b[2] - a[2]) * t + 6 + h * Math.sin(Math.PI * t)];
        });
      layers.push(
        curve(arc(4, 1, 5), 'neg', 'loops', { name: 'Loops back', tube: 0.06 }),
        curve(arc(3, 1, 2.5), 'neg', 'loops', { tube: 0.06 }),
        curve(arc(2, 1, 1.2), 'neg', 'loops', { tube: 0.06 }),
        arrows([[SPACING + 0.4, 1.5, 7.2]], [[-0.4, 0, -0.8]], 'neg', 'loops', { head: 'open' }),
        labels(
          [
            { text: 'wide gap in a metal: back to U', at: [2.5 * SPACING, 1.5, 4 * 1.2 + 11.2] },
            { text: 'moment flipped: back to the spin starts', at: [2 * SPACING, 1.5, 3 * 1.2 + 8.8] },
          ],
          'loops',
        ),
      );
    }
    const describe =
      `The worked example as five stations on one path, each with the LaCuO3 cell it works on (the cubic cell, and the doubled cell at the relaxation station). ` +
      `Station ${k + 1}, ${st.name}, is lit: the check done there is ${st.check}; it uses ${st.uses}. ` +
      (p.loops
        ? 'The blue arcs above are the loops back: a moment that jumps or flips, or a wide gap in a reported metal, sends you back to the inputs. '
        : '') +
      'No result numbers are shown: the results come from ongoing research.';
    return {
      layers,
      describe,
      camera: { eye: [0.35, -1.6, 0.8] },
      readouts: [
        { label: 'Station', value: `${k + 1} of ${STATIONS.length}: ${st.name}` },
        { label: 'Check done', value: st.check },
        { label: 'Uses', value: st.uses },
        { label: 'Go back if', value: st.back },
      ],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [tolerance.id]: tolerance,
  [inputs.id]: inputs,
  [convergence.id]: convergence,
  [relaxation.id]: relaxation,
  [electronic.id]: electronic,
  [pipeline.id]: pipeline,
};
