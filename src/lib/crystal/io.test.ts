import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFormat, readStructure } from './io';
import { ParseError } from './errors';
import { writePoscar } from './poscar';
import { writeCif } from './cif';
import { cellVolume } from './lattice';

const ref = (f: string) => readFileSync(join(__dirname, '../../../tests/reference/cif', f), 'utf8');

describe('detectFormat', () => {
  it('uses the file name, then the content', () => {
    expect(detectFormat('a.cif', '')).toBe('cif');
    expect(detectFormat('mol.XYZ', '')).toBe('xyz');
    expect(detectFormat('POSCAR', '')).toBe('poscar');
    expect(detectFormat('CONTCAR_relaxed', '')).toBe('poscar');
    expect(detectFormat('x.vasp', '')).toBe('poscar');
    expect(detectFormat('upload', 'data_a\n_cell_length_a 4\n')).toBe('cif');
    expect(detectFormat('upload', '3\ncomment\nO 0 0 0\n')).toBe('xyz');
    expect(detectFormat('upload', 'Si\n1.0\n')).toBe('poscar');
  });
});

describe('readStructure', () => {
  it('reads a CIF and warns about extra blocks', () => {
    const r = readStructure('two.cif', ref('edge_two_blocks.cif'));
    expect(r.format).toBe('cif');
    expect(r.blockCount).toBe(2);
    expect(r.structure.species).toHaveLength(8);
    expect(r.warnings.join(' ')).toMatch(/2 structures/);
    expect(readStructure('two.cif', ref('edge_two_blocks.cif'), { block: 1 }).structure.species).toHaveLength(
      2,
    );
    expect(() => readStructure('two.cif', ref('edge_two_blocks.cif'), { block: 5 })).toThrow(ParseError);
  });
  it('reads a POSCAR written by writePoscar', () => {
    const s = readStructure('x.cif', ref('hcp_Mg.sym.cif')).structure;
    const r = readStructure('POSCAR', writePoscar(s).text);
    expect(r.format).toBe('poscar');
    expect(cellVolume(r.structure.lattice)).toBeCloseTo(cellVolume(s.lattice), 6);
  });
  it('reads a CIF written by writeCif', () => {
    const s = readStructure('x.cif', ref('hcp_Mg.sym.cif')).structure;
    expect(readStructure('o.cif', writeCif(s)).structure.species).toEqual(s.species);
  });
  it('puts an XYZ molecule in a box with a warning', () => {
    const r = readStructure('w.xyz', '3\nwater\nO 0 0 0\nH 0.76 0.59 0\nH -0.76 0.59 0\n');
    expect(r.format).toBe('xyz');
    expect(r.warnings[0]).toMatch(/no unit cell/);
    expect(r.structure.lattice[0][0]).toBeCloseTo(1.52 + 20, 8);
    r.structure.frac.forEach((f) => f.forEach((x) => expect(x > 0 && x < 1).toBe(true)));
  });
  it('uses a supplied cell or an extended-XYZ Lattice', () => {
    const cell = [
      [4, 0, 0],
      [0, 4, 0],
      [0, 0, 4],
    ] as const;
    const r = readStructure('c.xyz', '1\n\nC 2 2 2\n', { cell });
    expect(r.warnings).toEqual([]);
    expect(r.structure.frac[0]).toEqual([0.5, 0.5, 0.5]);
    const e = readStructure('e.xyz', '1\nLattice="5 0 0 0 5 0 0 0 5"\nC 1 1 1\n');
    expect(e.structure.lattice[2][2]).toBe(5);
    expect(e.warnings).toEqual([]);
  });
  it.each([
    ['', /number of atoms/],
    ['2\nc\nO 0 0 0\n', /ends early/],
    ['1\nc\nO 0 0\n', /element and three/],
    ['1\nc\nQq 0 0 0\n', /not a known element/],
    ['1\nc\nO a 0 0\n', /numbers/],
  ])('rejects malformed XYZ %#', (text, re) => {
    expect(() => readStructure('b.xyz', text)).toThrow(re);
  });
});
