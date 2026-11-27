import { describe, expect, it } from 'vitest';
import { parallelSuggestions } from '../vasp/jobscript';
import { groupsOfRank, kpointsOfGroup, parallelSplit } from './vaspParallel';

describe('parallelSplit (KPAR and NCORE, S-019, S-041)', () => {
  it('the case in the job-scripts topic: 32 ranks, KPAR = 4, NCORE = 4 give four groups of 8 and two band groups', () => {
    const s = parallelSplit(32, 4, 4, 10);
    expect(s.valid).toBe(true);
    expect(s.ranksPerKGroup).toBe(8);
    expect(s.npar).toBe(2);
  });

  it('a fixed table of cases: ranks, KPAR, NCORE to ranks per group and NPAR', () => {
    const cases: [number, number, number, number, number][] = [
      [16, 1, 1, 16, 16],
      [16, 2, 4, 8, 2],
      [24, 3, 4, 8, 2],
      [64, 8, 8, 8, 1],
      [48, 4, 6, 12, 2],
      [128, 4, 16, 32, 2],
    ];
    for (const [r, k, c, per, npar] of cases) {
      const s = parallelSplit(r, k, c, 7);
      expect(s.valid, `${r} ${k} ${c}`).toBe(true);
      expect(s.ranksPerKGroup).toBe(per);
      expect(s.npar).toBe(npar);
      expect(s.ranksPerKGroup * s.kpar).toBe(r);
      expect(s.npar * s.ncore * s.kpar).toBe(r);
    }
  });

  it('KPAR that does not divide the ranks is invalid (VASP stops, S-041)', () => {
    const s = parallelSplit(32, 3, 1, 10);
    expect(s.valid).toBe(false);
    expect(s.npar).toBe(0);
    expect(s.problem).toMatch(/does not divide/);
    expect(parallelSplit(4, 8, 1, 10).valid).toBe(false);
  });

  it('NCORE that does not divide the ranks of a group is flagged', () => {
    const s = parallelSplit(32, 4, 3, 10);
    expect(s.valid).toBe(false);
    expect(s.ranksPerKGroup).toBe(8);
    expect(parallelSplit(32, 4, 16, 10).valid).toBe(false);
  });

  it('k-points are dealt in turn: 10 k-points over 4 groups take 3 rounds and leave 2 slots idle', () => {
    const s = parallelSplit(32, 4, 4, 10);
    expect(s.kpointsPerGroup).toEqual([3, 3, 2, 2]);
    expect(s.rounds).toBe(3);
    expect(s.idleSlots).toBe(2);
    expect(kpointsOfGroup(s, 0)).toEqual([0, 4, 8]);
    expect(kpointsOfGroup(s, 3)).toEqual([3, 7]);
    const all = s.kpointsPerGroup.flatMap((_, g) => kpointsOfGroup(s, g)).sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 10 }, (_, i) => i));
  });

  it('more groups than k-points leave whole groups idle', () => {
    const s = parallelSplit(16, 8, 1, 3);
    expect(s.kpointsPerGroup.filter((n) => n === 0).length).toBe(5);
    expect(s.idleSlots).toBe(5);
  });

  it('each rank belongs to exactly one k-group and one band group, and every group has the same size', () => {
    const s = parallelSplit(48, 4, 3, 5);
    const counts = new Map<string, number>();
    for (let r = 0; r < 48; r++) {
      const { kGroup, bandGroup } = groupsOfRank(s, r);
      expect(kGroup).toBeLessThan(4);
      expect(bandGroup).toBeLessThan(s.npar);
      const key = `${kGroup}:${bandGroup}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(4 * s.npar);
    expect([...counts.values()].every((n) => n === 3)).toBe(true);
  });

  it('every KPAR the job-script tool suggests gives a valid split', () => {
    const o = { nodes: 2, tasksPerNode: 32 };
    const { kpar, ncore } = parallelSuggestions(o);
    for (const k of kpar) expect(parallelSplit(64, k, 1, 10).valid).toBe(true);
    for (const c of ncore) expect(parallelSplit(64, 1, c, 10).valid).toBe(true);
  });

  it('rejects non-integer input', () => {
    expect(() => parallelSplit(0, 1, 1, 1)).toThrow(RangeError);
    expect(() => parallelSplit(8, 1.5, 1, 1)).toThrow(RangeError);
  });
});
