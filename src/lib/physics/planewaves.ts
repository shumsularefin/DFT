// Plane-wave basis counting: which reciprocal lattice vectors G satisfy (hbar^2/2m)|G|^2 <= ENCUT. Pure.
// @source S-049 (Martin: plane-wave basis and cutoff), S-031 (hbar, m_e), S-040 (VASP wiki ENCUT)
// G includes the factor 2 pi: G = n1 b1 + n2 b2 + n3 b3 with b_i . a_j = 2 pi delta_ij.
import { cross, dot, norm } from '../crystal/linalg';
import { cellVolume, reciprocalLattice } from '../crystal/lattice';
import type { Mat3, Vec3 } from '../crystal/types';
import { HBAR2_OVER_2M_EV_A2 } from './constants';

/** Never enumerate more vectors than this (a very large cell at a high cutoff); counts above it are reported, not listed. */
export const MAX_VECTORS = 200_000;

export interface PlaneWaveSet {
  encutEv: number;
  /** Cutoff radius in 1/Angstrom: sqrt(ENCUT / (hbar^2/2m)). */
  gCut: number;
  /** Exact number of reciprocal lattice vectors inside the sphere. */
  count: number;
  /** Continuum estimate V k_c^3 / (6 pi^2) (volume of the sphere over the volume per G vector). */
  continuum: number;
  /** count / continuum (1 for a perfect match). */
  ratio: number;
  /** Cartesian G vectors, 3 numbers each, in 1/Angstrom. Empty when `truncated`. */
  vectors: Float64Array;
  /** Integer coordinates (n1, n2, n3) of each vector, 3 numbers each. Empty when `truncated`. */
  indices: Int32Array;
  /** True when the count exceeds MAX_VECTORS and the list was not built. */
  truncated: boolean;
}

/** Free-electron kinetic energy (eV) of a wave vector of length q (1/Angstrom). */
export const kineticEnergy = (q: number): number => HBAR2_OVER_2M_EV_A2 * q * q;

/** k_c = sqrt(ENCUT / (hbar^2/2m)). */
export const cutoffRadius = (encutEv: number): number =>
  encutEv > 0 ? Math.sqrt(encutEv / HBAR2_OVER_2M_EV_A2) : 0;

/** Continuum estimate of the plane-wave count: V k_c^3 / (6 pi^2). */
export const continuumEstimate = (lattice: Mat3, encutEv: number): number => {
  const kc = cutoffRadius(encutEv);
  return (cellVolume(lattice) * kc ** 3) / (6 * Math.PI * Math.PI);
};

/**
 * Rigorous index bound. Since n_i = G . a_i / (2 pi), |n_i| <= k_c |a_i| / (2 pi) for every G inside the sphere.
 * (A bound from the shortest reciprocal vector is NOT safe for a skewed basis.)
 */
export const indexBounds = (lattice: Mat3, encutEv: number): [number, number, number] => {
  const kc = cutoffRadius(encutEv);
  const b = (a: Vec3) => Math.floor((kc * norm(a)) / (2 * Math.PI) + 1e-9);
  return [b(lattice[0]), b(lattice[1]), b(lattice[2])];
};

/** Reciprocal lattice rows (with 2 pi), checking the cell is not degenerate. */
function reciprocalRows(lattice: Mat3): Mat3 {
  if (!(cellVolume(lattice) > 1e-12)) throw new RangeError('The cell has no volume.');
  return reciprocalLattice(lattice);
}

/**
 * Count (and list, up to MAX_VECTORS) the reciprocal lattice vectors with (hbar^2/2m)|G|^2 <= ENCUT.
 * ENCUT = 0 gives only G = 0. A vector exactly on the sphere counts (<=), with a relative 1e-12 allowance for rounding.
 */
export function gVectorsWithin(lattice: Mat3, encutEv: number): PlaneWaveSet {
  if (!Number.isFinite(encutEv) || encutEv < 0) throw new RangeError('ENCUT must be zero or positive.');
  const b = reciprocalRows(lattice);
  const kc = cutoffRadius(encutEv);
  const kc2 = kc * kc * (1 + 1e-12);
  const [n1, n2, n3] = indexBounds(lattice, encutEv);
  const box = (2 * n1 + 1) * (2 * n2 + 1) * (2 * n3 + 1);
  const continuum = continuumEstimate(lattice, encutEv);
  const vec: number[] = [];
  const idx: number[] = [];
  let count = 0;
  for (let i = -n1; i <= n1; i++)
    for (let j = -n2; j <= n2; j++)
      for (let k = -n3; k <= n3; k++) {
        const x = i * b[0][0] + j * b[1][0] + k * b[2][0];
        const y = i * b[0][1] + j * b[1][1] + k * b[2][1];
        const z = i * b[0][2] + j * b[1][2] + k * b[2][2];
        if (x * x + y * y + z * z <= kc2) {
          count++;
          if (count <= MAX_VECTORS) {
            vec.push(x, y, z);
            idx.push(i, j, k);
          }
        }
      }
  void box;
  const truncated = count > MAX_VECTORS;
  return {
    encutEv,
    gCut: kc,
    count,
    continuum,
    ratio: continuum > 0 ? count / continuum : 1,
    vectors: truncated ? new Float64Array(0) : Float64Array.from(vec),
    indices: truncated ? new Int32Array(0) : Int32Array.from(idx),
    truncated,
  };
}

/** True if enumerating this cell at this cutoff would visit an unreasonable number of candidate integer triples. */
export function tooLargeToEnumerate(lattice: Mat3, encutEv: number, limit = 40_000_000): boolean {
  const [n1, n2, n3] = indexBounds(lattice, encutEv);
  return (2 * n1 + 1) * (2 * n2 + 1) * (2 * n3 + 1) > limit;
}

/** Reciprocal cell edges as three Cartesian vectors, for the wireframe. */
export const reciprocalCell = (lattice: Mat3): Mat3 => reciprocalRows(lattice);

/** Volume of the reciprocal cell, (2 pi)^3 / V, in 1/Angstrom^3. */
export const reciprocalVolume = (lattice: Mat3): number => {
  const b = reciprocalRows(lattice);
  return Math.abs(dot(b[0], cross(b[1], b[2])));
};

/**
 * Relative size of the basis against a reference cutoff: the coefficient count (and so the memory for the wavefunction
 * coefficients) scales with it. Run time grows at least this fast. A scaling estimate, not a runtime prediction.
 */
export const relativeBasisSize = (count: number, referenceCount: number): number =>
  referenceCount > 0 ? count / referenceCount : 1;
