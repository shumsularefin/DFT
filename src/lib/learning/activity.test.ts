import { describe, expect, it } from 'vitest';
import { emptyActivity, milestones, parseActivity, recordActivity, streak } from './activity';

describe('streak with one free rest day per 7', () => {
  it('is 0 with no activity and counts a plain run', () => {
    expect(streak([], 100)).toBe(0);
    expect(streak([98, 99, 100], 100)).toBe(3);
  });
  it('does not count today as a miss before the first answer of the day', () => {
    expect(streak([98, 99], 100)).toBe(2);
  });
  it('forgives one missed day', () => {
    expect(streak([96, 97, 98, 100], 100)).toBe(4);
    expect(streak([96, 97, 98], 100)).toBe(3); // yesterday missed, today open: free day used
  });
  it('allows only one free day in any 7', () => {
    // misses at 99 and 97: second miss is within 7 days of the first, so the run ends at 98
    expect(streak([96, 98, 100], 100)).toBe(2);
    // misses at 99 and 91 are 8 days apart: both forgiven
    expect(streak([88, 89, 90, 92, 93, 94, 95, 96, 97, 98, 100], 100)).toBe(11);
  });
  it('ends after two missed days in a row, quietly (returns 0, never a negative message)', () => {
    expect(streak([90, 91, 92], 100)).toBe(0);
    expect(streak([95, 96, 97], 100)).toBe(0);
  });
});

describe('activity record', () => {
  it('records distinct days, counts every answer, and caps the list', () => {
    let a = emptyActivity();
    a = recordActivity(a, 5);
    a = recordActivity(a, 5);
    a = recordActivity(a, 4);
    expect(a.days).toEqual([4, 5]);
    expect(a.answers).toBe(3);
    for (let d = 0; d < 500; d++) a = recordActivity(a, 1000 + d);
    expect(a.days.length).toBe(400);
    expect(a.days[a.days.length - 1]).toBe(1499);
  });
  it('parses defensively', () => {
    expect(parseActivity(null)).toEqual(emptyActivity());
    expect(parseActivity({ version: 1, days: [3, 3, 'x', 1], answers: 7, hideStreaks: true })).toEqual({
      version: 1,
      days: [1, 3],
      answers: 7,
      hideStreaks: true,
    });
    expect(parseActivity({ version: 9 })).toEqual(emptyActivity());
  });
});

describe('milestones', () => {
  it('are derived from counts', () => {
    expect(milestones(0, 0).map((m) => m.reached)).toEqual([false, false, false]);
    expect(milestones(1, 0).map((m) => m.reached)).toEqual([true, false, false]);
    expect(milestones(50, 1).map((m) => m.reached)).toEqual([true, true, true]);
  });
});
