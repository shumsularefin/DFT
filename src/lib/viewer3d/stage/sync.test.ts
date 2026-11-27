import { describe, expect, it } from 'vitest';
import { activeState, splitFraction, stepState } from './sync';

const order = ['why', 'intuition', 'lab', 'math', 'in-vasp', 'check'];
const states = [{ section: 'why' }, { section: 'intuition' }, { section: 'math' }, {}];

describe('activeState', () => {
  it('shows the first state before any heading reaches the line', () => {
    expect(activeState(states, { why: 500, intuition: 900 }, 1000, order)).toBe(0);
  });
  it('follows the last heading above 40% of the viewport', () => {
    expect(activeState(states, { why: -800, intuition: 350, lab: 700 }, 1000, order)).toBe(1);
    expect(activeState(states, { why: -800, intuition: -300, lab: 100, math: 390 }, 1000, order)).toBe(2);
  });
  it('keeps the previous state through sections that have none', () => {
    expect(activeState(states, { why: -800, intuition: -300, lab: 100, math: 900 }, 1000, order)).toBe(1);
    expect(
      activeState(
        states,
        { why: -2000, intuition: -1500, lab: -900, math: -400, 'in-vasp': 0, check: 100 },
        1000,
        order,
      ),
    ).toBe(2);
  });
  it('ignores sections that are not on the page', () => {
    expect(activeState(states, { why: -10 }, 1000, order)).toBe(0);
  });
});

describe('stepState and splitFraction', () => {
  it('clamps steps', () => {
    expect(stepState(4, 3, 1)).toBe(3);
    expect(stepState(4, 0, -1)).toBe(0);
    expect(stepState(4, 1, 1)).toBe(2);
  });
  it('keeps the stage between 28% and 66% of the row', () => {
    expect(splitFraction(0, 1000, 600)).toBeCloseTo(0.4, 9);
    expect(splitFraction(0, 1000, 100)).toBe(0.66);
    expect(splitFraction(0, 1000, 950)).toBe(0.28);
  });
});
