// Basis reduction (Delaunay/Selling) shared by the point group (M4.5) and the Brillouin zone (M5.2).
// @source S-032 (spglib uses a Delaunay-reduced basis; independent implementation, not a port)
import type { Mat3, Vec3 } from './types';

/** Integer 3x3 matrix, row-major. */
export type IntMat3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export const dotv = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const rowOf = (m: Mat3, c: readonly number[]): Vec3 => [
  c[0]! * m[0][0] + c[1]! * m[1][0] + c[2]! * m[2][0],
  c[0]! * m[0][1] + c[1]! * m[1][1] + c[2]! * m[2][1],
  c[0]! * m[0][2] + c[1]! * m[1][2] + c[2]! * m[2][2],
];

/**
 * Delaunay (Selling) reduction. Returns an integer matrix P (rows are combinations of the input basis) whose rows,
 * applied to the lattice, give a basis in which every pair of the four superbase vectors has a non-positive dot product.
 * The determinant of P is +1 or -1.
 */
export function delaunayReduction(lattice: Mat3): IntMat3 {
  // superbase: v0 = -(a1 + a2 + a3), v1..v3 = a1..a3, each stored as integer coefficients of a1..a3
  let coef: number[][] = [
    [-1, -1, -1],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const cart = (c: number[]): Vec3 => rowOf(lattice, c);
  const scaleRef = Math.max(...lattice.map((r) => dotv(r, r)));
  const eps = 1e-10 * scaleRef;
  for (let iter = 0; iter < 500; iter++) {
    const vec = coef.map(cart);
    let done = true;
    for (let i = 0; i < 4 && done; i++)
      for (let j = i + 1; j < 4 && done; j++) {
        if (dotv(vec[i]!, vec[j]!) > eps) {
          const next = coef.map((c) => c.slice());
          for (let k = 0; k < 4; k++) {
            if (k === i) next[k] = coef[i]!.map((x) => -x);
            else if (k !== j) next[k] = coef[k]!.map((x, m) => x + coef[i]![m]!);
          }
          coef = next;
          done = false;
        }
      }
    if (done) break;
  }
  // choose the three shortest superbase vectors that are independent
  const order = [0, 1, 2, 3].sort(
    (a, b) => dotv(cart(coef[a]!), cart(coef[a]!)) - dotv(cart(coef[b]!), cart(coef[b]!)),
  );
  for (const skip of [3, 2, 1, 0]) {
    const pick = order.filter((_, idx) => idx !== skip).map((i) => coef[i]!);
    const d =
      pick[0]![0]! * (pick[1]![1]! * pick[2]![2]! - pick[1]![2]! * pick[2]![1]!) -
      pick[0]![1]! * (pick[1]![0]! * pick[2]![2]! - pick[1]![2]! * pick[2]![0]!) +
      pick[0]![2]! * (pick[1]![0]! * pick[2]![1]! - pick[1]![1]! * pick[2]![0]!);
    if (Math.abs(d) === 1) return [pick[0]!, pick[1]!, pick[2]!] as unknown as IntMat3;
  }
  throw new RangeError('Delaunay reduction failed to find a basis; the cell may be degenerate.');
}

/** The reduced basis as rows (the input rows combined by the integer matrix P) together with P. */
export function reduceBasis(lattice: Mat3): { reduced: Mat3; transform: IntMat3 } {
  const P = delaunayReduction(lattice);
  const reduced = P.map((c) => rowOf(lattice, c)) as unknown as Mat3;
  return { reduced, transform: P };
}
