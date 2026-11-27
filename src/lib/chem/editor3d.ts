// Editing tools for molecule mode of the Material Builder: ring and group templates attached to an atom, bond
// orders, moving part of a molecule, setting a bond length, and measuring distances, angles and dihedrals.
// Geometry is the same heuristic as sketch3d.ts: bond lengths are sums of Cordero single-bond covalent radii
// (S-021) for every bond order, angles come from the electron-domain count, and template shapes come from the
// rough valence model in geom3d.ts. A drawing aid, not an optimised geometry: relax in VASP (ISIF = 2).
// @source S-021
import type { Vec3 } from '../crystal/types';
import { geometry3d } from './geom3d';
import type { MolGraph } from './molgraph';
import { neighbours, orderKey, orderOf, placeBonded, radiusOf } from './sketch3d';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => scale(a, 1 / (norm(a) || 1));

/** A molecule being edited: species, Cartesian positions (angstrom) and the bond orders that are not single. */
export interface EditMol {
  species: string[];
  positions: Vec3[];
  orders: Map<string, number>;
}

/** Rotate v about the unit axis k by angle t (Rodrigues). */
function rotate(v: Vec3, k: Vec3, t: number): Vec3 {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}
/** The rotation that takes unit vector a onto unit vector b, applied to v. */
function alignRotate(v: Vec3, a: Vec3, b: Vec3): Vec3 {
  const c = dot(a, b);
  if (c > 1 - 1e-9) return v;
  if (c < -1 + 1e-9) {
    const p = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
    return rotate(v, unit(p), Math.PI);
  }
  return rotate(v, unit(cross(a, b)), Math.acos(c));
}

// ------------------------------------------------------------ templates

/** A ring or group. The attach atom (index 0) has one open valence where it bonds to the molecule. */
export interface Fragment {
  id: string;
  label: string;
  kind: 'ring' | 'group';
  graph: MolGraph;
}

const ringXY = (n: number): [number, number][] =>
  Array.from({ length: n }, (_, i): [number, number] => [
    1.5 * Math.cos((2 * Math.PI * i) / n),
    1.5 * Math.sin((2 * Math.PI * i) / n),
  ]);
const ring = (els: string[], h: number[], order: 1 | 'aromatic'): MolGraph => ({
  atoms: els.map((el, i) => ({ el, charge: 0, hCount: h[i]! })),
  bonds: els.map((_, i) => ({ a: i, b: (i + 1) % els.length, order })),
  coords2d: ringXY(els.length),
});

