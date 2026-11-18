// Measuring in a periodic structure (M12.6): minimum-image vectors, distance, angle, dihedral and coordination number.
// Pure functions. The bond rule is the drawing heuristic of M12.2, not a bond-order result.
// @source S-021 (covalent radii for the bond rule)
import { covalentRadius } from './covalent';
import { add, cross, dot, norm, sub } from './linalg';
import { fracToCart } from './lattice';
import type { Structure, Vec3 } from './types';

const DEFAULT_TOLERANCE = 1.15;

/** Minimum-image Cartesian vector from site `a` to site `b` (Angstrom), searching images within `reach` cells. */
export function minimumImageVector(s: Structure, a: number, b: number, reach = 2): Vec3 {
  const d0 = sub(s.frac[b]!, s.frac[a]!);
  const d: Vec3 = [d0[0] - Math.round(d0[0]), d0[1] - Math.round(d0[1]), d0[2] - Math.round(d0[2])];
  let best: Vec3 = fracToCart(d, s.lattice);
  let bn = norm(best);
  for (let i = -reach; i <= reach; i++)
    for (let j = -reach; j <= reach; j++)
      for (let k = -reach; k <= reach; k++) {
        const v = fracToCart(add(d, [i, j, k]), s.lattice);
        const n = norm(v);
        if (n < bn - 1e-12) {
          best = v;
          bn = n;
        }
      }
  return best;
}

export const distance = (s: Structure, a: number, b: number): number => norm(minimumImageVector(s, a, b));

const deg = (r: number): number => (r * 180) / Math.PI;

/** Angle at `centre` between sites `a` and `b`, in degrees, from the minimum-image vectors out of the centre. */
export function angle(s: Structure, a: number, centre: number, b: number): number {
  const u = minimumImageVector(s, centre, a);
  const v = minimumImageVector(s, centre, b);
  const c = dot(u, v) / (norm(u) * norm(v));
  return deg(Math.acos(Math.max(-1, Math.min(1, c))));
}

/**
 * Dihedral angle of the chain a-b-c-d in degrees, in (-180, 180]. The three bond vectors are minimum-image vectors
 * between consecutive sites (IUPAC sign: positive when looking along b to c the far bond turns clockwise).
 */
export function dihedral(s: Structure, a: number, b: number, c: number, d: number): number {
  const b1 = minimumImageVector(s, a, b);
  const b2 = minimumImageVector(s, b, c);
  const b3 = minimumImageVector(s, c, d);
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  const m1 = cross(n1, [b2[0] / norm(b2), b2[1] / norm(b2), b2[2] / norm(b2)] as Vec3);
  return deg(Math.atan2(dot(m1, n2), dot(n1, n2)));
}

/** Neighbours of a site within the bond rule, counting every periodic image (so a small cell still gives the true count). */
export function coordination(
  s: Structure,
  site: number,
  tolerance = DEFAULT_TOLERANCE,
): { count: number; distances: number[] } {
  const r0 = covalentRadius(s.species[site]!).radius;
  const out: number[] = [];
  const reach = 2;
  s.frac.forEach((f, j) => {
    const lim = (r0 + covalentRadius(s.species[j]!).radius) * tolerance;
    const d0 = sub(f, s.frac[site]!);
    for (let i = -reach; i <= reach; i++)
      for (let k = -reach; k <= reach; k++)
        for (let l = -reach; l <= reach; l++) {
          const n = norm(fracToCart(add(d0, [i, k, l]), s.lattice));
          if (n > 0.1 && n < lim) out.push(n);
        }
  });
  return { count: out.length, distances: out.sort((x, y) => x - y) };
}
