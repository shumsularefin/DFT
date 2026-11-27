import { describe, expect, it } from 'vitest';
import {
  chainEnergy,
  helixOptimum,
  netPerSite,
  pairCorrelation,
  ringEnergy,
  saxisToCartesian,
  textureSpin,
  type TextureParams,
} from './spintexture';
import type { Vec3 } from '../crystal/types';

const ring = (p: TextureParams, n: number): Vec3[] => Array.from({ length: n }, (_, j) => textureSpin(p, j));
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.sqrt(dot(a, a));

describe('spin textures on a chain (S-059)', () => {
  it('every texture has unit spins', () => {
    for (const kind of ['canted', 'helix', 'cone'] as const)
      for (let j = 0; j < 7; j++)
        expect(len(textureSpin({ kind, angle: 0.7, q: 0.13 }, j))).toBeCloseTo(1, 12);
  });

  it('the closed-form energy equals the energy summed over a commensurate periodic ring', () => {
    const J = [1, -0.6];
    const cases: TextureParams[] = [
      { kind: 'canted', angle: 0.4, q: 0 },
      { kind: 'helix', angle: 0, q: 3 / 24 },
      { kind: 'helix', angle: 0, q: 0.5 },
      { kind: 'cone', angle: 1.1, q: 5 / 24 },
    ];
    for (const p of cases) expect(ringEnergy(ring(p, 24), J)).toBeCloseTo(chainEnergy(p, J), 12);
  });

  it('limits: q = 0 is ferromagnetic, q = 1/2 antiferromagnetic, canting 0 is collinear AFM', () => {
    expect(chainEnergy({ kind: 'helix', angle: 0, q: 0 }, [1, 0.3])).toBeCloseTo(-1.3, 12);
    expect(chainEnergy({ kind: 'helix', angle: 0, q: 0.5 }, [1, 0.3])).toBeCloseTo(1 - 0.3, 12);
    expect(pairCorrelation({ kind: 'canted', angle: 0, q: 0 }, 1)).toBeCloseTo(-1, 12);
    expect(pairCorrelation({ kind: 'canted', angle: Math.PI / 2, q: 0 }, 1)).toBeCloseTo(1, 12);
  });

  it('helixOptimum matches a brute-force minimum of the helix energy over q', () => {
    for (const [j1, j2] of [
      [1, -0.5],
      [1, -1],
      [-1, -0.4],
      [1, -0.1],
      [-1, 0.2],
    ] as const) {
      let best = 0;
      let eBest = Infinity;
      for (let i = 0; i <= 50000; i++) {
        const q = (0.5 * i) / 50000;
        const e = chainEnergy({ kind: 'helix', angle: 0, q }, [j1, j2]);
        if (e < eBest) [eBest, best] = [e, q];
      }
      expect(helixOptimum(j1, j2)).toBeCloseTo(best, 4);
    }
    // the textbook point: J2 = -J1 / 2 gives cos(2 pi q) = 1/2, q = 1/6
    expect(helixOptimum(1, -0.5)).toBeCloseTo(1 / 6, 12);
  });

  it('net moment per site equals the average over a long commensurate ring', () => {
    for (const p of [
      { kind: 'canted', angle: 0.3, q: 0 },
      { kind: 'cone', angle: 0.8, q: 1 / 8 },
      { kind: 'helix', angle: 0, q: 1 / 8 },
    ] as TextureParams[]) {
      const r = ring(p, 48);
      const avg = [0, 1, 2].map((k) => r.reduce((a, s) => a + s[k]!, 0) / r.length);
      netPerSite(p).forEach((x, k) => expect(avg[k]).toBeCloseTo(x, 12));
    }
  });
});

describe('SAXIS frame (S-065)', () => {
  it('SAXIS = 0 0 1 leaves MAGMOM unchanged', () => {
    const m: Vec3 = [0.3, -1.2, 2.5];
    saxisToCartesian(m, [0, 0, 1]).forEach((x, k) => expect(x).toBeCloseTo(m[k]!, 12));
  });
  it('MAGMOM 0 0 1 points along SAXIS, and the map is a rotation', () => {
    for (const s of [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [0, -1, 2],
    ] as Vec3[]) {
      const u = saxisToCartesian([0, 0, 1], s);
      const n = len(s);
      u.forEach((x, k) => expect(x).toBeCloseTo(s[k]! / n, 12));
      const ex = saxisToCartesian([1, 0, 0], s);
      const ey = saxisToCartesian([0, 1, 0], s);
      expect(dot(ex, ey)).toBeCloseTo(0, 12);
      expect(dot(ex, u)).toBeCloseTo(0, 12);
      expect(len(ex)).toBeCloseTo(1, 12);
      expect(len(ey)).toBeCloseTo(1, 12);
    }
  });
});
