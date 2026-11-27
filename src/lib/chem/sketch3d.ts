// Build a molecule atom by atom in 3D (Material Builder, molecule mode): place a new atom bonded to an
// anchor atom at a sensible angle, fill open valences with hydrogens, and work out bonds from distances.
// Bond lengths are sums of Cordero covalent radii (S-021); angles come from the electron-domain count. A drawing
// aid with rough geometry, not a geometry optimisation: run a relaxation in VASP (ISIF = 2) before trusting it.
// @source S-021
import type { Vec3 } from '../crystal/types';
import { covalentRadius } from './elements';
import type { MolGraph } from './molgraph';

/** Labelled where the panel shows the result. */
export const SKETCH_LABEL =
  'Heuristic placement (covalent radii and ideal angles), not an optimised geometry.';

/** Covalent radius with a fallback for elements Cordero (2008) does not tabulate. */
export const radiusOf = (el: string): number => covalentRadius(el) ?? 1.5;

/** Typical number of single bonds, used only to decide how many hydrogens to add. */
const VALENCE: Record<string, number> = {
  H: 1,
  B: 3,
  C: 4,
  N: 3,
  O: 2,
  F: 1,
  Si: 4,
  P: 3,
  S: 2,
  Cl: 1,
  Ge: 4,
  As: 3,
  Se: 2,
  Br: 1,
  Te: 2,
  I: 1,
};
export const typicalValence = (el: string): number | null => VALENCE[el] ?? null;

/** Electron domains (bonds plus lone pairs) for the common main-group elements; sets the ideal angle. */
const DOMAINS: Record<string, number> = { C: 4, N: 4, O: 4, Si: 4, P: 4, S: 4, Ge: 4, As: 4, Se: 4, B: 3 };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => scale(a, 1 / (norm(a) || 1));

/** Evenly spread unit vectors (Fibonacci sphere), fixed so the result is the same on every run. */
const DIRECTIONS: Vec3[] = (() => {
  const n = 720;
  const out: Vec3[] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out.push([Math.cos(g * i) * r, y, Math.sin(g * i) * r]);
  }
  return out;
})();

/** Atoms closer than 1.2 times the sum of covalent radii count as bonded. */
export const BOND_FACTOR = 1.2;

export function neighbours(species: readonly string[], positions: readonly Vec3[], i: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < species.length; j++) {
    if (j === i) continue;
    const d = norm(sub(positions[j]!, positions[i]!));
    if (d > 0.35 && d <= BOND_FACTOR * (radiusOf(species[i]!) + radiusOf(species[j]!))) out.push(j);
  }
  return out;
}

/** Ideal angle (degrees) between bonds at an atom with `domains` electron domains. */
export function idealAngle(domains: number): number {
  if (domains <= 2) return 180;
  if (domains === 3) return 120;
  if (domains === 4) return 109.47;
  return 90;
}

/**
 * Where to put a new atom `el` bonded to atom `anchor`. The bond length is the sum of covalent radii; the
 * direction keeps the ideal angle to the anchor's other bonds and stays as far as it can from every other
 * atom. `domains` overrides the anchor's electron-domain count (for example when several hydrogens follow).
 */
export function placeBonded(
  species: readonly string[],
  positions: readonly Vec3[],
  anchor: number,
  el: string,
  domains?: number,
): Vec3 {
  const p0 = positions[anchor]!;
  const length = radiusOf(species[anchor]!) + radiusOf(el);
  const bonded = neighbours(species, positions, anchor);
  const bondDirs = bonded.map((j) => unit(sub(positions[j]!, p0)));
  const nd = domains ?? Math.max(bonded.length + 1, DOMAINS[species[anchor]!] ?? bonded.length + 1);
  const target = Math.cos((idealAngle(nd) * Math.PI) / 180);
  let best: Vec3 = [1, 0, 0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const d of DIRECTIONS) {
    let score = 0;
    for (const b of bondDirs) score += (dot(d, b) - target) ** 2 * 10;
    const p = add(p0, scale(d, length));
    // Keep clear of the other atoms: a soft penalty inside 1.6 times the contact distance.
    for (let j = 0; j < species.length; j++) {
      if (j === anchor) continue;
      const r = norm(sub(positions[j]!, p));
      const contact = 1.6 * (radiusOf(species[j]!) + radiusOf(el));
      if (r < contact) score += ((contact - r) / contact) ** 2;
    }
    if (score < bestScore - 1e-12) {
      bestScore = score;
      best = d;
    }
  }
  return add(p0, scale(best, length));
}

/** Bond orders set by the user, keyed by `orderKey` (atom indices, smaller first); unset bonds are single. */
export type BondOrders = ReadonlyMap<string, number>;
export const orderKey = (i: number, j: number): string => (i < j ? `${i}-${j}` : `${j}-${i}`);
/** The order of the bond between i and j: 1, 1.5 (aromatic), 2 or 3. */
export const orderOf = (orders: BondOrders | undefined, i: number, j: number): number =>
  orders?.get(orderKey(i, j)) ?? 1;

/**
 * Add hydrogens until every atom with a typical valence has that many bonds, counting each bond by its order
 * (`orders`; without it every bond is single, so a C=O carbon gets one hydrogen too many). Returns the new
 * hydrogen positions, in the order added.
 */
