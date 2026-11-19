// Structure exporters: POSCAR, CIF (P1 or with symmetry) and extended XYZ. Each round-trips through readStructure.
// @source S-019 (POSCAR), S-034 (CIF as written by pymatgen's CifWriter), S-054 (extended XYZ), S-032 (operations from moyo)
import { writeCif, writeCifWithSymmetry } from './cif';
import { fracToCart } from './lattice';
import { writePoscar } from './poscar';
import { analyzeWith, type MoyoApi } from './symmetry';
import type { Structure } from './types';

export interface ExportResult {
  text: string;
  filename: string;
  /** What the user should know about the file (reordering, the cell that was written). */
  notes: string[];
}

export function exportPoscar(s: Structure): ExportResult {
  const r = writePoscar(s);
  return {
    text: r.text,
    filename: 'POSCAR',
    notes: r.reordered
      ? [
          'Atoms were regrouped by element, as POSCAR requires; MAGMOM and other per-atom tags follow the new order.',
        ]
      : [],
  };
}

export function exportCifP1(s: Structure, symmetry?: { number: number; hmSymbol: string }): ExportResult {
  return {
    text: writeCif(s, symmetry ? { symmetry } : {}),
    filename: 'structure.cif',
    notes: ['P1: every atom is listed and no symmetry is assumed.'],
  };
}

/**
 * CIF with symmetry. The standardized conventional cell is written (operations and Wyckoff orbits from moyo for that
 * cell), so the file matches the space-group symbol; a reader expands it back to the same conventional cell.
 */
export function exportCifSymmetrized(api: MoyoApi, s: Structure, symprec = 1e-4): ExportResult {
  const conv = analyzeWith(api, s, { symprec }).stdCell;
  const r = analyzeWith(api, conv, { symprec });
  const reps = [...new Set(r.orbits)];
  const text = writeCifWithSymmetry(conv, r.operations, reps, { number: r.number, hmSymbol: r.hmSymbol });
  return {
    text,
    filename: 'structure_symmetrized.cif',
    notes: [
      `Written as the standard conventional cell of ${r.hmSymbol} (${r.number}) with ${reps.length} symmetry-unique atom(s) and ${r.operations.length} operations; it expands to ${conv.species.length} atoms.`,
    ],
  };
}

/** Extended XYZ: Cartesian coordinates with the cell in the comment line. */
export function exportExtendedXyz(s: Structure, decimals = 10): ExportResult {
  const fx = (x: number) => {
    const t = x.toFixed(decimals);
    return Number(t) === 0 ? (0).toFixed(decimals) : t;
  };
  const lat = s.lattice.flat().map(fx).join(' ');
  const lines = [
    String(s.species.length),
    `Lattice="${lat}" Properties=species:S:1:pos:R:3 pbc="T T T"`,
    ...s.species.map((el, i) => `${el} ${fracToCart(s.frac[i]!, s.lattice).map(fx).join(' ')}`),
  ];
  return { text: lines.join('\n') + '\n', filename: 'structure.xyz', notes: [] };
}
