// Supercells from any integer matrix, Hermite normal forms, and commensurate-cell searches (M13.1, reused by M10.2).
// Pure integer and linear algebra; no physics constants. Convention (D-059): rows of M are the new lattice vectors as
// integer combinations of the old rows (POSCAR row convention), so the new lattice is M * L and det(M) > 0 keeps the
// handedness. A fractional coordinate f in the old cell becomes (f + T) * M^-1 in the new one.
import { reduceBasis, rowOf, type IntMat3 } from './reduction';
import type { Mat3, Structure, Vec3 } from './types';

type Int3 = readonly [number, number, number];

/** Determinant of an integer matrix (exact for small entries). */
export const determinant = (m: IntMat3): number =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

/** Adjugate: adj(M) * M = det(M) * I. */
function adjugate(m: IntMat3): IntMat3 {
  const c = (r0: number, r1: number, c0: number, c1: number) =>
    m[r0]![c0]! * m[r1]![c1]! - m[r0]![c1]! * m[r1]![c0]!;
  return [
    [c(1, 2, 1, 2), -c(0, 2, 1, 2), c(0, 1, 1, 2)],
    [-c(1, 2, 0, 2), c(0, 2, 0, 2), -c(0, 1, 0, 2)],
    [c(1, 2, 0, 1), -c(0, 2, 0, 1), c(0, 1, 0, 1)],
  ];
}

const mulInt = (a: IntMat3, b: IntMat3): IntMat3 =>
  [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!),
  ) as unknown as IntMat3;

const negate = (a: IntMat3): IntMat3 => a.map((r) => r.map((x) => -x + 0)) as unknown as IntMat3;

export const IDENTITY: IntMat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function checkMatrix(M: IntMat3): number {
  if (M.length !== 3 || M.some((r) => r.length !== 3 || r.some((x) => !Number.isInteger(x))))
    throw new RangeError('The supercell matrix must be 3 x 3 with integer entries.');
  const d = determinant(M);
  if (d <= 0)
    throw new RangeError(
      d === 0
        ? 'The supercell matrix is singular (determinant 0): its rows do not span three dimensions.'
        : 'The supercell matrix has a negative determinant; swap two rows or negate one to keep a right-handed cell.',
    );
  return d;
}

/** Wrap into [0, 1) with a stable tolerance: values within 1e-10 of an integer snap to it. */
const WRAP_TOL = 1e-10;
function wrap(x: number): number {
  const r = Math.round(x);
  if (Math.abs(x - r) < WRAP_TOL) return 0;
  const y = x - Math.floor(x);
  return y === 0 ? 0 : y;
}

export interface SupercellResult {
  structure: Structure;
  matrix: IntMat3;
  /** For each new site, the index of the site of the input structure it copies. */
  parentIndex: number[];
  /** For each new site, the integer lattice translation T (in the input basis) added to the parent site. */
  translations: Int3[];
}

/**
 * The lattice translations of the input cell that lie inside the supercell, sorted lexicographically. Exact: T is
 * inside when every component of T * adj(M) is in [0, det).
 */
export function supercellTranslations(M: IntMat3): Int3[] {
  const d = checkMatrix(M);
  const adj = adjugate(M);
  const lo = [0, 1, 2].map((j) => M.reduce((s, r) => s + Math.min(0, r[j]!), 0));
  const hi = [0, 1, 2].map((j) => M.reduce((s, r) => s + Math.max(0, r[j]!), 0));
  const out: Int3[] = [];
  for (let i = lo[0]!; i <= hi[0]!; i++)
    for (let j = lo[1]!; j <= hi[1]!; j++)
      for (let k = lo[2]!; k <= hi[2]!; k++) {
        let inside = true;
        for (let c = 0; c < 3 && inside; c++) {
          const u = i * adj[0][c]! + j * adj[1][c]! + k * adj[2][c]!;
          if (u < 0 || u >= d) inside = false;
        }
        if (inside) out.push([i, j, k]);
      }
  if (out.length !== d) throw new Error(`internal: found ${out.length} translations for determinant ${d}`);
  return out;
}

/**
 * Build the supercell with rows M * L. Site order (deterministic, documented): translation-major, translations in
 * lexicographic order of (T1, T2, T3), and the input sites in their own order inside each copy. For a diagonal M this
 * is the same order as `supercell(s, na, nb, nc)` in structure.ts.
 */
