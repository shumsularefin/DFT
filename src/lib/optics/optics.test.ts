import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ELEMENTARY_CHARGE_C,
  PLANCK_J_S,
  SPEED_OF_LIGHT_M_S,
  VACUUM_PERMITTIVITY_F_M,
} from '../physics/constants';
import { parseOutcar } from '../vasp/outcar';
import { parseVasprunDielectric } from '../vasp/vasprunDielectric';
import { AVERAGE_RULE, deriveOptics, DRUDE_NOTE, opticalPoint, type OpticalPoint } from './derived';
import { BORN_SUM_RULE_LIMIT, bornSumRule, staticDielectric } from './dielectric';

type Series = Record<'abs_eps' | 'n' | 'k' | 'alpha_cm' | 'R' | 'L' | 'sigma_S_m', number[]>;
const ref = JSON.parse(readFileSync('tests/reference/optics_reference.json', 'utf8')) as {
  _meta: { constants: { h_J_s: number; e_C: number; c_m_s: number; eps0_F_m: number } };
  vasprun: {
    file: string;
    blocks: string[];
    energies_eV: number[];
    eps1: Record<string, number[]>;
    eps2: Record<string, number[]>;
    current_current_eps2_xx: number[];
  };
  derived: Record<'xx' | 'yy' | 'zz' | 'average', Series>;
  outcar: Record<
    string,
    {
      file: string;
      eps_inf: number[][];
      eps_ion: number[][];
      eps_static: number[][];
      born: number[][][];
      born_sum: number[][];
      born_sum_max_abs: number;
    }
  >;
};

const rel = (a: number, b: number, tol = 1e-9) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const relM = (a: number[][], b: number[][], tol = 1e-9) =>
  a.forEach((r, i) => r.forEach((v, j) => rel(v, b[i]![j]!, tol)));
const KEYS: [keyof OpticalPoint, keyof Series][] = [
  ['absEps', 'abs_eps'],
  ['n', 'n'],
  ['k', 'k'],
  ['alphaPerCm', 'alpha_cm'],
  ['reflectivity', 'R'],
  ['loss', 'L'],
  ['sigmaSPerM', 'sigma_S_m'],
];

describe('constants used by the golden generator (S-031)', () => {
  it('h, e and c exact; eps0 CODATA 2018', () => {
    const c = ref._meta.constants;
    expect(PLANCK_J_S).toBe(c.h_J_s);
    expect(ELEMENTARY_CHARGE_C).toBe(c.e_C);
    expect(SPEED_OF_LIGHT_M_S).toBe(c.c_m_s);
    expect(VACUUM_PERMITTIVITY_F_M).toBe(c.eps0_F_m);
  });
});

describe('vasprun.xml <dielectricfunction> reader (layout read back by pymatgen _parse_diel)', () => {
  const r = parseVasprunDielectric(readFileSync(`tests/reference/${ref.vasprun.file}`, 'utf8'));
  it('finds both VASP 6 blocks and selects density-density, not current-current', () => {
    expect(r.blocks.map((b) => b.comment)).toEqual(ref.vasprun.blocks);
    expect(r.selected?.comment).toBe('density-density');
    expect(r.warnings).toEqual([]);
    r.blocks[1]!.eps2.xx.forEach((v, i) => rel(v, ref.vasprun.current_current_eps2_xx[i]!));
  });
  it('energies and all six components of eps1 and eps2 match', () => {
    const s = r.selected!;
    expect(s.energiesEv).toEqual(ref.vasprun.energies_eV);
    for (const c of Object.keys(ref.vasprun.eps1)) {
      s.eps1[c as 'xx'].forEach((v, i) => rel(v, ref.vasprun.eps1[c]![i]!));
      s.eps2[c as 'xx'].forEach((v, i) => rel(v, ref.vasprun.eps2[c]![i]!));
    }
  });
  it('reports a truncated file and a missing block', () => {
    const text = readFileSync(`tests/reference/${ref.vasprun.file}`, 'utf8');
    expect(
      parseVasprunDielectric(text.slice(0, text.lastIndexOf('</dielectricfunction>'))).warnings[0],
    ).toMatch(/not closed/);
    expect(parseVasprunDielectric('<modeling></modeling>').warnings[0]).toMatch(/LOPTICS/);
  });
});

