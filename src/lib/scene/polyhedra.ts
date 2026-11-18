// Coordination polyhedra by distance cutoff, with periodic images, and their convex hull for display (M12.2).
// A polyhedron joins the ligand atoms found within the cutoff of a centre atom. This is the VESTA-style drawing convention
// (S-043), a picture of geometry, not a bond-valence or oxidation-state result.
// @source S-043
import { fracToCart } from '../crystal/lattice';
import type { Structure, Vec3 } from '../crystal/types';

export interface Neighbour {
  /** Index of the site in the structure. */
  site: number;
  /** Cartesian position of this image, Angstrom. */
  cart: Vec3;
  distance: number;
}

export interface Polyhedron {
  centreSite: number;
  centre: Vec3;
  vertices: Neighbour[];
  /** Faces as vertex-index loops (coplanar vertices are merged into one polygon, in boundary order). */
  faces: number[][];
  /** Unique edges as vertex-index pairs. */
  edges: [number, number][];
}

const EPS = 1e-9;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

/** Atoms of the listed elements within `cutoffA` of site `i`, over the periodic images of the cell (nearest first). */
export function neighbours(
  s: Structure,
  i: number,
  elements: readonly string[],
  cutoffA: number,
  reach = 2,
): Neighbour[] {
  const c = fracToCart(s.frac[i]!, s.lattice);
  const out: Neighbour[] = [];
  s.frac.forEach((f, j) => {
    if (!elements.includes(s.species[j]!)) return;
    for (let a = -reach; a <= reach; a++)
      for (let b = -reach; b <= reach; b++)
        for (let k = -reach; k <= reach; k++) {
          const p = fracToCart([f[0] + a, f[1] + b, f[2] + k], s.lattice);
          const d = norm(sub(p, c));
          if (d > 1e-6 && d <= cutoffA) out.push({ site: j, cart: p, distance: d });
        }
  });
  return out.sort((x, y) => x.distance - y.distance || x.site - y.site);
}

/**
 * Convex hull of a small point set (a coordination shell has 4 to 12 vertices, so the O(n^4) search is fine).
 * Faces are the supporting planes; points lying on one plane are merged into one polygon. Returns no faces when the points
 * are fewer than four or all coplanar.
 */
export function convexHull(points: readonly Vec3[]): { faces: number[][]; edges: [number, number][] } {
  const n = points.length;
  const found = new Map<string, number[]>();
  const scale = Math.max(1, ...points.map(norm));
  const tol = EPS * scale * scale;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const nrm = cross(sub(points[j]!, points[i]!), sub(points[k]!, points[i]!));
        const len = norm(nrm);
        if (len < tol) continue; // collinear
        let pos = 0;
        let neg = 0;
        const on: number[] = [];
        for (let m = 0; m < n; m++) {
          const side = dot(nrm, sub(points[m]!, points[i]!)) / len;
          if (Math.abs(side) <= 1e-7 * scale) on.push(m);
          else if (side > 0) pos++;
          else neg++;
        }
        if (pos > 0 && neg > 0) continue; // not a supporting plane
        if (pos === 0 && neg === 0) continue; // all coplanar: no volume
        found.set(on.join(','), on);
      }
  const faces: number[][] = [];
  for (const on of found.values()) {
    // order the polygon about its centroid
    const acc = [0, 0, 0];
    for (const m of on) for (let d = 0; d < 3; d++) acc[d] = acc[d]! + points[m]![d]! / on.length;
    const cen = acc as unknown as Vec3;
    const nrm = cross(sub(points[on[1]!]!, points[on[0]!]!), sub(points[on[2]!]!, points[on[0]!]!));
    const u = sub(points[on[0]!]!, cen);
    const v = cross(nrm, u);
    const ang = (m: number) => {
      const r = sub(points[m]!, cen);
      return Math.atan2(dot(r, v) / norm(v), dot(r, u) / norm(u));
    };
    faces.push([...on].sort((a, b) => ang(a) - ang(b)));
  }
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const f of faces)
    f.forEach((a, idx) => {
      const b = f[(idx + 1) % f.length]!;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(a < b ? [a, b] : [b, a]);
      }
    });
  return { faces, edges };
}

/** Faces counted as triangles (a polygon of m vertices is m-2 triangles), for readouts and tests. */
export const triangleCount = (faces: readonly number[][]): number =>
  faces.reduce((t, f) => t + f.length - 2, 0);

export interface PolyhedraRequest {
  centre: readonly string[];
  ligand: readonly string[];
  cutoffA: number;
}

/** One polyhedron per centre atom that has at least four ligands within the cutoff. */
export function coordinationPolyhedra(s: Structure, req: PolyhedraRequest): Polyhedron[] {
  const out: Polyhedron[] = [];
  s.species.forEach((sp, i) => {
    if (!req.centre.includes(sp)) return;
    const vertices = neighbours(s, i, req.ligand, req.cutoffA);
    if (vertices.length < 4) return;
    const { faces, edges } = convexHull(vertices.map((v) => v.cart));
    if (faces.length === 0) return;
    out.push({ centreSite: i, centre: fracToCart(s.frac[i]!, s.lattice), vertices, faces, edges });
  });
  return out;
}
