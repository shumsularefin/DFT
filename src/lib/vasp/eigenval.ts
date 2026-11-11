// EIGENVAL parser (ISPIN 1 and 2). Pure; throws ParseError with a 1-based line number for malformed input.
// Layout: line 1 "NIONS NIONS 1 ISPIN"; lines 2-4 volume/POTIM, cell, "CAR"; line 5 title; line 6 "NELECT NKPT NBANDS";
// then per k-point a blank line, "kx ky kz weight", and NBANDS lines: ISPIN 1 "i E occ", ISPIN 2 "i E_up E_down occ_up occ_down".
// @source S-019 (VASP wiki: EIGENVAL), S-041 (Field Handbook output files)
import { ParseError } from '../crystal/errors';
import { numbersIn } from './num';
import type { Vec3 } from '../crystal/types';

export interface BandPoint {
  /** Eigenvalue in eV (absolute, not shifted by E_F: EIGENVAL does not contain E_F). */
  e: number;
  occ: number;
}

export interface EigenvalResult {
  ispin: 1 | 2;
  nelect: number;
  nkpt: number;
  nbands: number;
  /** Fractional (reciprocal) coordinates as written. */
  kpoints: Vec3[];
  weights: number[];
  /** bands[spin][k][band]; spin 0 is up (or the only spin). */
  bands: BandPoint[][][];
}

export function parseEigenval(text: string): EigenvalResult {
  const lines = text.split(/\r?\n/);
  if (lines.length < 8) throw new ParseError('file is too short to be an EIGENVAL', lines.length);
  const head = numbersIn(lines[0]!);
  const ispin = head[3];
  if (ispin !== 1 && ispin !== 2) throw new ParseError('line 1 must end with ISPIN = 1 or 2', 1);
  const h6 = numbersIn(lines[5]!);
  if (h6.length < 3) throw new ParseError('line 6 must hold NELECT, NKPT and NBANDS', 6);
  const nelect = h6[0]!;
  const nkpt = h6[1]!;
  const nbands = h6[2]!;
  if (!Number.isInteger(nkpt) || !Number.isInteger(nbands) || nkpt < 1 || nbands < 1)
    throw new ParseError('NKPT and NBANDS must be positive integers', 6);

  const kpoints: Vec3[] = [];
  const weights: number[] = [];
  const bands: BandPoint[][][] = ispin === 2 ? [[], []] : [[]];
  let i = 6;
  for (let k = 0; k < nkpt; k++) {
    while (i < lines.length && lines[i]!.trim() === '') i++;
    const kv = numbersIn(lines[i] ?? '');
    if (kv.length < 4) throw new ParseError(`k-point ${k + 1}: expected "kx ky kz weight"`, i + 1);
    kpoints.push([kv[0]!, kv[1]!, kv[2]!]);
    weights.push(kv[3]!);
    i++;
    const rows: BandPoint[][] = ispin === 2 ? [[], []] : [[]];
    for (let b = 0; b < nbands; b++, i++) {
      const v = numbersIn(lines[i] ?? '');
      if (ispin === 1) {
        if (v.length < 3) throw new ParseError(`k-point ${k + 1}, band ${b + 1}: expected "i E occ"`, i + 1);
        rows[0]!.push({ e: v[1]!, occ: v[2]! });
      } else {
        if (v.length < 5)
          throw new ParseError(
            `k-point ${k + 1}, band ${b + 1}: expected "i E_up E_down occ_up occ_down"`,
            i + 1,
          );
        rows[0]!.push({ e: v[1]!, occ: v[3]! });
        rows[1]!.push({ e: v[2]!, occ: v[4]! });
      }
    }
    rows.forEach((r, s) => bands[s]!.push(r));
  }
  return { ispin, nelect, nkpt, nbands, kpoints, weights, bands };
}
