import { describe, expect, it } from 'vitest';
import golden from '../../../../tests/reference/magnetic_reference.json';
import { parsePoscar } from '../../../lib/crystal/poscar';
import { validateSpec } from '../../../lib/scene/spec';
import { buildNamed, EXAMPLE_POSCAR, request, sceneFor, suggestedElements } from './magneticModel';

const cell = parsePoscar(EXAMPLE_POSCAR).structure;

describe('magnetic model', () => {
  it('suggests the d-block element of the example, never a moment', () => {
    expect(suggestedElements(cell)).toEqual(['Mn']);
  });
  it('builds one common cell for the batch, with the golden determinant', () => {
    const b = buildNamed(cell, ['FM', 'A', 'C', 'G'], 'G', 'auto', ['Mn'], true);
    expect(b.error).toBeUndefined();
    expect(b.det).toBe(golden.common_supercell.cubic_perovskite_SrTiO3.det);
    expect(new Set(b.batch.map((c) => c.structure.species.length)).size).toBe(1);
  });
  it('builds the smallest cell for G on its own', () => {
    const b = buildNamed(cell, ['G'], 'G', 'auto', ['Mn'], false);
    expect(b.current!.structure.species.length).toBe(
      golden.orderings.cubic_perovskite_SrTiO3.cases.G.minimal_cell.n_atoms,
    );
  });
  it('turns a configuration into a valid scene with spins and optional polyhedra', () => {
    const c = buildNamed(cell, ['G'], 'G', 'auto', ['Mn'], false).current!;
    const spec = sceneFor(c, { Mn: 4 }, { polyhedra: true, repeat: false, selected: 2 });
    expect(validateSpec(spec)).toEqual([]);
    expect(spec.spins!.filter((x) => x === 4).length).toBe(1);
    expect(spec.spins!.filter((x) => x === -4).length).toBe(1);
    expect(spec.show!.polyhedra!.ligand).toEqual(['O']);
    expect(spec.badge).toBe('computed');
  });
  it('passes an axis only to A and C', () => {
    expect(request('A', 1)).toEqual({ kind: 'A', axis: 1 });
    expect(request('G', 1)).toEqual({ kind: 'G' });
  });
  it('reports an unfittable request as a message, not a crash', () => {
    const b = buildNamed(cell, ['G'], 'G', 'auto', ['Xx'], true);
    expect(b.error).toBeTruthy();
  });
});
