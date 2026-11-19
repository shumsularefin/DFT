// Point defects from a bulk crystal (M13.5): symmetry-distinct sites, single vacancies and substitutions, defect
// pairs grouped by symmetry, a supercell suggestion from a minimum defect-image distance, and the neutral
// formation energy E_f = E_defect - E_bulk - sum_i n_i mu_i (C. Freysoldt et al., Rev. Mod. Phys. 86, 253 (2014),
// S-067), with n_i > 0 for atoms added and n_i < 0 for atoms removed. Charged defects (the E_F and correction
// terms) are out of scope here and said so in every result.
// @source S-067
import { contacts } from '../chem/geometry';
import { atomicNumber } from './elements';
import { det3, vecMat } from './linalg';
import { niggliReduce } from './niggli';
import { speciesCounts } from './structure';
import type { IntMat3 } from './reduction';
import { buildSupercell, hermiteNormalForms } from './supercell';
import { analyzeWith, type MoyoApi } from './symmetry';
import type { Mat3, Structure, Vec3 } from './types';

/** Default minimum distance between a defect and its periodic images, angstrom. A convention, not physics (D-069). */
export const DEFAULT_IMAGE_DISTANCE = 10;

export interface DistinctSite {
  /** Orbit number, 0 based, in order of first appearance. */
  orbit: number;
  /** First atom of the orbit (index into the structure). */
  representative: number;
  members: number[];
  species: string;
  wyckoff: string;
  siteSymmetry: string;
}

export interface DefectResult {
  structure: Structure;
  description: string;
  /** Index of the changed site in the input structure. */
  site: number;
  notes: string[];
}

/** Symmetry-distinct sites from moyo's orbits (Wyckoff letters and site symmetries included). */
export function distinctSites(api: MoyoApi, s: Structure, symprec = 1e-4): DistinctSite[] {
  const sym = analyzeWith(api, s, { symprec });
  const byOrbit = new Map<number, number[]>();
  sym.orbits.forEach((o, i) => byOrbit.set(o, [...(byOrbit.get(o) ?? []), i]));
  return [...byOrbit.values()].map((members, orbit) => {
    const r = members[0]!;
    return {
      orbit,
      representative: r,
      members,
      species: s.species[r]!,
      wyckoff: sym.wyckoffs[r] ?? '',
      siteSymmetry: sym.siteSymmetries[r] ?? '',
    };
  });
}

const siteIndex = (site: DistinctSite | number): number =>
  typeof site === 'number' ? site : site.representative;

function checkIndex(s: Structure, i: number): void {
  if (!Number.isInteger(i) || i < 0 || i >= s.species.length)
    throw new RangeError(`Site ${i} does not exist.`);
}

const NEUTRAL_NOTE =
  'Neutral defect only: charged defects need the Fermi-level term and finite-size corrections, which this tool does not apply (S-067).';

/** Remove one atom of the orbit (its representative). Use a supercell first so the defect is dilute. */
export function vacancy(s: Structure, site: DistinctSite | number): DefectResult {
  const i = siteIndex(site);
  checkIndex(s, i);
  const keep = (_: unknown, k: number): boolean => k !== i;
  const structure: Structure = {
    ...s,
    species: s.species.filter(keep),
    frac: s.frac.filter(keep),
    ...(s.labels ? { labels: s.labels.filter(keep) } : {}),
    ...(s.selective ? { selective: s.selective.filter(keep) } : {}),
  };
  return {
    structure,
    description: `Vacancy: removed ${s.species[i]} at site ${i + 1}`,
    site: i,
    notes: [NEUTRAL_NOTE],
  };
}

/** Replace the species of one atom of the orbit (its representative) by `element`. */
export function substitute(s: Structure, site: DistinctSite | number, element: string): DefectResult {
  const i = siteIndex(site);
  checkIndex(s, i);
  if (atomicNumber(element) === undefined) throw new RangeError(`Unknown element symbol "${element}".`);
  if (s.species[i] === element) throw new RangeError(`Site ${i + 1} is already ${element}.`);
  const structure: Structure = {
    ...s,
    species: s.species.map((x, k) => (k === i ? element : x)),
    ...(s.labels ? { labels: s.labels.map((x, k) => (k === i ? element : x)) } : {}),
  };
  return {
    structure,
    description: `Substitution: ${s.species[i]} at site ${i + 1} replaced by ${element}`,
    site: i,
    notes: [NEUTRAL_NOTE],
  };
}

