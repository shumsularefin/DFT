import { describe, expect, it } from 'vitest';
import { alongDirection, direction, fromPrincipal, matVec, rotationY, symmetricEigen3 } from './tensor3';

describe('symmetric 3x3 principal axes', () => {
  it('recovers the principal values and axes of a tensor built from them', () => {
    const r = rotationY(0.4);
    const m = fromPrincipal([2.5, 4, 7.25], r);
    const { values, axes } = symmetricEigen3(m);
    expect(values[0]).toBeCloseTo(2.5, 12);
    expect(values[1]).toBeCloseTo(4, 12);
    expect(values[2]).toBeCloseTo(7.25, 12);
    // each axis is an eigenvector: M v = lambda v
    axes.forEach((v, i) => {
      const mv = matVec(m, v);
      for (let k = 0; k < 3; k++) expect(mv[k]).toBeCloseTo(values[i]! * v[k]!, 12);
      expect(Math.hypot(...v)).toBeCloseTo(1, 12);
    });
    // the first axis is the rotated x axis (up to sign)
    expect(Math.abs(axes[0][0] * Math.cos(0.4) - axes[0][2] * Math.sin(0.4))).toBeCloseTo(1, 12);
  });

  it('matches the closed form of a 2x2 block', () => {
    // [[a, b], [b, d]] block has eigenvalues (a + d)/2 -/+ sqrt(((a - d)/2)^2 + b^2)
    const [a, b, d] = [5, 1.5, 2];
    const { values } = symmetricEigen3([
      [a, b, 0],
      [b, d, 0],
      [0, 0, 9],
    ]);
    const r = Math.sqrt(((a - d) / 2) ** 2 + b * b);
    expect(values[0]).toBeCloseTo((a + d) / 2 - r, 12);
    expect(values[1]).toBeCloseTo((a + d) / 2 + r, 12);
    expect(values[2]).toBeCloseTo(9, 12);
  });

  it('eps along a principal axis is the principal value, and the trace is invariant', () => {
    const m = fromPrincipal([3, 5, 11], rotationY(1.1));
    const { values, axes } = symmetricEigen3(m);
    axes.forEach((v, i) => expect(alongDirection(m, v)).toBeCloseTo(values[i]!, 12));
    expect(m[0][0] + m[1][1] + m[2][2]).toBeCloseTo(19, 12);
    // an isotropic tensor gives the same value in every direction
    const iso = fromPrincipal([4, 4, 4], rotationY(0.3));
    for (const [t, p] of [
      [0.2, 0.1],
      [1.3, 2.2],
      [2.9, 4],
    ] as const)
      expect(alongDirection(iso, direction(t, p))).toBeCloseTo(4, 12);
  });
});
