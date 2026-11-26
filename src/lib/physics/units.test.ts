import { describe, expect, it } from 'vitest';
import {
  CM1_TO_MEV,
  EV_PER_A3_TO_GPA,
  EV_PER_A_TO_NN,
  EV_PER_ATOM_TO_KJ_MOL,
  frequencyFromThz,
  HARTREE_TO_EV,
  KBAR_TO_GPA,
  RY_TO_EV,
  THZ_TO_CM1,
  THZ_TO_MEV,
} from './units';

/** `a` agrees with the table value to the last digit the table prints (4 or more significant figures for every entry but 0.1). */
const sig = (a: number, printed: string) => {
  const dec = printed.includes('.') ? printed.split('.')[1]!.length : 0;
  expect(Math.abs(a - Number(printed))).toBeLessThanOrEqual(0.5 * 10 ** -dec + 1e-15);
};

describe('unit conversions from CODATA constants vs the Workflow Handbook table (S-031, S-042)', () => {
  // S-042 "Units, conversions and quick formulas": 1 kBar 0.1 GPa; 1 eV/A^3 160.2177 GPa; 1 THz 33.356 cm-1 =
  // 4.1357 meV; 1 cm-1 0.12398 meV; 1 Ry 13.6057 eV; 1 Hartree 27.2114 eV; 1 eV/atom 96.485 kJ/mol; 1 eV/A 1.602 nN.
  it('kBar to GPa (exact)', () => expect(KBAR_TO_GPA).toBeCloseTo(0.1, 15));
  it('eV/A^3 to GPa', () => sig(EV_PER_A3_TO_GPA, '160.2177'));
  it('THz to cm^-1 and meV', () => {
    sig(THZ_TO_CM1, '33.356');
    sig(THZ_TO_MEV, '4.1357');
  });
  it('cm^-1 to meV', () => sig(CM1_TO_MEV, '0.12398'));
  it('Ry and Hartree to eV', () => {
    sig(RY_TO_EV, '13.6057');
    sig(HARTREE_TO_EV, '27.2114');
  });
  it('eV/atom to kJ/mol', () => sig(EV_PER_ATOM_TO_KJ_MOL, '96.485'));
  it('eV/A to nN', () => sig(EV_PER_A_TO_NN, '1.602'));
  it('the three frequency factors agree with each other (THz to meV = THz to cm-1 times cm-1 to meV)', () => {
    expect(Math.abs(THZ_TO_CM1 * CM1_TO_MEV - THZ_TO_MEV) / THZ_TO_MEV).toBeLessThan(1e-14);
  });
  it('reproduce the VASP wiki example mode line (S-019, Phonons from finite differences, oldid 36045)', () => {
    // "1 f  =   14.329944 THz    90.037693 2PiTHz  477.995462 cm-1    59.263905 meV"
    // VASP's built-in factors are not exactly CODATA 2018: they differ by 4e-8 (cm-1) and 3e-7 (meV) relative.
    const f = frequencyFromThz(14.329944);
    expect(Math.abs(f.cm1 - 477.995462) / 477.995462).toBeLessThan(1e-6);
    expect(Math.abs(f.meV - 59.263905) / 59.263905).toBeLessThan(1e-6);
    expect(Math.abs(14.329944 * 2 * Math.PI - 90.037693)).toBeLessThan(5e-6);
  });
});
