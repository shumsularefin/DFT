// Module 6 (the VASP input and output files) scenes: each file shown as the object it encodes. POSCAR is the crystal it
// builds, KPOINTS the mesh it lays in the zone, INCAR the effect of a tag on a small model, POTCAR the radial functions of
// a PAW dataset revolved into 3D, and the output files as a map of what a run leaves behind.
// @source S-041 (Field Handbook: the file formats), S-019 (VASP wiki: POSCAR, KPOINTS, INCAR tags), S-007 (meshes)
import {
  irreducibleCount,
  meshPoints,
  meshSymmetryReport,
  qToCartesian,
  type Centering,
} from '../../crystal/kmesh';
import {
  cartToFrac,
  cellVolume,
  fracToCart,
  minimumImageDistance,
  reciprocalLattice,
} from '../../crystal/lattice';
import { latticePointGroup } from '../../crystal/pointgroup';
import type { Mat3, Structure } from '../../crystal/types';
import { allElectronLike, augmentation, nodeCount, pseudo } from '../../physics/paw';
import { cutoffRadius, gVectorsWithin } from '../../physics/planewaves';
import { occupation, SMEARINGS, type SmearingId } from '../../physics/smearing';
import { lookupStructure } from '../../scene/library';
import {
  arrows,
  atoms,
  axesLayers,
  brillouinLayers,
  cellEdges,
  crystalLayers,
  curve,
  fmt,
  graph1d,
  labels,
  lines,
  points,
  sphereLayer,
  surfaceLayer,
} from '../kit';
import { add, norm, scale, sub } from '../math';
import type { AtomsLayer, Color, Layer, MeshLayer, SceneDef, Vec3 } from '../types';
import { boxMesh } from './blocks';

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const mat = (rows: readonly (readonly number[])[]): Mat3 =>
  [v3(rows[0]!), v3(rows[1]!), v3(rows[2]!)] as unknown as Mat3;
const rowsOf = (m: Mat3): [Vec3, Vec3, Vec3] => [v3(m[0]), v3(m[1]), v3(m[2])];

// ---------------------------------------------------------------------------------------------------------------------
// POSCAR: the crystal the file describes, with the line being read highlighted.

interface PoscarFile {
  label: string;
  comment: string;
  /** Line 2. */
  scale: number;
  /** Lines 3 to 5, in units of the scaling factor. */
  rows: Vec3[];
  species: string[];
  frac: Vec3[];
}

function fromLibrary(id: string, label: string, comment: string): PoscarFile {
  const s = lookupStructure(id)!;
  return { label, comment, scale: 1, rows: s.lattice.map(v3), species: [...s.species], frac: s.frac.map(v3) };
}

/** The topic's own example (poscar.mdx) and three library cells written with scaling factor 1 and vectors in Angstrom. */
export const POSCAR_FILES: Record<string, PoscarFile> = {
  si: {
    label: 'Si, diamond (the topic example)',
    comment: 'Si diamond',
    scale: 5.43,
    rows: [
      [0, 0.5, 0.5],
      [0.5, 0, 0.5],
      [0.5, 0.5, 0],
    ],
    species: ['Si', 'Si'],
    frac: [
      [0, 0, 0],
      [0.25, 0.25, 0.25],
    ],
  },
  nacl: fromLibrary('rocksalt', 'NaCl, rock salt (conventional cell)', 'NaCl rock salt'),
  mg: fromLibrary('hcp', 'Mg, hexagonal close packed', 'Mg hcp'),
  srtio3: fromLibrary('perovskite', 'SrTiO3, cubic perovskite', 'SrTiO3 cubic perovskite'),
};

/** Element symbols (line 6) and counts (line 7) in the order of first appearance. */
export function speciesLines(species: readonly string[]): { names: string[]; counts: number[] } {
  const names: string[] = [];
  const counts: number[] = [];
  for (const e of species) {
    const i = names.indexOf(e);
    if (i < 0) {
      names.push(e);
      counts.push(1);
    } else counts[i]!++;
  }
  return { names, counts };
}

/** Atom positions in Angstrom for one reading of the coordinate block (S-041: Cartesian numbers are scaled too). */
export function poscarPositions(
  f: PoscarFile,
  s: number,
  reading: 'direct' | 'cartesian' | 'misread',
): Vec3[] {
  const lat = mat(f.rows.map((r) => scale(r, f.scale * s)));
  if (reading === 'misread') return f.frac.map((x) => scale(x, f.scale * s));
  return f.frac.map((x) => v3(fracToCart(x, lat)));
}

/** Shortest distance between two atoms, periodic images included (Angstrom). */
export function shortestDistance(lat: Mat3, cart: readonly Vec3[]): number {
  const fr = cart.map((c) => cartToFrac(c, lat));
  let best = Infinity;
  for (let i = 0; i < fr.length; i++)
    for (let j = i + 1; j < fr.length; j++) best = Math.min(best, minimumImageDistance(fr[i]!, fr[j]!, lat));
  for (const r of lat) best = Math.min(best, norm(v3(r)));
  return best;
}

const nums = (v: readonly number[], d = 4) => v.map((x) => fmt(x, d)).join('  ');

