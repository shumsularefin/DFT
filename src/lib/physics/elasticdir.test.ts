import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { invert6, youngModulus } from '../mechanics/elastic';
import {
  directionalYoung,
  isotropicStiffness,
  strainEnergyDensity,
  strainLattice,
  stressFromStrain,
  youngSurface,
} from './elasticdir';

const ref = JSON.parse(readFileSync('tests/reference/elastic_reference.json', 'utf8')) as {
  cases: Record<string, { voigt_GPa: number[][]; compliance_per_GPa: number[][] }>;
};

const dirs: number[][] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, 1, 1],
  [0.3, -0.7, 0.2],
  [-2, 0.5, 1.5],
];

describe('directional Young modulus', () => {
  it('is constant for an isotropic tensor and equals 9BG / (3B + G) within 1e-9', () => {
    const s = invert6(isotropicStiffness(150, 60))!;
    const e = youngModulus(150, 60);
    for (const n of dirs) expect(Math.abs(directionalYoung(s, n) - e)).toBeLessThan(1e-9);
    const surf = youngSurface(s, 12, 24);
    expect(surf.max - surf.min).toBeLessThan(1e-9);
  });

  it('matches the cubic closed form for the golden cubic tensor (compliance from pymatgen)', () => {
    const s = ref.cases.cubic!.compliance_per_GPa;
    const [s11, s12, s44] = [s[0]![0]!, s[0]![1]!, s[3]![3]!];
    for (const n of dirs) {
      const l = Math.hypot(...n);
      const [a, b, c] = n.map((x) => x / l) as [number, number, number];
      const j = a * a * b * b + b * b * c * c + c * c * a * a;
      const inv = s11 - 2 * (s11 - s12 - s44 / 2) * j;
      expect(directionalYoung(s, n)).toBeCloseTo(1 / inv, 9);
    }
    // the golden compliance is the inverse of the golden stiffness
    const mine = invert6(ref.cases.cubic!.voigt_GPa)!;
    expect(mine[0]![0]).toBeCloseTo(s11, 12);
  });

  it('along the axes equals 1 / S_ii for the golden hexagonal and triclinic tensors', () => {
    for (const name of ['hexagonal', 'triclinic']) {
      const s = ref.cases[name]!.compliance_per_GPa;
      for (let i = 0; i < 3; i++) {
        const n = [0, 0, 0];
        n[i] = 1;
        expect(directionalYoung(s, n)).toBeCloseTo(1 / s[i]![i]!, 9);
      }
    }
  });

  it('hexagonal modulus is the same for every direction in the basal plane', () => {
    const s = ref.cases.hexagonal!.compliance_per_GPa;
    const e0 = directionalYoung(s, [1, 0, 0]);
    for (const ph of [0.3, 1.1, 2.0, 4.4])
      expect(directionalYoung(s, [Math.cos(ph), Math.sin(ph), 0])).toBeCloseTo(e0, 9);
  });
});

describe('strain energy and the strained cell', () => {
  it('a uniaxial strain e1 costs C11 e1^2 / 2; a pure shear e4 costs C44 e4^2 / 2', () => {
    const c = ref.cases.cubic!.voigt_GPa;
    expect(strainEnergyDensity(c, [0.01, 0, 0, 0, 0, 0])).toBeCloseTo((168.4 * 1e-4) / 2, 12);
    expect(strainEnergyDensity(c, [0, 0, 0, 0.02, 0, 0])).toBeCloseTo((75.4 * 4e-4) / 2, 12);
    // U = e.sigma / 2
    const e = [0.01, -0.004, 0.002, 0.003, 0, 0.001];
    const sig = stressFromStrain(c, e);
    expect(strainEnergyDensity(c, e)).toBeCloseTo(sig.reduce((s, x, i) => s + x * e[i]!, 0) / 2, 12);
  });

  it('strains the cell: e1 stretches a only; e4 tilts b toward c by the engineering angle', () => {
    const l = [
      [4, 0, 0],
      [0, 4, 0],
      [0, 0, 4],
    ];
    const s1 = strainLattice(l, [0.05, 0, 0, 0, 0, 0]);
    expect(s1[0]).toEqual([4.2, 0, 0]);
    expect(s1[1]).toEqual([0, 4, 0]);
    const s4 = strainLattice(l, [0, 0, 0, 0.02, 0, 0]);
    expect(s4[1][2]).toBeCloseTo(0.04, 12);
    expect(s4[2][1]).toBeCloseTo(0.04, 12);
    // the angle between b and c drops by about e4 (small strain)
    const cos = (s4[1][1] * s4[2][1] + s4[1][2] * s4[2][2]) / (Math.hypot(...s4[1]) * Math.hypot(...s4[2]));
    expect(Math.PI / 2 - Math.acos(cos)).toBeCloseTo(0.02, 4);
  });
});
