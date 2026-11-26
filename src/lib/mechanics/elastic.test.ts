import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Mat3 } from '../crystal/types';
import { parseOutcar, vaspToVoigt } from '../vasp/outcar';
import {
  analyseElastic,
  bornConditions,
  BULK_CROSSCHECK_TOLERANCE,
  crossCheckBulk,
  crossCheckWithEos,
  indicators,
  invert6,
  soundAndDebye,
  soundAndDebyeForStructure,
  stability,
  symmetricEigenvalues,
  type Matrix6,
} from './elastic';

interface Case {
  voigt_GPa: Matrix6;
  compliance_per_GPa: Matrix6;
  eigenvalues_GPa: number[];
  k_voigt: number;
  k_reuss: number;
  k_vrh: number;
  g_voigt: number;
  g_reuss: number;
  g_vrh: number;
  y_mod_GPa: number;
  homogeneous_poisson: number;
  universal_anisotropy: number;
  long_v_m_s: number;
  trans_v_m_s: number;
  debye_temperature_K: number;
  structure: {
    lattice: [number, number, number][];
    species: string[];
    frac: [number, number, number][];
    density_g_cm3: number;
    volume_A3: number;
  };
}
const ref = JSON.parse(readFileSync('tests/reference/elastic_reference.json', 'utf8')) as {
  vasp_to_voigt: number[];
  cases: Record<string, Case>;
  outcar_fixtures: Record<
    string,
    { file: string; pymatgen_raw_vasp_order_kbar: Matrix6; expected_voigt_GPa: Matrix6 }
  >;
};

const REL = 1e-6;
const close = (a: number, b: number, rel = REL) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));
const closeM = (a: Matrix6, b: Matrix6, tol: number) =>
  a.forEach((r, i) => r.forEach((v, j) => expect(Math.abs(v - b[i]![j]!)).toBeLessThanOrEqual(tol)));

describe('OUTCAR TOTAL ELASTIC MODULI reader (golden fixtures read back by pymatgen)', () => {
  for (const [name, fx] of Object.entries(ref.outcar_fixtures)) {
    it(`${name}: reads the last TOTAL block, reorders XX YY ZZ XY YZ ZX to Voigt and converts kBar to GPa`, () => {
      const out = parseOutcar(readFileSync(`tests/reference/${fx.file}`, 'utf8'));
      expect(out.elastic).toBeDefined();
      closeM(out.elastic!.vaspOrderKbar, fx.pymatgen_raw_vasp_order_kbar, 1e-9);
      closeM(out.elastic!.voigtGPa, fx.expected_voigt_GPa, 1e-9);
      expect(out.warnings.some((w) => w.includes('ELASTIC'))).toBe(false);
    });
  }

  it('the non-symmetric fixture fails under a wrong mapping (identity or transposed)', () => {
    const fx = ref.outcar_fixtures.reorder_nonsymmetric!;
    const raw = fx.pymatgen_raw_vasp_order_kbar;
    const identity = raw.map((r) => r.map((v) => v / 10));
    const transposed = vaspToVoigt(raw, 0.1).map((_, i, m) => m.map((r) => r[i]!));
    const differs = (m: Matrix6) =>
      m.some((r, i) => r.some((v, j) => Math.abs(v - fx.expected_voigt_GPa[i]![j]!) > 1e-6));
    expect(differs(identity)).toBe(true);
    expect(differs(transposed)).toBe(true);
    expect(ref.vasp_to_voigt).toEqual([0, 1, 2, 5, 3, 4]);
  });

  it('reports the asymmetry and warns on a truncated block', () => {
    const text = readFileSync('tests/reference/elastic/OUTCAR_reorder_nonsymmetric', 'utf8');
    expect(parseOutcar(text).elastic!.asymmetryGPa).toBeGreaterThan(1);
    const cut = text.split('\n');
    const at = cut.findIndex((l) => l.includes('TOTAL ELASTIC'));
    const broken = [...cut.slice(0, at + 5), ...cut.slice(at + 9)].join('\n');
    const r = parseOutcar(broken);
    expect(r.elastic?.line).not.toBe(at + 1);
    expect(r.warnings.some((w) => w.includes('TOTAL ELASTIC MODULI'))).toBe(true);
  });
});

