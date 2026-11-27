// Crystal view directions (M16.1): view along a, b, c, a*, b*, c*, a direction [uvw] or the normal of a plane (hkl), and an
// isometric view, for any lattice. Pure. The lattice is given as rows a, b, c in Cartesian coordinates (the scene frame).
// Up-vector rule (VESTA-like): along a, b and their reciprocals, c points up; along c and c*, b points up; along [uvw] or the
// (hkl) normal, c is up unless it is (nearly) parallel to the view, then b. "View along d" means the reader looks down d:
// d points towards the reader and the camera sits on the +d side.
// @source S-043 (VESTA viewer conventions, prior art for the up-vector rule)
import { angleBetween, cross, invert3, normalize, norm, type Vec3 } from './math';

export type Lattice = readonly [Vec3, Vec3, Vec3];
export type ViewName = 'a' | 'b' | 'c' | 'a*' | 'b*' | 'c*' | 'iso';

export interface View {
  /** Unit vector from the target towards the camera (the reader looks down -eye). */
  eye: Vec3;
  /** Screen-up hint (the camera takes the component perpendicular to the view). */
  up: Vec3;
}

/** Reciprocal lattice rows a*, b*, c* without the 2 pi factor: a_i . a*_j = delta_ij. */
export function reciprocal(l: Lattice): Lattice {
  const inv = invert3(l);
  if (!inv) throw new Error('singular lattice');
  // columns of inv(L) are the reciprocal vectors
  const col = (j: number): Vec3 => [inv[0]![j]!, inv[1]![j]!, inv[2]![j]!];
  return [col(0), col(1), col(2)];
}

const nearlyParallel = (a: Vec3, b: Vec3): boolean => norm(cross(normalize(a), normalize(b))) < 1e-3;

function withUp(dir: Vec3, preferred: Vec3, fallback: Vec3): View {
  const eye = normalize(dir);
  return { eye, up: nearlyParallel(eye, preferred) ? normalize(fallback) : normalize(preferred) };
}

export function namedView(name: ViewName, l: Lattice): View {
  const [a, b, c] = l;
  const [as, bs, cs] = reciprocal(l);
  switch (name) {
    case 'a':
      return withUp(a, c, b);
    case 'b':
      return withUp(b, c, a);
    case 'c':
      return withUp(c, b, a);
    case 'a*':
      return withUp(as, c, b);
    case 'b*':
      return withUp(bs, c, a);
    case 'c*':
      return withUp(cs, b, a);
    case 'iso': {
      // the corner a + b + c seen slightly from the side, so the three axes are all visible
      const d: Vec3 = [
        normalize(a)[0] * 1 + normalize(b)[0] * -0.55 + normalize(c)[0] * 0.65,
        normalize(a)[1] * 1 + normalize(b)[1] * -0.55 + normalize(c)[1] * 0.65,
        normalize(a)[2] * 1 + normalize(b)[2] * -0.55 + normalize(c)[2] * 0.65,
      ];
      return withUp(d, c, b);
    }
  }
}

/** Direction [uvw] in the lattice: u a + v b + w c. Null for [000]. */
export function directionView(uvw: readonly [number, number, number], l: Lattice): View | null {
  const d: Vec3 = [0, 1, 2].map((k) => uvw[0] * l[0][k]! + uvw[1] * l[1][k]! + uvw[2] * l[2][k]!) as Vec3;
  if (norm(d) < 1e-12) return null;
  return withUp(d, l[2], l[1]);
}

/** Normal of the plane (hkl): h a* + k b* + l c*. Null for (000). */
export function planeNormalView(hkl: readonly [number, number, number], l: Lattice): View | null {
  const r = reciprocal(l);
  const d: Vec3 = [0, 1, 2].map((k) => hkl[0] * r[0][k]! + hkl[1] * r[1][k]! + hkl[2] * r[2][k]!) as Vec3;
  if (norm(d) < 1e-12) return null;
  return withUp(d, l[2], l[1]);
}

/** Parse "1 1 0", "[110]", "(1-10)" or "1,1,0" into three integers; null when it is not three integers or all zero. */
export function parseIndices(text: string): [number, number, number] | null {
  const t = text.trim().replace(/^[[(]|[\])]$/g, '');
  let parts = t.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 1 && /^-?\d-?\d-?\d$/.test(parts[0]!)) parts = parts[0]!.match(/-?\d/g)!;
  if (parts.length !== 3 || !parts.every((p) => /^-?\d+$/.test(p))) return null;
  const v = parts.map(Number) as [number, number, number];
  return v.some((x) => x !== 0) ? v : null;
}

/** For tests: the angle between the view direction and a vector. */
export const viewAngle = (v: View, d: Vec3): number => {
  const a = angleBetween(v.eye, d);
  return Math.min(a, Math.PI - a);
};
