// Pure fix functions for the validity engine: each takes a structure and returns a new one; the input is
// never modified. Labels and selective-dynamics flags follow their sites.
import { cartToFrac, wrapFrac } from '../crystal/lattice';
import { add, norm, scale, sub, vecMat } from '../crystal/linalg';
import { deleteSites, wrapStructure } from '../crystal/structure';
import { mergeDuplicates as mergeDuplicatesOp } from '../crystal/ops';
import type { Mat3, Structure, Vec3 } from '../crystal/types';
import { THRESHOLDS } from './rules';

export const wrapAll = (s: Structure): Structure => wrapStructure(s);

/** Remove the listed sites. */
export const deleteAtoms = deleteSites;

/** Replace site i by the midpoint of i and the image of j (translation `image`), then delete j. */
export function mergeAtoms(s: Structure, i: number, j: number, image: Vec3 = [0, 0, 0]): Structure {
  const fj = add(s.frac[j]!, image);
  const mid = wrapFrac(scale(add(s.frac[i]!, fj), 0.5));
  const moved: Structure = { ...s, frac: s.frac.map((f, k) => (k === i ? mid : f)) };
  return deleteAtoms(moved, [j]);
}

/**
 * Move i and the image of j apart along the line joining them, each by half the change, until they are
 * `target` angstrom apart. Coincident atoms have no direction and are returned unchanged.
 */
export function moveApart(s: Structure, i: number, j: number, image: Vec3, target: number): Structure {
  const v = vecMat(sub(add(s.frac[j]!, image), s.frac[i]!), s.lattice);
  const d = norm(v);
  if (d < 1e-9) return s;
  const shift = scale(v, (target - d) / (2 * d)); // Cartesian, applied +j and -i
  const df = cartToFrac(shift, s.lattice);
  return {
    ...s,
    frac: s.frac.map((f, k) => {
      if (i === j) return f;
      if (k === i) return wrapFrac(sub(f, df));
      if (k === j) return wrapFrac(add(f, df));
      return f;
    }),
  };
}

/** Scale all lattice vectors by `factor`; fractional coordinates are kept, so every distance scales too. */
export function scaleCell(s: Structure, factor: number): Structure {
  const L = s.lattice.map((r) => scale(r, factor)) as unknown as Mat3;
  return { ...s, lattice: L };
}

/** Keep the first of every group of same-species atoms within 0.1 angstrom (after wrapping); delete the rest. */
export const mergeDuplicates = (s: Structure): Structure =>
  mergeDuplicatesOp(s, THRESHOLDS.mergeDistance).structure;
