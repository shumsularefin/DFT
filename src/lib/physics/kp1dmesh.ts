// The 1D plane-wave toy of kp1d.ts on a k-mesh (M16.9): energy per cell against both convergence settings at once, ENCUT
// (plane waves per k-point) and the number of k-points. Pure. A teaching model, not a DFT calculation.
// The mesh is Gamma-centred: k_i = 2 pi i / (N a), i folded into (-N/2, N/2] (the 1D form of the Monkhorst-Pack set
// with no shift). Bands are filled from the bottom across the whole mesh: `filling` bands per cell, so filling 1 fills
// the lowest band (an insulator when it is separated by a gap) and filling 0.5 fills half of it (a metal: the occupied
// states end at a Fermi point that the mesh resolves only roughly). The last state is filled fractionally when
// filling N is not a whole number. Energy per cell and per spin, eV.
// @source S-050 (Kronig-Penney band structure), S-049 (k-point sampling and the plane-wave cutoff), S-007 (meshes)
import { solveToy, type Potential1D } from './kp1d';

export interface MeshEnergyOptions {
  /** Period, Angstrom. */
  a: number;
  potential: Potential1D;
  encutEv: number;
  /** Number of k-points of the Gamma-centred mesh. */
  nk: number;
  /** Occupied bands per cell (0 < filling <= 3). */
  filling: number;
}

export interface MeshEnergy {
  /** Energy per cell and per spin, eV; null when the cutoff leaves too few plane waves for the filling. */
  energy: number | null;
  /** Plane waves at Gamma. */
  nPw: number;
}

/** Gamma-centred mesh of nk points in the 1D zone, 1/Angstrom, folded into (-pi/a, pi/a]. */
export function gammaMesh1d(nk: number, a: number): number[] {
  if (!Number.isInteger(nk) || nk < 1)
    throw new RangeError('The mesh needs a positive whole number of points.');
  const out: number[] = [];
  for (let i = 0; i < nk; i++) {
    const j = i > nk / 2 ? i - nk : i;
    out.push((2 * Math.PI * j) / (nk * a));
  }
  return out;
}

/** A cache of band energies keyed by k and cutoff, so a sweep reuses the solves at shared k-points. */
export type BandCache = Map<string, { energies: number[]; nPw: number }>;

/** Bands at k; the potentials are even, so E(-k) = E(k) and the cache keys on |k|. */
function bands(o: MeshEnergyOptions, k: number, nBands: number, cache?: BandCache) {
  k = Math.abs(k);
  const key = `${o.a}|${JSON.stringify(o.potential)}|${o.encutEv}|${k.toFixed(12)}|${nBands}`;
  const hit = cache?.get(key);
  if (hit) return hit;
  const r = solveToy({ a: o.a, potential: o.potential, k, encutEv: o.encutEv, nBands });
  cache?.set(key, r);
  return r;
}

/** Energy per cell of the filled bands on the mesh, for one cutoff and one mesh. */
export function meshEnergy(o: MeshEnergyOptions, cache?: BandCache): MeshEnergy {
  if (!(o.filling > 0 && o.filling <= 3)) throw new RangeError('The filling must be in (0, 3].');
  const nBands = Math.ceil(o.filling) + 1;
  const ks = gammaMesh1d(o.nk, o.a);
  const all: number[] = [];
  let nPw = 0;
  for (const k of ks) {
    const r = bands(o, k, nBands, cache);
    if (k === 0) nPw = r.nPw;
    if (r.energies.length < Math.ceil(o.filling)) return { energy: null, nPw: r.nPw };
    all.push(...r.energies);
  }
  all.sort((x, y) => x - y);
  const states = o.filling * o.nk;
  const whole = Math.floor(states + 1e-9);
  let sum = 0;
  for (let i = 0; i < whole; i++) sum += all[i]!;
  const frac = states - whole;
  if (frac > 1e-9) sum += frac * all[whole]!;
  return { energy: sum / o.nk, nPw };
}

export interface GridPoint {
  encut: number;
  nk: number;
  energy: number;
  nPw: number;
}

/** meshEnergy over every pair of cutoffs and mesh sizes (row by cutoff); pairs without enough plane waves are skipped. */
export function convergenceGrid(
  base: Omit<MeshEnergyOptions, 'encutEv' | 'nk'>,
  cutoffs: readonly number[],
  meshes: readonly number[],
  cache: BandCache = new Map(),
): GridPoint[] {
  const out: GridPoint[] = [];
  for (const encut of cutoffs)
    for (const nk of meshes) {
      const r = meshEnergy({ ...base, encutEv: encut, nk }, cache);
      if (r.energy !== null) out.push({ encut, nk, energy: r.energy, nPw: r.nPw });
    }
  return out;
}
