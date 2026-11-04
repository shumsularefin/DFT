// Atom positions for drawing a unit cell or a repeated block of cells (M5.5). Pure geometry, no science beyond the
// definition of fractional coordinates.
import { fracToCart } from './lattice';
import type { Mat3, Structure, Vec3 } from './types';

export interface DrawnAtom {
  species: string;
  /** Cartesian position in Angstrom, relative to the corner of the block. */
  cart: Vec3;
  /** True for a periodic image drawn on the far face, edge or corner of the block. */
  image: boolean;
}

const EPS = 1e-6;

/**
 * Atoms of an na x nb x nc block of cells. Coordinates are wrapped into [0, 1) first. With `boundaryImages`, an atom that
 * sits on a cell face, edge or corner (a fractional coordinate of 0) is also drawn at the far side of the block, the way
 * crystal viewers show it: a conventional fcc cell then shows 14 atoms although it holds 4.
 */
export function cellAtoms(
  s: Structure,
  repeat: readonly [number, number, number] = [1, 1, 1],
  boundaryImages = true,
): DrawnAtom[] {
  for (const n of repeat)
    if (!Number.isInteger(n) || n < 1) throw new RangeError('repeats must be positive integers');
  const out: DrawnAtom[] = [];
  s.frac.forEach((f0, idx) => {
    const f = f0.map((x) => {
      const w = x - Math.floor(x + EPS);
      return Math.abs(w) < EPS ? 0 : w;
    }) as unknown as Vec3;
    const shifts: number[][] = [[], [], []];
    for (let ax = 0; ax < 3; ax++) {
      for (let i = 0; i < repeat[ax]!; i++) shifts[ax]!.push(i);
    }
    const extra: boolean[] = [0, 1, 2].map((ax) => boundaryImages && f[ax] === 0);
    const ax0 = extra[0] ? [...shifts[0]!, repeat[0]] : shifts[0]!;
    const ax1 = extra[1] ? [...shifts[1]!, repeat[1]] : shifts[1]!;
    const ax2 = extra[2] ? [...shifts[2]!, repeat[2]] : shifts[2]!;
    for (const i of ax0)
      for (const j of ax1)
        for (const k of ax2) {
          const image = i >= repeat[0] || j >= repeat[1] || k >= repeat[2];
          out.push({
            species: s.species[idx]!,
            cart: fracToCart([f[0] + i, f[1] + j, f[2] + k], s.lattice),
            image,
          });
        }
  });
  return out;
}

/** The outline cells of a block: one parallelepiped origin per cell, in Angstrom. */
export function cellOrigins(lattice: Mat3, repeat: readonly [number, number, number]): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < repeat[0]; i++)
    for (let j = 0; j < repeat[1]; j++)
      for (let k = 0; k < repeat[2]; k++) out.push(fracToCart([i, j, k], lattice));
  return out;
}
