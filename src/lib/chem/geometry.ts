// Interatomic distances for the validity engine: periodic (all lattice images within a cutoff) or open (molecule).
import { cellVolume, latticeParameters, reciprocalLattice } from '../crystal/lattice';
import { norm, sub, vecMat } from '../crystal/linalg';
import type { Mat3, Structure, Vec3 } from '../crystal/types';

export interface Contact {
  i: number;
  j: number;
  /** Lattice translation added to atom j (zeros in molecule mode). */
  image: Vec3;
  distance: number;
  /** Cartesian vector from i to the image of j. */
  vector: Vec3;
}

/** How many lattice translations along each axis can bring two atoms within `cutoff`. */
function reach(L: Mat3, cutoff: number): [number, number, number] {
  const rec = reciprocalLattice(L);
  // |b_k| / (2 pi) is 1 / (spacing of lattice planes k); one extra image covers atoms anywhere in the cell
  return rec.map((b) => Math.ceil((cutoff * norm(b)) / (2 * Math.PI)) + 1) as [number, number, number];
}

/**
 * Every pair (i <= j) closer than `cutoff`, each periodic image counted once. A pair i = j appears only
 * through a non-zero lattice translation.
 */
export function contacts(s: Structure, cutoff: number, periodic = true): Contact[] {
  const out: Contact[] = [];
  const n = s.species.length;
  const L = s.lattice;
  const [ra, rb, rc] = periodic ? reach(L, cutoff) : [0, 0, 0];
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++) {
      const df = sub(s.frac[j]!, s.frac[i]!);
      for (let a = -ra; a <= ra; a++)
        for (let b = -rb; b <= rb; b++)
          for (let c = -rc; c <= rc; c++) {
            if (i === j && (a > 0 || (a === 0 && b > 0) || (a === 0 && b === 0 && c >= 0))) continue; // each +/- image pair once
            const v = vecMat([df[0] + a, df[1] + b, df[2] + c], L);
            const d = norm(v);
            if (d < cutoff) out.push({ i, j, image: [a, b, c], distance: d, vector: v });
          }
    }
  return out.sort((x, y) => x.distance - y.distance);
}

/** Neighbours of atom i (both directions of every contact), sorted by distance. */
export function neighboursOf(i: number, list: readonly Contact[]): { site: number; distance: number }[] {
  const out: { site: number; distance: number }[] = [];
  for (const c of list) {
    if (c.i === i) out.push({ site: c.j, distance: c.distance });
    if (c.j === i) out.push({ site: c.i, distance: c.distance });
  }
  return out.sort((x, y) => x.distance - y.distance);
}

export const volume = (s: Structure): number => cellVolume(s.lattice);
export const angles = (s: Structure): [number, number, number] => {
  const p = latticeParameters(s.lattice);
  return [p.alpha, p.beta, p.gamma];
};
