import { describe, expect, it } from 'vitest';
import { streak } from './streak';
import { dayKey } from './state';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 20, 15).getTime();
const days = (...back: number[]) => back.map((b) => dayKey(NOW - b * DAY));

describe('gentle streak', () => {
  it('counts consecutive days and does not end because today is not done yet', () => {
    expect(streak(days(0, 1, 2), NOW).days).toBe(3);
    expect(streak(days(1, 2, 3), NOW).days).toBe(3);
  });
  it('forgives one rest day in any 7', () => {
    expect(streak(days(0, 1, 3, 4), NOW)).toEqual({ days: 4, restDaysUsed: 1 });
  });
  it('does not forgive two rest days within 7', () => {
    expect(streak(days(0, 2, 4), NOW).days).toBe(2);
  });
  it('forgives again after 7 days', () => {
    // active 0..2, rest 3, active 4..9, rest 10, active 11
    expect(streak(days(0, 1, 2, 4, 5, 6, 7, 8, 9, 11), NOW)).toEqual({ days: 10, restDaysUsed: 2 });
  });
  it('two missing days in a row start a new streak', () => {
    expect(streak(days(0, 3, 4), NOW).days).toBe(1);
  });
  it('is zero with no activity', () => {
    expect(streak([], NOW)).toEqual({ days: 0, restDaysUsed: 0 });
  });
});
