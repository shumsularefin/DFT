import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePoscar } from './poscar';
import {
  clearSelective,
  densityGcm3,
  frozenCount,
  groupBySpecies,
  numberOfAtoms,
  reducedFormula,
  setSelective,
  speciesCounts,
  supercell,
} from './structure';
import { cellVolume } from './lattice';

const load = (n: string) =>
  parsePoscar(readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8')).structure;

describe('composition', () => {
  const nacl = load('nacl.vasp');
  it('counts, formula, atoms', () => {
    expect(speciesCounts(nacl)).toEqual([
      { symbol: 'Na', count: 4 },
      { symbol: 'Cl', count: 4 },
    ]);
    expect(reducedFormula(nacl)).toBe('NaCl');
    expect(numberOfAtoms(nacl)).toBe(8);
  });
  it('reduces TiO2 from Ti2O4', () => {
    const s = {
      lattice: nacl.lattice,
      species: ['Ti', 'Ti', 'O', 'O', 'O', 'O'],
      frac: Array(6).fill([0, 0, 0]),
    };
    expect(reducedFormula(s)).toBe('TiO2');
  });
});

describe('density (S-034 masses, S-031 u)', () => {
  it('Cu fcc a = 3.61: 4 u / a^3 gives 8.93 g/cm^3', () => {
    const d = densityGcm3(load('cu-fcc.vasp'));
    expect(d).toBeCloseTo((63.546 * 1.6605390666e-24) / ((3.61 ** 3 / 4) * 1e-24), 8);
    expect(d).toBeGreaterThan(8.9);
    expect(d).toBeLessThan(9.0);
  });
  it('NaCl 5.64 is about 2.16 g/cm^3', () => {
    expect(densityGcm3(load('nacl.vasp'))).toBeCloseTo(2.165, 2);
  });
  it('placeholder species have no mass', () => {
    expect(() => densityGcm3(load('vasp4.vasp'))).toThrow(RangeError);
  });
});

describe('grouping and supercell', () => {
  it('groupBySpecies returns the permutation', () => {
    const s = {
      lattice: load('nacl.vasp').lattice,
      species: ['Na', 'Cl', 'Na'],
      frac: [
        [0, 0, 0],
        [0.5, 0.5, 0.5],
        [0.5, 0, 0],
      ] as const,
    };
    const g = groupBySpecies(s as never);
    expect(g.permutation).toEqual([0, 2, 1]);
    expect(g.structure.species).toEqual(['Na', 'Na', 'Cl']);
  });
  it('2x1x3 supercell scales volume and atoms', () => {
    const s = load('nacl.vasp');
    const t = supercell(s, 2, 1, 3);
    expect(numberOfAtoms(t)).toBe(48);
    expect(cellVolume(t.lattice)).toBeCloseTo(6 * cellVolume(s.lattice), 8);
    expect(densityGcm3(t)).toBeCloseTo(densityGcm3(s), 10);
    expect(() => supercell(s, 0, 1, 1)).toThrow(RangeError);
  });
});

describe('selective helpers', () => {
  it('freeze the bottom half', () => {
    const s = setSelective(load('selective.vasp'), (f) =>
      f[2] < 0.25 ? [false, false, false] : [true, true, true],
    );
    expect(frozenCount(s)).toBe(2);
    expect(frozenCount(clearSelective(s))).toBe(0);
    expect(clearSelective(s).selective).toBeUndefined();
  });
});
