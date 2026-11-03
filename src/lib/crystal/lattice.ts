// Lattice math. Rows are lattice vectors in Angstrom; reciprocal rows include the factor 2 pi, in 1/Angstrom.
// @source S-036 (Ashcroft and Mermin: reciprocal lattice b_i . a_j = 2 pi delta_ij)
import type { Mat3, Vec3 } from './types';
import { cross, det3, dot, norm, scale, sub, vecMat, add } from './linalg';

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

export interface LatticeParameters {
  a: number;
  b: number;
  c: number;
  alpha: number;
  beta: number;
  gamma: number;
}

/** Lengths (Angstrom) and angles (degrees) of the three lattice vectors. */
export function latticeParameters(m: Mat3): LatticeParameters {
  const [a, b, c] = m;
  const ang = (u: Vec3, v: Vec3) =>
    Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (norm(u) * norm(v))))) / DEG;
  return { a: norm(a), b: norm(b), c: norm(c), alpha: ang(b, c), beta: ang(a, c), gamma: ang(a, b) };
}

/** Cell volume in Angstrom^3 (absolute value of the determinant). */
export const cellVolume = (m: Mat3): number => Math.abs(det3(m));

/** Standard setting: a along x, b in the xy plane. */
export function fromParameters(
  a: number,
  b: number,
  c: number,
  alpha: number,
  beta: number,
  gamma: number,
): Mat3 {
  const ca = Math.cos(alpha * DEG);
  const cb = Math.cos(beta * DEG);
  const cg = Math.cos(gamma * DEG);
  const sg = Math.sin(gamma * DEG);
  const cx = c * cb;
  const cy = (c * (ca - cb * cg)) / sg;
  const cz2 = c * c - cx * cx - cy * cy;
  return [
    [a, 0, 0],
    [b * cg, b * sg, 0],
    [cx, cy, Math.sqrt(Math.max(cz2, 0))],
  ];
}

/** Reciprocal lattice rows with the factor 2 pi: b_i . a_j = 2 pi delta_ij. */
export function reciprocalLattice(m: Mat3): Mat3 {
  const v = det3(m);
  const f = TWO_PI / v;
  return [scale(cross(m[1], m[2]), f), scale(cross(m[2], m[0]), f), scale(cross(m[0], m[1]), f)];
}

/** Fractional to Cartesian: x = f A (A has lattice vectors as rows). */
export const fracToCart = (f: Vec3, m: Mat3): Vec3 => vecMat(f, m);

/** Cartesian to fractional. */
export function cartToFrac(x: Vec3, m: Mat3): Vec3 {
  const r = reciprocalLattice(m);
  const k = 1 / TWO_PI;
  return [dot(x, r[0]) * k, dot(x, r[1]) * k, dot(x, r[2]) * k];
}

/** Wrap fractional coordinates into [0, 1). A value that rounds to 1 within 1e-12 becomes 0. */
export function wrapFrac(f: Vec3): Vec3 {
  const w = (x: number) => {
    let y = x - Math.floor(x);
    if (y >= 1 - 1e-12) y = 0;
    return y === 0 ? 0 : y; // avoid -0
  };
  return [w(f[0]), w(f[1]), w(f[2])];
}

/**
 * Minimum-image distance (Angstrom) between two fractional points. Searches the 27 neighbouring images after
 * wrapping the difference to [-1/2, 1/2); that is exact for cells that are not strongly skewed, and the search
 * range `reach` can be raised for extreme cells.
 */
export function minimumImageDistance(f1: Vec3, f2: Vec3, m: Mat3, reach = 1): number {
  const d0 = sub(f1, f2);
  const d: Vec3 = [d0[0] - Math.round(d0[0]), d0[1] - Math.round(d0[1]), d0[2] - Math.round(d0[2])];
  let best = Infinity;
  for (let i = -reach; i <= reach; i++)
    for (let j = -reach; j <= reach; j++)
      for (let k = -reach; k <= reach; k++) {
        const cart = fracToCart(add(d, [i, j, k]), m);
        best = Math.min(best, norm(cart));
      }
  return best;
}

export type CellType =
  'cubic' | 'tetragonal' | 'orthorhombic' | 'hexagonal' | 'rhombohedral' | 'monoclinic' | 'triclinic';

/**
 * LATTICE METRIC CLASS of the cell as given. This is NOT a Bravais lattice identification: the same crystal in a
 * primitive and a conventional cell gets different answers (fcc Cu in its primitive cell has a = b = c and all angles
 * 60 degrees, which this reports as `rhombohedral`). Use the symmetry tools (M5) for the real Bravais lattice.
 */
export function guessCellType(m: Mat3, tolLen = 1e-3, tolAngDeg = 1e-2): CellType {
  const p = latticeParameters(m);
  const eqL = (x: number, y: number) => Math.abs(x - y) <= tolLen * Math.max(x, y);
  const is = (x: number, t: number) => Math.abs(x - t) <= tolAngDeg;
  const ab = eqL(p.a, p.b);
  const bc = eqL(p.b, p.c);
  const ac = eqL(p.a, p.c);
  const right = is(p.alpha, 90) && is(p.beta, 90) && is(p.gamma, 90);
  if (ab && bc && right) return 'cubic';
  if (ab && bc && is(p.alpha, p.beta) && is(p.beta, p.gamma)) return 'rhombohedral';
  if (right && (ab || bc || ac)) return 'tetragonal';
  if (right) return 'orthorhombic';
  if (ab && is(p.alpha, 90) && is(p.beta, 90) && (is(p.gamma, 120) || is(p.gamma, 60))) return 'hexagonal';
  const nRight = [p.alpha, p.beta, p.gamma].filter((x) => is(x, 90)).length;
  if (nRight === 2) return 'monoclinic';
  return 'triclinic';
}
