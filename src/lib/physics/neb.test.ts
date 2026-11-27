import { describe, expect, it } from 'vitest';
import {
  MB_MINIMA,
  MB_SADDLES,
  MULLER_BROWN,
  improvedTangent,
  linearBand,
  morseIndex,
  mullerBrown,
  mullerBrownGradient,
  mullerBrownHessian,
  refineStationary,
  runNeb,
  type P2,
} from './neb';

// Literature energies of the stationary points of the Muller-Brown surface (S-167), in the model's units.
const E_MIN = [-146.7, -108.17, -80.77];
const E_SAD = [-40.66, -72.25];

describe('Muller-Brown surface (S-167)', () => {
  it('has analytic derivatives that match finite differences', () => {
    const h = 1e-6;
    for (const [x, y] of [
      [-0.3, 0.8],
      [0.4, 0.1],
      [-1.0, 1.2],
    ] as P2[]) {
      const g = mullerBrownGradient(x, y);
      expect(g[0]).toBeCloseTo((mullerBrown(x + h, y) - mullerBrown(x - h, y)) / (2 * h), 4);
      expect(g[1]).toBeCloseTo((mullerBrown(x, y + h) - mullerBrown(x, y - h)) / (2 * h), 4);
      const H = mullerBrownHessian(x, y);
      const gx = mullerBrownGradient(x + h, y);
      const gm = mullerBrownGradient(x - h, y);
      expect(H[0]).toBeCloseTo((gx[0] - gm[0]) / (2 * h), 2);
      expect(H[1]).toBeCloseTo((gx[1] - gm[1]) / (2 * h), 2);
    }
  });

  it('has three minima and two saddle points where the literature puts them', () => {
    MB_MINIMA.forEach((p, i) => {
      const q = refineStationary(p);
      expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeLessThan(1e-3);
      expect(morseIndex(q)).toBe(0);
      expect(mullerBrown(q[0], q[1])).toBeCloseTo(E_MIN[i]!, 1);
    });
    MB_SADDLES.forEach((p, i) => {
      const q = refineStationary(p);
      expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeLessThan(1e-3);
      expect(morseIndex(q)).toBe(1);
      expect(mullerBrown(q[0], q[1])).toBeCloseTo(E_SAD[i]!, 1);
    });
  });
});

describe('nudged elastic band (S-121)', () => {
  const A = refineStationary(MB_MINIMA[0]!);
  const B = refineStationary(MB_MINIMA[1]!);
  const S1 = refineStationary(MB_SADDLES[0]!);
  const eS1 = mullerBrown(S1[0], S1[1]);

  it('takes the tangent towards the higher neighbour', () => {
    const pts: P2[] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    expect(improvedTangent(pts, [0, 1, 2], 1)).toEqual([0, 1]);
    expect(improvedTangent(pts, [2, 1, 0], 1)).toEqual([1, 0]);
  });

  it('with the climbing image converges onto the highest saddle point', () => {
    for (const images of [5, 7, 11]) {
      const fr = runNeb(linearBand(A, B, images), MULLER_BROWN, { images, climb: true }, 800);
      const last = fr[fr.length - 1]!;
      const ci = last.points[last.climbing]!;
      expect(Math.hypot(ci[0] - S1[0], ci[1] - S1[1])).toBeLessThan(1e-3);
      expect(last.energies[last.climbing]!).toBeCloseTo(eS1, 3);
      expect(last.maxForce).toBeLessThan(0.5);
    }
  });

  it('without it, the highest image lies below the saddle (the barrier is underestimated)', () => {
    for (const images of [3, 7]) {
      const fr = runNeb(linearBand(A, B, images), MULLER_BROWN, { images, climb: false }, 800);
      const last = fr[fr.length - 1]!;
      const top = Math.max(...last.energies.slice(1, -1));
      expect(top).toBeLessThan(eS1);
      expect(last.climbing).toBe(-1);
    }
  });

  it('keeps the end points fixed', () => {
    const fr = runNeb(linearBand(A, B, 5), MULLER_BROWN, { images: 5, climb: true }, 50);
    const last = fr[fr.length - 1]!;
    expect(last.points[0]).toEqual(fr[0]!.points[0]);
    expect(last.points[6]).toEqual(fr[0]!.points[6]);
    expect(Math.hypot(last.points[6]![0] - B[0], last.points[6]![1] - B[1])).toBeLessThan(1e-12);
  });
});
