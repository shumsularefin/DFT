import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import kpaths from '../../../tests/reference/kpaths.json';
import masses from '../../data/atomic-masses.json';
import { ParseError } from './errors';
import { cellVolume } from './lattice';
import { parsePoscar, writePoscar } from './poscar';
import type { Structure } from './types';

const fx = (n: string) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');
const SYMS = Object.keys(masses.masses);

describe('POSCAR rule 1: scale', () => {
  it('positive scale multiplies the lattice (fcc Cu volume a^3/4 = 11.76147, see Q-027)', () => {
    const r = parsePoscar(fx('cu-fcc.vasp'));
    expect(cellVolume(r.structure.lattice)).toBeCloseTo(3.61 ** 3 / 4, 10);
    expect(cellVolume(r.structure.lattice)).toBeCloseTo(11.76147, 4);
  });
  it('negative scale is a target volume: 8 -> 27', () => {
    const r = parsePoscar(fx('negscale.vasp'));
    expect(cellVolume(r.structure.lattice)).toBeCloseTo(27, 10);
  });
  it('three scaling factors are rejected on line 2', () => {
    try {
      parsePoscar(fx('bad-three-scales.vasp'));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).line).toBe(2);
      expect((e as ParseError).message).toContain('three scaling factors are not supported yet');
    }
  });
});

describe('POSCAR rule 2: species', () => {
  it('VASP 4 gets placeholders and a warning', () => {
    const r = parsePoscar(fx('vasp4.vasp'));
    expect(r.structure.species).toEqual(['X1', 'X2']);
    expect(r.warnings).toContain('species names missing (VASP 4 format)');
  });
  it('keeps raw labels and takes the element before the underscore', () => {
    const t = 'x\n1.0\n4 0 0\n0 4 0\n0 0 4\nTi_pv O\n1 2\nDirect\n0 0 0\n0.3 0.3 0\n0.7 0.7 0\n';
    const r = parsePoscar(t);
    expect(r.structure.species).toEqual(['Ti', 'O', 'O']);
    expect(r.structure.labels).toEqual(['Ti_pv', 'O', 'O']);
    expect(writePoscar(r.structure).text.split('\n')[5]).toBe('Ti_pv O');
  });
});

describe('POSCAR rule 3: counts, selective, Cartesian', () => {
  it('reads NaCl counts and order', () => {
    const r = parsePoscar(fx('nacl.vasp'));
    expect(r.structure.species.filter((s) => s === 'Na')).toHaveLength(4);
    expect(r.structure.frac).toHaveLength(8);
  });
  it('Cartesian is scaled and converted to fractional', () => {
    const r = parsePoscar(fx('cartesian.vasp'));
    expect(r.wasCartesian).toBe(true);
    expect(r.structure.frac[1]![0]).toBeCloseTo((0.25 * 2.0) / 2.0, 12);
  });
  it('selective dynamics flags and trailing text', () => {
    const r = parsePoscar(fx('selective.vasp'));
    expect(r.structure.selective).toEqual([
      [false, false, false],
      [true, true, false],
      [true, true, true],
    ]);
  });
  it('wrong flag count is an error with its line', () => {
    expect(() => parsePoscar(fx('bad-flags.vasp'))).toThrow(/T\/F flags/);
  });
});

describe('POSCAR rule 4: tolerance', () => {
  it('CRLF, tabs, blank lines, -.5 and 1.0E-01', () => {
    const r = parsePoscar(fx('crlf.vasp'));
    expect(r.structure.frac[0]).toEqual([-0.5, 0.1, 0]);
    expect(r.structure.lattice[0][0]).toBe(3);
  });
});

describe('broken files report the line', () => {
  const cases: [string, number][] = [
    ['bad-scale.vasp', 2],
    ['bad-flat.vasp', 5],
    ['bad-counts.vasp', 7],
    ['bad-missing-atoms.vasp', 10],
    ['bad-flags.vasp', 10],
    ['bad-three-scales.vasp', 2],
  ];
  it.each(cases)('%s -> line %i', (name, line) => {
    try {
      parsePoscar(fx(name));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).line).toBe(line);
    }
  });
});

describe('POSCAR rule 5: writer', () => {
  it('VASP 5 layout, Direct, 16 decimals', () => {
    const w = writePoscar(parsePoscar(fx('nacl.vasp')).structure);
    const l = w.text.split('\n');
    expect(l[5]).toBe('Na Cl');
    expect(l[6]).toBe('4 4');
    expect(l[7]).toBe('Direct');
    expect(l[8]).toMatch(/^ {2}0\.0000000000000000 {2}0\.0000000000000000 {2}0\.0000000000000000$/);
  });
  it('regroups interleaved species and returns the permutation', () => {
    const s: Structure = {
      lattice: [
        [4, 0, 0],
        [0, 4, 0],
        [0, 0, 4],
      ],
      species: ['Na', 'Cl', 'Na', 'Cl'],
      frac: [
        [0, 0, 0],
        [0.5, 0.5, 0.5],
        [0.5, 0, 0],
        [0, 0.5, 0],
      ],
    };
    const w = writePoscar(s);
    expect(w.reordered).toBe(true);
    expect(w.permutation).toEqual([0, 2, 1, 3]);
    expect(w.text.split('\n')[6]).toBe('2 2');
  });
  it('selective dynamics survive a round trip', () => {
    const a = parsePoscar(fx('selective.vasp')).structure;
    const b = parsePoscar(writePoscar(a).text).structure;
    expect(b.selective).toEqual(a.selective);
  });
});

describe('round trip on all 39 kpaths structures to 1e-12', () => {
  const all = Object.entries(kpaths.structures);
  it('has 39', () => expect(all).toHaveLength(39));
  it.each(all)('%s', (_name, st) => {
    const inp = st.input;
    const s: Structure = {
      lattice: inp.lattice_rows as unknown as Structure['lattice'],
      species: inp.atomic_numbers.map((z: number) => SYMS[z - 1]!),
      frac: inp.frac_coords as unknown as Structure['frac'],
    };
    const w = writePoscar(s);
    const r = parsePoscar(w.text).structure;
    w.permutation.forEach((old, i) => {
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(r.frac[i]![k]! - s.frac[old]![k]!)).toBeLessThan(1e-12);
      }
      expect(r.species[i]).toBe(s.species[old]);
    });
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 3; k++) expect(Math.abs(r.lattice[i]![k]! - s.lattice[i]![k]!)).toBeLessThan(1e-12);
  });
});
