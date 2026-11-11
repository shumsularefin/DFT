// k-meshes in the reciprocal lattice basis, orbit counting under a point group, and the mesh-symmetry test.
// @source S-007 (Monkhorst-Pack meshes), S-032 (irreducible points as spglib counts them), S-019 (VASP wiki KPOINTS: avoid even MP meshes on hexagonal lattices), D-044.
// Points are fractional coordinates q along b1, b2, b3. A mesh point is (g + s) / n with g = 0..n-1 and s = 0 or 1/2.
// A rotation R of the real-space lattice (f' = f R) acts on q as q' = q (R^-1)^T (inverse transpose).
import { intInverse, type IntMat3 } from './pointgroup';
import type { Vec3 } from './types';

export type Centering = 'gamma' | 'monkhorst-pack';
export type MeshDivisions = readonly [number, number, number];

/** Shift flags per axis (true = half a step). Gamma: none. Monkhorst-Pack (VASP): half a step on even n only (S-007). */
export const shiftFlags = (n: MeshDivisions, c: Centering): [boolean, boolean, boolean] =>
  n.map((x) => c === 'monkhorst-pack' && x % 2 === 0) as [boolean, boolean, boolean];

const fold = (x: number) => (Math.abs(x) < 1e-15 ? 0 : x);

export interface MeshPoints {
  n: MeshDivisions;
  centering: Centering;
  shift: [boolean, boolean, boolean];
  /** Fractional coordinates, 3 per point, ordered with the third index fastest. Folded into (-1/2, 1/2]. */
  coords: Float64Array;
  count: number;
}

/** All points of the mesh as fractional coordinates in (-1/2, 1/2]. Monkhorst-Pack even n gives the VASP set (2r-n-1)/(2n). */
export function meshPoints(n: MeshDivisions, centering: Centering): MeshPoints {
  if (n.some((x) => !Number.isInteger(x) || x < 1))
    throw new RangeError('Mesh divisions must be positive integers.');
  const shift = shiftFlags(n, centering);
  const count = n[0] * n[1] * n[2];
  const coords = new Float64Array(3 * count);
  const axis = (g: number, k: 0 | 1 | 2): number => {
    let q = (g + (shift[k] ? 0.5 : 0)) / n[k];
    if (q > 0.5 + 1e-12) q -= 1;
    // a half-shifted mesh is symmetric about zero: -0.5 + eps and 0.5 never both occur; keep (-1/2, 1/2]
    return fold(q);
  };
  let p = 0;
  for (let i = 0; i < n[0]; i++)
    for (let j = 0; j < n[1]; j++)
      for (let k = 0; k < n[2]; k++) {
        coords[p++] = axis(i, 0);
        coords[p++] = axis(j, 1);
        coords[p++] = axis(k, 2);
      }
  return { n, centering, shift, coords, count };
}

/** The reciprocal-space action of each rotation, q' = q (R^-1)^T, optionally with time reversal (q -> -q) added. */
export function reciprocalActions(rotations: readonly IntMat3[], timeReversal: boolean): IntMat3[] {
  const acts = rotations.map((r) => {
    const inv = intInverse(r);
    return [
      [inv[0][0], inv[1][0], inv[2][0]],
      [inv[0][1], inv[1][1], inv[2][1]],
      [inv[0][2], inv[1][2], inv[2][2]],
    ] as unknown as IntMat3;
  });
  if (!timeReversal) return acts;
  const neg = acts.map((m) => m.map((row) => row.map((x) => -x + 0)) as unknown as IntMat3);
  return [...acts, ...neg];
}

/** Grid index of the image of grid point (i, j, k) under action m, or -1 when the image is not a mesh point. */
function image(
  m: IntMat3,
  n: MeshDivisions,
  shift: readonly boolean[],
  i: number,
  j: number,
  k: number,
): number {
  // doubled address a = 2 g + shift flag; a'_c = sum_r a_r m[r][c] n_c / n_r, taken mod 2 n_c
  const a = [2 * i + (shift[0] ? 1 : 0), 2 * j + (shift[1] ? 1 : 0), 2 * k + (shift[2] ? 1 : 0)];
  const g: number[] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let v = 0;
    for (let r = 0; r < 3; r++) v += (a[r]! * m[r]![c]! * n[c]!) / n[r]!;
    const vr = Math.round(v);
    if (Math.abs(v - vr) > 1e-9) return -1;
    const mod = ((vr % (2 * n[c]!)) + 2 * n[c]!) % (2 * n[c]!);
    const flag = shift[c] ? 1 : 0;
    if (mod % 2 !== flag) return -1;
    g[c] = (mod - flag) / 2;
  }
  return (g[0]! * n[1] + g[1]!) * n[2] + g[2]!;
}