describe('derived optical quantities vs numpy golden at 1e-9 (S-042 formulas)', () => {
  const s = parseVasprunDielectric(readFileSync(`tests/reference/${ref.vasprun.file}`, 'utf8')).selected!;
  const res = deriveOptics(s);
  for (const name of ['xx', 'yy', 'zz', 'average'] as const) {
    it(`${name}: |eps|, n, k, alpha (1/cm), R, L, sigma (S/m)`, () => {
      res.series[name].forEach((p, i) => {
        for (const [ts, py] of KEYS) rel(p[ts], ref.derived[name][py][i]!);
      });
    });
  }
  it('states how the average is formed, and flags metals (no Drude term)', () => {
    expect(res.averageRule).toBe(AVERAGE_RULE);
    expect(res.notes).not.toContain(DRUDE_NOTE);
    expect(deriveOptics(s, { isMetal: true }).notes[0]).toBe(DRUDE_NOTE);
  });
  it('hand checks: a lossless dielectric eps = 4 gives n 2, k 0, R 1/9; zero energy gives no absorption', () => {
    const p = opticalPoint(2, 4, 0);
    expect(p.n).toBe(2);
    expect(p.k).toBe(0);
    expect(p.alphaPerCm).toBe(0);
    rel(p.reflectivity, 1 / 9, 1e-15);
    expect(opticalPoint(0, 3, 1).sigmaSPerM).toBe(0);
  });
});

describe('LEPSILON OUTCAR: eps_inf, ionic eps, Born charges (read back by pymatgen read_lepsilon)', () => {
  for (const [name, g] of Object.entries(ref.outcar)) {
    it(`${name}: tensors, static eps = eps_inf + eps_ion, Born charges and their sum`, () => {
      const o = parseOutcar(readFileSync(`tests/reference/${g.file}`, 'utf8'));
      relM(o.epsilonInf!.tensor, g.eps_inf);
      relM(o.epsilonIon!.tensor, g.eps_ion);
      expect(o.born!.charges.length).toBe(g.born.length);
      o.born!.charges.forEach((z, i) => relM(z, g.born[i]!));
      const d = staticDielectric(o);
      relM(d.epsStatic!, g.eps_static);
      relM(d.sumRule!.sum, g.born_sum, 1e-9);
      rel(d.sumRule!.maxAbs, g.born_sum_max_abs);
      expect(d.sumRule!.holds).toBe(g.born_sum_max_abs <= BORN_SUM_RULE_LIMIT);
      expect(d.sumRule!.heuristic).toBe(true);
    });
  }
  it('takes eps_inf from the block with local field effects, not the one without', () => {
    const o = parseOutcar(readFileSync(`tests/reference/${ref.outcar.sum_ok!.file}`, 'utf8'));
    relM(o.epsilonInf!.tensor, ref.outcar.sum_ok!.eps_inf);
  });
  it('the 0.1 e limit comes from S-042; a 0.3 e violation fails, and a truncated Born block warns', () => {
    expect(BORN_SUM_RULE_LIMIT).toBe(0.1);
    expect(bornSumRule(ref.outcar.sum_broken!.born).holds).toBe(false);
    const text = readFileSync(`tests/reference/${ref.outcar.sum_ok!.file}`, 'utf8').split('\n');
    const at = text.findIndex((l) => l.includes('BORN EFFECTIVE'));
    const broken = [...text.slice(0, at + 4), ...text.slice(at + 6)].join('\n');
    expect(parseOutcar(broken).warnings.some((w) => w.includes('BORN'))).toBe(true);
  });
});
