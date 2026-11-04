// First Brillouin zone by half-space clipping: start from a box that contains the zone and cut it by the bisector plane
// of every short reciprocal lattice vector G (the plane through G/2 with normal G). The zone is the set of points that
// are closer to the origin than to any other reciprocal lattice point, which is what these cuts keep.
// Independent of the golden generator (Qhull Voronoi); no Voronoi or convex-hull code is used.
// @source S-036 (Ashcroft and Mermin: Wigner-Seitz cell of the reciprocal lattice), S-050 (Kittel: Brillouin zones)
import { add, cross, det3, dot, norm, scale, sub } from './linalg';
import { reduceBasis, rowOf } from './reduction';
import type { Mat3, Vec3 } from './types';

export interface BrillouinFace {
  /** Unit outward normal. */
  normal: Vec3;
  /** The foot of the bisector plane, G / 2. */
  planePoint: Vec3;
  /** Indices into `vertices`, counter-clockwise seen from outside. */
  vertexIds: number[];
}

export interface BrillouinZone {
  vertices: Vec3[];
  faces: BrillouinFace[];
  /** Pairs of vertex indices, each pair once, smaller index first. */
  edges: [number, number][];
  /** In (1/Angstrom)^3 when the input is in 1/Angstrom. */
  volume: number;
}

interface Poly {
  pts: Vec3[];
  normal: Vec3;
  point: Vec3;
}

const MERGE_REL = 1e-9;

function box(half: number): Poly[] {
  const out: Poly[] = [];
  const axes: [Vec3, Vec3, Vec3][] = [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
  ];
  for (const [n, u, v] of axes) {
    for (const sgn of [1, -1]) {
      const nn = scale(n, sgn);
      const c = scale(nn, half);
      // u x v = n for these cyclic triples, so (u, v) is counter-clockwise seen from +n; flip for the -n face
      const [uu, vv] = sgn === 1 ? [u, v] : [v, u];
      const p = (a: number, b: number): Vec3 => add(c, add(scale(uu, a * half), scale(vv, b * half)));
      out.push({ pts: [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)], normal: nn, point: c });
    }
  }
  return out;
}

const closeTo = (a: Vec3, b: Vec3, tol: number): boolean =>
  Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;

/** Cut every polygon by n . x <= d; returns the new polyhedron (the cut face is appended). */
function clip(polys: Poly[], n: Vec3, d: number, eps: number): Poly[] {
  const out: Poly[] = [];
  const onPlane: Vec3[] = [];
  for (const f of polys) {
    const s = f.pts.map((p) => dot(n, p) - d);
    const kept: Vec3[] = [];
    for (let i = 0; i < f.pts.length; i++) {
      const j = (i + 1) % f.pts.length;
      const a = f.pts[i]!;
      const b = f.pts[j]!;
      const sa = s[i]!;
      const sb = s[j]!;
      const inA = sa <= eps;
      const inB = sb <= eps;
      if (inA) kept.push(a);
      if (inA !== inB && Math.abs(sa) > eps && Math.abs(sb) > eps) {
        const t = sa / (sa - sb);
        kept.push(add(a, scale(sub(b, a), t)));
      }
    }
    const pts: Vec3[] = [];
    for (const p of kept) if (!pts.length || !closeTo(p, pts[pts.length - 1]!, eps)) pts.push(p);
    while (pts.length > 1 && closeTo(pts[0]!, pts[pts.length - 1]!, eps)) pts.pop();
    if (pts.length < 3) continue;
    for (const p of pts) if (Math.abs(dot(n, p) - d) <= eps) onPlane.push(p);
    out.push({ pts, normal: f.normal, point: f.point });
  }
  // the new face: distinct vertices lying on the cutting plane, ordered counter-clockwise seen from outside
  const cut: Vec3[] = [];
  for (const p of onPlane) if (!cut.some((q) => closeTo(p, q, eps))) cut.push(p);
  if (cut.length >= 3) {
    const c = scale(
      cut.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3),
      1 / cut.length,
    );
    const ref = Math.abs(n[0]) < 0.9 ? ([1, 0, 0] as Vec3) : ([0, 1, 0] as Vec3);
    const u = scale(cross(n, ref), 1 / norm(cross(n, ref)));
    const v = cross(n, u);
    const ordered = cut
      .map((p) => ({ p, ang: Math.atan2(dot(sub(p, c), v), dot(sub(p, c), u)) }))
      .sort((x, y) => x.ang - y.ang)
      .map((x) => x.p);
    let area2 = 0;
    for (let i = 0; i < ordered.length; i++) {
      const w = cross(sub(ordered[i]!, ordered[0]!), sub(ordered[(i + 1) % ordered.length]!, ordered[0]!));
      area2 += dot(w, n);
    }
    // a plane that only touches an edge or a vertex has no area and is not a face
    if (area2 > eps * eps * 10 && area2 > 1e-12 * d * d)
      out.push({ pts: ordered, normal: n, point: scale(n, d) });
  }
  return out;
}