const poscar: SceneDef = {
  id: 'm06-poscar',
  title: 'POSCAR as the crystal it builds',
  badge: 'computed',
  sources: ['S-041', 'S-019'],
  params: [
    {
      kind: 'select',
      id: 'file',
      label: 'File',
      physics: true,
      value: 'si',
      options: Object.entries(POSCAR_FILES).map(([value, f]) => ({ value, label: f.label })),
    },
    {
      kind: 'select',
      id: 'line',
      label: 'Line being read',
      value: 'lattice',
      options: [
        { value: 'comment', label: 'Line 1: comment' },
        { value: 'scale', label: 'Line 2: scaling factor' },
        { value: 'lattice', label: 'Lines 3 to 5: lattice vectors' },
        { value: 'species', label: 'Lines 6 and 7: elements and counts' },
        { value: 'keyword', label: 'Line 8: Direct or Cartesian' },
        { value: 'positions', label: 'Line 9 on: one line per atom' },
      ],
    },
    {
      kind: 'slider',
      id: 'scale',
      label: 'Scaling factor, relative to the file',
      min: 0.85,
      max: 1.15,
      step: 0.01,
      value: 1,
      digits: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'reading',
      label: 'Coordinates',
      physics: true,
      value: 'direct',
      options: [
        { value: 'direct', label: 'Direct (fractional), read correctly' },
        { value: 'cartesian', label: 'Cartesian, read correctly' },
        { value: 'misread', label: 'Direct numbers read as Cartesian (the mistake)' },
      ],
    },
  ],
  build(p) {
    const f = POSCAR_FILES[String(p.file)] ?? POSCAR_FILES.si!;
    const s = Number(p.scale);
    const line = String(p.line);
    const reading = (
      ['direct', 'cartesian', 'misread'].includes(String(p.reading)) ? String(p.reading) : 'direct'
    ) as 'direct' | 'cartesian' | 'misread';
    const sc = f.scale * s;
    const lat = mat(f.rows.map((r) => scale(r, sc)));
    const latRows = rowsOf(lat);
    const pos = poscarPositions(f, s, reading);
    const structure: Structure = {
      lattice: lat,
      species: f.species,
      frac: pos.map((c) => cartToFrac(c, lat)),
    };
    const { layers } = crystalLayers(structure, { bonds: reading !== 'misread' });
    const atomLayer = layers[0] as AtomsLayer;
    atomLayer.labels = f.species.map((e, i) => `${e}, POSCAR line ${9 + i}`);
    const { names, counts } = speciesLines(f.species);
    const V = cellVolume(lat);
    const dmin = shortestDistance(lat, pos);
    const dRight = shortestDistance(lat, poscarPositions(f, s, 'direct'));
    const tones: Color[] = ['pos', 'neg', 'accent'];
    layers.push(
      arrows(
        [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
        latRows,
        tones,
        'vectors',
        {
          name: 'Lattice vectors',
          thickness: line === 'lattice' ? 0.035 : 0.018,
        },
      ),
    );
    const items: { text: string; at: Vec3 }[] = [];
    const last = f.frac.length - 1;
    const centre = scale(add(add(latRows[0], latRows[1]), latRows[2]), 0.5);
    let lineNo = '1';
    let text = f.comment;
    let focus: string;
    if (line === 'comment') {
      items.push({
        text: `"${f.comment}" (free text, ignored by VASP)`,
        at: add(centre, [0, 0, norm(latRows[2]) * 0.8]),
      });
      focus = 'Line 1 is a comment: VASP prints it but nothing in the structure depends on it.';
    } else if (line === 'scale') {
      lineNo = '2';
      text = fmt(sc, 4);
      const file = mat(f.rows.map((r) => scale(r, f.scale)));
      layers.push(lines(cellEdges(file), 'muted', 'ghost', { name: 'Cell at the file value', dashed: true }));
      items.push({ text: `scaling factor ${fmt(sc, 3)}`, at: add(latRows[0], latRows[1]) });
      focus =
        `Line 2 multiplies every lattice vector by ${fmt(sc, 3)}` +
        (Math.abs(s - 1) > 1e-9
          ? `, ${fmt((s - 1) * 100, 0)} percent from the file value ${fmt(f.scale, 3)}, so every length changes by that factor and the volume by its cube; the dashed cell is the file value.`
          : ', the value in the file; move the slider to see every length scale together.');
    } else if (line === 'lattice') {
      lineNo = '3 to 5';
      text = f.rows.map((r) => nums(r)).join(' / ');
      latRows.forEach((r, i) => items.push({ text: `a${i + 1} (line ${3 + i})`, at: scale(r, 1.08) }));
      focus = `Lines 3 to 5 are the cell vectors a1, a2, a3 (arrows), ${latRows.map((r) => fmt(norm(r), 3)).join(', ')} Angstrom long after scaling.`;
    } else if (line === 'species') {
      lineNo = '6 and 7';
      text = `${names.join(' ')} / ${counts.join(' ')}`;
      let k = 0;
      names.forEach((e, i) => {
        items.push({ text: `${e} x ${counts[i]}`, at: add(pos[k]!, [0, 0, 0.6]) });
        k += counts[i]!;
      });
      atomLayer.highlight = f.species.map((_, i) => i).filter((i) => f.species[i] === names[0]);
      focus = `Line 6 names the elements (${names.join(', ')}) in the order the POTCAR must follow, and line 7 counts them (${counts.join(', ')}); the outlined atoms are the first element.`;
    } else if (line === 'keyword') {
      lineNo = '8';
      text = reading === 'cartesian' ? 'Cartesian' : 'Direct';
      const away = pos.filter((q) => norm(q) > 1e-6);
      layers.push(
        arrows(
          away.map(() => [0, 0, 0] as Vec3),
          away,
          'muted',
          'path',
          { name: 'Position vectors', thickness: 0.015 },
        ),
      );
      items.push({ text: `"${text}"`, at: add(centre, [0, 0, norm(latRows[2]) * 0.8]) });
      focus =
        reading === 'misread'
          ? 'Line 8 says Direct, but the numbers are read as Cartesian (in units of the scaling factor), so every atom lands near the origin.'
          : `Line 8 says ${text}: the numbers below are ${text === 'Direct' ? 'fractions of a1, a2, a3' : 'Cartesian coordinates times the scaling factor'}. The arrows go from the origin to each atom.`;
    } else {
      lineNo = String(9 + last);
      const fr = f.frac[last]!;
      text = reading === 'cartesian' ? nums(scale(pos[last]!, 1 / sc)) : nums(fr);
      atomLayer.highlight = [last];
      if (reading !== 'misread') {
        const p1 = scale(latRows[0], fr[0]);
        const p2 = add(p1, scale(latRows[1], fr[1]));
        const p3 = add(p2, scale(latRows[2], fr[2]));
        layers.push(
          curve([[0, 0, 0], p1, p2, p3], 'accent', 'path', { name: 'f1 a1 + f2 a2 + f3 a3', tube: 0.04 }),
        );
        items.push({ text: `${fmt(fr[0], 3)} a1`, at: scale(p1, 0.5) });
        items.push({ text: `+ ${fmt(fr[1], 3)} a2`, at: scale(add(p1, p2), 0.5) });
        items.push({ text: `+ ${fmt(fr[2], 3)} a3`, at: scale(add(p2, p3), 0.5) });
      }
      focus =
        reading === 'misread'
          ? `The last line, ${text}, is placed at ${nums(pos[last]!, 2)} Angstrom instead of its true site.`
          : `The last atom line, ${text}, puts ${f.species[last]} at r = ${fmt(fr[0], 3)} a1 + ${fmt(fr[1], 3)} a2 + ${fmt(fr[2], 3)} a3 = (${nums(pos[last]!, 2)}) Angstrom; the tube walks that sum.`;
    }
    if (items.length) layers.push(labels(items, 'labels'));
    const describe =
      `${f.label}: a cell of ${f.species.length} atoms (${names.map((e, i) => `${counts[i]} ${e}`).join(', ')}), volume ${fmt(V, 2)} cubic Angstrom. ` +
      `${focus} The shortest distance between atoms is ${fmt(dmin, 2)} Angstrom` +
      (reading === 'misread' ? ` (it is ${fmt(dRight, 2)} Angstrom when read as Direct).` : '.');
    return {
      layers,
      describe,
      lattice: latRows,
      ortho: true,
      camera: 'iso',
      readouts: [
        { label: `Line ${lineNo}`, value: text },
        { label: 'Scaling factor', value: fmt(sc, 3) },
        { label: 'Cell volume', value: `${fmt(V, 2)} A^3` },
        { label: 'Shortest distance', value: `${fmt(dmin, 2)} A` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// KPOINTS: the mesh an automatic KPOINTS file lays in the Brillouin zone.

export const KPOINT_LATTICES: Record<string, { label: string; lattice: Mat3 }> = {
  si: {
    label: 'Si, fcc primitive cell (a = 5.43 A)',
    lattice: mat([
      [0, 2.715, 2.715],
      [2.715, 0, 2.715],
      [2.715, 2.715, 0],
    ]),
  },
  sc: { label: 'Simple cubic (a = 3.35 A)', lattice: lookupStructure('sc')!.lattice },
  bcc: {
    label: 'Fe, bcc primitive cell (a = 2.87 A)',
    lattice: mat([
      [-1.435, 1.435, 1.435],
      [1.435, -1.435, 1.435],
      [1.435, 1.435, -1.435],
    ]),
  },
  hcp: { label: 'Mg, hexagonal (a = 3.21 A, c = 5.21 A)', lattice: lookupStructure('hcp')!.lattice },
};

/** Divisions from n along a1 with the rule N_i |a_i| about constant (kpoints.mdx, S-041). */
export function meshFor(lattice: Mat3, n: number): [number, number, number] {
  const a = lattice.map((r) => norm(v3(r)));
  return [0, 1, 2].map((i) => Math.max(1, Math.round((n * a[0]!) / a[i]!))) as [number, number, number];
}

/**
 * Fold a k-point of the cell (-1/2, 1/2] into the first Brillouin zone: add the reciprocal lattice vector, with
 * coefficients -1, 0 or 1 (enough for the reduced cells drawn here), that makes it shortest.
 */
export function foldToZone(k: Vec3, b: readonly Vec3[]): Vec3 {
  let best = k;
  let bn = norm(k);
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (let l = -1; l <= 1; l++) {
        const q = add(k, add(add(scale(b[0]!, i), scale(b[1]!, j)), scale(b[2]!, l)));
        const qn = norm(q);
        if (qn < bn - 1e-9) {
          bn = qn;
          best = q;
        }
      }
  return best;
}

const groups = new Map<string, ReturnType<typeof latticePointGroup>>();
const groupOf = (id: string, lattice: Mat3) => {
  if (!groups.has(id)) groups.set(id, latticePointGroup(lattice));
  return groups.get(id)!;
};

const meshCache = new Map<string, ReturnType<typeof computeMesh>>();
function computeMesh(id: string, n: [number, number, number], centering: Centering, fold: boolean) {
  const L = KPOINT_LATTICES[id]!;
  const rec = rowsOf(reciprocalLattice(L.lattice));
  const mesh = meshPoints(n, centering);
  const rot = groupOf(id, L.lattice);
  const red = irreducibleCount(n, centering, rot);
  const sym = meshSymmetryReport(n, centering, rot);
  const ks: Vec3[] = [];
  let hasGamma = false;
  for (let i = 0; i < mesh.count; i++) {
    const q: Vec3 = [mesh.coords[3 * i]!, mesh.coords[3 * i + 1]!, mesh.coords[3 * i + 2]!];
    if (q.every((x) => Math.abs(x) < 1e-12)) hasGamma = true;
    const k = v3(qToCartesian(q, rec));
    ks.push(fold ? foldToZone(k, rec) : k);
  }
  return { red, sym, ks, hasGamma };
}
function meshOf(id: string, n: [number, number, number], centering: Centering, fold: boolean) {
  const key = `${id}|${n.join('x')}|${centering}|${fold}`;
  if (!meshCache.has(key)) meshCache.set(key, computeMesh(id, n, centering, fold));
  return meshCache.get(key)!;
}

const kpoints: SceneDef = {
  id: 'm06-kpoints',
  title: 'KPOINTS as the mesh it lays in the zone',
  badge: 'computed',
  sources: ['S-007', 'S-032', 'S-041', 'S-019'],
  params: [
    {
      kind: 'select',
      id: 'lattice',
      label: 'Crystal',
      physics: true,
      value: 'si',
      options: Object.entries(KPOINT_LATTICES).map(([value, l]) => ({ value, label: l.label })),
    },
    {
      kind: 'slider',
      id: 'n',
      label: 'Subdivisions along b1 (line 4)',
      min: 1,
      max: 10,
      step: 1,
      value: 4,
      physics: true,
    },
    {
      kind: 'select',
      id: 'centering',
      label: 'Line 3',
      physics: true,
      value: 'gamma',
      options: [
        { value: 'gamma', label: 'Gamma' },
        { value: 'monkhorst-pack', label: 'Monkhorst-Pack' },
      ],
    },
    { kind: 'toggle', id: 'fold', label: 'Fold the points into the first zone', value: true, physics: true },
    { kind: 'toggle', id: 'irreducible', label: 'Mark the irreducible points', value: true },
  ],
  build(p) {
    const id = String(p.lattice) in KPOINT_LATTICES ? String(p.lattice) : 'si';
    const L = KPOINT_LATTICES[id]!;
    const n = meshFor(L.lattice, Number(p.n));
    const centering = (p.centering === 'monkhorst-pack' ? 'monkhorst-pack' : 'gamma') as Centering;
    const rec = rowsOf(reciprocalLattice(L.lattice));
    const { red, sym, ks, hasGamma } = meshOf(id, n, centering, Boolean(p.fold));
    const bmax = Math.max(...rec.map(norm));
    const dot = bmax * 0.025;
    const { layers } = brillouinLayers(L.lattice);
    layers.push(points(ks, 'muted', dot, 'mesh', { name: 'Mesh points' }));
    if (p.irreducible) {
      const reps = red.representatives.map((r) => ks[r.index]!);
      layers.push(
        atoms(reps, dot * 1.9, 'pos', 'irreducible', {
          name: 'Irreducible points',
          labels: red.representatives.map((r) => `weight ${r.size} of ${red.total}`),
        }),
      );
    }
    const corner = scale(add(add(rec[0], rec[1]), rec[2]), -0.5);
    layers.push(lines(cellEdges(rec, corner), 'muted', 'cell', { name: 'Reciprocal cell', dashed: true }));
    layers.push(
      arrows(
        [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
        rec,
        ['pos', 'neg', 'accent'],
        'vectors',
        { name: 'b1, b2, b3', thickness: 0.02 },
      ),
    );
    layers.push(
      labels(
        [
          ...rec.map((b, i) => ({ text: `b${i + 1}`, at: scale(b, 1.08) })),
          {
            text: hasGamma ? 'Gamma (a mesh point)' : 'Gamma (not in the mesh)',
            at: [0, 0, -bmax * 0.12] as Vec3,
          },
        ],
        'labels',
      ),
    );
    layers.push(
      atoms([[0, 0, 0]], dot * 1.2, 'ink', 'gamma', {
        name: 'Gamma',
        labels: ['Gamma'],
        opacity: hasGamma ? 1 : 0.4,
      }),
    );
    const mtxt = n.join(' x ');
    const describe =
      `${L.label}: a ${centering === 'gamma' ? 'Gamma-centred' : 'Monkhorst-Pack'} ${mtxt} mesh, ${red.total} points ` +
      `${p.fold ? 'folded into the first Brillouin zone' : 'in the reciprocal cell'}, of which ${red.irreducible} are irreducible under the lattice symmetry. ` +
      `${hasGamma ? 'The zone centre Gamma is a mesh point.' : 'The mesh is shifted, so Gamma is not a mesh point.'} ` +
      (sym.symmetric
        ? 'Every symmetry operation of the lattice maps the mesh onto itself.'
        : `${sym.failing} of ${sym.of} symmetry operations send some points off the mesh, so this mesh breaks the symmetry.`);
    return {
      layers,
      describe,
      lattice: rowsOf(L.lattice),
      ortho: true,
      camera: 'iso',
      readouts: [
        { label: 'Line 4', value: n.join(' ') },
        { label: 'Points', value: String(red.total) },
        { label: 'Irreducible', value: String(red.irreducible) },
        {
          label: 'Symmetric',
          value: sym.symmetric ? 'yes' : `no (${sym.failing} of ${sym.of} operations fail)`,
        },
      ],
      axes: ['kx (1/A)', 'ky (1/A)', 'kz (1/A)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// INCAR: one tag group at a time, each on the object it changes.

const SI_PRIM = KPOINT_LATTICES.si!.lattice;
const gCache = new Map<number, ReturnType<typeof gVectorsWithin>>();
const gSet = (encut: number) => {
  if (!gCache.has(encut)) gCache.set(encut, gVectorsWithin(SI_PRIM, encut));
  return gCache.get(encut)!;
};

const SMEAR_OPTIONS = SMEARINGS.filter((s) => s.ismear !== null);

/** The MAGMOM line of the two-atom bcc Fe cell for a moment m (Bohr magneton) and an ordering. */
export function magmomLine(m: number, order: 'ferro' | 'antiferro'): { text: string; moments: number[] } {
  const moments = order === 'ferro' ? [m, m] : [m, -m];
  const text = order === 'ferro' ? `MAGMOM = 2*${fmt(m, 1)}` : `MAGMOM = ${fmt(m, 1)} ${fmt(-m, 1)}`;
  return { text, moments };
}

const incar: SceneDef = {
  id: 'm06-incar',
  title: 'INCAR tags on the systems they change',
  badge: 'computed',
  sources: ['S-019', 'S-041', 'S-049', 'S-031', 'S-015', 'S-016'],
  params: [
    {
      kind: 'select',
      id: 'tag',
      label: 'Tag group',
      physics: true,
      value: 'encut',
      options: [
        { value: 'encut', label: 'ENCUT: the plane-wave sphere' },
        { value: 'ismear', label: 'ISMEAR and SIGMA: occupations' },
        { value: 'ispin', label: 'ISPIN and MAGMOM: starting moments' },
      ],
    },
    {
      kind: 'slider',
      id: 'encut',
      label: 'ENCUT',
      unit: 'eV',
      min: 150,
      max: 700,
      step: 10,
      value: 400,
      physics: true,
    },
    {
      kind: 'select',
      id: 'ismear',
      label: 'ISMEAR',
      physics: true,
      value: 'gaussian',
      options: SMEAR_OPTIONS.map((s) => ({ value: s.id, label: `${s.ismear}: ${s.label}` })),
    },
    {
      kind: 'slider',
      id: 'sigma',
      label: 'SIGMA',
      unit: 'eV',
      min: 0.02,
      max: 0.5,
      step: 0.01,
      value: 0.2,
      digits: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'ispin',
      label: 'ISPIN',
      physics: true,
      value: '2',
      options: [
        { value: '1', label: '1: no spin polarisation' },
        { value: '2', label: '2: spin polarised' },
      ],
    },
    {
      kind: 'slider',
      id: 'magmom',
      label: 'MAGMOM per atom',
      unit: 'Bohr magneton',
      min: 0,
      max: 5,
      step: 0.5,
      value: 3,
      digits: 1,
      physics: true,
    },
    {
      kind: 'select',
      id: 'order',
      label: 'Starting order',
      physics: true,
      value: 'ferro',
      options: [
        { value: 'ferro', label: 'Ferromagnetic' },
        { value: 'antiferro', label: 'Antiferromagnetic' },
      ],
    },
  ],
  build(p) {
    const tag = String(p.tag);
    if (tag === 'ismear') {
      const id = (SMEAR_OPTIONS.find((s) => s.id === p.ismear) ?? SMEAR_OPTIONS[1]!).id as SmearingId;
      const meta = SMEARINGS.find((s) => s.id === id)!;
      const sigma = Number(p.sigma);
      // scene units: x = 5 per eV of E - E_F, y = 20 per eV of SIGMA, z = 4 per unit of occupation
      const occ = (e: number, sg: number) => occupation(id, e / sg);
      const surf = surfaceLayer((X, Y) => 4 * occ(X / 5, Y / 20), [-5, 5], [0.4, 10], 60, 40, {
        group: 'surface',
        name: 'Occupation over energy and SIGMA',
        opacity: 0.85,
      });
      const cut = graph1d(
        (X) => 4 * occ(X / 5, sigma),
        -5,
        5,
        200,
        (x, z) => [x, 20 * sigma, z],
      );
      let fmax = -Infinity;
      let fmin = Infinity;
      for (let i = 0; i <= 400; i++) {
        const f = occ(-1 + (2 * i) / 400, sigma);
        fmax = Math.max(fmax, f);
        fmin = Math.min(fmin, f);
      }
      const layers: Layer[] = [
        surf,
        curve(cut, 'accent', 'cut', { name: 'Occupation at this SIGMA', tube: 0.07 }),
        lines(
          [
            [
              [-5, 20 * sigma, 4],
              [5, 20 * sigma, 4],
            ],
            [
              [-5, 20 * sigma, 0],
              [5, 20 * sigma, 0],
            ],
            [
              [0, 0.4, 0],
              [0, 10, 0],
            ],
          ],
          'muted',
          'guides',
          { name: 'f = 0, f = 1 and the Fermi level', dashed: true },
        ),
        ...axesLayers([10.5, 10.5, 5], ['E - E_F', 'SIGMA', 'occupation'], [-5, 0, 0]),
        labels(
          [
            { text: 'E_F', at: [0, 10.4, 0] },
            { text: `SIGMA = ${fmt(sigma, 2)} eV`, at: [5.3, 20 * sigma, 0.5] },
          ],
          'labels',
        ),
      ];
      const over = fmax > 1 + 1e-6 || fmin < -1e-6;
      return {
        layers,
        describe:
          `ISMEAR = ${meta.ismear} (${meta.label}): the occupation of a level as a surface over its energy relative to the Fermi level (-1 to 1 eV, across) and SIGMA (0.02 to 0.5 eV, depth). ` +
          `The tube is SIGMA = ${fmt(sigma, 2)} eV: the step from 1 to 0 is about ${fmt(2 * sigma, 2)} eV wide. ` +
          (over
            ? `The occupation runs from ${fmt(fmin, 3)} to ${fmt(fmax, 3)}, outside 0 to 1, which this method allows.`
            : 'The occupation stays between 0 and 1.'),
        readouts: [
          { label: 'ISMEAR', value: String(meta.ismear) },
          { label: 'SIGMA', value: `${fmt(sigma, 2)} eV` },
          { label: 'Largest occupation', value: fmt(fmax, 3) },
          { label: 'Smallest occupation', value: fmt(fmin, 3) },
        ],
        axes: ['E - E_F (5 units per eV)', 'SIGMA (20 units per eV)', 'occupation (4 units per 1)'],
        camera: 'iso',
      };
    }
    if (tag === 'ispin') {
      const fe = lookupStructure('bcc')!;
      const { layers, positions } = crystalLayers(fe, { repeat: [2, 2, 2] });
      const m = Number(p.magmom);
      const order = p.order === 'antiferro' ? 'antiferro' : 'ferro';
      const { text, moments } = magmomLine(m, order);
      const spin = p.ispin === '2';
      const net = moments.reduce((a, b) => a + b, 0);
      if (spin && m > 0) {
        // crystalLayers lists all copies of file atom 0 first, then all copies of atom 1 (8 copies each here)
        const copies = positions.length / fe.frac.length;
        const mom = positions.map((_, i) => moments[Math.floor(i / copies)]!);
        const vec = mom.map((x) => [0, 0, 0.32 * x] as Vec3);
        layers.push(
          arrows(
            positions.map((q, i) => sub(q, scale(vec[i]!, 0.5))),
            vec,
            mom.map((x) => (x >= 0 ? 'pos' : 'neg')),
            'spins',
            { name: 'Starting moments', head: mom.map((x) => (x >= 0 ? 'solid' : 'open')), thickness: 0.06 },
          ),
        );
      }
      layers.push(
        labels(
          [{ text: spin ? text : 'ISPIN = 1: MAGMOM is not used', at: [2.87, 2.87, 2 * 2.87 + 1.2] }],
          'labels',
        ),
      );
      return {
        layers,
        lattice: rowsOf(mat(fe.lattice.map((r) => scale(v3(r), 2)))),
        ortho: true,
        camera: 'iso',
        describe:
          `Body-centred cubic Fe, 2 x 2 x 2 copies of the two-atom cell. ` +
          (spin
            ? m > 0
              ? `ISPIN = 2 with ${text}: every corner atom starts at ${fmt(m, 1)} Bohr magneton (solid orange arrows) and every centre atom at ${fmt(moments[1]!, 1)}${moments[1]! < 0 ? ' (open blue arrows)' : ''}. The net starting moment is ${fmt(net, 1)} Bohr magneton per cell.`
              : 'ISPIN = 2 with MAGMOM = 0: the run starts with no moment, so a magnetic solution has nothing to grow from.'
            : 'ISPIN = 1: the run is not spin polarised, MAGMOM is not used and no moments are drawn.'),
        readouts: [
          { label: 'ISPIN', value: spin ? '2' : '1' },
          { label: 'MAGMOM line', value: spin ? text : 'not used' },
          { label: 'Net start moment', value: spin ? `${fmt(net, 1)} per cell` : '0' },
        ],
      };
    }
    const encut = Number(p.encut);
    const g = gSet(encut);
    const G: Vec3[] = [];
    for (let i = 0; i < g.vectors.length; i += 3)
      G.push([g.vectors[i]!, g.vectors[i + 1]!, g.vectors[i + 2]!]);
    const kc = cutoffRadius(encut);
    const layers: Layer[] = [
      points(G, 'accent', 0.16, 'gvectors', { name: 'Plane waves kept' }),
      sphereLayer([0, 0, 0], kc, {
        group: 'sphere',
        name: 'Cutoff sphere',
        color: 'muted',
        opacity: 0.18,
        wireframe: true,
        segments: 24,
      }),
      ...axesLayers(kc * 1.15, ['Gx', 'Gy', 'Gz']),
      labels([{ text: `radius ${fmt(kc, 2)} 1/A`, at: [kc * 0.75, -kc * 0.75, kc * 0.3] }], 'labels'),
    ];
    return {
      layers,
      camera: 'iso',
      axes: ['Gx (1/A)', 'Gy (1/A)', 'Gz (1/A)'],
      describe:
        `ENCUT = ${encut} eV on the Si primitive cell: every dot is a reciprocal lattice vector G with (hbar^2/2m)|G|^2 below ENCUT, the plane waves kept at the Gamma point. ` +
        `The sphere has radius ${fmt(kc, 2)} 1/Angstrom and holds ${g.count} plane waves; the count grows as ENCUT to the power 3/2.`,
      readouts: [
        { label: 'ENCUT', value: `${encut} eV` },
        { label: 'Sphere radius', value: `${fmt(kc, 2)} 1/A` },
        { label: 'Plane waves at Gamma', value: String(g.count) },
        { label: 'Continuum estimate', value: fmt(g.continuum, 0) },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// POTCAR: the radial functions of a PAW dataset, revolved into a surface, with the augmentation sphere.

const potcar: SceneDef = {
  id: 'm06-potcar',
  title: 'POTCAR: smooth and all-electron functions around the core',
  badge: 'toy-model',
  banner:
    'Schematic radial functions that show the PAW idea, not data for any element; real POTCAR contents are licensed and never shown here.',
  sources: ['S-008', 'S-009', 'S-041'],
  params: [
    {
      kind: 'slider',
      id: 'rc',
      label: 'Core radius rc',
      unit: 'a0',
      min: 1,
      max: 3,
      step: 0.1,
      value: 1.8,
      digits: 1,
      physics: true,
    },
    {
      kind: 'select',
      id: 'show',
      label: 'Functions',
      physics: true,
      value: 'both',
      options: [
        { value: 'both', label: 'Smooth (solid) and all-electron-like (wire)' },
        { value: 'pseudo', label: 'Smooth pseudo function only' },
        { value: 'ae', label: 'All-electron-like function only' },
        { value: 'aug', label: 'What the augmentation adds back' },
      ],
    },
    { kind: 'toggle', id: 'cut', label: 'Cut away the front half', value: true },
  ],
  build(p) {
    const rc = Number(p.rc);
    const show = String(p.show);
    const R = 6;
    const zs = 3; // height units per unit of the radial function
    const half = Boolean(p.cut);
    const yr: [number, number] = half ? [0, R] : [-R, R];
    // the function of r = |(x, y)|, held at its value at R in the corners of the square
    const rim = (g: (r: number) => number) => (x: number, y: number) => g(Math.min(Math.hypot(x, y), R));
    const ae = (r: number) => allElectronLike(r, rc);
    const aug = (r: number) => augmentation(r, rc);
    const layers: Layer[] = [];
    if (show === 'both' || show === 'pseudo')
      layers.push(
        surfaceLayer(rim(pseudo), [-R, R], yr, 56, half ? 28 : 56, {
          group: 'pseudo',
          name: 'Smooth pseudo function',
          zScale: zs,
          colormap: false,
          color: 'neg',
          opacity: 0.75,
        }),
      );
    if (show === 'both' || show === 'ae') {
      const m = surfaceLayer(rim(ae), [-R, R], yr, 56, half ? 28 : 56, {
        group: 'ae',
        name: 'All-electron-like function',
        zScale: zs,
        colormap: false,
        color: 'pos',
        opacity: show === 'ae' ? 0.8 : 0.9,
      });
      if (show === 'both') m.wireframe = true;
      layers.push(m);
    }
    if (show === 'aug')
      layers.push(
        surfaceLayer(rim(aug), [-R, R], yr, 56, half ? 28 : 56, {
          group: 'aug',
          name: 'Augmentation',
          zScale: zs,
          colormap: 'diverging',
          opacity: 0.85,
        }),
      );
    const prof = (g: (r: number) => number) => graph1d((x) => g(Math.abs(x)) * zs, -R, R, 240);
    if (show !== 'aug') {
      if (show !== 'ae')
        layers.push(curve(prof(pseudo), 'neg', 'profile', { name: 'Radial profiles', tube: 0.05 }));
      if (show !== 'pseudo') layers.push(curve(prof(ae), 'pos', 'profile', { tube: 0.035 }));
    } else layers.push(curve(prof(aug), 'accent', 'profile', { name: 'Radial profiles', tube: 0.05 }));
    layers.push(
      sphereLayer([0, 0, 0], rc, {
        group: 'core',
        name: 'Augmentation sphere rc',
        color: 'muted',
        opacity: 0.2,
        wireframe: true,
        segments: 20,
      }),
    );
    const ring: Vec3[] = [];
    for (let i = 0; i <= 96; i++) {
      const t = (2 * Math.PI * i) / 96;
      ring.push([rc * Math.cos(t), rc * Math.sin(t), pseudo(rc) * zs]);
    }
    layers.push(curve(ring, 'ink', 'core', { closed: true }));
    layers.push(...axesLayers([R * 1.05, R * 1.05, 5], ['x (a0)', 'y (a0)', 'value']));
    layers.push(
      labels(
        [
          { text: `rc = ${fmt(rc, 1)} a0`, at: [rc, 0, pseudo(rc) * zs + 0.6] },
          { text: 'nucleus', at: [0, 0, -0.4] },
        ],
        'labels',
      ),
    );
    const nAE = nodeCount(ae, rc);
    const nPS = nodeCount(pseudo, R);
    let maxOut = 0;
    for (let i = 0; i <= 200; i++) {
      const r = rc + ((R - rc) * i) / 200;
      maxOut = Math.max(maxOut, Math.abs(ae(r) - pseudo(r)));
    }
    const what =
      show === 'aug'
        ? 'the difference that the PAW augmentation adds back, which is non-zero only inside the sphere'
        : show === 'pseudo'
          ? 'the smooth pseudo function, the part the plane waves describe'
          : show === 'ae'
            ? 'the all-electron-like function, which wiggles near the nucleus'
            : 'the smooth pseudo function (solid blue) and the all-electron-like function (orange wire)';
    return {
      layers,
      camera: 'iso',
      axes: ['x (a0)', 'y (a0)', 'radial function (3 units per 1)'],
      describe:
        `A radial function revolved around the nucleus into a surface: ${what}. ` +
        `Inside the wire sphere of radius rc = ${fmt(rc, 1)} a0 the all-electron-like function has ${nAE} node${nAE === 1 ? '' : 's'} and the smooth one ${nPS}; ` +
        `outside rc they agree (largest difference ${fmt(maxOut, 4)}).`,
      readouts: [
        { label: 'rc', value: `${fmt(rc, 1)} a0` },
        { label: 'Nodes inside rc', value: `${nAE} all-electron, ${nPS} smooth` },
        { label: 'Difference beyond rc', value: fmt(maxOut, 4) },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// The output files: a map of what one run leaves behind, sorted by what you do with each file.

interface OutFile {
  name: string;
  shelf: 0 | 1 | 2;
  holds: string;
}
export const OUT_FILES: OutFile[] = [
  { name: 'CONTCAR', shelf: 0, holds: 'the latest geometry' },
  { name: 'WAVECAR', shelf: 0, holds: 'the wavefunctions' },
  { name: 'CHGCAR', shelf: 0, holds: 'the charge density' },
  { name: 'OSZICAR', shelf: 1, holds: 'one line per electronic and per ionic step' },
  { name: 'OUTCAR', shelf: 1, holds: 'the full log of every step' },
  { name: 'XDATCAR', shelf: 2, holds: 'the positions at every ionic step' },
  { name: 'DOSCAR', shelf: 2, holds: 'the density of states' },
  { name: 'EIGENVAL', shelf: 2, holds: 'band energies at every k-point' },
  { name: 'PROCAR', shelf: 2, holds: 'orbital projections (LORBIT of 10 or more)' },
  { name: 'vasprun.xml', shelf: 2, holds: 'the machine-readable record' },
];
const SHELVES = ['Restart from', 'Read to judge the run', 'Plot and analyse'];
const SHELF_TONES: Color[] = ['c0', 'c1', 'c2'];

/** Which files a run with these settings writes (output-files.mdx, S-041), and the records the stacked ones hold. */
export function outputsOf(o: {
  nsw: number;
  nelm: number;
  lwave: boolean;
  lcharg: boolean;
  lorbit: boolean;
}): {
  name: string;
  written: boolean;
  records: number;
}[] {
  return OUT_FILES.map((f) => {
    let written = true;
    if (f.name === 'WAVECAR') written = o.lwave;
    if (f.name === 'CHGCAR') written = o.lcharg;
    if (f.name === 'PROCAR') written = o.lorbit;
    // OSZICAR: one line per electronic step and one per ionic step; XDATCAR: one frame per ionic step
    const records = f.name === 'OSZICAR' ? o.nsw * (o.nelm + 1) : f.name === 'XDATCAR' ? o.nsw : 1;
    return { name: f.name, written, records };
  });
}

const outputs: SceneDef = {
  id: 'm06-outputs',
  title: 'The output files of one run',
  badge: 'illustrative',
  sources: ['S-041', 'S-019'],
  params: [
    {
      kind: 'slider',
      id: 'nsw',
      label: 'Ionic steps the run took',
      min: 1,
      max: 12,
      step: 1,
      value: 4,
      physics: true,
    },
    { kind: 'toggle', id: 'lwave', label: 'LWAVE = .TRUE.', value: true, physics: true },
    { kind: 'toggle', id: 'lcharg', label: 'LCHARG = .TRUE.', value: true, physics: true },
    { kind: 'toggle', id: 'lorbit', label: 'LORBIT = 11', value: false, physics: true },
    { kind: 'toggle', id: 'next', label: 'Show what the next run reads', value: true },
  ],
  build(p) {
    const nsw = Number(p.nsw);
    const nelm = 3; // drawing choice: three electronic lines per ionic step
    const files = outputsOf({
      nsw,
      nelm,
      lwave: Boolean(p.lwave),
      lcharg: Boolean(p.lcharg),
      lorbit: Boolean(p.lorbit),
    });
    const unit = 0.12; // height of one record in a stacked file
    const where = new Map<string, Vec3>();
    const solid: { c: Vec3; s: Vec3 }[][] = [[], [], []];
    const ghost: { c: Vec3; s: Vec3 }[] = [];
    const items: { text: string; at: Vec3 }[] = [];
    const count = [0, 0, 0];
    OUT_FILES.forEach((f, i) => {
      const st = files[i]!;
      const x = f.shelf * 3.2;
      const y = count[f.shelf]! * 1.6;
      count[f.shelf]!++;
      const stacked = f.name === 'OSZICAR' || f.name === 'XDATCAR';
      const h = stacked ? Math.max(0.3, st.records * unit) : 0.8;
      const box = { c: [x, y, h / 2] as Vec3, s: [1.2, 1.1, h] as Vec3 };
      if (st.written) solid[f.shelf]!.push(box);
      else ghost.push({ c: box.c, s: box.s });
      where.set(f.name, [x, y, h]);
      items.push({ text: st.written ? f.name : `${f.name} (not written)`, at: [x, y, h + 0.35] });
    });
    const layers: Layer[] = solid
      .map((b, k) =>
        b.length
          ? boxMesh(b, { group: `shelf${k}`, name: SHELVES[k], color: SHELF_TONES[k]!, opacity: 0.85 })
          : null,
      )
      .filter((l): l is MeshLayer => l !== null);
    if (ghost.length) {
      const g = boxMesh(ghost, {
        group: 'missing',
        name: 'Files not written',
        color: 'muted',
        opacity: 0.15,
      });
      g.wireframe = true;
      layers.push(g);
    }
    // the stacked files show their records as slabs: one per ionic step in XDATCAR, one per line in OSZICAR
    const seps: [Vec3, Vec3][] = [];
    for (const name of ['XDATCAR', 'OSZICAR']) {
      const at = where.get(name)!;
      const per = name === 'XDATCAR' ? 1 : nelm + 1;
      for (let s = 1; s < nsw; s++) {
        const z = s * per * unit;
        seps.push([
          [at[0] - 0.6, at[1] - 0.56, z],
          [at[0] + 0.6, at[1] - 0.56, z],
        ]);
      }
    }
    if (seps.length) layers.push(lines(seps, 'ink', 'records', { name: 'One slab per ionic step' }));
    const reads: string[] = [];
    if (p.next) {
      const nx: Vec3 = [3.2, 6.4, 0.6];
      layers.push(
        boxMesh([{ c: nx, s: [2.4, 1.2, 1.2] }], {
          group: 'next',
          name: 'The next run',
          color: 'accent',
          opacity: 0.6,
        }),
      );
      const from: Vec3[] = [];
      const vec: Vec3[] = [];
      for (const [name, what] of [
        ['CONTCAR', 'POSCAR'],
        ['WAVECAR', 'ISTART = 1'],
        ['CHGCAR', 'ICHARG = 1 or 11'],
      ] as const) {
        const st = files.find((f) => f.name === name)!;
        if (!st.written) continue;
        const a = where.get(name)!;
        const start: Vec3 = [a[0] + 0.6, a[1], a[2]];
        from.push(start);
        vec.push(sub(add(nx, [-1.2, 0, 0.3]), start));
        reads.push(`${name} as ${what}`);
      }
      if (from.length) layers.push(arrows(from, vec, 'accent', 'next', { thickness: 0.012 }));
      items.push({ text: 'next run', at: add(nx, [0, 0, 0.9]) });
    }
    layers.push(labels(items, 'labels'));
    const missing = files.filter((f) => !f.written).map((f) => f.name);
    const osz = files.find((f) => f.name === 'OSZICAR')!.records;
    return {
      layers,
      camera: 'iso',
      describe:
        `The files of a run with ${nsw} ionic step${nsw === 1 ? '' : 's'}, on three shelves: restart from (CONTCAR, WAVECAR, CHGCAR), read to judge (OSZICAR, OUTCAR), plot and analyse (XDATCAR, DOSCAR, EIGENVAL, PROCAR, vasprun.xml). ` +
        `XDATCAR stacks ${nsw} frame${nsw === 1 ? '' : 's'} and OSZICAR ${osz} lines (drawn with ${nelm} electronic steps per ionic step), while CONTCAR keeps only the latest geometry. ` +
        (missing.length ? `Not written: ${missing.join(', ')}. ` : 'Every file is written. ') +
        (p.next
          ? reads.length
            ? `The next run can read ${reads.join(', ')}.`
            : 'The next run can read nothing from this one.'
          : ''),
      readouts: [
        { label: 'XDATCAR frames', value: String(nsw) },
        { label: 'CONTCAR', value: 'latest geometry only' },
        { label: 'Not written', value: missing.length ? missing.join(', ') : 'none' },
      ],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [poscar.id]: poscar,
  [kpoints.id]: kpoints,
  [incar.id]: incar,
  [potcar.id]: potcar,
  [outputs.id]: outputs,
};

export { SHELVES };
