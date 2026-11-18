import { describe, expect, it } from 'vitest';
import golden from '../../../tests/reference/scf1d_reference.json';
import { classify, runScf } from './scf1d';

describe('scf1d against the golden file (scf1d_reference.json)', () => {
  for (const g of golden.cases) {
    describe(`Z = ${g.Z}`, () => {
      const r = runScf({ Z: g.Z, alpha: g.mixing_alpha });
      it('E_HF, orbital energy and J within 1e-6 hartree', () => {
        expect(r.converged).toBe(true);
        expect(Math.abs(r.energy - g.E_HF)).toBeLessThan(1e-6);
        expect(Math.abs(r.orbitalEnergy - g.orbital_energy)).toBeLessThan(1e-6);
        expect(Math.abs(r.J - g.J)).toBeLessThan(1e-6);
        expect(Math.abs(r.nonInteractingEnergy - g.E_noninteracting)).toBeLessThan(1e-6);
      });
      it('density integrates to 2 within 1e-10 and is a fixed point (residual below 1e-10)', () => {
        expect(Math.abs(r.densityIntegral - 2)).toBeLessThan(1e-10);
        expect(r.iterations[r.iterations.length - 1]!.residual).toBeLessThan(1e-10);
      });
      it('iteration count matches the generator (same mixing, same start)', () => {
        expect(r.iterations.length).toBe(g.iterations);
      });
      it('variational check: the exact two-electron energy on the same grid lies below E_HF', () => {
        expect(g.E_exact_two_electron_same_grid).toBeLessThan(r.energy);
        expect(g.E_exact_two_electron_same_grid - r.energy).toBeCloseTo(g.E_correlation, 6);
      });
      it('the last iteration energy equals the final energy', () => {
        expect(r.iterations[r.iterations.length - 1]!.totalEnergy).toBeCloseTo(r.energy, 9);
      });
    });
  }

  it('non-interacting toggle: one step, energy is twice the lowest h0 eigenvalue (golden E_noninteracting)', () => {
    const g = golden.cases.find((c) => c.Z === 2)!;
    const r = runScf({ Z: 2, nonInteracting: true });
    expect(r.converged).toBe(true);
    expect(r.iterations.length).toBe(1);
    expect(Math.abs(r.energy - g.E_noninteracting)).toBeLessThan(1e-9);
  });

  // Observed behaviour (recorded, not guessed; see docs/reports/M7.1.md): with linear mixing every alpha from 0.1 to
  // 0.9 converges for Z = 1 and 2; alpha = 0.05 is still converging after 400 steps; alpha = 1.0 converges for Z = 2
  // in 14 steps but for Z = 1 settles into a two-state oscillation (residual stays near 0.445).
  it('mixing: alpha = 0.3 converges; alpha = 1.0 oscillates for Z = 1 and converges for Z = 2', () => {
    expect(runScf({ Z: 1, alpha: 0.3 }).behaviour).toBe('converged');
    const bad = runScf({ Z: 1, alpha: 1, maxIterations: 400 });
    expect(bad.converged).toBe(false);
    expect(bad.behaviour).toBe('oscillating');
    const tail = bad.iterations.slice(-10);
    expect(tail.every((i) => i.turn < 0)).toBe(true);
    expect(Math.max(...tail.map((i) => i.residual)) - Math.min(...tail.map((i) => i.residual))).toBeLessThan(
      1e-3,
    );
    const z2 = runScf({ Z: 2, alpha: 1, maxIterations: 400 });
    expect(z2.behaviour).toBe('converged');
    expect(z2.iterations.length).toBe(14);
  });
  it('the iteration counts quoted in the-scf-loop topic: fastest alpha is 0.9 for Z = 2 and 0.7 for Z = 1', () => {
    const alphas = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (const [Z, best] of [
      [2, 0.9],
      [1, 0.7],
    ] as const) {
      const counts = alphas.map((a) => {
        const r = runScf({ Z, alpha: a, maxIterations: 400 });
        return r.converged ? r.iterations.length : Infinity;
      });
      expect(alphas[counts.indexOf(Math.min(...counts))]).toBe(best);
    }
  });
  it('too little mixing is slow: alpha = 0.05 has not converged after 400 steps but the residual keeps falling', () => {
    const r = runScf({ Z: 2, alpha: 0.05, maxIterations: 400 });
    expect(r.converged).toBe(false);
    expect(r.behaviour).toBe('slow');
    expect(r.iterations[399]!.residual).toBeLessThan(r.iterations[0]!.residual * 1e-6);
  });

  it('rejects a mixing parameter outside (0, 1]', () => {
    expect(() => runScf({ alpha: 0 })).toThrow(RangeError);
    expect(() => runScf({ alpha: 1.5 })).toThrow(RangeError);
  });

  it('classify on short synthetic histories', () => {
    const it0 = {
      iteration: 1,
      densityIn: new Float64Array(),
      densityOut: new Float64Array(),
      potential: new Float64Array(),
      hartree: new Float64Array(),
      orbitalEnergy: 0,
      totalEnergy: 0,
      turn: 0,
    };
    expect(classify([{ ...it0, residual: 1e-13 }], 1e-12)).toBe('converged');
    expect(
      classify(
        [
          { ...it0, residual: 1 },
          { ...it0, residual: 20 },
        ],
        1e-12,
      ),
    ).toBe('diverging');
  });
});