export interface Reduction {
  total: number;
  irreducible: number;
  /** Representative grid index of the class of each point, in the order of `meshPoints`. */
  classOf: Int32Array;
  /** Representatives in order of first appearance with their weight (class size / total). */
  representatives: { index: number; size: number; weight: number }[];
}

/**
 * Irreducible points: the classes of mesh points joined by the rotations (and time reversal) whenever the image is
 * itself a mesh point. This is how a library reduces a mesh that may not have the full symmetry (S-032 behaviour,
 * checked against the golden spglib counts).
 */
export function irreducibleCount(
  n: MeshDivisions,
  centering: Centering,
  rotations: readonly IntMat3[],
  opts: { timeReversal?: boolean } = {},
): Reduction {
  const shift = shiftFlags(n, centering);
  const acts = reciprocalActions(rotations, opts.timeReversal ?? true);
  const total = n[0] * n[1] * n[2];
  const parent = new Int32Array(total).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  for (let i = 0; i < n[0]; i++)
    for (let j = 0; j < n[1]; j++)
      for (let k = 0; k < n[2]; k++) {
        const p = (i * n[1] + j) * n[2] + k;
        for (const m of acts) {
          const q = image(m, n, shift, i, j, k);
          if (q < 0) continue;
          const a = find(p);
          const b = find(q);
          if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
        }
      }
  const classOf = new Int32Array(total);
  const sizes = new Map<number, number>();
  for (let p = 0; p < total; p++) {
    const r = find(p);
    classOf[p] = r;
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  const representatives = [...sizes.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, size]) => ({ index, size, weight: size / total }));
  return { total, irreducible: representatives.length, classOf, representatives };
}

export interface SymmetryReport {
  symmetric: boolean;
  /** Rotations (of the group given) that send at least one mesh point off the mesh. */
  failing: number;
  of: number;
  /** One sentence naming the reason, used by the lab. */
  reason: string;
}

/** True when every rotation maps the whole mesh onto itself. */
export function meshIsSymmetric(
  n: MeshDivisions,
  centering: Centering,
  rotations: readonly IntMat3[],
): boolean {
  return meshSymmetryReport(n, centering, rotations).symmetric;
}

export function meshSymmetryReport(
  n: MeshDivisions,
  centering: Centering,
  rotations: readonly IntMat3[],
): SymmetryReport {
  const shift = shiftFlags(n, centering);
  const acts = reciprocalActions(rotations, false);
  let failing = 0;
  for (const m of acts) {
    let bad = false;
    for (let i = 0; i < n[0] && !bad; i++)
      for (let j = 0; j < n[1] && !bad; j++)
        for (let k = 0; k < n[2] && !bad; k++) if (image(m, n, shift, i, j, k) < 0) bad = true;
    if (bad) failing++;
  }
  const symmetric = failing === 0;
  const anyShift = shift.some(Boolean);
  const reason = symmetric
    ? anyShift
      ? 'Every symmetry operation of the lattice maps the mesh onto itself, even though it is shifted off Gamma.'
      : 'The mesh contains Gamma and every symmetry operation of the lattice maps it onto itself.'
    : `${failing} of ${acts.length} symmetry operations of the lattice send some mesh points off the mesh, so the mesh has lower symmetry than the crystal. ` +
      (anyShift
        ? 'An even Monkhorst-Pack mesh is shifted off Gamma; on hexagonal and fcc lattices that shift is not preserved by every rotation. A Gamma-centred mesh keeps the full symmetry, and the VASP wiki advises against even Monkhorst-Pack meshes on hexagonal lattices.'
        : 'The three divisions are not equivalent under the lattice symmetry, so a rotation turns one direction into another with a different spacing.');
  return { symmetric, failing, of: acts.length, reason };
}

/** Cartesian k of fractional q: q B with B the reciprocal lattice rows (1/Angstrom, with 2 pi). */
export const qToCartesian = (q: Vec3, b: readonly [Vec3, Vec3, Vec3]): Vec3 => [
  q[0] * b[0][0] + q[1] * b[1][0] + q[2] * b[2][0],
  q[0] * b[0][1] + q[1] * b[1][1] + q[2] * b[2][1],
  q[0] * b[0][2] + q[1] * b[1][2] + q[2] * b[2][2],
];
