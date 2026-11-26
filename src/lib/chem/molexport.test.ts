import { describe, expect, it } from 'vitest';
import { DEFAULT_MOLECULE_VACUUM, moleculeInBox, writeMolBlock, writeXyz } from './molexport';
import type { MolGraph } from './molgraph';
import type { Vec3 } from '../crystal/types';

// M15.3: tests of what the M10.3 export code does today. The values are simple arithmetic on a made-up
// linear triatomic (no science claim): atoms on the x axis at -1, 0 and +1 angstrom.
const SPECIES = ['O', 'C', 'O'];
const POS: Vec3[] = [
  [-1, 0, 0],
  [0, 0, 0],
  [1, 0, 0],
];
const GRAPH: MolGraph = {
  atoms: SPECIES.map((el) => ({ el, charge: 0, hCount: 0 })),
  bonds: [
    { a: 0, b: 1, order: 2 },
    { a: 1, b: 2, order: 2 },
  ],
};

describe('molecule export (M10.3, tested in M15.3)', () => {
  it('XYZ has the atom count, a one-line comment and one line per atom', () => {
    const lines = writeXyz(SPECIES, POS, 'a\nb').trimEnd().split('\n');
    expect(lines[0]).toBe('3');
    expect(lines[1]).toBe('a b');
    expect(lines).toHaveLength(5);
    expect(lines[2]).toBe('O -1.00000000 0.00000000 0.00000000');
  });

  it('MOL block counts, bond types and charge line', () => {
    const g: MolGraph = { ...GRAPH, atoms: GRAPH.atoms.map((a, i) => (i === 1 ? { ...a, charge: 1 } : a)) };
    const lines = writeMolBlock(g, POS).trimEnd().split('\n');
    expect(lines[3]).toBe('  3  2  0  0  0  0  0  0  0  0999 V2000');
    expect(lines.filter((l) => l === '  1  2  2  0' || l === '  2  3  2  0')).toHaveLength(2);
    expect(lines.some((l) => l === '  1  2  2  0')).toBe(true);
    expect(lines).toContain('M  CHG  1   2   1');
    expect(lines.at(-1)).toBe('M  END');
  });

  it('MOL block refuses an atom that still has implicit hydrogens', () => {
    const g: MolGraph = { ...GRAPH, atoms: GRAPH.atoms.map((a) => ({ ...a, hCount: 1 })) };
    expect(() => writeMolBlock(g, POS)).toThrow(/Expand the hydrogens/);
  });

  it('box edge is the largest extent plus the vacuum and the molecule sits at the centre', () => {
    const r = moleculeInBox(SPECIES, POS);
    expect(DEFAULT_MOLECULE_VACUUM).toBe(10);
    expect(r.edge).toBeCloseTo(12, 12); // extent 2 + vacuum 10
    expect(r.structure.frac[1]![0]).toBeCloseTo(0.5, 12);
    expect(r.structure.frac[0]![0]).toBeCloseTo(0.5 - 1 / 12, 12);
    expect(r.notes.join(' ')).toMatch(/Gamma-only/);
    expect(r.poscar.split('\n')[0]).toBe('molecule in a box');
  });

  it('rejects empty input, mismatched lengths and a non-positive vacuum', () => {
    expect(() => moleculeInBox([], [])).toThrow(RangeError);
    expect(() => moleculeInBox(['O'], POS)).toThrow(RangeError);
    expect(() => moleculeInBox(SPECIES, POS, { vacuumA: 0 })).toThrow(/positive/);
  });
});
