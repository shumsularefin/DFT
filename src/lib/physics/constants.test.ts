import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOHR_RADIUS_ANGSTROM, HBAR2_OVER_2M_EV_A2, PLANCK_EV_S, RYDBERG_ENERGY_EV } from './constants';

const golden = JSON.parse(readFileSync('tests/reference/quantum_basics_reference.json', 'utf8'));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('constants (S-031)', () => {
  it('hbar^2/2m is 3.80998 eV A^2 to 1e-4 relative (the value VASP uses)', () => {
    expect(rel(HBAR2_OVER_2M_EV_A2, 3.80998)).toBeLessThan(1e-4);
  });
  it('agree with scipy.constants (CODATA 2022) far inside the tolerance, since 2018 and 2022 differ by < 1e-8', () => {
    const g = golden.constants;
    expect(rel(HBAR2_OVER_2M_EV_A2, g.hbar2_over_2m_eV_A2)).toBeLessThan(1e-7);
    expect(rel(BOHR_RADIUS_ANGSTROM, g.bohr_radius_A)).toBeLessThan(1e-7);
    expect(rel(RYDBERG_ENERGY_EV, g.rydberg_energy_eV)).toBeLessThan(1e-7);
    expect(rel(PLANCK_EV_S, g.h_eV_s)).toBeLessThan(1e-12);
  });
  it('Rydberg energy is 13.6057 eV to 1e-4 eV', () => {
    expect(Math.abs(RYDBERG_ENERGY_EV - 13.6057)).toBeLessThan(1e-4);
  });
  it('are consistent with each other: Ry = hbar^2 / (2 m a0^2) in the infinite-nucleus-mass limit', () => {
    const ry = HBAR2_OVER_2M_EV_A2 / BOHR_RADIUS_ANGSTROM ** 2;
    expect(rel(ry, RYDBERG_ENERGY_EV)).toBeLessThan(1e-7);
  });
});

describe('de Broglie wavelength from the energy scale (S-047, S-031)', () => {
  it('a 100 eV electron has a wavelength of 1.2264 angstrom', () => {
    // lambda = 2 pi / k, k = sqrt(E / (hbar^2/2m)); 1.2264 is the standard 12.264/sqrt(E) angstrom value
    const lambda = (2 * Math.PI) / Math.sqrt(100 / HBAR2_OVER_2M_EV_A2);
    expect(lambda).toBeCloseTo(1.2264, 3);
  });
});
