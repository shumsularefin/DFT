// Structure helpers: composition, grouping, supercell, density, selective dynamics.
// @source S-034 (atomic masses table, see src/data/atomic-masses.json and Q-027)
import masses from '../../data/atomic-masses.json';
import { cellVolume, wrapFrac } from './lattice';
import type { Mat3, Structure, Vec3 } from './types';

const MASS = masses.masses as Record<string, number>;
const AMU_G = 1.6605390666e-24; // g per u (CODATA 2018, S-031)
const A3_CM3 = 1e-24; // cm^3 per Angstrom^3

/** Species in order of first appearance, with counts. */
export function speciesCounts(s: Structure): { symbol: string; count: number }[] {
  const out: { symbol: string; count: number }[] = [];
  for (const sym of s.species) {
    const e = out.find((x) => x.symbol === sym);
    if (e) e.count++;
    else out.push({ symbol: sym, count: 1 });
  }
  return out;
}

export const numberOfAtoms = (s: Structure): number => s.species.length;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Reduced formula in order of first appearance, e.g. "Na Cl" counts 4,4 gives "NaCl"; Ti2O4 gives "TiO2". */
export function reducedFormula(s: Structure): string {
  const c = speciesCounts(s);
  if (c.length === 0) return '';
  const g = c.map((x) => x.count).reduce(gcd);
  return c.map((x) => x.symbol + (x.count / g === 1 ? '' : String(x.count / g))).join('');
}

/** Sites grouped by species label (or symbol), keeping first-appearance order. permutation[new] = old. */
export function groupBySpecies(s: Structure): { structure: Structure; permutation: number[] } {
  const key = (i: number) => s.labels?.[i] ?? s.species[i]!;
  const order: string[] = [];
  const idx = new Map<string, number[]>();
  s.species.forEach((_, i) => {
    const k = key(i);
    if (!idx.has(k)) {
      idx.set(k, []);
      order.push(k);
    }
    idx.get(k)!.push(i);
  });
  const permutation = order.flatMap((k) => idx.get(k)!);
  const pick = <T>(a: readonly T[]) => permutation.map((i) => a[i]!);
  return {
    permutation,
    structure: {
      ...s,
      species: pick(s.species),
      frac: pick(s.frac),
      ...(s.labels ? { labels: pick(s.labels) } : {}),
      ...(s.selective ? { selective: pick(s.selective) } : {}),
    },
  };
}

/** Repeat the cell na x nb x nc times. New lattice rows are scaled; sites are ordered cell by cell. */
export function supercell(s: Structure, na: number, nb: number, nc: number): Structure {
  for (const n of [na, nb, nc]) {
    if (!Number.isInteger(n) || n < 1) throw new RangeError('supercell repeats must be positive integers');
  }
  const lattice: Mat3 = [
    s.lattice[0].map((x) => x * na) as unknown as Vec3,
    s.lattice[1].map((x) => x * nb) as unknown as Vec3,
    s.lattice[2].map((x) => x * nc) as unknown as Vec3,
  ];
  const frac: Vec3[] = [];
  const species: string[] = [];
  const labels: string[] = [];
  const selective: (readonly [boolean, boolean, boolean])[] = [];
  for (let i = 0; i < na; i++)
    for (let j = 0; j < nb; j++)
      for (let k = 0; k < nc; k++)
        s.frac.forEach((f, n) => {
          frac.push([(f[0] + i) / na, (f[1] + j) / nb, (f[2] + k) / nc]);
          species.push(s.species[n]!);
          if (s.labels) labels.push(s.labels[n]!);
          if (s.selective) selective.push(s.selective[n]!);
        });
  return {
    lattice,
    species,
    frac,
    ...(s.labels ? { labels } : {}),
    ...(s.selective ? { selective } : {}),
    ...(s.comment !== undefined ? { comment: s.comment } : {}),
  };
}

/** Mass density in g/cm^3. Throws if a species has no tabulated mass (for example the VASP 4 placeholders X1). */
export function densityGcm3(s: Structure): number {
  let m = 0;
  for (const sym of s.species) {
    const w = MASS[sym];
    if (w === undefined) throw new RangeError(`no atomic mass for "${sym}"`);
    m += w;
  }
  return (m * AMU_G) / (Math.abs(cellVolume(s.lattice)) * A3_CM3);
}

/** Wrap every site into [0, 1). */
export function wrapStructure(s: Structure): Structure {
  return { ...s, frac: s.frac.map(wrapFrac) };
}

/** Selective dynamics: flags per site, `true` = free. */
export function setSelective(
  s: Structure,
  free: (frac: Vec3, index: number) => readonly [boolean, boolean, boolean],
): Structure {
  return { ...s, selective: s.frac.map((f, i) => free(f, i)) };
}

export function clearSelective(s: Structure): Structure {
  const { selective: _drop, ...rest } = s;
  void _drop;
  return rest;
}

/** Number of sites with at least one frozen direction. */
export const frozenCount = (s: Structure): number =>
  s.selective ? s.selective.filter((f) => !(f[0] && f[1] && f[2])).length : 0;