export function fillHydrogens(
  species: readonly string[],
  positions: readonly Vec3[],
  orders?: BondOrders,
): Vec3[] {
  const sp = [...species];
  const pos = [...positions];
  const added: Vec3[] = [];
  const heavy = species.length;
  for (let i = 0; i < heavy; i++) {
    const v = typicalValence(sp[i]!);
    if (v === null || sp[i] === 'H') continue;
    const nb = neighbours(sp, pos, i);
    const used = nb.reduce((t, j) => t + (j < heavy ? orderOf(orders, i, j) : 1), 0);
    const open = Math.floor(v - used + 1e-9);
    if (open <= 0) continue;
    // Electron domains: one per neighbour (a double bond is one domain), plus the new hydrogens.
    const have = nb.length;
    const multiple = nb.some((j) => j < heavy && orderOf(orders, i, j) > 1);
    const domains = multiple ? have + open : Math.max(have + open, DOMAINS[sp[i]!] ?? have + open);
    for (let k = 0; k < open; k++) {
      const p = placeBonded(sp, pos, i, 'H', domains);
      sp.push('H');
      pos.push(p);
      added.push(p);
    }
  }
  return added;
}

/** A graph with a bond between every pair of atoms that counts as bonded (for a MOL block), single unless
 * `orders` says otherwise. */
export function graphFromDistances(
  species: readonly string[],
  positions: readonly Vec3[],
  orders?: BondOrders,
): MolGraph {
  const bonds: MolGraph['bonds'] = [];
  for (let i = 0; i < species.length; i++)
    for (const j of neighbours(species, positions, i))
      if (j > i) {
        const o = orderOf(orders, i, j);
        bonds.push({ a: i, b: j, order: o === 1.5 ? 'aromatic' : o === 2 ? 2 : o === 3 ? 3 : 1 });
      }
  return { atoms: species.map((el) => ({ el, charge: 0, hCount: 0 })), bonds };
}

/** Starting molecules. Hydrogens are counts on the heavy atoms; geometry3d places them from the 2D layout. */
export const MOLECULE_PRESETS: { id: string; label: string; graph: MolGraph }[] = [
  {
    id: 'water',
    label: 'Water',
    graph: { atoms: [{ el: 'O', charge: 0, hCount: 2 }], bonds: [] },
  },
  {
    id: 'methane',
    label: 'Methane',
    graph: { atoms: [{ el: 'C', charge: 0, hCount: 4 }], bonds: [] },
  },
  {
    id: 'ammonia',
    label: 'Ammonia',
    graph: { atoms: [{ el: 'N', charge: 0, hCount: 3 }], bonds: [] },
  },
  {
    id: 'ethanol',
    label: 'Ethanol',
    graph: {
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
    },
  },
  {
    id: 'co2',
    label: 'Carbon dioxide',
    graph: {
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
        [0, 0],
        [1.5, 0],
        [3, 0],
      ],
    },
  },
  {
    id: 'benzene',
    label: 'Benzene',
    graph: {
      atoms: Array.from({ length: 6 }, () => ({ el: 'C', charge: 0, hCount: 1 })),
      bonds: Array.from({ length: 6 }, (_, i) => ({ a: i, b: (i + 1) % 6, order: 'aromatic' as const })),
      // A regular hexagon: the 3D model starts from the 2D layout.
      coords2d: Array.from({ length: 6 }, (_, i): [number, number] => [
        1.5 * Math.cos((i * Math.PI) / 3),
        1.5 * Math.sin((i * Math.PI) / 3),
      ]),
    },
  },
];

/**
 * A hydrogen-terminated graphene flake: the honeycomb (C-C 1.42 angstrom, a common literature value for
 * graphene) cut at `radius` around a hexagon centre, with one C-H (1.08 angstrom) on every edge carbon.
 * radius 3.8 gives coronene, C24H12. A molecule, not the periodic sheet.
 */
export function grapheneFlake(radius = 3.8): { species: string[]; positions: Vec3[] } {
  const cc = 1.42;
  const a1: Vec3 = [cc * Math.sqrt(3), 0, 0];
  const a2: Vec3 = [(cc * Math.sqrt(3)) / 2, 1.5 * cc, 0];
  // Two atoms per cell, placed so that the origin is the centre of a hexagon.
  const basis: Vec3[] = [
    [0, cc, 0],
    [(cc * Math.sqrt(3)) / 2, cc / 2, 0],
  ];
  const carbons: Vec3[] = [];
  const n = Math.ceil(radius / cc) + 2;
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++)
      for (const b of basis) {
        const p = add(add(scale(a1, i), scale(a2, j)), b);
        if (norm(p) <= radius) carbons.push(p);
      }
  const species = carbons.map(() => 'C');
  const positions = [...carbons];
  carbons.forEach((c, i) => {
    const nb = carbons.filter((d, j) => j !== i && norm(sub(d, c)) < 1.6);
    if (nb.length !== 2) return;
    const out = unit(sub(scale(c, 2), add(nb[0]!, nb[1]!)));
    species.push('H');
    positions.push(add(c, scale(out, 1.08)));
  });
  return { species, positions };
}