/**
 * The first Brillouin zone of a lattice given by its reciprocal lattice rows (include the factor 2 pi if you want
 * 1/Angstrom). Candidates for the cutting vectors are all integer combinations with coefficients in -2..2 of a
 * Delaunay-reduced basis, which contains every Voronoi-relevant vector.
 */
export function brillouinZone(reciprocal: Mat3): BrillouinZone {
  if (Math.abs(det3(reciprocal)) < 1e-12 * Math.max(1, norm(reciprocal[0]) ** 3))
    throw new RangeError('The lattice vectors are not independent, so there is no Brillouin zone.');
  const { reduced } = reduceBasis(reciprocal);
  const size = Math.max(norm(reduced[0]), norm(reduced[1]), norm(reduced[2]));
  const eps = MERGE_REL * size;
  // every point of the zone is within the sum of the reduced vector lengths of the origin
  let polys = box(norm(reduced[0]) + norm(reduced[1]) + norm(reduced[2]));
  const cands: { g: Vec3; len: number }[] = [];
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      for (let k = -2; k <= 2; k++) {
        if (i === 0 && j === 0 && k === 0) continue;
        const g = rowOf(reduced, [i, j, k]);
        cands.push({ g, len: norm(g) });
      }
  // nearest planes first: they cut the most, so later cuts meet small polygons
  cands.sort((a, b) => a.len - b.len);
  for (const { g, len } of cands) polys = clip(polys, scale(g, 1 / len), len / 2, eps);

  // merge vertices and number them
  const vertices: Vec3[] = [];
  const idOf = (p: Vec3): number => {
    const found = vertices.findIndex((q) => closeTo(p, q, eps * 10));
    if (found >= 0) return found;
    vertices.push(p);
    return vertices.length - 1;
  };
  const faces: BrillouinFace[] = polys.map((f) => {
    const ids: number[] = [];
    for (const p of f.pts) {
      const id = idOf(p);
      if (ids[ids.length - 1] !== id) ids.push(id);
    }
    while (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
    return { normal: f.normal, planePoint: f.point, vertexIds: ids };
  });
  const edgeSet = new Map<string, [number, number]>();
  for (const f of faces)
    f.vertexIds.forEach((a, i) => {
      const b = f.vertexIds[(i + 1) % f.vertexIds.length]!;
      if (a === b) return;
      const e: [number, number] = a < b ? [a, b] : [b, a];
      edgeSet.set(`${e[0]},${e[1]}`, e);
    });
  let volume = 0;
  for (const f of faces) {
    const p0 = vertices[f.vertexIds[0]!]!;
    for (let i = 1; i + 1 < f.vertexIds.length; i++)
      volume += dot(p0, cross(vertices[f.vertexIds[i]!]!, vertices[f.vertexIds[i + 1]!]!)) / 6;
  }
  return { vertices, faces, edges: [...edgeSet.values()], volume };
}
