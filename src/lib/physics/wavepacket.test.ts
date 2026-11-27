// The free Gaussian packet (S-047) against independent checks: the time-dependent Schrodinger equation by finite
// differences, normalisation and the first moment by Simpson, and the closed-form density against |psi|^2.
import { describe, expect, it } from 'vitest';
import { HBAR2_OVER_2M_EV_A2, PLANCK_EV_S } from './constants';
import { simpson } from './quadrature';
import {
  HBAR_EV_FS,
  deBroglie,
  energyFromK,
  groupVelocity,
  kFromEnergy,
  packetCentre,
  packetDensity,
  packetPsi,
  packetWidth,
  probabilityBetween,
  spreadTime,
  type Packet,
} from './wavepacket';

const p: Packet = { k0: 1.6, sigma0: 1.5, x0: -2 };

describe('free Gaussian wave packet (S-047)', () => {
  it('uses hbar = h / 2 pi = 0.6582119569 eV fs (CODATA 2018)', () => {
    expect(HBAR_EV_FS).toBeCloseTo(0.6582119569, 9);
    expect(HBAR_EV_FS).toBeCloseTo((PLANCK_EV_S * 1e15) / (2 * Math.PI), 12);
  });
  it('a 100 eV electron has a de Broglie wavelength of about 1.23 A (the page check)', () => {
    expect(deBroglie(kFromEnergy(100))).toBeCloseTo(1.2264, 3);
    expect(energyFromK(kFromEnergy(37))).toBeCloseTo(37, 12);
  });
  it('solves i hbar dpsi/dt = -(hbar^2/2m) d2psi/dx2 (finite differences, relative residual below 1e-5)', () => {
    // the time step is smaller because psi turns at omega = E / hbar, about 15 per fs here
    const h = 1e-3;
    const ht = 1e-4;
    for (const t of [0, 0.2, 0.7])
      for (const x of [-3, -1, 0.5, 2]) {
        const [r0, i0] = packetPsi(p, x, t);
        const [rp, ip] = packetPsi(p, x, t + ht);
        const [rm, im] = packetPsi(p, x, t - ht);
        const [rxp, ixp] = packetPsi(p, x + h, t);
        const [rxm, ixm] = packetPsi(p, x - h, t);
        // left: i hbar (psi(t+ht) - psi(t-ht)) / 2ht = hbar * (-(dIm), dRe)
        const lRe = (-HBAR_EV_FS * (ip - im)) / (2 * ht);
        const lIm = (HBAR_EV_FS * (rp - rm)) / (2 * ht);
        const rRe = (-HBAR2_OVER_2M_EV_A2 * (rxp - 2 * r0 + rxm)) / (h * h);
        const rIm = (-HBAR2_OVER_2M_EV_A2 * (ixp - 2 * i0 + ixm)) / (h * h);
        const scale = Math.hypot(rRe, rIm) + Math.hypot(r0, i0);
        expect(Math.hypot(lRe - rRe, lIm - rIm) / scale).toBeLessThan(1e-5);
      }
  });
  it('the closed-form density equals |psi|^2 and stays normalised', () => {
    for (const t of [0, 0.3, 1.2]) {
      for (const x of [-4, -1, 0, 3]) {
        const [re, im] = packetPsi(p, x, t);
        expect(packetDensity(p, x, t)).toBeCloseTo(re * re + im * im, 12);
      }
      const c = packetCentre(p, t);
      const w = packetWidth(p, t);
      expect(simpson((x) => packetDensity(p, x, t), c - 12 * w, c + 12 * w, 2000)).toBeCloseTo(1, 9);
      // first moment: the centre moves at the group velocity hbar k0 / m
      const mean = simpson((x) => x * packetDensity(p, x, t), c - 12 * w, c + 12 * w, 2000);
      expect(mean).toBeCloseTo(-2 + groupVelocity(1.6) * t, 9);
    }
  });
  it('spreads by sqrt(2) at t = tau = 2 m s0^2 / hbar', () => {
    const tau = spreadTime(p.sigma0);
    expect(tau).toBeCloseTo((p.sigma0 ** 2 * HBAR_EV_FS) / HBAR2_OVER_2M_EV_A2, 12);
    expect(packetWidth(p, tau)).toBeCloseTo(Math.SQRT2 * p.sigma0, 12);
    // the second moment from the density agrees
    const t = 0.9;
    const c = packetCentre(p, t);
    const w = packetWidth(p, t);
    const v = simpson((x) => (x - c) ** 2 * packetDensity(p, x, t), c - 12 * w, c + 12 * w, 2000);
    expect(Math.sqrt(v)).toBeCloseTo(w, 9);
  });
  it('the probability of a window matches the integral of the density', () => {
    const t = 0.4;
    const a = -1;
    const b = 0.5;
    expect(probabilityBetween(p, t, a, b)).toBeCloseTo(
      simpson((x) => packetDensity(p, x, t), a, b, 1000),
      9,
    );
    expect(probabilityBetween(p, t, -1e3, 1e3)).toBeCloseTo(1, 12);
  });
});
