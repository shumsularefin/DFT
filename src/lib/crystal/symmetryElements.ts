// Symmetry operations of a given cell, and the geometric symmetry element behind each one (M16, symmetry topic).
// Pure: no moyo, so a 3D scene can rebuild them synchronously on every slider change. The tests check the operation
// counts against moyo (S-032) for the golden structures and the 14 Bravais lattices.
// @source S-105 (operations as a pair (W, w); intrinsic screw and glide translations; location of the element),
// S-036 (lattice point groups; only 1, 2, 3, 4 and 6-fold axes)
import { inv3, mul, transpose } from './linalg';
import { cartToFrac, fracToCart, minimumImageDistance } from './lattice';
import type { IntMat3 } from './pointgroup';
import { delaunayReduction, dotv, rowOf } from './reduction';
import type { Mat3, Structure, Vec3 } from './types';

/** One operation of the cell in fractional coordinates, row convention: f' = f R + t, with t wrapped to [0, 1). */
export interface CellOp {
  rotation: IntMat3;
  translation: Vec3;
}

type V = [number, number, number];
type M = [V, V, V];

const vadd = (a: Vec3, b: Vec3): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a: Vec3, b: Vec3): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vscale = (a: Vec3, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a: Vec3, b: Vec3): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vnorm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): V => {
  const n = vnorm(a);
  return n > 0 ? vscale(a, 1 / n) : [0, 0, 1];
};
const fmul = (f: Vec3, r: IntMat3): V => [
  f[0] * r[0][0] + f[1] * r[1][0] + f[2] * r[2][0],
  f[0] * r[0][1] + f[1] * r[1][1] + f[2] * r[2][1],
  f[0] * r[0][2] + f[1] * r[1][2] + f[2] * r[2][2],
];
const wrap1 = (x: number): number => {
  const y = x - Math.floor(x);
  return y > 1 - 1e-9 || y < 1e-9 ? 0 : y;
};
const wrap3 = (f: Vec3): V => [wrap1(f[0]), wrap1(f[1]), wrap1(f[2])];
const mv = (m: Mat3, x: Vec3): V => [vdot(m[0], x), vdot(m[1], x), vdot(m[2], x)];

/** True when every atom of `s` lands within `tol` (Angstrom) of an atom of the same species under f -> f R + t. */
export function mapsOntoItself(s: Structure, op: CellOp, tol = 1e-3): boolean {
  return mismatch(s, op) < tol;
}

/** Largest distance (Angstrom) from an image f R + t to the nearest atom of the same species, periodic images included. */
export function mismatch(s: Structure, op: CellOp): number {
  let worst = 0;
  for (let i = 0; i < s.frac.length; i++) {
    const img = vadd(fmul(s.frac[i]!, op.rotation), op.translation);
    let best = Infinity;
    for (let j = 0; j < s.frac.length; j++)
      if (s.species[j] === s.species[i])
        best = Math.min(best, minimumImageDistance(img, s.frac[j]!, s.lattice));
    worst = Math.max(worst, best);
  }
  return worst;
}

/**
 * The lattice point group of a cell, in the basis of the cell (row convention f' = f R): the same set as
 * `latticePointGroup` in pointgroup.ts (the tests check this), found faster for a scene that builds on the main thread.
 * In the Delaunay-reduced basis every row of R has entries in {-1, 0, 1} (S-032); the rows are chosen one at a time so
 * that R G R^T = G holds row by row, instead of trying all 3^9 matrices.
 */
