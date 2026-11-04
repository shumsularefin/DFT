// Point group of a lattice (its holohedry): the integer matrices that preserve the metric tensor.
// @source S-032 (spglib finds lattice symmetry from a Delaunay-reduced basis and integer matrices with entries in
// {-1, 0, 1}; this is an independent implementation of that idea, not a port).
// Convention: a rotation R acts on fractional coordinates as a row vector, f' = f R, so the Cartesian image of
// f A is f R A and the metric G = A A^T is preserved when R G R^T = G.
import { inv3, mul, transpose } from './linalg';
import type { Mat3, Vec3 } from './types';

/** Integer 3x3 matrix, row-major. */
export type IntMat3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

const dotv = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rowOf = (m: Mat3, c: readonly number[]): Vec3 => [
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

const roundMat = (m: Mat3): IntMat3 => m.map((r) => r.map((x) => Math.round(x) + 0)) as unknown as IntMat3;
const mulInt = (a: IntMat3, b: IntMat3): IntMat3 => roundMat(mul(a as Mat3, b as Mat3));

/**
 * All integer matrices R (in the basis of `lattice`) with R G R^T = G, G = A A^T. Includes the identity and,
 * for every lattice, the inversion. The group order is the length of the result.
 * Found in the Delaunay-reduced basis by trying every matrix with entries in {-1, 0, 1} (3^9 = 19683), then
 * transformed back to the input basis.
 */
export function latticePointGroup(lattice: Mat3, relTol = 1e-6): IntMat3[] {
  const P = delaunayReduction(lattice);
  const red: Mat3 = [rowOf(lattice, P[0]), rowOf(lattice, P[1]), rowOf(lattice, P[2])];
  const G: Mat3 = [
    [dotv(red[0], red[0]), dotv(red[0], red[1]), dotv(red[0], red[2])],
    [dotv(red[1], red[0]), dotv(red[1], red[1]), dotv(red[1], red[2])],
    [dotv(red[2], red[0]), dotv(red[2], red[1]), dotv(red[2], red[2])],
  ];
  const tol = relTol * Math.max(G[0][0], G[1][1], G[2][2]);
  const Pinv = roundMat(inv3(P as Mat3));
  const out: IntMat3[] = [];
  const e = new Array<number>(9).fill(-1);
  for (let code = 0; code < 19683; code++) {
    let c = code;
    for (let k = 0; k < 9; k++) {
      e[k] = (c % 3) - 1;
      c = Math.floor(c / 3);
    }
    const R: Mat3 = [
      [e[0]!, e[1]!, e[2]!],
      [e[3]!, e[4]!, e[5]!],
      [e[6]!, e[7]!, e[8]!],
    ];
    const M = mul(mul(R, G), transpose(R));
    let ok = true;
    for (let i = 0; i < 3 && ok; i++)
      for (let j = 0; j < 3 && ok; j++) if (Math.abs(M[i]![j]! - G[i]![j]!) > tol) ok = false;
    if (!ok) continue;
    out.push(mulInt(mulInt(Pinv, R as IntMat3), P));
  }
  return out;
}

/** True when -I is in the group (always the case for a lattice). */
export const hasInversion = (group: readonly IntMat3[]): boolean =>
  group.some(
    (r) =>
      r[0][0] === -1 &&
      r[1][1] === -1 &&
      r[2][2] === -1 &&
      r[0][1] === 0 &&
      r[0][2] === 0 &&
      r[1][0] === 0 &&
      r[1][2] === 0 &&
      r[2][0] === 0 &&
      r[2][1] === 0,
  );

/** Integer inverse of a unimodular matrix. */
export const intInverse = (r: IntMat3): IntMat3 => roundMat(inv3(r as Mat3));
