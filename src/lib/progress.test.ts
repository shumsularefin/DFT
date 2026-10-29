import { describe, expect, it } from 'vitest';
import {
  complete,
  emptyProgress,
  merge,
  modulePercent,
  parseProgress,
  percent,
  uncomplete,
  visit,
} from './progress';

const T1 = '2026-10-29T10:00:00.000Z';
const T2 = '2026-10-29T11:00:00.000Z';

describe('progress', () => {
  it('visit adds once and dedupes', () => {
    const p = visit(visit(emptyProgress(), 'a/x', T1), 'a/x', T2);
    expect(p.visited).toEqual(['a/x']);
    expect(p.updated).toBe(T1);
  });

  it('complete implies visited, dedupes, and uncomplete removes only the completion', () => {
    let p = complete(emptyProgress(), 'a/x', T1);
    p = complete(p, 'a/x', T2);
    expect(p).toEqual({ visited: ['a/x'], completed: ['a/x'], updated: T1 });
    p = uncomplete(p, 'a/x', T2);
    expect(p.completed).toEqual([]);
    expect(p.visited).toEqual(['a/x']);
    expect(uncomplete(p, 'zzz', T2)).toBe(p);
  });

  it('percent rounds, caps, and survives zero topics', () => {
    const p = complete(complete(emptyProgress(), 'a', T1), 'b', T1);
    expect(percent(p, 3)).toBe(67);
    expect(percent(p, 2)).toBe(100);
    expect(percent(p, 1)).toBe(100);
    expect(percent(p, 0)).toBe(0);
  });

  it('ignores ids that no longer exist when told which are known', () => {
    const p = complete(complete(emptyProgress(), 'a', T1), 'gone', T1);
    expect(percent(p, 2, ['a', 'b'])).toBe(50);
  });

  it('per-module percent counts only that module', () => {
    const p = complete(complete(emptyProgress(), 'm1/a', T1), 'm2/a', T1);
    expect(modulePercent(p, ['m1/a', 'm1/b'])).toBe(50);
    expect(modulePercent(p, [])).toBe(0);
  });

  it('merge is a union and keeps the later timestamp', () => {
    const a = complete(emptyProgress(), 'a', T1);
    const b = visit(complete(emptyProgress(), 'b', T2), 'c', T2);
    const m = merge(a, b);
    expect(m.completed.sort()).toEqual(['a', 'b']);
    expect(m.visited.sort()).toEqual(['a', 'b', 'c']);
    expect(m.updated).toBe(T2);
    const r = merge(b, a);
    expect([...r.visited].sort()).toEqual([...m.visited].sort());
    expect([...r.completed].sort()).toEqual([...m.completed].sort());
  });

  it('parseProgress turns junk into an empty state and keeps good ids', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('x')).toEqual(emptyProgress());
    expect(parseProgress({ visited: ['a', 3, null], completed: 'no', updated: 5 })).toEqual({
      visited: ['a'],
      completed: [],
      updated: '',
    });
  });
});
