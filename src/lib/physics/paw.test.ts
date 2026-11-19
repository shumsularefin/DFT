import { describe, expect, it } from 'vitest';
import { allElectronLike, augmentation, nodeCount, pseudo, window } from './paw';

describe('schematic PAW picture', () => {
  it('the two functions agree for r at or beyond rc', () => {
    for (const rc of [0.8, 1.5, 2.5])
      for (const r of [rc, rc + 0.1, rc + 1, 6]) expect(allElectronLike(r, rc)).toBeCloseTo(pseudo(r), 12);
  });
  it('the augmentation is zero outside rc and the window is smooth at rc', () => {
    expect(augmentation(3, 2)).toBeCloseTo(0, 12);
    expect(window(2, 2)).toBe(0);
    expect(window(1.999, 2)).toBeLessThan(1e-5);
    expect(window(0, 2)).toBe(1);
  });
  it('the pseudo function has no nodes and the all-electron-like one has nodes inside rc only', () => {
    expect(nodeCount(pseudo, 8)).toBe(0);
    const rc = 2;
    const n = nodeCount((r) => allElectronLike(r, rc), 8);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(nodeCount((r) => allElectronLike(r, rc), 8)).toBe(nodeCount((r) => allElectronLike(r, rc), rc));
  });
  it('a larger rc keeps nodes inside it and the function stays continuous', () => {
    for (const rc of [1, 2, 3]) {
      const a = allElectronLike(rc - 1e-9, rc);
      const b = allElectronLike(rc + 1e-9, rc);
      expect(Math.abs(a - b)).toBeLessThan(1e-6);
    }
  });
});
