import { describe, expect, it } from 'vitest';
import { LEVELS, normalizeLevel, visibleAt, visibleLevels, type LevelRange } from './levels';

// Truth table, written out by hand from D-011: rows are [range, [beginner, intermediate, pro]].
const TABLE: [LevelRange, [boolean, boolean, boolean]][] = [
  [{}, [true, true, true]],
  [{ min: 'beginner' }, [true, true, true]],
  [{ min: 'intermediate' }, [false, true, true]],
  [{ min: 'pro' }, [false, false, true]],
  [{ max: 'beginner' }, [true, false, false]],
  [{ max: 'intermediate' }, [true, true, false]],
  [{ max: 'pro' }, [true, true, true]],
  [{ min: 'intermediate', max: 'intermediate' }, [false, true, false]],
  [{ min: 'intermediate', max: 'pro' }, [false, true, true]],
  [{ min: 'beginner', max: 'beginner' }, [true, false, false]],
  [{ min: 'pro', max: 'beginner' }, [false, false, false]],
];

describe('visibleAt', () => {
  for (const [range, expected] of TABLE) {
    it(`${JSON.stringify(range)}`, () => {
      expect(LEVELS.map((l) => visibleAt(l, range))).toEqual(expected);
    });
  }

  it('visibleLevels lists the levels where content shows', () => {
    expect(visibleLevels({ min: 'intermediate' })).toEqual(['intermediate', 'pro']);
    expect(visibleLevels({ max: 'beginner' })).toEqual(['beginner']);
  });

  it('normalizeLevel falls back to beginner', () => {
    expect(normalizeLevel(undefined)).toBe('beginner');
    expect(normalizeLevel('expert')).toBe('beginner');
    expect(normalizeLevel('pro')).toBe('pro');
  });
});
