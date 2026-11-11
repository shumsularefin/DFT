import { describe, expect, it } from 'vitest';
import { fmt, niceTicks } from './ticks';

describe('niceTicks', () => {
  it('gives round numbers inside the range', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-3.2, 3.9, 4)).toEqual([-2, 0, 2]);
  });
  it('handles a flat range and bad input', () => {
    expect(niceTicks(2, 2)).toEqual([2]);
    expect(niceTicks(NaN, 1)).toEqual([]);
  });
  it('formats numbers compactly', () => {
    expect(fmt(0.123456)).toBe('0.123');
    expect(fmt(NaN)).toBe('n/a');
  });
});
