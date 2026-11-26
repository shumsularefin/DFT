import { describe, expect, it } from 'vitest';
import { CRYSTAL_TEMPLATES } from './crystalTemplates';
import { check, composition } from '../../../lib/chem/validity';
import { cellVolume } from '../../../lib/crystal/lattice';
import { supercellOp, wrap } from '../../../lib/crystal/ops';

// M15.3: tests of what the M10.4 starter templates and the editor operations do today.
describe('crystal editor templates (M10.4, tested in M15.3)', () => {
  it('ids are unique and each template is well formed', () => {
    const ids = CRYSTAL_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of CRYSTAL_TEMPLATES) {
      expect(t.structure.species.length, t.id).toBe(t.structure.frac.length);
      expect(Math.abs(cellVolume(t.structure.lattice)), t.id).toBeGreaterThan(1);
      for (const f of t.structure.frac) for (const x of f) expect(Number.isFinite(x), t.id).toBe(true);
    }
  });

  it('rock salt is 8 atoms (4 Na, 4 Cl), reduced formula NaCl, in a 5.64 A cube', () => {
    const t = CRYSTAL_TEMPLATES.find((x) => x.id === 'rocksalt')!;
    expect(t.structure.species.filter((e) => e === 'Na')).toHaveLength(4);
    expect(t.structure.species.filter((e) => e === 'Cl')).toHaveLength(4);
    // composition() reports the reduced formula, not the cell contents
    expect(composition(t.structure)).toEqual([
      { el: 'Na', count: 1 },
      { el: 'Cl', count: 1 },
    ]);
    expect(Math.abs(cellVolume(t.structure.lattice))).toBeCloseTo(5.64 ** 3, 9);
  });

  it('no starter template has a validity error', () => {
    for (const t of CRYSTAL_TEMPLATES) {
      const errors = check(t.structure, 'crystal').filter((i) => i.severity === 'error');
      expect(
        errors.map((e) => e.code),
        t.id,
      ).toEqual([]);
    }
  });

  it('the 2x2x2 button multiplies the atoms and the volume by 8; wrap keeps the atom count', () => {
    const s = CRYSTAL_TEMPLATES[0]!.structure;
    const big = supercellOp(s, [
      [2, 0, 0],
      [0, 2, 0],
      [0, 0, 2],
    ]).structure;
    expect(big.species).toHaveLength(8 * s.species.length);
    expect(Math.abs(cellVolume(big.lattice))).toBeCloseTo(8 * Math.abs(cellVolume(s.lattice)), 6);
    expect(wrap(big).structure.species).toHaveLength(big.species.length);
  });
});
