import { describe, expect, it } from 'vitest';
import golden from '../../../tests/reference/magnetic_reference.json';
import { parsePoscar } from '../crystal/poscar';
import type { Mat3, Structure } from '../crystal/types';
import { expandRepeats, parseIncar, writeIncar } from '../vasp/incar';
import { compressMagmom, formatMoment, magmomFor, STARTING_MOMENT_GUIDANCE, validateMagmom } from './magmom';
import { customOrdering, namedOrdering } from './orderings';
import { MagneticError } from './sublattice';

// SrMnO3-like cubic cell: the SrTiO3 fixture geometry with Mn on the B site (illustrative, not a real material claim)
const a = 3.905;
const smo: Structure = {
  lattice: [
    [a, 0, 0],
    [0, a, 0],
    [0, 0, a],
  ] as Mat3,
  species: ['Sr', 'Mn', 'O', 'O', 'O'],
  frac: [
    [0, 0, 0],
    [0.5, 0.5, 0.5],
    [0.5, 0, 0.5],
    [0, 0.5, 0.5],
    [0.5, 0.5, 0],
  ],
};

describe('formatting', () => {
  it('formats moments with at least one decimal and no negative zero', () => {
    expect(formatMoment(4)).toBe('4.0');
    expect(formatMoment(-4)).toBe('-4.0');
    expect(formatMoment(-0)).toBe('0.0');
    expect(formatMoment(0.25)).toBe('0.25');
  });
  it('compresses runs with the repeat syntax of the handbooks (S-041 example "2*4.0 2*-4.0")', () => {
    expect(compressMagmom([4, 4, -4, -4])).toBe('2*4.0 2*-4.0');
    expect(compressMagmom([5, -5, 0, 0, 0, 0])).toBe('5.0 -5.0 4*0.0');
    expect(expandRepeats(compressMagmom([3, 3, -3, 0.6]))).toEqual([3, 3, -3, 0.6]);
  });
  it('carries guidance with sources and no per-element numbers', () => {
    for (const g of STARTING_MOMENT_GUIDANCE) expect(g.source).toMatch(/^S-0\d\d$/);
  });
});

describe('MAGMOM for a 10-atom G-type SrMnO3-like cell', () => {
  const g = namedOrdering(smo, { kind: 'G' }, { elements: ['Mn'] });
  it('has the golden atom count, 10 values in POSCAR order and one up and one down Mn', () => {
    expect(g.structure.frac.length).toBe(
      golden.orderings.cubic_perovskite_SrTiO3.cases.G.minimal_cell.n_atoms,
    );
    const r = magmomFor(g, { magnitudes: { Mn: 4 } });
    expect(r.values.length).toBe(10);
    expect(r.magmom).toBe('2*0.0 4.0 -4.0 6*0.0');
    expect(r.structure.species).toEqual(['Sr', 'Sr', 'Mn', 'Mn', 'O', 'O', 'O', 'O', 'O', 'O']);
    // the POSCAR written is the one MAGMOM refers to
    const back = parsePoscar(r.poscar).structure;
    expect(back.species).toEqual(r.structure.species);
  });
  it('round-trips through the INCAR writer and parser, and V001 and V002 pass', () => {
    const r = magmomFor(g, { magnitudes: { Mn: 4 } });
    const parsed = parseIncar(writeIncar(r.incar)).entries;
    const m = parsed.find((e) => e.name === 'MAGMOM')!;
    expect(expandRepeats(m.value)).toEqual(r.values);
    expect(validateMagmom(r)).toEqual([]);
  });
  it('V001 fires when MAGMOM is paired with the wrong structure (the hook is live)', () => {
    const r = magmomFor(g, { magnitudes: { Mn: 4 } });
    const wrong = { ...r, structure: smo };
    expect(validateMagmom(wrong).map((i) => i.rule)).toContain('V001');
  });
  it('a missing magnitude is an error, never a guessed default', () => {
    expect(() => magmomFor(g)).toThrow(MagneticError);
    expect(() => magmomFor(g, { magnitudes: { Mn: 0 } })).toThrow(/positive/);
  });
  it('non-magnetic value is configurable', () => {
    expect(magmomFor(g, { magnitudes: { Mn: 4 }, nonMagnetic: 0.6 }).magmom).toBe('2*0.6 4.0 -4.0 6*0.6');
  });
  it('split species writes Mn1 and Mn2 and explains the POTCAR consequence', () => {
    const r = magmomFor(g, { magnitudes: { Mn: 4 }, splitSpecies: true });
    expect(r.poscar.split('\n')[5]).toBe('Sr Mn1 Mn2 O');
    expect(r.notes.join(' ')).toMatch(/POTCAR/);
    expect(validateMagmom(r)).toEqual([]);
  });
  it('custom per-site magnitudes win over the element value', () => {
    const c = customOrdering(smo, [0, 1, 0, 0, 0], [0, 3.5, 0, 0, 0]);
    expect(magmomFor(c, { magnitudes: { Mn: 4 } }).magmom).toBe('0.0 3.5 3*0.0');
  });
});