export interface PairClass {
  /** One pair of the class: sites i < j at their minimum-image distance. */
  i: number;
  j: number;
  image: Vec3;
  distance: number;
  species: [string, string];
  /** Number of distinct site pairs in the class. */
  multiplicity: number;
  pairs: [number, number][];
}

/**
 * Pairs of distinct sites (i < j) whose minimum-image distance is at most `maxDistance`, grouped into classes
 * by the symmetry operations of the structure (pass the defect supercell). `sites` restricts both ends.
 */
export function defectPairs(
  api: MoyoApi,
  s: Structure,
  maxDistance: number,
  opts: { sites?: readonly number[]; symprec?: number } = {},
): PairClass[] {
  if (!(maxDistance > 0)) throw new RangeError('The pair distance must be positive.');
  const allowed = opts.sites ? new Set(opts.sites) : null;
  const best = new Map<string, { i: number; j: number; image: Vec3; distance: number }>();
  for (const c of contacts(s, maxDistance + 1e-6)) {
    if (c.i === c.j) continue;
    if (allowed && !(allowed.has(c.i) && allowed.has(c.j))) continue;
    const k = `${c.i},${c.j}`;
    if (!best.has(k)) best.set(k, { i: c.i, j: c.j, image: c.image, distance: c.distance }); // sorted by distance
  }
  const sym = analyzeWith(api, s, { symprec: opts.symprec ?? 1e-4 });
  const L = s.lattice;
  const perms = sym.operations.map((op) =>
    s.frac.map((x, a) => {
      const y: Vec3 = [0, 1, 2].map(
        (r) =>
          op.rotation[r]![0]! * x[0] +
          op.rotation[r]![1]! * x[1] +
          op.rotation[r]![2]! * x[2] +
          op.translation[r]!,
      ) as unknown as Vec3;
      let hit = -1;
      let dmin = Infinity;
      s.frac.forEach((z, b) => {
        if (s.species[b] !== s.species[a]) return;
        const d = [0, 1, 2].map((q) => z[q]! - y[q]! - Math.round(z[q]! - y[q]!)) as unknown as Vec3;
        const dist = Math.hypot(...vecMat(d, L));
        if (dist < dmin) [dmin, hit] = [dist, b];
      });
      if (dmin > 1e-2) throw new Error('A symmetry operation did not map the structure onto itself.');
      return hit;
    }),
  );
  const seen = new Set<string>();
  const out: PairClass[] = [];
  const ordered = [...best.values()].sort((p, q) => p.distance - q.distance || p.i - q.i || p.j - q.j);
  for (const p of ordered) {
    if (seen.has(`${p.i},${p.j}`)) continue;
    const members = new Map<string, [number, number]>();
    for (const perm of perms) {
      const a = perm[p.i]!;
      const b = perm[p.j]!;
      const pair: [number, number] = a < b ? [a, b] : [b, a];
      members.set(`${pair[0]},${pair[1]}`, pair);
    }
    for (const k of members.keys()) seen.add(k);
    out.push({
      ...p,
      species: [s.species[p.i]!, s.species[p.j]!].sort() as [string, string],
      multiplicity: members.size,
      pairs: [...members.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]),
    });
  }
  return out;
}

/** Shortest non-zero lattice vector, angstrom (first vector of the Niggli cell, checked against small combinations). */
export function shortestLatticeVector(L: Mat3): number {
  const R = niggliReduce(L);
  let best = Infinity;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (let k = -1; k <= 1; k++) {
        if (i === 0 && j === 0 && k === 0) continue;
        best = Math.min(best, Math.hypot(...vecMat([i, j, k], R)));
      }
  return best;
}

export interface SupercellSuggestion {
  matrix: IntMat3;
  determinant: number;
  atoms: number;
  /** Distance between a defect and its nearest periodic image in this supercell, angstrom. */
  imageDistance: number;
  minDistance: number;
  notes: string[];
}

/**
 * The supercell of the input cell with the fewest atoms whose shortest lattice vector is at least `minDistance`
 * (every Hermite normal form up to `maxDeterminant` is searched; ties go to the larger image distance). Falls
 * back to the diagonal n_i = ceil(minDistance / spacing_i), which always works but is rarely the smallest.
 */