export function buildSupercell(s: Structure, M: IntMat3): SupercellResult {
  const d = checkMatrix(M);
  const adj = adjugate(M);
  const lattice = M.map((r) => rowOf(s.lattice, r)) as unknown as Mat3;
  const ts = supercellTranslations(M);
  const frac: Vec3[] = [];
  const species: string[] = [];
  const labels: string[] = [];
  const selective: (readonly [boolean, boolean, boolean])[] = [];
  const parentIndex: number[] = [];
  const translations: Int3[] = [];
  for (const T of ts)
    s.frac.forEach((f, n) => {
      const x: Vec3 = [f[0] + T[0], f[1] + T[1], f[2] + T[2]];
      const nf = [0, 1, 2].map((c) => wrap((x[0] * adj[0][c]! + x[1] * adj[1][c]! + x[2] * adj[2][c]!) / d));
      frac.push(nf as unknown as Vec3);
      species.push(s.species[n]!);
      if (s.labels) labels.push(s.labels[n]!);
      if (s.selective) selective.push(s.selective[n]!);
      parentIndex.push(n);
      translations.push(T);
    });
  return {
    matrix: M,
    parentIndex,
    translations,
    structure: {
      lattice,
      species,
      frac,
      ...(s.labels ? { labels } : {}),
      ...(s.selective ? { selective } : {}),
      ...(s.comment !== undefined ? { comment: s.comment } : {}),
    },
  };
}

/** The supercell structure with rows M * L (see `buildSupercell` for the site order). */
export const supercell = (s: Structure, M: IntMat3): Structure => buildSupercell(s, M).structure;

/** n1 x n2 x n3 repeat; the same sites and order as `supercell(s, n1, n2, n3)` in structure.ts. */
export function diagonalSupercell(s: Structure, n1: number, n2: number, n3: number): Structure {
  return supercell(s, [
    [n1, 0, 0],
    [0, n2, 0],
    [0, 0, n3],
  ]);
}

const divisors = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => i + 1).filter((x) => n % x === 0);

/**
 * All lower-triangular Hermite normal forms of determinant n, rows [a 0 0], [b c 0], [d e f] with a c f = n,
 * 0 <= b < a, 0 <= d < a, 0 <= e < c. Each sublattice of index n appears exactly once. Order: a, then c ascending,
 * then b, d, e ascending, so the search below is deterministic.
 */
export function hermiteNormalForms(n: number): IntMat3[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('The determinant must be a positive integer.');
  const out: IntMat3[] = [];
  for (const a of divisors(n))
    for (const c of divisors(n / a)) {
      const f = n / a / c;
      for (let b = 0; b < a; b++)
        for (let d = 0; d < a; d++)
          for (let e = 0; e < c; e++)
            out.push([
              [a, 0, 0],
              [b, c, 0],
              [d, e, f],
            ]);
    }
  return out;
}

const COMM_TOL = 1e-8;
/** True when k . (row of M) is an integer for every row: the wave vector k (reduced, input basis) fits the supercell. */
export function commensurateFor(M: IntMat3, k: Vec3): boolean {
  return M.every((r) => {
    const p = r[0] * k[0] + r[1] * k[1] + r[2] * k[2];
    return Math.abs(p - Math.round(p)) < COMM_TOL;
  });
}

export interface CommensurateOptions {
  /** Largest determinant tried (default 16). */
  maxDet?: number;
  /** Reduce the found cell with the Delaunay reduction of reduction.ts (default true). */
  reduce?: boolean;
}

/**
 * The smallest supercell (by determinant, then by the HNF order) in which every wave vector of `ks` is commensurate.
 * With `reduce` the cell is then replaced by its Delaunay-reduced basis (same lattice, compact shape); the matrix is
 * returned with det > 0. Throws RangeError when no matrix up to `maxDet` works.
 */
export function minimalCommonSupercell(
  s: Structure,
  ks: readonly Vec3[],
  opts: CommensurateOptions = {},
): SupercellResult {
  const maxDet = opts.maxDet ?? 16;
  for (let n = 1; n <= maxDet; n++)
    for (const H of hermiteNormalForms(n)) {
      if (!ks.every((k) => commensurateFor(H, k))) continue;
      let M = H;
      if (opts.reduce ?? true) {
        const sub = H.map((r) => rowOf(s.lattice, r)) as unknown as Mat3;
        const P = reduceBasis(sub).transform;
        M = mulInt(determinant(P) < 0 ? negate(P) : P, H);
      }
      return buildSupercell(s, M);
    }
  throw new RangeError(
    `No supercell with up to ${maxDet} copies of the cell fits these wave vectors. Check that every component is a simple fraction.`,
  );
}

/** The smallest supercell in which one wave vector k (reduced coordinates of the input cell) is commensurate. */
export const minimalCommensurateSupercell = (s: Structure, k: Vec3, opts: CommensurateOptions = {}) =>
  minimalCommonSupercell(s, [k], opts);

/** Smallest diagonal repeat n_i with n_i k_i integer for each i (up to `maxRepeat`, default 12). */
export function diagonalCommensurate(ks: readonly Vec3[], maxRepeat = 12): Int3 {
  const pick = (i: number): number => {
    for (let n = 1; n <= maxRepeat; n++)
      if (ks.every((k) => Math.abs(n * k[i]! - Math.round(n * k[i]!)) < COMM_TOL)) return n;
    throw new RangeError(`No repeat up to ${maxRepeat} along axis ${i + 1} fits these wave vectors.`);
  };
  return [pick(0), pick(1), pick(2)];
}