/** Templates. In each, atom 0 is the attach atom and has one hydrogen fewer than the free molecule. */
export const FRAGMENTS: Fragment[] = [
  {
    id: 'benzene',
    label: 'Benzene ring',
    kind: 'ring',
    graph: ring(['C', 'C', 'C', 'C', 'C', 'C'], [0, 1, 1, 1, 1, 1], 'aromatic'),
  },
  {
    id: 'pyridine',
    label: 'Pyridine ring',
    kind: 'ring',
    graph: ring(['C', 'C', 'C', 'N', 'C', 'C'], [0, 1, 1, 0, 1, 1], 'aromatic'),
  },
  {
    id: 'cyclohexane',
    label: 'Cyclohexane',
    kind: 'ring',
    graph: ring(['C', 'C', 'C', 'C', 'C', 'C'], [1, 2, 2, 2, 2, 2], 1),
  },
  {
    id: 'cyclopentane',
    label: 'Cyclopentane',
    kind: 'ring',
    graph: ring(['C', 'C', 'C', 'C', 'C'], [1, 2, 2, 2, 2], 1),
  },
  {
    id: 'pyrrole',
    label: 'Pyrrole ring',
    kind: 'ring',
    graph: ring(['C', 'C', 'N', 'C', 'C'], [0, 1, 1, 1, 1], 'aromatic'),
  },
  {
    id: 'furan',
    label: 'Furan ring',
    kind: 'ring',
    graph: ring(['C', 'C', 'O', 'C', 'C'], [0, 1, 0, 1, 1], 'aromatic'),
  },
  {
    id: 'thiophene',
    label: 'Thiophene ring',
    kind: 'ring',
    graph: ring(['C', 'C', 'S', 'C', 'C'], [0, 1, 0, 1, 1], 'aromatic'),
  },
  {
    id: 'ch3',
    label: 'CH3 (methyl)',
    kind: 'group',
    graph: { atoms: [{ el: 'C', charge: 0, hCount: 3 }], bonds: [] },
  },
  {
    id: 'oh',
    label: 'OH (hydroxyl)',
    kind: 'group',
    graph: { atoms: [{ el: 'O', charge: 0, hCount: 1 }], bonds: [] },
  },
  {
    id: 'nh2',
    label: 'NH2 (amino)',
    kind: 'group',
    graph: { atoms: [{ el: 'N', charge: 0, hCount: 2 }], bonds: [] },
  },
  {
    id: 'cooh',
    label: 'COOH (carboxyl)',
    kind: 'group',
    graph: {
      atoms: [
        { el: 'C', charge: 0, hCount: 0 },
        { el: 'O', charge: 0, hCount: 0 },
        { el: 'O', charge: 0, hCount: 1 },
      ],
      bonds: [
        { a: 0, b: 1, order: 2 },
        { a: 0, b: 2, order: 1 },
      ],
      coords2d: [
        [0, 0],
        [0.75, 1.3],
        [0.75, -1.3],
      ],
    },
  },
  {
    id: 'cho',
    label: 'CHO (aldehyde)',
    kind: 'group',
    graph: {
      atoms: [
        { el: 'C', charge: 0, hCount: 1 },
        { el: 'O', charge: 0, hCount: 0 },
      ],
      bonds: [{ a: 0, b: 1, order: 2 }],
      coords2d: [
        [0, 0],
        [0.75, 1.3],
      ],
    },
  },
];

/**
 * The 3D shape of a template: atom 0 is the attach atom; orders hold every bond that is not single; `open` is
 * the unit vector from atom 0 along its open valence. The shape is built with a hydrogen on the open valence
 * (so the attach atom keeps its proper angles), and that hydrogen is then taken off.
 */
export function fragmentGeometry(id: string): EditMol & { open: Vec3 } {
  const full = fullFragment(id);
  // expandHydrogens puts atom 0's hydrogens first after the heavy atoms; the first of them is the stand-in.
  const heavy = FRAGMENTS.find((x) => x.id === id)!.graph.atoms.length;
  const open = unit(sub(full.positions[heavy]!, full.positions[0]!));
  return { ...removeAtom(full, heavy), open };
}

/** The template as a free molecule (the open valence capped with a hydrogen), centred on the origin. */
function fullFragment(id: string): EditMol {
  const f = FRAGMENTS.find((x) => x.id === id);
  if (!f) throw new RangeError(`Unknown template: ${id}`);
  const g: MolGraph = {
    ...f.graph,
    atoms: f.graph.atoms.map((a, i) => (i === 0 ? { ...a, hCount: a.hCount + 1 } : a)),
  };
  const r = geometry3d(g);
  const orders = new Map<string, number>();
  for (const b of r.graph.bonds) {
    const o = b.order === 'aromatic' ? 1.5 : b.order;
    if (o !== 1) orders.set(orderKey(b.a, b.b), o);
  }
  return { species: r.species, positions: r.positions, orders };
}

/** Remove atom k: positions shift down and bond-order keys follow. */
export function removeAtom(m: EditMol, k: number): EditMol {
  const orders = new Map<string, number>();
  for (const [key, o] of m.orders) {
    const [a, b] = key.split('-').map(Number) as [number, number];
    if (a === k || b === k) continue;
    orders.set(orderKey(a > k ? a - 1 : a, b > k ? b - 1 : b), o);
  }
  return {
    species: m.species.filter((_, i) => i !== k),
    positions: m.positions.filter((_, i) => i !== k),
    orders,
  };
}

