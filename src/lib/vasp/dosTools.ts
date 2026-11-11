// Helpers for the DOS viewer: sum projected DOS over chosen atoms and orbital groups, optional Gaussian smoothing,
// and the value of a curve at an energy. Smoothing is OFF by default in the viewer and always labelled when on.
// @source S-019 (VASP wiki: DOSCAR layout)
import type { DoscarResult } from './doscar';

export type OrbitalGroup = 's' | 'p' | 'd';
export const ORBITAL_GROUPS: readonly OrbitalGroup[] = ['s', 'p', 'd'];

/** Orbital column indices that belong to a group, for the labels of an ion (LORBIT 10: s p d; LORBIT 11: nine). */
export function groupColumns(orbitals: readonly string[], group: OrbitalGroup): number[] {
  const out: number[] = [];
  orbitals.forEach((o, i) => {
    const kind = o === 's' ? 's' : o === 'p' || ['px', 'py', 'pz'].includes(o) ? 'p' : 'd';
    if (kind === group) out.push(i);
  });
  return out;
}

export interface Curve {
  up: Float64Array;
  down?: Float64Array;
}

/** Sum of the projected DOS of the chosen ions (0-based) and orbital groups. Empty selection gives zeros. */
export function projectedSum(
  dos: DoscarResult,
  ions: readonly number[],
  groups: readonly OrbitalGroup[],
): Curve {
  const n = dos.energies.length;
  const up = new Float64Array(n);
  const down = dos.ispin === 2 ? new Float64Array(n) : undefined;
  for (const i of ions) {
    const ion = dos.ions[i];
    if (!ion) continue;
    for (const g of groups)
      for (const c of groupColumns(ion.orbitals, g)) {
        const u = ion.up[c];
        const d = ion.down?.[c];
        for (let k = 0; k < n; k++) {
          if (u) up[k]! += u[k]!;
          if (down && d) down[k]! += d[k]!;
        }
      }
  }
  return down ? { up, down } : { up };
}

/** Gaussian smoothing on a uniform grid; area is kept, edges are not padded. sigma in the units of the energy axis. */
export function gaussianSmooth(
  energies: ArrayLike<number>,
  values: ArrayLike<number>,
  sigma: number,
): Float64Array {
  const n = energies.length;
  const out = new Float64Array(n);
  if (n < 2 || !(sigma > 0)) {
    for (let i = 0; i < n; i++) out[i] = values[i]!;
    return out;
  }
  const de = (energies[n - 1]! - energies[0]!) / (n - 1);
  const half = Math.min(n, Math.ceil((4 * sigma) / de));
  const w = new Float64Array(2 * half + 1);
  let s = 0;
  for (let j = -half; j <= half; j++) {
    w[j + half] = Math.exp(-0.5 * ((j * de) / sigma) ** 2);
    s += w[j + half]!;
  }
  for (let j = 0; j < w.length; j++) w[j]! /= s;
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = -half; j <= half; j++) {
      const k = i + j;
      if (k >= 0 && k < n) acc += values[k]! * w[j + half]!;
    }
    out[i] = acc;
  }
  return out;
}

/** Linear interpolation of a curve on `energies` (ascending) at `e`; null outside the grid. */
export function valueAt(energies: ArrayLike<number>, values: ArrayLike<number>, e: number): number | null {
  const n = energies.length;
  if (n === 0 || e < energies[0]! || e > energies[n - 1]!) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (energies[mid]! <= e) lo = mid;
    else hi = mid;
  }
  const t = (e - energies[lo]!) / (energies[hi]! - energies[lo]! || 1);
  return values[lo]! * (1 - t) + values[hi]! * t;
}
