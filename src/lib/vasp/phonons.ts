// Gamma-point normal modes from an OUTCAR (IBRION = 5 to 8): units, imaginary modes and the acoustic triplet (M15.6).
// @source S-019 (VASP wiki "Phonons from finite differences": f is a real mode, f/i an imaginary "soft" mode),
// S-042 (phonon chapter: three near-zero modes are the acoustic translations; a small imaginary acoustic dip of a few
// cm^-1 is numerical noise, large imaginary modes are a genuine instability), S-031 (unit factors, ../physics/units).
import { frequencyFromThz, type Frequency } from '../physics/units';
import type { PhononMode } from './outcar';

/**
 * cm^-1. Heuristic: an acoustic mode counts as "near zero" below this. S-042 says "a few cm^-1" without a number;
 * 5 is the builder's reading of that phrase (Q-058).
 */
export const ACOUSTIC_NEAR_ZERO_CM1 = 5;

export interface AnalysedMode extends PhononMode {
  /** Signed frequency (imaginary modes negative, the usual plotting convention) in THz, cm^-1 and meV. */
  signed: Frequency;
  /** One of the three modes with the smallest |frequency|, taken as the acoustic translations at Gamma. */
  acoustic: boolean;
}

export interface GammaModeAnalysis {
  modes: AnalysedMode[];
  /** Imaginary modes that are not among the three acoustic ones. */
  imaginaryOptical: AnalysedMode[];
  /** Acoustic modes printed as f/i (expected to be tiny numerical noise). */
  imaginaryAcoustic: AnalysedMode[];
  /** Number of acoustic modes with |frequency| below `limitCm1`. Three is what a converged run shows. */
  nearZeroAcoustic: number;
  limitCm1: number;
  heuristic: true;
  /** Largest |printed cm^-1 - THz x factor| / cm^-1 over the modes: shows the printed columns are consistent. */
  unitMismatch: number;
}

export function analyseGammaModes(
  modes: readonly PhononMode[],
  limitCm1 = ACOUSTIC_NEAR_ZERO_CM1,
): GammaModeAnalysis {
  const order = modes.map((m, i) => ({ i, a: Math.abs(m.thz) })).sort((x, y) => x.a - y.a);
  const acousticIdx = new Set(order.slice(0, Math.min(3, modes.length)).map((o) => o.i));
  let unitMismatch = 0;
  const analysed: AnalysedMode[] = modes.map((m, i) => {
    const f = frequencyFromThz(m.thz);
    if (m.cm1 > 0) unitMismatch = Math.max(unitMismatch, Math.abs(m.cm1 - f.cm1) / m.cm1);
    const s = m.imaginary ? -1 : 1;
    return {
      ...m,
      signed: { thz: s * f.thz, cm1: s * f.cm1, meV: s * f.meV },
      acoustic: acousticIdx.has(i),
    };
  });
  const acoustic = analysed.filter((m) => m.acoustic);
  return {
    modes: analysed,
    imaginaryOptical: analysed.filter((m) => m.imaginary && !m.acoustic),
    imaginaryAcoustic: acoustic.filter((m) => m.imaginary),
    nearZeroAcoustic: acoustic.filter((m) => Math.abs(m.signed.cm1) < limitCm1).length,
    limitCm1,
    heuristic: true,
    unitMismatch,
  };
}