describe('elastic analysis vs pymatgen ElasticTensor (S-034, S-072, S-076, S-077, S-078)', () => {
  for (const [name, g] of Object.entries(ref.cases)) {
    describe(name, () => {
      const a = analyseElastic(g.voigt_GPa);
      it('compliance S = C^-1', () => {
        a.complianceInvGPa!.forEach((r, i) =>
          r.forEach((v, j) => close(v, g.compliance_per_GPa[i]![j]!, 1e-9)),
        );
      });
      it('six eigenvalues and the stability verdict', () => {
        a.stability.eigenvaluesGPa.forEach((e, i) => close(e, g.eigenvalues_GPa[i]!));
        expect(a.stability.stable).toBe(g.eigenvalues_GPa.every((e) => e > 0));
      });
      it('Voigt, Reuss and Hill B and G, E, nu, A^U', () => {
        const m = a.moduli!;
        close(m.bVoigt, g.k_voigt);
        close(m.bReuss, g.k_reuss);
        close(m.bHill, g.k_vrh);
        close(m.gVoigt, g.g_voigt);
        close(m.gReuss, g.g_reuss);
        close(m.gHill, g.g_vrh);
        close(m.eHill, g.y_mod_GPa);
        close(m.nuHill, g.homogeneous_poisson);
        close(m.aU, g.universal_anisotropy);
      });
      it('sound velocities and Debye temperature', () => {
        const s = g.structure;
        const sd = soundAndDebye(
          a.moduli!.bHill,
          a.moduli!.gHill,
          s.density_g_cm3,
          s.species.length / s.volume_A3,
        )!;
        close(sd.vLongitudinal, g.long_v_m_s);
        close(sd.vTransverse, g.trans_v_m_s);
        close(sd.debyeK, g.debye_temperature_K);
      });
      it('Debye temperature from the structure itself (project mass table)', () => {
        const s = g.structure;
        const sd = soundAndDebyeForStructure(a.moduli!.bHill, a.moduli!.gHill, {
          lattice: s.lattice as unknown as Mat3,
          species: s.species,
          frac: s.frac,
        })!;
        close(sd.debyeK, g.debye_temperature_K, 1e-5);
      });
    });
  }
});

describe('stability: eigenvalue test decides, class forms explain (S-072)', () => {
  const cub = ref.cases.cubic!.voigt_GPa;
  it('class conditions hold for the golden cubic and hexagonal tensors', () => {
    expect(stability(cub, 'cubic').classConditions!.conditions.every((x) => x.holds)).toBe(true);
    expect(bornConditions(ref.cases.hexagonal!.voigt_GPa, 'hexagonal').every((x) => x.holds)).toBe(true);
    expect(bornConditions(ref.cases.hexagonal!.voigt_GPa, 'tetragonal-I').every((x) => x.holds)).toBe(true);
  });
  it('C12 > C11 makes a cubic tensor unstable, and both tests agree', () => {
    const bad = cub.map((r) => [...r]);
    bad[0]![1] = bad[1]![0] = bad[0]![2] = bad[2]![0] = bad[1]![2] = bad[2]![1] = 180;
    const s = stability(bad, 'cubic');
    expect(s.stable).toBe(false);
    // cubic eigenvalues: C11 - C12 (twice), C44 (three times), C11 + 2 C12
    close(s.eigenvaluesGPa[0]!, 168.4 - 180);
    expect(s.classConditions!.conditions.find((x) => x.text === 'C11 - C12 > 0')!.holds).toBe(false);
  });
  it('hexagonal and tetragonal (I) forms fail when 2 C13^2 >= C33 (C11 + C12), and the eigenvalue test agrees', () => {
    const bad = ref.cases.hexagonal!.voigt_GPa.map((r) => [...r]);
    bad[0]![2] = bad[2]![0] = bad[1]![2] = bad[2]![1] = 200;
    for (const cls of ['hexagonal', 'tetragonal-I'] as const) {
      const s = stability(bad, cls);
      expect(s.classConditions!.conditions.find((x) => x.text.startsWith('2 C13'))!.holds).toBe(false);
      expect(s.stable).toBe(false);
    }
  });
  it('tetragonal (I) needs C66 > 0', () => {
    const bad = ref.cases.hexagonal!.voigt_GPa.map((r) => [...r]);
    bad[5]![5] = -1;
    expect(bornConditions(bad, 'tetragonal-I').find((x) => x.text === 'C66 > 0')!.holds).toBe(false);
    expect(stability(bad).stable).toBe(false);
  });
  it('Jacobi eigenvalues of a diagonal matrix are its entries', () => {
    expect(
      symmetricEigenvalues([
        [3, 0],
        [0, 1],
      ]),
    ).toEqual([1, 3]);
  });
  it('a singular matrix has no compliance and no Reuss bounds', () => {
    const z = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
    expect(invert6(z)).toBeUndefined();
    expect(analyseElastic(z).moduli).toBeUndefined();
  });
});

