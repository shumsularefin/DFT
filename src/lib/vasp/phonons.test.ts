import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ingestCalculationFiles } from '../review/intake';
import { reviewCalculation } from '../review/postflight';
import * as U from '../physics/units';
import { parseOutcar } from './outcar';
import { ACOUSTIC_NEAR_ZERO_CM1, analyseGammaModes } from './phonons';

interface Fx {
  file: string;
  modes: { index: number; imaginary: boolean; thz: number; cm1: number; meV: number }[];
  ase_real_meV: number[];
  ase_imaginary_meV: number[];
}
const ref = JSON.parse(readFileSync('tests/reference/phonon_reference.json', 'utf8')) as {
  factors: Record<string, number>;
  outcar_fixtures: Record<string, Fx>;
};
const text = (name: string) => readFileSync(`tests/reference/${ref.outcar_fixtures[name]!.file}`, 'utf8');
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('unit factors vs scipy.constants (S-031)', () => {
  const pairs: [string, number][] = [
    ['kbar_to_gpa', U.KBAR_TO_GPA],
    ['ev_per_a3_to_gpa', U.EV_PER_A3_TO_GPA],
    ['thz_to_cm1', U.THZ_TO_CM1],
    ['thz_to_mev', U.THZ_TO_MEV],
    ['cm1_to_mev', U.CM1_TO_MEV],
    ['ry_to_ev', U.RY_TO_EV],
    ['hartree_to_ev', U.HARTREE_TO_EV],
    ['ev_per_atom_to_kj_mol', U.EV_PER_ATOM_TO_KJ_MOL],
    ['ev_per_a_to_nn', U.EV_PER_A_TO_NN],
  ];
  // Exact SI constants agree to rounding; Ry and Hartree differ between CODATA 2018 (here) and scipy's CODATA 2022 by < 1e-11.
  for (const [k, v] of pairs) it(k, () => expect(rel(v, ref.factors[k]!)).toBeLessThan(1e-10));
});

describe('OUTCAR Gamma-mode reader (fixtures read back by ASE read_vib_freq)', () => {
  for (const [name, fx] of Object.entries(ref.outcar_fixtures)) {
    it(`${name}: every mode, f and f/i, in THz, cm-1 and meV`, () => {
      const out = parseOutcar(text(name));
      expect(out.phonons).toBeDefined();
      expect(
        out.phonons!.modes.map((m) => ({
          index: m.index,
          imaginary: m.imaginary,
          thz: m.thz,
          cm1: m.cm1,
          meV: m.meV,
        })),
      ).toEqual(fx.modes);
      expect(out.phonons!.modes.filter((m) => !m.imaginary).map((m) => m.meV)).toEqual(fx.ase_real_meV);
      expect(out.phonons!.modes.filter((m) => m.imaginary).map((m) => m.meV)).toEqual(fx.ase_imaginary_meV);
      expect(out.warnings.some((w) => w.includes('dynamical'))).toBe(false);
    });
  }
  it('stops at 3 NIONS modes and warns on a heading without mode lines', () => {
    const t = text('stable');
    const twice = t.replace(' General timing', t.slice(t.indexOf(' Eigenvectors and')) + '\n General timing');
    expect(parseOutcar(twice).phonons!.modes).toHaveLength(6);
    const bare = t
      .split('\n')
      .filter((l) => !/ f(\/i)?\s*=/.test(l))
      .join('\n');
    const r = parseOutcar(bare);
    expect(r.phonons).toBeUndefined();
    expect(r.warnings.some((w) => w.includes('dynamical-matrix heading'))).toBe(true);
  });
});

describe('Gamma-mode analysis (S-019, S-042; acoustic count Heuristic)', () => {
  it('stable: three acoustic near zero (one tiny f/i), no imaginary optical mode, consistent columns', () => {
    const a = analyseGammaModes(parseOutcar(text('stable')).phonons!.modes);
    expect(a.modes.filter((m) => m.acoustic).map((m) => m.index)).toEqual([4, 5, 6]);
    expect(a.imaginaryOptical).toHaveLength(0);
    expect(a.imaginaryAcoustic.map((m) => m.index)).toEqual([6]);
    expect(a.nearZeroAcoustic).toBe(3);
    expect(a.modes[5]!.signed.thz).toBeLessThan(0);
    expect(a.unitMismatch).toBeLessThan(1e-6);
    expect(a.heuristic).toBe(true);
  });
  it('unstable: the 2.85i THz optical mode is flagged, the acoustic triplet is still found', () => {
    const a = analyseGammaModes(parseOutcar(text('unstable')).phonons!.modes);
    expect(a.imaginaryOptical.map((m) => m.index)).toEqual([6]);
    expect(a.nearZeroAcoustic).toBe(3);
  });
  it('the near-zero level is a parameter (default 5 cm-1, Q-058)', () => {
    expect(ACOUSTIC_NEAR_ZERO_CM1).toBe(5);
    // acoustic modes are 0.70, 0.43 and 1.13i cm-1: with a 1 cm-1 level only two count, and the check warns
    const a = analyseGammaModes(parseOutcar(text('stable')).phonons!.modes, 1);
    expect(a.nearZeroAcoustic).toBe(2);
  });
});

describe('review tool phonon checks, both ways', () => {
  const post = (name: string) =>
    reviewCalculation(ingestCalculationFiles([{ name: 'OUTCAR', text: text(name) }])).postflight;
  it('stable: POST-PHONON-IMAG passes, POST-PHONON-ACOUSTIC passes and is heuristic', () => {
    const c = post('stable');
    expect(c.find((x) => x.id === 'POST-PHONON-IMAG')!.status).toBe('pass');
    const ac = c.find((x) => x.id === 'POST-PHONON-ACOUSTIC')!;
    expect(ac.status).toBe('pass');
    expect(ac.kind).toBe('heuristic');
  });
  it('unstable: POST-PHONON-IMAG warns and names the soft mode', () => {
    const imag = post('unstable').find((x) => x.id === 'POST-PHONON-IMAG')!;
    expect(imag.status).toBe('warn');
    expect(imag.reason).toMatch(/mode 6: 2\.850i THz/);
    expect(imag.fix).toBeDefined();
  });
  it('no phonon block: no phonon checks', () => {
    const c = reviewCalculation(
      ingestCalculationFiles([
        { name: 'OUTCAR', text: readFileSync('src/lib/vasp/__fixtures__/outcar-v54.txt', 'utf8') },
      ]),
    ).postflight;
    expect(c.some((x) => x.id.startsWith('POST-PHONON'))).toBe(false);
  });
});
