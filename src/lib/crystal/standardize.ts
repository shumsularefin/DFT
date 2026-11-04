// Plain-language description of what standardizing a cell changed.
// @source S-032 (spglib and moyo: standardized cells), S-036 (primitive and conventional cells)
import { transpose } from './linalg';
import { cellVolume, latticeParameters, type LatticeParameters } from './lattice';
import type { SymmetryResult } from './symmetry';
import type { Mat3, Structure } from './types';

export interface StandardizationReport {
  /** False when the input was already the standardized primitive cell (to within 1e-4 relative). */
  changed: boolean;
  atomsBefore: number;
  atomsAfter: number;
  before: LatticeParameters;
  after: LatticeParameters;
  volumeBefore: number;
  volumeAfter: number;
  /** Rows map the input basis to the standardized primitive basis (a_new = sum_j M[i][j] a_old[j]). */
  matrix: Mat3;
  /** Origin shift reported by moyo (fractional coordinates). */
  originShift: readonly [number, number, number];
  /** One short sentence for beginners. */
  headline: string;
  /** Further sentences, shortest explanation first. */
  details: string[];
  /** For each atom of the standardized conventional cell, the index of the atom in the primitive cell it maps to. */
  conventionalToPrimitive: number[];
}

const f = (x: number, d = 4): string => String(Number(x.toFixed(d)));
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a));

/** What changed between the input cell and the standardized primitive cell. */
export function describeStandardization(input: Structure, r: SymmetryResult): StandardizationReport {
  const before = latticeParameters(input.lattice);
  const after = latticeParameters(r.primStdCell.lattice);
  const volumeBefore = cellVolume(input.lattice);
  const volumeAfter = cellVolume(r.primStdCell.lattice);
  const atomsBefore = input.species.length;
  const atomsAfter = r.primStdCell.species.length;
  const sameParams =
    near(before.a, after.a) &&
    near(before.b, after.b) &&
    near(before.c, after.c) &&
    near(before.alpha, after.alpha) &&
    near(before.beta, after.beta) &&
    near(before.gamma, after.gamma);
  const changed = !(sameParams && atomsBefore === atomsAfter && near(volumeBefore, volumeAfter));

  // moyo's linear part acts on columns (A_new = A_in P), so the new vectors are the COLUMNS of P: transpose for rows.
  const matrix = transpose(r.primStdLinear);
  const details: string[] = [];
  let headline: string;
  if (!changed) {
    headline = `Your cell is already the standard primitive cell of space group ${r.hmSymbol} (number ${r.number}). Nothing was changed.`;
  } else {
    headline = `Your cell was rewritten as the standard primitive cell of space group ${r.hmSymbol} (number ${r.number}).`;
    if (atomsAfter < atomsBefore) {
      details.push(
        `It is smaller: ${atomsBefore} atoms became ${atomsAfter}. Your cell repeated a smaller unit, and the primitive cell is the smallest repeat, so the calculation is cheaper and gives the same physics.`,
      );
    } else if (atomsAfter > atomsBefore) {
      details.push(
        `It is larger: ${atomsBefore} atoms became ${atomsAfter}. The standard cell needs more atoms to express the symmetry.`,
      );
    } else {
      details.push(`The number of atoms is unchanged (${atomsAfter}).`);
    }
    details.push(
      `Cell lengths: a, b, c went from ${f(before.a)}, ${f(before.b)}, ${f(before.c)} to ${f(after.a)}, ${f(after.b)}, ${f(after.c)} Angstrom. Angles: alpha, beta, gamma went from ${f(before.alpha, 2)}, ${f(before.beta, 2)}, ${f(before.gamma, 2)} to ${f(after.alpha, 2)}, ${f(after.beta, 2)}, ${f(after.gamma, 2)} degrees.`,
    );
    details.push(
      `Why: a standard setting makes the Brillouin-zone labels and k-paths agree with the literature. The crystal itself is the same; only the choice of axes and origin changed.`,
    );
    if (!near(volumeBefore / atomsBefore, volumeAfter / atomsAfter)) {
      details.push(
        `Volume per atom changed from ${f(volumeBefore / atomsBefore)} to ${f(volumeAfter / atomsAfter)} Angstrom^3 because the symmetry search (tolerance ${r.symprec}) idealized the cell slightly.`,
      );
    }
  }
  return {
    changed,
    atomsBefore,
    atomsAfter,
    before,
    after,
    volumeBefore,
    volumeAfter,
    matrix,
    originShift: r.primStdOriginShift,
    headline,
    details,
    conventionalToPrimitive: [...r.mappingStdPrim],
  };
}
