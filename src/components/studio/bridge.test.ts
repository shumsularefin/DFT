import { describe, expect, it } from 'vitest';
import { SiteBridge } from './bridge';
import { parsePoscar } from '../../lib/crystal/poscar';

// Two Na atoms 0.4 Angstrom apart in a 10 Angstrom cube: the B001 case from src/lib/chem/validity.test.ts.
const TWO_NA = `two Na
1.0
10 0 0
0 10 0
0 0 10
Na
2
Direct
0.2 0.2 0.2
0.24 0.2 0.2
`;

describe('SiteBridge (DFT Studio to the site code)', () => {
  it('runs the site structure checks on Studio POSCAR text', () => {
    const issues = SiteBridge.check(TWO_NA);
    const b001 = issues.find((i) => i.code === 'B001');
    expect(b001?.severity).toBe('error');
    expect(b001?.atoms).toEqual([0, 1]);
    expect(b001?.fixes[0]).toMatch(/Merge/);
  });
  it('applies the main fix through the same code as the site (merge to the midpoint)', () => {
    const i = SiteBridge.check(TWO_NA).findIndex((x) => x.code === 'B001');
    const fixed = SiteBridge.applyFix(TWO_NA, i, 0)!;
    const s = parsePoscar(fixed).structure;
    expect(s.species).toEqual(['Na']);
    expect(s.frac[0]![0]).toBeCloseTo(0.22, 12);
    expect(SiteBridge.check(fixed).some((x) => x.code === 'B001')).toBe(false);
    expect(SiteBridge.applyFix(TWO_NA, 99)).toBeNull();
  });
  it('gate blocks errors without a reason and writes the reason into the comment line', () => {
    expect(SiteBridge.gate(TWO_NA).allowed).toBe(false);
    expect(SiteBridge.gate(TWO_NA).blocking[0]).toMatch(/^B001/);
    const g = SiteBridge.gate(TWO_NA, 'testing a dimer');
    expect(g.allowed).toBe(true);
    expect(g.poscar.split('\n')[0]).toContain('testing a dimer');
  });
  it('clean-up operations return POSCAR text (merge works within 0.1 Angstrom, rules.ts mergeDistance)', () => {
    expect(SiteBridge.op('merge', TWO_NA).changed).toBe(false); // 0.4 Angstrom apart: not a duplicate
    const dup = TWO_NA.replace('0.24 0.2 0.2', '0.205 0.2 0.2'); // 0.05 Angstrom apart
    const merged = SiteBridge.op('merge', dup);
    expect(merged.changed).toBe(true);
    expect(parsePoscar(merged.poscar).structure.species).toEqual(['Na']);
  });
  it('exposes the handbook templates and Z = 1 to 103 on the periodic-table grid', () => {
    const per = SiteBridge.templates.find((t) => t.id === 'perovskite')!;
    expect(parsePoscar(per.poscar).structure.species).toHaveLength(5);
    expect(SiteBridge.elements).toHaveLength(103);
    const la = SiteBridge.elements.find((e) => e.symbol === 'La')!;
    const fe = SiteBridge.elements.find((e) => e.symbol === 'Fe')!;
    expect([la.row, la.col]).toEqual([9, 4]);
    expect([fe.row, fe.col]).toEqual([4, 8]);
  });
  it('runs the site INCAR rules on Studio input', () => {
    const out = SiteBridge.validateIncar('ISMEAR = -5\nSIGMA = 0.05\n', TWO_NA);
    expect(Array.isArray(out)).toBe(true);
    for (const r of out) expect(r.rule).toMatch(/^[A-Z]+-?\d+/);
  });
});
