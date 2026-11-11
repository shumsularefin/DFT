import { describe, expect, it } from 'vitest';
import ref from '../../../tests/reference/scf1d_reference.json';
import { runScf } from './scf1d';

// Golden values: tests/reference/scf1d_reference.json from scripts/reference/gen_scf1d_reference.py.
describe('scf1d against the golden file', () => {
  for (const c of ref.cases) {
    describe(`Z = ${c.Z}`, () => {
      const r = runScf({ Z: c.Z, alpha: c.mixing_alpha });
      it('converges below 1e-10', () => {
        expect(r.converged).toBe(true);
        expect(r.iterations.at(-1)!.residual).toBeLessThan(1e-10);
      });
      it('reproduces E_HF and the orbital energy within 1e-6', () => {
        expect(Math.abs(r.E - c.E_HF)).toBeLessThan(1e-6);
        expect(Math.abs(r.orbitalEnergy - c.orbital_energy)).toBeLessThan(1e-6);
        expect(Math.abs(r.J - c.J)).toBeLessThan(1e-6);
        expect(Math.abs(r.E_noninteracting - c.E_noninteracting)).toBeLessThan(1e-6);
      });
      it('density integrates to 2 within 1e-10', () => {
        expect(Math.abs(r.densityIntegral - 2)).toBeLessThan(1e-10);
      });
      it('takes the same number of iterations as the generator', () => {
        expect(Math.abs(r.iterations.length - c.iterations)).toBeLessThanOrEqual(1);
      });
      it('lies above the exact two-electron energy on the same grid (variational)', () => {
        expect(c.E_exact_two_electron_same_grid).toBeLessThan(r.E);
        expect(c.E_exact_two_electron_same_grid - r.E).toBeCloseTo(c.E_correlation, 6);
      });
    });
  }
});

describe('scf1d behaviour', () => {
  it('without interaction it converges at once to 2 x lowest orbital energy', () => {
    const r = runScf({ Z: 2, alpha: 0.3, interacting: false });
    expect(r.iterations.length).toBe(1);
    expect(Math.abs(r.E - ref.cases[1]!.E_noninteracting)).toBeLessThan(1e-9);
  });
  it('records the observed behaviour for alpha = 1.0', () => {
    for (const Z of [1, 2]) {
      const r = runScf({ Z, alpha: 1.0, maxIterations: 300 });
      // Observed in this session: see the snapshot of behaviour below.
      expect({ Z, behaviour: r.behaviour, n: r.iterations.length }).toMatchSnapshot();
    }
  });
  it('small alpha is slower than alpha = 0.3', () => {
    const slow = runScf({ Z: 2, alpha: 0.05, maxIterations: 2000 });
    const mid = runScf({ Z: 2, alpha: 0.3 });
    expect(slow.converged).toBe(true);
    expect(slow.iterations.length).toBeGreaterThan(mid.iterations.length);
  });
});
