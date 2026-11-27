import { describe, expect, it } from 'vitest';
import golden from '../../../tests/reference/scf1d_reference.json';
import { runScf } from './scf1d';
import { runRestart } from './scfRestart1d';

const g2 = golden.cases.find((c) => c.Z === 2)!;

describe('runRestart against runScf and the golden file (scf1d_reference.json)', () => {
  const ref = runScf({ Z: 2, alpha: 0.3 });
  const fresh = runRestart({ Z: 2, alpha: 0.3 });

  it('the default start reproduces runScf iteration by iteration (the independent reference)', () => {
    expect(fresh.iterations.length).toBe(ref.iterations.length);
    fresh.iterations.forEach((it, i) => {
      expect(it.residual).toBeCloseTo(ref.iterations[i]!.residual, 12);
      expect(it.totalEnergy).toBeCloseTo(ref.iterations[i]!.totalEnergy, 12);
      expect(it.orbitalEnergy).toBeCloseTo(ref.iterations[i]!.orbitalEnergy, 12);
    });
  });

  it('a fresh start converges to the golden orbital energy within 1e-6 hartree in the golden number of steps', () => {
    expect(fresh.converged).toBe(true);
    expect(fresh.iterations.length).toBe(g2.iterations);
    expect(Math.abs(fresh.orbitalEnergy - g2.orbital_energy)).toBeLessThan(1e-6);
  });

  it('a restart from the converged density (ICHARG = 1, same problem) converges at once', () => {
    const r = runRestart({ Z: 2, start: fresh.density });
    expect(r.converged).toBe(true);
    expect(r.iterations.length).toBeLessThanOrEqual(2);
    expect(Math.abs(r.orbitalEnergy - g2.orbital_energy)).toBeLessThan(1e-6);
  });

  // Observed, not assumed: with linear mixing a density from another problem (Z = 1.5) is no closer than the bare-well
  // start, so it takes as many steps; it still ends at the same answer because the density is iterated.
  it('a restart from a density of another problem still converges to the same answer', () => {
    const other = runRestart({ Z: 1.5 });
    const r = runRestart({ Z: 2, start: other.density });
    expect(r.converged).toBe(true);
    expect(Math.abs(r.orbitalEnergy - g2.orbital_energy)).toBeLessThan(1e-6);
    expect(Math.abs(r.iterations.length - fresh.iterations.length)).toBeLessThanOrEqual(5);
  });

  it('a fixed density (ICHARG = 11) is never updated and gives the SCF eigenvalue only when it is the converged one', () => {
    const same = runRestart({ Z: 2, start: fresh.density, fixed: true });
    expect(same.iterations.length).toBe(1);
    expect(Array.from(same.density)).toEqual(Array.from(fresh.density));
    expect(Math.abs(same.orbitalEnergy - g2.orbital_energy)).toBeLessThan(1e-6);
    const other = runRestart({ Z: 1.5 });
    const wrong = runRestart({ Z: 2, start: other.density, fixed: true });
    expect(Array.from(wrong.density)).toEqual(Array.from(other.density));
    expect(Math.abs(wrong.orbitalEnergy - g2.orbital_energy)).toBeGreaterThan(1e-3);
  });

  it('every density integrates to two electrons', () => {
    let s = 0;
    for (const v of fresh.density) s += v;
    expect(Math.abs(s * fresh.h - 2)).toBeLessThan(1e-10);
  });

  it('rejects a start of the wrong length and a bad mixing value', () => {
    expect(() => runRestart({ start: new Float64Array(3) })).toThrow(RangeError);
    expect(() => runRestart({ alpha: 0 })).toThrow(RangeError);
  });
});
