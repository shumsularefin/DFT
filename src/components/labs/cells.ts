import type { Mat3 } from '../../lib/crystal/types';

const fcc = (a: number): Mat3 => [
  [0, a / 2, a / 2],
  [a / 2, 0, a / 2],
  [a / 2, a / 2, 0],
];

/** Cells offered by the labs. Lengths in Angstrom. */
export const CELLS: Record<string, { label: string; lattice: Mat3 }> = {
  sc: {
    label: 'Simple cubic, a = 4.0 Å',
    lattice: [
      [4, 0, 0],
      [0, 4, 0],
      [0, 0, 4],
    ],
  },
  fcc: { label: 'fcc Cu primitive cell, a = 3.61 Å', lattice: fcc(3.61) },
  bcc: {
    label: 'bcc primitive cell, a = 3.0 Å',
    lattice: [
      [-1.5, 1.5, 1.5],
      [1.5, -1.5, 1.5],
      [1.5, 1.5, -1.5],
    ],
  },
  hex: {
    label: 'Hexagonal, a = 3.0 Å, c = 5.0 Å',
    lattice: [
      [3, 0, 0],
      [-1.5, (3 * Math.sqrt(3)) / 2, 0],
      [0, 0, 5],
    ],
  },
};
