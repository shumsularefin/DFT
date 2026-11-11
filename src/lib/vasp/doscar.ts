// DOSCAR parser: total DOS and, when present, site- and orbital-projected DOS (ISPIN 1 and 2; LORBIT 10 and 11).
// Header: line 1 "NIONS NIONS PARTIAL ..." (the last number is ignored); lines 2-5 volume, POTIM, "CAR", title; line 6 "Emax Emin NEDOS E_fermi weight".
// Total block: NEDOS rows "E dos int" (ISPIN 1) or "E dos_up dos_down int_up int_down" (ISPIN 2).
// Per-ion blocks: a header row like line 6, then NEDOS rows "E" followed by the orbital columns; with ISPIN 2 each orbital
// contributes an (up, down) pair. Orbital order for 9 columns: s, py, pz, px, dxy, dyz, dz2, dxz, dx2.
// Energies are absolute; subtract efermi for the usual axis.
// Layout verified against a hand-written fixture only (Q-008): not independently validated.
// @source S-019 (VASP wiki: DOSCAR, LORBIT), S-041 (Field Handbook output files)
import { ParseError } from '../crystal/errors';
import { numbersIn } from './num';

export const ORBITALS_9 = ['s', 'py', 'pz', 'px', 'dxy', 'dyz', 'dz2', 'dxz', 'dx2'] as const;
export const ORBITALS_3 = ['s', 'p', 'd'] as const;

export interface IonDos {
  /** Orbital labels in column order. */
  orbitals: string[];
  /** up[orbital][energy index]; for ISPIN 1 this is the only channel. */
  up: Float64Array[];
  down?: Float64Array[];
}

export interface DoscarResult {
  nions: number;
  nedos: number;
  ispin: 1 | 2;
  emax: number;
  emin: number;
  efermi: number;
  energies: Float64Array;
  totalUp: Float64Array;
  totalDown?: Float64Array;
  intUp: Float64Array;
  intDown?: Float64Array;
  /** 10 (s, p, d), 11 (nine orbitals) or null when there is no projected DOS. */
  lorbit: 10 | 11 | null;
  ions: IonDos[];
  warnings: string[];
}

export function parseDoscar(text: string): DoscarResult {
  const lines = text.split(/\r?\n/);
  if (lines.length < 7) throw new ParseError('file is too short to be a DOSCAR', lines.length);
  const h = numbersIn(lines[0]!);
  const nions = h[0]!;
  const partial = h[2];
  if (!Number.isInteger(nions) || nions < 1)
    throw new ParseError('line 1 must start with the number of ions', 1);
  // The fourth number of line 1 is not reliable (the fixture writes 0 with ISPIN 2), so ISPIN comes from the column count
  // of the total DOS rows: 3 columns (E, dos, integrated) or 5 (E, up, down, integrated up, integrated down).
  const ncols = numbersIn(lines[6] ?? '').length;
  if (ncols !== 3 && ncols !== 5)
    throw new ParseError(`total DOS rows must have 3 (ISPIN 1) or 5 (ISPIN 2) columns, found ${ncols}`, 7);
  const ispin: 1 | 2 = ncols === 5 ? 2 : 1;
  const h6 = numbersIn(lines[5]!);
  if (h6.length < 4) throw new ParseError('line 6 must hold Emax, Emin, NEDOS and E_fermi', 6);
  const [emax, emin, nedosRaw, efermi] = h6 as [number, number, number, number];
  const nedos = Math.round(nedosRaw);
  if (nedos < 1) throw new ParseError('NEDOS must be positive', 6);

  const energies = new Float64Array(nedos);
  const totalUp = new Float64Array(nedos);
  const intUp = new Float64Array(nedos);
  const totalDown = ispin === 2 ? new Float64Array(nedos) : undefined;
  const intDown = ispin === 2 ? new Float64Array(nedos) : undefined;
  let i = 6;
  for (let r = 0; r < nedos; r++, i++) {
    const v = numbersIn(lines[i] ?? '');
    const need = ispin === 1 ? 3 : 5;
    if (v.length < need) throw new ParseError(`total DOS row ${r + 1}: expected ${need} numbers`, i + 1);
    energies[r] = v[0]!;
    totalUp[r] = v[1]!;
    if (ispin === 1) intUp[r] = v[2]!;
    else {
      totalDown![r] = v[2]!;
      intUp[r] = v[3]!;
      intDown![r] = v[4]!;
    }
  }

  const warnings: string[] = [];
  const ions: IonDos[] = [];
  let lorbit: 10 | 11 | null = null;
  if (partial === 1 || (partial === undefined && i < lines.length)) {
    for (let a = 0; a < nions; a++) {
      if (!lines[i] || numbersIn(lines[i]!).length < 4) {
        warnings.push(`projected DOS ended after ${a} of ${nions} ions`);
        break;
      }
      i++; // block header
      const rows: number[][] = [];
      for (let r = 0; r < nedos; r++, i++) {
        const v = numbersIn(lines[i] ?? '');
        if (v.length < 2)
          throw new ParseError(`ion ${a + 1}, row ${r + 1}: expected energy and columns`, i + 1);
        rows.push(v);
      }
      const ncol = rows[0]!.length - 1;
      const perOrbital = ispin === 2 ? 2 : 1;
      const norb = ncol / perOrbital;
      let names: string[];
      if (norb === 3) {
        names = [...ORBITALS_3];
        lorbit = 10;
      } else if (norb === 9) {
        names = [...ORBITALS_9];
        lorbit = 11;
      } else {
        throw new ParseError(
          `ion ${a + 1}: ${ncol} projected columns is not a known layout (3 or 9 orbitals, times 2 for ISPIN 2; f orbitals are not supported)`,
          i,
        );
      }
      const up = names.map(() => new Float64Array(nedos));
      const down = ispin === 2 ? names.map(() => new Float64Array(nedos)) : undefined;
      rows.forEach((v, r) => {
        names.forEach((_, o) => {
          if (ispin === 1) up[o]![r] = v[1 + o]!;
          else {
            up[o]![r] = v[1 + 2 * o]!;
            down![o]![r] = v[2 + 2 * o]!;
          }
        });
      });
      ions.push({ orbitals: names, up, ...(down ? { down } : {}) });
    }
  }
  return {
    nions,
    nedos,
    ispin,
    emax,
    emin,
    efermi,
    energies,
    totalUp,
    ...(totalDown ? { totalDown } : {}),
    intUp,
    ...(intDown ? { intDown } : {}),
    lorbit,
    ions,
    warnings,
  };
}