export function suggestSupercell(
  s: Structure,
  minDistance = DEFAULT_IMAGE_DISTANCE,
  opts: { maxDeterminant?: number } = {},
): SupercellSuggestion {
  if (!(minDistance > 0)) throw new RangeError('The minimum image distance must be positive.');
  const maxDet = opts.maxDeterminant ?? 64;
  const convention =
    `A minimum defect-image distance of ${minDistance} angstrom is a convention (default 10), not a converged value: ` +
    'check the property you need against a larger supercell.';
  const L = s.lattice;
  const cellOf = (M: IntMat3): Mat3 => M.map((r) => vecMat(r as unknown as Vec3, L)) as unknown as Mat3;
  for (let n = 1; n <= maxDet; n++) {
    let pick: { M: IntMat3; d: number } | undefined;
    for (const M of hermiteNormalForms(n)) {
      const d = shortestLatticeVector(cellOf(M));
      if (d >= minDistance - 1e-9 && (!pick || d > pick.d + 1e-9)) pick = { M, d };
    }
    if (pick) {
      return {
        matrix: pick.M,
        determinant: n,
        atoms: n * s.species.length,
        imageDistance: pick.d,
        minDistance,
        notes: [convention],
      };
    }
  }
  // Diagonal fallback: every lattice vector of the supercell has length >= n_i * spacing_i for some i.
  const V = Math.abs(det3(L));
  const spacing = [0, 1, 2].map((i) => {
    const [b, c] = [L[(i + 1) % 3]!, L[(i + 2) % 3]!];
    const cr: Vec3 = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
    return V / Math.hypot(...cr);
  });
  const nd = spacing.map((h) => Math.ceil(minDistance / h - 1e-9));
  const M: IntMat3 = [
    [nd[0]!, 0, 0],
    [0, nd[1]!, 0],
    [0, 0, nd[2]!],
  ];
  const det = nd[0]! * nd[1]! * nd[2]!;
  return {
    matrix: M,
    determinant: det,
    atoms: det * s.species.length,
    imageDistance: shortestLatticeVector(cellOf(M)),
    minDistance,
    notes: [
      convention,
      `No supercell up to ${maxDet} cells met the distance; this is the diagonal fallback.`,
    ],
  };
}

/** Build the suggested supercell (convenience). */
export const defectSupercell = (s: Structure, minDistance = DEFAULT_IMAGE_DISTANCE): Structure =>
  buildSupercell(s, suggestSupercell(s, minDistance).matrix).structure;

export interface Exchange {
  element: string;
  /** Atoms added (> 0) or removed (< 0) in making the defect. */
  n: number;
  /** Chemical potential of the element, eV per atom, chosen by the user. */
  mu: number;
}

export interface FormationEnergy {
  /** eV. */
  value: number;
  terms: {
    eDefect: number;
    eBulk: number;
    exchange: { element: string; n: number; mu: number; nMu: number }[];
  };
  formula: string;
  notes: string[];
  sources: string[];
}

/** Atoms exchanged with reservoirs: n_i = count in the defect cell minus count in the bulk cell. */
export function exchangedAtoms(bulk: Structure, defect: Structure): { element: string; n: number }[] {
  const a = new Map(speciesCounts(bulk).map((c) => [c.symbol, c.count]));
  const b = new Map(speciesCounts(defect).map((c) => [c.symbol, c.count]));
  const els = [...new Set([...a.keys(), ...b.keys()])].sort();
  return els.map((el) => ({ element: el, n: (b.get(el) ?? 0) - (a.get(el) ?? 0) })).filter((x) => x.n !== 0);
}

/**
 * Neutral defect formation energy E_f = E_defect - E_bulk - sum_i n_i mu_i (S-067). Both total energies must come
 * from the same supercell and the same calculation settings.
 */
export function neutralFormationEnergy(
  eDefect: number,
  eBulk: number,
  exchange: readonly Exchange[],
): FormationEnergy {
  if (![eDefect, eBulk, ...exchange.flatMap((x) => [x.n, x.mu])].every(Number.isFinite)) {
    throw new RangeError('Every energy, count and chemical potential must be a finite number.');
  }
  const terms = exchange.map((x) => ({ element: x.element, n: x.n, mu: x.mu, nMu: x.n * x.mu }));
  const value = eDefect - eBulk - terms.reduce((a, t) => a + t.nMu, 0);
  return {
    value,
    terms: { eDefect, eBulk, exchange: terms },
    formula: 'E_f = E_defect - E_bulk - sum_i n_i mu_i',
    notes: [
      NEUTRAL_NOTE,
      'The chemical potentials are yours: their limits come from the stability of the host against competing phases.',
    ],
    sources: ['S-067'],
  };
}