export function latticeRotations(lattice: Mat3, relTol = 1e-6): IntMat3[] {
  const P = delaunayReduction(lattice);
  const red: Mat3 = [rowOf(lattice, P[0]), rowOf(lattice, P[1]), rowOf(lattice, P[2])];
  const G = [0, 1, 2].map((i) => [0, 1, 2].map((j) => dotv(red[i]!, red[j]!)));
  const tol = relTol * Math.max(G[0]![0]!, G[1]![1]!, G[2]![2]!);
  const gq = (a: readonly number[], b: readonly number[]) => {
    let x = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) x += a[i]! * G[i]![j]! * b[j]!;
    return x;
  };
  const rowsAll: number[][] = [];
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) rowsAll.push([a, b, c]);
  const cand = [0, 1, 2].map((i) => rowsAll.filter((r) => Math.abs(gq(r, r) - G[i]![i]!) < tol));
  const Pm = P as unknown as Mat3;
  const Pinv = inv3(Pm);
  const out: IntMat3[] = [];
  const near = (x: number, y: number) => Math.abs(x - y) < tol;
  for (const r0 of cand[0]!)
    for (const r1 of cand[1]!) {
      if (!near(gq(r0, r1), G[0]![1]!)) continue;
      for (const r2 of cand[2]!) {
        if (!near(gq(r0, r2), G[0]![2]!) || !near(gq(r1, r2), G[1]![2]!)) continue;
        const R = mul(mul(Pinv, [r0, r1, r2] as unknown as Mat3), Pm);
        out.push(R.map((r) => r.map((x) => Math.round(x) + 0)) as unknown as IntMat3);
      }
    }
  return out;
}

/** Same site modulo the lattice: every fractional difference within `tol` Angstrom of a whole number. */
function sameSite(f1: Vec3, f2: Vec3, edge: Vec3, tol: number): boolean {
  for (let k = 0; k < 3; k++) {
    const d = f1[k]! - f2[k]!;
    if (Math.abs(d - Math.round(d)) * edge[k]! > tol) return false;
  }
  return true;
}

/**
 * All operations (R, t) of the cell that map the structure onto itself: R runs over the lattice point group of the
 * cell (`latticeRotations`), and t over the vectors that take the image of atom 0 onto an atom of its species.
 * For a conventional centred cell the centring translations appear as operations with R = identity.
 */
export function cellOperations(s: Structure, tol = 1e-3): CellOp[] {
  if (!s.frac.length) return [];
  const out: CellOp[] = [];
  const f0 = s.frac[0]!;
  const edge: Vec3 = [vnorm(s.lattice[0]), vnorm(s.lattice[1]), vnorm(s.lattice[2])];
  const n = s.frac.length;
  for (const R of latticeRotations(s.lattice)) {
    const img0 = fmul(f0, R);
    const imgs = s.frac.map((f) => fmul(f, R));
    const seen: V[] = [];
    for (let j = 0; j < n; j++) {
      if (s.species[j] !== s.species[0]) continue;
      const t = wrap3(vsub(s.frac[j]!, img0));
      if (seen.some((u) => sameSite(u, t, edge, tol))) continue;
      let all = true;
      for (let i = 0; i < n && all; i++) {
        const img = vadd(imgs[i]!, t);
        let hit = false;
        for (let k = 0; k < n && !hit; k++)
          hit = s.species[k] === s.species[i] && sameSite(img, s.frac[k]!, edge, tol);
        all = hit;
      }
      if (all) {
        seen.push(t);
        out.push({ rotation: R, translation: t });
      }
    }
  }
  return out;
}

export type ElementKind =
  'identity' | 'translation' | 'rotation' | 'screw' | 'mirror' | 'glide' | 'inversion' | 'rotoinversion';

/** The geometric element of an operation, in Cartesian Angstrom (column convention x' = matrix x + shift). */
export interface SymElement {
  kind: ElementKind;
  /** +1 for a proper rotation, -1 for an improper one. */
  det: 1 | -1;
  /** Rotation angle of the proper part det * W, in radians, 0 to pi. */
  angle: number;
  /** Order n of the proper part (360 / n degrees); 1 for identity, translations and inversion. */
  order: number;
  /** Axis of a rotation, screw or rotoinversion, normal of a mirror or glide (unit vector). */
  axis: V;
  /** A point on the element: on the axis, in the plane, or the inversion centre. */
  point: V;
  /** Screw or glide part (or the whole translation of a pure translation), Cartesian. */
  intrinsic: V;
  /** Hermann-Mauguin style symbol of the element: 4, 2, -1, -3, m, glide, 2_1, 4_2 ... */
  symbol: string;
  matrix: M;
  shift: V;
}

