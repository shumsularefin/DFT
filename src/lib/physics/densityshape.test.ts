import { describe, expect, it } from 'vitest';
import { CONTROL_X, PRESETS, presetHeights, shapeFromHeights } from './densityshape';

describe('density shape (lab input recipe)', () => {
  it('passes through the control heights and stays positive', () => {
    const h = presetHeights('two-bumps');
    const f = shapeFromHeights(h);
    CONTROL_X.forEach((x, j) => expect(f(x)).toBeCloseTo(h[j]!, 10));
    for (let x = -7; x <= 7; x += 0.05) expect(f(x)).toBeGreaterThan(0);
  });
  it('is tiny at the walls', () => {
    const f = shapeFromHeights(presetHeights('gaussian'));
    expect(f(-6)).toBeLessThan(1e-5);
    expect(f(6)).toBeLessThan(1e-5);
  });
  it('has a preset for each id with peak-normalised heights', () => {
    for (const p of PRESETS) expect(Math.max(...presetHeights(p.id))).toBeLessThanOrEqual(1);
  });
});
