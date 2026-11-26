// VASP EIGENVAL parser (ISPIN 1 and 2) and band-gap classifier (metal, direct, indirect).
// @source S-019 (VASP wiki: EIGENVAL), S-042 (Field Handbook)
import { numbersIn } from './num';

export interface EigenvalResult {
  readonly ispin: 1 | 2;
  readonly nelect: number;
  readonly nkpt: number;
  readonly nbands: number;
  readonly kpoints: readonly [number, number, number][];
  readonly weights: readonly number[];
  /** eigenvalues[spinIndex][kIndex][bandIndex] in eV. */
  readonly eigenvalues: readonly (readonly (readonly number[])[])[];
  /** occupations[spinIndex][kIndex][bandIndex]. */
  readonly occupations: readonly (readonly (readonly number[])[])[];
}

export function parseEigenval(text: string): EigenvalResult {
  const lines = text.split(/\r?\n/);
  if (lines.length < 8) throw new Error('EIGENVAL is too short.');
  const head0 = numbersIn(lines[0]!);
  const ispin: 1 | 2 = Math.round(head0[3] ?? 1) === 2 ? 2 : 1;
  const counts = numbersIn(lines[5]!);
  if (counts.length < 3) throw new Error('EIGENVAL line 6 counts line is malformed.');
  const nelect = Math.round(counts[0]!);
  const nkpt = Math.round(counts[1]!);
  const nbands = Math.round(counts[2]!);

  const kpoints: [number, number, number][] = [];
  const weights: number[] = [];
  const eig: number[][][] = ispin === 2 ? [[], []] : [[]];
  const occ: number[][][] = ispin === 2 ? [[], []] : [[]];

  let idx = 6;
  for (let k = 0; k < nkpt; k++) {
    while (idx < lines.length && lines[idx]!.trim() === '') idx++;
    if (idx >= lines.length) throw new Error(`Unexpected end of EIGENVAL at k-point ${k + 1}.`);
    const kp = numbersIn(lines[idx++]!);
    if (kp.length < 4) throw new Error(`Malformed k-point line at k-point ${k + 1}.`);
    kpoints.push([kp[0]!, kp[1]!, kp[2]!]);
    weights.push(kp[3]!);

    const eUp: number[] = [];
    const oUp: number[] = [];
    const eDn: number[] = [];
    const oDn: number[] = [];

    for (let b = 0; b < nbands; b++) {
      const row = numbersIn(lines[idx++] ?? '');
      if (ispin === 2) {
        if (row.length < 5) throw new Error(`Malformed ISPIN=2 band row at k=${k + 1}, b=${b + 1}.`);
        eUp.push(row[1]!);
        eDn.push(row[2]!);
        oUp.push(row[3]!);
        oDn.push(row[4]!);
      } else {
        if (row.length < 3) throw new Error(`Malformed ISPIN=1 band row at k=${k + 1}, b=${b + 1}.`);
        eUp.push(row[1]!);
        oUp.push(row[2]!);
      }
    }
    eig[0]!.push(eUp);
    occ[0]!.push(oUp);
    if (ispin === 2) {
      eig[1]!.push(eDn);
      occ[1]!.push(oDn);
    }
  }

  return { ispin, nelect, nkpt, nbands, kpoints, weights, eigenvalues: eig, occupations: occ };
}

export interface BandGapResult {
  readonly kind: 'metal' | 'direct' | 'indirect';
  readonly gapEv: number;
  /** True when VBM and CBM are in different spin channels (ISPIN = 2). Absent for metals. */
  readonly crossSpin?: boolean;
  readonly vbm?: {
    readonly energyEv: number;
    readonly kIndex: number;
    readonly bandIndex: number;
    readonly spin: number;
  };
  readonly cbm?: {
    readonly energyEv: number;
    readonly kIndex: number;
    readonly bandIndex: number;
    readonly spin: number;
  };
}

/**
 * Compute band gap and direct/indirect character from eigenvalues and occupations.
 * A state counts as occupied when occ >= 0.5 (half of a full occupation; builder choice, Q-055). For VASP's 0/1
 * insulator occupations this agrees with pymatgen's occ > 1e-8 (tested on the golden EIGENVAL files).
 * "direct" means VBM and CBM at the same k-point whatever their spin, the pymatgen convention; `crossSpin` flags
 * a gap whose VBM and CBM lie in different spin channels (not a spin-conserving optical transition).
 */
export function computeBandGap(ev: EigenvalResult, occThreshold = 0.5): BandGapResult {
  let vbm: { energyEv: number; kIndex: number; bandIndex: number; spin: number } | undefined;
  let cbm: { energyEv: number; kIndex: number; bandIndex: number; spin: number } | undefined;

  for (let s = 0; s < ev.eigenvalues.length; s++) {
    const sEig = ev.eigenvalues[s]!;
    const sOcc = ev.occupations[s]!;
    for (let k = 0; k < sEig.length; k++) {
      const kEig = sEig[k]!;
      const kOcc = sOcc[k]!;
      for (let b = 0; b < kEig.length; b++) {
        const energyEv = kEig[b]!;
        const o = kOcc[b]!;
        if (o >= occThreshold) {
          if (!vbm || energyEv > vbm.energyEv) vbm = { energyEv, kIndex: k, bandIndex: b, spin: s };
        } else {
          if (!cbm || energyEv < cbm.energyEv) cbm = { energyEv, kIndex: k, bandIndex: b, spin: s };
        }
      }
    }
  }

  if (!vbm || !cbm || cbm.energyEv <= vbm.energyEv) {
    return { kind: 'metal', gapEv: 0, ...(vbm ? { vbm } : {}), ...(cbm ? { cbm } : {}) };
  }
  const gapEv = cbm.energyEv - vbm.energyEv;
  const kind = vbm.kIndex === cbm.kIndex ? 'direct' : 'indirect';
  return { kind, gapEv, vbm, cbm, crossSpin: vbm.spin !== cbm.spin };
}