describe('indicators (Heuristic; S-073, S-074, S-075, S-079)', () => {
  const g = ref.cases.cubic!;
  const a = analyseElastic(g.voigt_GPa);
  const ind = indicators(a.stiffnessGPa, a.moduli!, true);
  it('Pugh ratio and Poisson ratio from the golden Hill moduli, thresholds 1.75 and 0.26', () => {
    close(ind.pugh.bOverG, g.k_vrh / g.g_vrh);
    expect(ind.pugh.reading).toBe(g.k_vrh / g.g_vrh > 1.75 ? 'ductile' : 'brittle');
    expect(ind.poisson.reading).toBe(g.homogeneous_poisson > 0.26 ? 'ductile' : 'brittle');
    expect(ind.heuristic).toBe(true);
  });
  it('Zener ratio agrees with the golden A^U through the cubic identity A^U = (6/5)(sqrt(A) - 1/sqrt(A))^2 (S-077)', () => {
    const A = ind.zener!.a;
    close((6 / 5) * (Math.sqrt(A) - 1 / Math.sqrt(A)) ** 2, g.universal_anisotropy);
  });
  it('Cauchy pressure is C12 - C44, cubic only', () => {
    close(ind.cauchy!.valueGPa, g.voigt_GPa[0]![1]! - g.voigt_GPa[3]![3]!);
    const tri = analyseElastic(ref.cases.triclinic!.voigt_GPa);
    const t = indicators(tri.stiffnessGPa, tri.moduli!, false);
    expect(t.cauchy).toBeUndefined();
    expect(t.zener).toBeUndefined();
  });
  it('Chen hardness follows 2 (k^2 G)^0.585 - 3 and is not applicable when negative', () => {
    const k = g.g_vrh / g.k_vrh;
    close(ind.chenHardness.hvGPa, 2 * (k * k * g.g_vrh) ** 0.585 - 3);
    expect(ind.chenHardness.applicable).toBe(ind.chenHardness.hvGPa >= 0);
    // A soft, ductile solid (B 100, G 10 GPa): 2 (0.01 * 10)^0.585 - 3 < 0.
    const soft = indicators(a.stiffnessGPa, { ...a.moduli!, bHill: 100, gHill: 10 }, false);
    expect(soft.chenHardness.applicable).toBe(false);
  });
});

describe('B_Hill vs EOS B0 cross-check (S-042, Heuristic)', () => {
  it('agrees within the default 5 % and warns beyond it', () => {
    expect(BULK_CROSSCHECK_TOLERANCE).toBe(0.05);
    expect(crossCheckBulk(137.07, 135).agrees).toBe(true);
    const off = crossCheckBulk(137.07, 120);
    expect(off.agrees).toBe(false);
    expect(off.message).toMatch(/ENCUT/);
    const m = analyseElastic(ref.cases.cubic!.voigt_GPa).moduli!;
    expect(crossCheckWithEos(m, { b0GPa: ref.cases.cubic!.k_vrh }).relativeDifference).toBeCloseTo(0, 12);
  });
});
