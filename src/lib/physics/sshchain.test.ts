// Reference checks for the dimerized chain (S-161) and its Wannier functions (S-133): the lower-band eigenvector, the
// gap 2 |v - w|, the Berry (Zak) phase 0 or pi, Wannier centres on the intra-cell bond (+1/4) or the inter-cell bond
// (-1/4), normalization, and the spread growing when the gauge is scrambled.
import { describe, expect, it } from 'vitest';
import { gap, hk, kMesh, lowerBand, parallelTransport, wannier, wannierAt, weight } from './sshchain';

describe('Bloch states', () => {
  it('u(k) solves H(k) u = E u with H = [[0, h], [conj h, 0]] and is normalized', () => {
    const c = { v: 1.3, w: 0.6, n: 10 };
    for (const k of kMesh(12)) {
      const h = hk(c, k);
      const { E, u } = lowerBand(c, k);
      // row A: h u_B,  row B: conj(h) u_A
      const ra = { re: h.re * u[1].re - h.im * u[1].im, im: h.re * u[1].im + h.im * u[1].re };
      const rb = { re: h.re * u[0].re + h.im * u[0].im, im: h.re * u[0].im - h.im * u[0].re };
      expect(ra.re).toBeCloseTo(E * u[0].re, 12);
      expect(ra.im).toBeCloseTo(E * u[0].im, 12);
      expect(rb.re).toBeCloseTo(E * u[1].re, 12);
      expect(rb.im).toBeCloseTo(E * u[1].im, 12);
      expect(u[0].re ** 2 + u[0].im ** 2 + u[1].re ** 2 + u[1].im ** 2).toBeCloseTo(1, 12);
    }
  });
  it('the gap is 2 |v - w|, at k = pi', () => {
    const c = { v: 1.3, w: 0.6, n: 10 };
    expect(gap(c)).toBeCloseTo(1.4, 12);
    expect(-2 * lowerBand(c, Math.PI).E).toBeCloseTo(1.4, 12);
  });
});

describe('Berry phase and Wannier centres (S-133)', () => {
  const trivial = { v: 1.4, w: 0.6, n: 10 };
  const shifted = { v: 0.6, w: 1.4, n: 10 };
  it('the Berry phase is 0 when v > w and pi when w > v', () => {
    expect(Math.cos(parallelTransport(trivial).berry)).toBeCloseTo(1, 9);
    expect(Math.cos(parallelTransport(shifted).berry)).toBeCloseTo(-1, 9);
  });
  it('the maximally localized function sits on the intra-cell bond (+1/4) or the inter-cell bond (-1/4)', () => {
    // on a finite mesh of 10 k-points the centre is 1/4 to a few parts in a million
    expect(wannier(trivial, 1).centre).toBeCloseTo(0.25, 5);
    expect(wannier(shifted, 1).centre).toBeCloseTo(-0.25, 5);
  });
  it('is normalized and real up to one overall phase', () => {
    const wf = wannier(trivial, 1);
    expect(weight(wf)).toBeCloseTo(1, 12);
    expect(weight(wannier(trivial, 0))).toBeCloseTo(1, 12);
  });
  it('scrambling the gauge spreads the function out', () => {
    expect(wannier(trivial, 0).spread).toBeGreaterThan(10 * wannier(trivial, 1).spread);
    expect(wannier(trivial, 1).spread).toBeLessThan(0.2);
  });
  it('the dimer limit w = 0 gives the bonding orbital of one cell, spread 1/16', () => {
    const wf = wannier({ v: 1, w: 0, n: 8 }, 1);
    expect(wf.centre).toBeCloseTo(0.25, 12);
    expect(wf.spread).toBeCloseTo(1 / 16, 12);
  });
  it('wannierAt evaluates on the line', () => {
    const wf = wannier(trivial, 1);
    const at = wannierAt(wf, 0);
    expect(Math.hypot(at.re, at.im)).toBeGreaterThan(0.3);
  });
});