/** The template on its own, with a hydrogen on the open valence, centred on the origin. */
export function standaloneFragment(id: string): EditMol {
  return fullFragment(id);
}

/** Electron domains for a new bond at atom i: trigonal (one more than its bonds) next to a multiple bond, else
 * left to placeBonded. */
function domainsFor(m: EditMol, i: number): number | undefined {
  const nb = neighbours(m.species, m.positions, i);
  return nb.some((j) => orderOf(m.orders, i, j) > 1) ? nb.length + 1 : undefined;
}

/**
 * Bond template `id` to atom `anchor`. If the anchor is a hydrogen, the template takes its place; if the
 * anchor carries a hydrogen, the template replaces that hydrogen; otherwise it bonds at the anchor's next free
 * direction. The template is turned so its open valence points at the anchor, then spun about the new bond to
 * keep clear of the other atoms. Returns the new molecule and the index of the template's attach atom.
 */
export function attachFragment(m: EditMol, anchor: number, id: string): { mol: EditMol; attach: number } {
  const frag = fragmentGeometry(id);
  let mol: EditMol = {
    species: [...m.species],
    positions: [...m.positions],
    orders: new Map(m.orders),
  };
  let parent = anchor;
  let dir: Vec3 | null = null;
  const nbOf = (i: number) => neighbours(mol.species, mol.positions, i);
  // A hydrogen to replace: the anchor itself, or one bonded to the anchor.
  let replace = -1;
  if (mol.species[anchor] === 'H') {
    const p = nbOf(anchor)[0];
    if (p !== undefined) {
      parent = p;
      replace = anchor;
    }
  } else {
    const h = nbOf(anchor).find((j) => mol.species[j] === 'H');
    if (h !== undefined) replace = h;
  }
  const attachEl = frag.species[0]!;
  const length = radiusOf(mol.species[parent]!) + radiusOf(attachEl);
  if (replace >= 0) {
    dir = unit(sub(mol.positions[replace]!, mol.positions[parent]!));
    mol = removeAtom(mol, replace);
    if (replace < parent) parent -= 1;
  } else {
    dir = unit(
      sub(
        placeBonded(mol.species, mol.positions, parent, attachEl, domainsFor(mol, parent)),
        mol.positions[parent]!,
      ),
    );
  }
  const p0 = mol.positions[parent]!;
  const at = add(p0, scale(dir, length));
  // The template's open valence: where a hydrogen would go on its attach atom.
  const open = frag.open;
  const back = scale(dir, -1);
  const local = frag.positions.map((p) => alignRotate(sub(p, frag.positions[0]!), open, back));
  // Spin about the bond to keep clear of the rest of the molecule (24 steps of 15 degrees).
  let best: Vec3[] = local;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let s = 0; s < 24; s++) {
    const t = (s * Math.PI) / 12;
    const placed = local.map((v) => add(at, rotate(v, dir!, t)));
    let score = 0;
    placed.forEach((q, a) => {
      mol.positions.forEach((r, b) => {
        if (b === parent && a === 0) return;
        const contact = 1.6 * (radiusOf(frag.species[a]!) + radiusOf(mol.species[b]!));
        const d = norm(sub(q, r));
        if (d < contact) score += ((contact - d) / contact) ** 2;
      });
    });
    if (score < bestScore - 1e-12) {
      bestScore = score;
      best = placed;
    }
  }
  const base = mol.species.length;
  const orders = new Map(mol.orders);
  for (const [key, o] of frag.orders) {
    const [a, b] = key.split('-').map(Number) as [number, number];
    orders.set(orderKey(a + base, b + base), o);
  }
  return {
    mol: {
      species: [...mol.species, ...frag.species],
      positions: [...mol.positions, ...best],
      orders,
    },
    attach: base,
  };
}

// ------------------------------------------------------------ bonds