/** Cartesian form of an operation: x' = Mc x + tau with Mc = A^T R^T A^-T and tau = t A (rows of A are the lattice). */
export function cartesianOp(op: CellOp, lattice: Mat3): { matrix: M; shift: V } {
  // the matrix depends only on the rotation and the lattice: cache it (scenes classify one rotation many times)
  let byRot = matrixCache.get(lattice);
  if (!byRot) matrixCache.set(lattice, (byRot = new WeakMap()));
  let matrix = byRot.get(op.rotation);
  if (!matrix) {
    const At = transpose(lattice);
    const Mc = mul(mul(At, transpose(op.rotation as unknown as Mat3)), inv3(At));
    matrix = Mc.map((r) => r.map((x) => (Math.abs(x) < 1e-12 ? 0 : x))) as unknown as M;
    byRot.set(op.rotation, matrix);
  }
  return { matrix, shift: fracToCart(op.translation, lattice) as V };
}
const matrixCache = new WeakMap<Mat3, WeakMap<IntMat3, M>>();
const inverseCache = new WeakMap<Mat3, Mat3>();
/** Fractional coordinates of a Cartesian vector, x A^-1 (row convention), with the inverse cached per lattice. */
function fracOf(x: Vec3, lattice: Mat3): V {
  let Ai = inverseCache.get(lattice);
  if (!Ai) inverseCache.set(lattice, (Ai = inv3(lattice)));
  return [
    x[0] * Ai[0][0] + x[1] * Ai[1][0] + x[2] * Ai[2][0],
    x[0] * Ai[0][1] + x[1] * Ai[1][1] + x[2] * Ai[2][1],
    x[0] * Ai[0][2] + x[1] * Ai[1][2] + x[2] * Ai[2][2],
  ];
}
const periodCache = new WeakMap<Mat3, Map<string, number>>();

const det3 = (m: Mat3): number => vdot(m[0], vcross(m[1], m[2]));

const ORIGIN_ONLY: readonly Vec3[] = [[0, 0, 0]];

/** The centring translations of a cell: the translation parts of the operations whose rotation is the identity. */
export function centringVectors(ops: readonly CellOp[]): Vec3[] {
  const id = (r: IntMat3) => r.every((row, i) => row.every((x, j) => x === (i === j ? 1 : 0)));
  const out = ops.filter((o) => id(o.rotation)).map((o) => o.translation);
  return out.length ? out : [[0, 0, 0]];
}

/**
 * Shortest lattice vector parallel to a unit direction (small integer combinations plus the centring vectors of a
 * conventional cell), or 0 when none is found.
 */
