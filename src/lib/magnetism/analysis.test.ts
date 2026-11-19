import { describe, expect, it } from 'vitest';
import { patternKept, rankEnergies, totalMomentCheck } from './analysis';

describe('rankEnergies', () => {
  it('gives energy per magnetic ion relative to FM and ranks lowest first', () => {
    const r = rankEnergies([
      { label: 'FM', energy: -40, nMagnetic: 2, source: 't' },
      { label: 'G', energy: -81, nMagnetic: 4, source: 't' },
      { label: 'A', energy: -40.2, nMagnetic: 2, source: 't' },
    ]);
    expect(r.referenceIsFm).toBe(true);
    expect(r.rows.map((x) => x.label)).toEqual(['G', 'A', 'FM']);
    expect(r.rows[0]!.relative).toBeCloseTo(-0.25, 12);
    expect(r.rows[1]!.relative).toBeCloseTo(-0.1, 12);
    expect(r.rows[2]!.relative).toBe(0);
    expect(r.rows.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
  it('falls back to the lowest energy without FM, and warns about near ties', () => {
    const r = rankEnergies([
      { label: 'A', energy: -10, nMagnetic: 1, source: 't' },
      { label: 'G', energy: -10.0005, nMagnetic: 1, source: 't' },
    ]);
    expect(r.referenceIsFm).toBe(false);
    expect(r.reference).toBe('G');
    expect(r.warnings.join(' ')).toMatch(/No FM/);
    expect(r.warnings.join(' ')).toMatch(/within 1 meV/);
  });
});

describe('patternKept (heuristic)', () => {
  const intended = [5, -5, 0, 0];
  it('keeps a pattern with the same signs and enough size', () => {
    const r = patternKept(intended, [4.2, -4.2, 0.05, 0]);
    expect(r.heuristic).toBe(true);
    expect(r.kept).toBe(true);
    expect(r.rule).toMatch(/^Heuristic/);
  });
  it('flags flipped, collapsed, shrunk and appeared moments', () => {
    expect(patternKept(intended, [4.2, 4.2, 0, 0]).sites[1]!.verdict).toBe('flipped');
    expect(patternKept(intended, [4.2, -0.05, 0, 0]).sites[1]!.verdict).toBe('collapsed');
    expect(patternKept(intended, [4.2, -2.0, 0, 0]).sites[1]!.verdict).toBe('shrunk');
    const r = patternKept(intended, [4.2, -4.2, 3.0, 0]);
    expect(r.sites[2]!.verdict).toBe('appeared');
    expect(r.kept).toBe(false);
  });
  it('honours tol and fraction, and refuses mismatched lengths', () => {
    expect(patternKept([2], [0.9], { fraction: 0.4 }).kept).toBe(true);
    expect(patternKept([2], [0.9]).kept).toBe(false);
    expect(patternKept([2], [0.15], { tol: 0.2 }).sites[0]!.verdict).toBe('collapsed');
    const bad = patternKept([1, 1], [1]);
    expect(bad.kept).toBe(false);
    expect(bad.warnings[0]).toMatch(/2 values but the file has 1/);
  });
});

describe('totalMomentCheck (heuristic)', () => {
  it('compares the site sum with the cell moment', () => {
    const c = totalMomentCheck([3.41, -3.41, 0.001], 0.001);
    expect(c.siteSum).toBeCloseTo(0.001, 12);
    expect(c.consistent).toBe(true);
    expect(totalMomentCheck([2, 2], 2.9).consistent).toBe(false);
    expect(totalMomentCheck([2, 2], 4.4).consistent).toBe(true);
  });
});