/** Set the order of the bond between i and j (1, 1.5, 2 or 3). Throws when the atoms are not bonded. */
export function setBondOrder(m: EditMol, i: number, j: number, order: number): EditMol {
  if (!neighbours(m.species, m.positions, i).includes(j))
    throw new RangeError('These two atoms are not bonded.');
  const orders = new Map(m.orders);
  if (order === 1) orders.delete(orderKey(i, j));
  else orders.set(orderKey(i, j), order);
  return { ...m, orders };
}

/** Drop orders for pairs that are no longer bonded (after atoms were moved or deleted). */
export function pruneOrders(m: EditMol): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, o] of m.orders) {
    const [a, b] = key.split('-').map(Number) as [number, number];
    if (a < m.species.length && b < m.species.length && neighbours(m.species, m.positions, a).includes(b))
      out.set(key, o);
  }
  return out;
}

/** Sum of bond orders at atom i (the valence it uses). */
export function usedValence(m: EditMol, i: number): number {
  return neighbours(m.species, m.positions, i).reduce((t, j) => t + orderOf(m.orders, i, j), 0);
}

/** Atoms connected to `start` by bonds, optionally ignoring the bond cut[0]-cut[1]. */
export function fragmentOf(
  species: readonly string[],
  positions: readonly Vec3[],
  start: number,
  cut?: readonly [number, number],
): number[] {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const i = queue.shift()!;
    for (const j of neighbours(species, positions, i)) {
      if (cut && ((i === cut[0] && j === cut[1]) || (i === cut[1] && j === cut[0]))) continue;
      if (!seen.has(j)) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Make the distance between i and j equal to `d` by moving j, and with it everything on j's side of the i-j
 * bond when cutting that bond splits the molecule (in a ring, or with no bond, only j moves).
 */
export function setDistance(
  positions: readonly Vec3[],
  species: readonly string[],
  i: number,
  j: number,
  d: number,
): Vec3[] {
  if (!(d > 0.3)) throw new RangeError('The distance must be more than 0.3 angstrom.');
  const bonded = neighbours(species, positions, i).includes(j);
  let side = [j];
  if (bonded) {
    const f = fragmentOf(species, positions, j, [i, j]);
    if (!f.includes(i)) side = f;
  }
  const u = unit(sub(positions[j]!, positions[i]!));
  const shift = scale(u, d - norm(sub(positions[j]!, positions[i]!)));
  return positions.map((p, k) => (side.includes(k) ? add(p, shift) : p));
}

/** Move the atoms in `idx` by `v` (angstrom). */
export function moveAtoms(positions: readonly Vec3[], idx: readonly number[], v: Vec3): Vec3[] {
  return positions.map((p, k) => (idx.includes(k) ? add(p, v) : p));
}

// ------------------------------------------------------------ measuring

/** Distance (2 atoms, angstrom), angle (3, degrees, at the middle atom) or dihedral (4, degrees). */
export function measure(
  positions: readonly Vec3[],
  idx: readonly number[],
): { kind: string; value: number } | null {
  const p = idx.map((i) => positions[i]!);
  if (p.length === 2) return { kind: 'distance', value: norm(sub(p[1]!, p[0]!)) };
  if (p.length === 3) {
    const u = sub(p[0]!, p[1]!);
    const v = sub(p[2]!, p[1]!);
    const c = Math.max(-1, Math.min(1, dot(u, v) / (norm(u) * norm(v) || 1)));
    return { kind: 'angle', value: (Math.acos(c) * 180) / Math.PI };
  }
  if (p.length === 4) {
    const b0 = sub(p[0]!, p[1]!);
    const b1 = unit(sub(p[2]!, p[1]!));
    const b2 = sub(p[3]!, p[2]!);
    const v = sub(b0, scale(b1, dot(b0, b1)));
    const w = sub(b2, scale(b1, dot(b2, b1)));
    const x = dot(v, w);
    const y = dot(cross(b1, v), w);
    return { kind: 'dihedral', value: (Math.atan2(y, x) * 180) / Math.PI };
  }
  return null;
}