export function latticePeriodAlong(
  u: Vec3,
  lattice: Mat3,
  centring: readonly Vec3[] = ORIGIN_ONLY,
  reach = 3,
): number {
  let memo = periodCache.get(lattice);
  if (!memo) periodCache.set(lattice, (memo = new Map()));
  const key = `${Math.round(u[0] * 1e6)},${Math.round(u[1] * 1e6)},${Math.round(u[2] * 1e6)}|${centring.length}|${reach}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let best = 0;
  for (const c of centring)
    for (let i = -reach; i <= reach; i++)
      for (let j = -reach; j <= reach; j++)
        for (let k = -reach; k <= reach; k++) {
          const f: Vec3 = [i + c[0], j + c[1], k + c[2]];
          if (vnorm(f) < 1e-9) continue;
          const v = fracToCart(f, lattice);
          const L = vnorm(v);
          if (vnorm(vcross(v, u)) < 1e-6 * L && (best === 0 || L < best - 1e-9)) best = L;
        }
  memo.set(key, best);
  return best;
}

/** Solve a 3 x 3 linear system m x = b (Cramer's rule; m must be invertible). */
function solve3(m: M, b: Vec3): V {
  const d = det3(m);
  const col = (k: number): M => m.map((r, i) => r.map((x, j) => (j === k ? b[i]! : x))) as unknown as M;
  return [det3(col(0)) / d, det3(col(1)) / d, det3(col(2)) / d];
}

/**
 * Classify an operation: what element it is, where it sits and how much it slides (S-105). For a conventional centred
 * cell pass its `centringVectors`, so a slide by a centring vector counts as a lattice translation.
 */
export function classify(op: CellOp, lattice: Mat3, centring: readonly Vec3[] = ORIGIN_ONLY): SymElement {
  const { matrix, shift } = cartesianOp(op, lattice);
  const det = det3(matrix) > 0 ? 1 : -1;
  const P = matrix.map((r) => r.map((x) => x * det)) as unknown as M; // proper part
  const tr = P[0][0] + P[1][1] + P[2][2];
  const angle = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  const order = angle < 1e-6 ? 1 : Math.round((2 * Math.PI) / angle);
  let axis: V;
  if (angle < 1e-6) axis = [0, 0, 1];
  else if (Math.PI - angle < 1e-6) {
    // P + I = 2 u u^T: the column with the largest diagonal entry is along u
    const k = [0, 1, 2].reduce((a, b) => (P[b]![b]! > P[a]![a]! ? b : a), 0);
    axis = unit([P[0][k]! + (k === 0 ? 1 : 0), P[1][k]! + (k === 1 ? 1 : 0), P[2][k]! + (k === 2 ? 1 : 0)]);
  } else axis = unit([P[2][1] - P[1][2], P[0][2] - P[2][0], P[1][0] - P[0][1]]);
  // a half turn has no sense: give its axis a canonical sign (first non-zero component positive)
  const ax = Math.PI - angle < 1e-6 && axis.find((x) => Math.abs(x) > 1e-9)! < 0 ? vscale(axis, -1) : axis;
  const base = { det: det as 1 | -1, angle, order, axis: ax, matrix, shift: shift as V };
  const isLatticeVector = (v: Vec3): boolean => {
    const f = fracOf(v, lattice);
    return centring.some((c) =>
      [0, 1, 2].every((k) => Math.abs(f[k]! - c[k]! - Math.round(f[k]! - c[k]!)) < 1e-6),
    );
  };
  const len = vnorm(shift);
  if (det === 1 && order === 1) {
    const kind: ElementKind = len < 1e-6 ? 'identity' : 'translation';
    return { ...base, kind, point: [0, 0, 0], intrinsic: shift, symbol: kind === 'identity' ? '1' : 't' };
  }
  if (det === 1) {
    const par = vscale(ax, vdot(shift, ax));
    const perp = vsub(shift, par);
    // fixed axis: (I - P + u u^T) p = perp, p perpendicular to u
    const m = [0, 1, 2].map((i) =>
      [0, 1, 2].map((j) => (i === j ? 1 : 0) - P[i]![j]! + ax[i]! * ax[j]!),
    ) as unknown as M;
    const point = solve3(m, perp);
    if (vnorm(par) < 1e-6 || isLatticeVector(par))
      return {
        ...base,
        shift: vsub(shift, par),
        kind: 'rotation',
        point,
        intrinsic: [0, 0, 0],
        symbol: String(order),
      };
    // screw n_m: the slide is m / n of the shortest lattice vector along the axis (taken in the sense of the turn)
    const period = latticePeriodAlong(ax, lattice, centring);
    const f = period > 0 ? vdot(par, ax) / period : 0;
    const m2 = ((Math.round(f * order) % order) + order) % order;
    return { ...base, kind: 'screw', point, intrinsic: par, symbol: `${order}_${m2}` };
  }
  if (order === 1)
    return { ...base, kind: 'inversion', point: vscale(shift, 0.5), intrinsic: [0, 0, 0], symbol: '-1' };
  if (order === 2) {
    // mirror: matrix = I - 2 n n^T, plane x . n = (shift . n) / 2, glide = in-plane part of the shift
    const n = ax;
    const sn = vdot(shift, n);
    const glide = vsub(shift, vscale(n, sn));
    const point = vscale(n, sn / 2);
    if (vnorm(glide) > 1e-6 && !isLatticeVector(glide))
      return { ...base, kind: 'glide', point, intrinsic: glide, symbol: 'glide' };
    return { ...base, shift: vsub(shift, glide), kind: 'mirror', point, intrinsic: [0, 0, 0], symbol: 'm' };
  }
  // rotoinversion: the fixed point solves (I - matrix) p = shift
  const m = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) - matrix[i]![j]!)) as unknown as M;
  return {
    ...base,
    kind: 'rotoinversion',
    point: solve3(m, shift),
    intrinsic: [0, 0, 0],
    symbol: `-${order}`,
  };
}

/** Rodrigues rotation of v about the unit axis u by phi (right-handed). */
export function rotateAbout(v: Vec3, u: Vec3, phi: number): V {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return vadd(vadd(vscale(v, c), vscale(vcross(u, v), s)), vscale(u, vdot(u, v) * (1 - c)));
}

/** Apply the full Cartesian operation. */
export const applyOp = (el: Pick<SymElement, 'matrix' | 'shift'>, x: Vec3): V =>
  vadd(mv(el.matrix, x), el.shift);

/**
 * A point moved part of the way (s from 0 to 1) through the operation, along a path that shows what the element does:
 * a turn about the axis (plus the screw slide), a straight pass through a mirror or a centre, a turn then an inversion.
 * At s = 1 it equals `applyOp`.
 */
export function partialOp(el: SymElement, x: Vec3, s: number): V {
  const p = el.point;
  switch (el.kind) {
    case 'identity':
      return [x[0], x[1], x[2]];
    case 'translation':
      return vadd(x, vscale(el.intrinsic, s));
    case 'rotation':
    case 'screw':
      return vadd(vadd(p, rotateAbout(vsub(x, p), el.axis, s * el.angle)), vscale(el.intrinsic, s));
    case 'rotoinversion': {
      const y = vadd(p, rotateAbout(vsub(x, p), el.axis, s * el.angle));
      return vadd(y, vscale(vsub(vsub(vscale(p, 2), y), y), s));
    }
    default: {
      const end = applyOp(el, x);
      return vadd(x, vscale(vsub(end, x), s));
    }
  }
}

/** Distance from a point to the element (axis line, plane, or centre). */
export function distanceToElement(el: SymElement, q: Vec3): number {
  const d = vsub(q, el.point);
  switch (el.kind) {
    case 'rotation':
    case 'screw':
    case 'rotoinversion':
      return vnorm(vcross(d, el.axis));
    case 'mirror':
    case 'glide':
      return Math.abs(vdot(d, el.axis));
    case 'inversion':
      return vnorm(d);
    default:
      return 0;
  }
}

/**
 * The same element moved by a whole lattice translation (-1, 0 or 1 along each vector) to lie closest to `target`.
 * Centring vectors are not added: (R, t + centring) is a different operation, already listed by `cellOperations`.
 */
export function placeNear(
  op: CellOp,
  lattice: Mat3,
  target: Vec3,
  centring: readonly Vec3[] = ORIGIN_ONLY,
): { op: CellOp; element: SymElement } {
  let best: { op: CellOp; element: SymElement } | undefined;
  let bestD = Infinity;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (let k = -1; k <= 1; k++) {
        const cand: CellOp = { rotation: op.rotation, translation: vadd(op.translation, [i, j, k]) };
        const element = classify(cand, lattice, centring);
        const d = distanceToElement(element, target);
        if (d < bestD - 1e-9) {
          bestD = d;
          best = { op: cand, element };
        }
      }
  return best!;
}

/** A Cartesian operation that is not taken from the group (a test move such as a five-fold turn), as a SymElement. */
export function geometricRotation(axis: Vec3, point: Vec3, angle: number, improper = false): SymElement {
  const u = unit(axis);
  const cols = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ].map((e) => rotateAbout(e as V, u, angle));
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => cols[j]![i]! * (improper ? -1 : 1))) as unknown as M;
  // x' = R (x - p) + p
  const shift = vsub(point, mv(R, point));
  const order = angle < 1e-9 ? 1 : Math.round((2 * Math.PI) / angle);
  const kind: ElementKind = improper
    ? order === 2
      ? 'mirror'
      : order === 1
        ? 'inversion'
        : 'rotoinversion'
    : 'rotation';
  return {
    kind,
    det: improper ? -1 : 1,
    angle,
    order,
    axis: u,
    point: [point[0], point[1], point[2]],
    intrinsic: [0, 0, 0],
    symbol: improper ? (order === 2 ? 'm' : `-${order}`) : String(order),
    matrix: R,
    shift,
  };
}

/** Fractional image of a Cartesian point (helper for tests and scenes). */
export const toFrac = (x: Vec3, lattice: Mat3): V => cartToFrac(x, lattice) as V;
