import { describe, expect, it } from 'vitest';
import { solveStoner, stonerDosCurves, stonerEnergy } from './stoner';

describe('Stoner toy model (S-059)', () => {
  it('stays non-magnetic when I * N < 1 and at the threshold I * N = 1', () => {
    const below = solveStoner({ dosPerSpin: 1.0, stonerI: 0.8 });
    expect(below.productIN).toBeCloseTo(0.8, 12);
    expect(below.isMagnetic).toBe(false);
    expect(below.equilibriumMoment).toBe(0);
    expect(below.energyGainEv).toBe(0);

    const atThreshold = solveStoner({ dosPerSpin: 1.25, stonerI: 0.8 });
    expect(atThreshold.productIN).toBeCloseTo(1.0, 12);
    expect(atThreshold.isMagnetic).toBe(false);
    expect(atThreshold.equilibriumMoment).toBe(0);
    expect(stonerEnergy({ dosPerSpin: 1.25, stonerI: 0.8 }, 0.5)).toBeGreaterThan(0);
  });

  it('develops a lower-energy spin-split solution strictly when I * N > 1', () => {
    const justAbove = solveStoner({ dosPerSpin: 1.0, stonerI: 1.05 });
    expect(justAbove.productIN).toBeCloseTo(1.05, 12);
    expect(justAbove.isMagnetic).toBe(true);
    expect(justAbove.equilibriumMoment).toBeGreaterThan(0);
    expect(justAbove.energyGainEv).toBeLessThan(0);
    expect(justAbove.splittingEv).toBeCloseTo(1.05 * justAbove.equilibriumMoment, 12);

    const strong = solveStoner({ dosPerSpin: 1.5, stonerI: 1.0 });
    expect(strong.productIN).toBeCloseTo(1.5, 12);
    expect(strong.isMagnetic).toBe(true);
    expect(strong.equilibriumMoment).toBeGreaterThan(justAbove.equilibriumMoment);
    expect(strong.energyGainEv).toBeLessThan(justAbove.energyGainEv);
    // Equilibrium is a true energy minimum compared to nearby moments
    const eStar = stonerEnergy({ dosPerSpin: 1.5, stonerI: 1.0 }, strong.equilibriumMoment);
    expect(eStar).toBeCloseTo(strong.energyGainEv, 12);
    expect(eStar).toBeLessThan(
      stonerEnergy({ dosPerSpin: 1.5, stonerI: 1.0 }, strong.equilibriumMoment + 0.1),
    );
    expect(eStar).toBeLessThan(
      stonerEnergy({ dosPerSpin: 1.5, stonerI: 1.0 }, Math.max(0, strong.equilibriumMoment - 0.1)),
    );
  });

  it('produces symmetric DOS when non-magnetic and shifted DOS when magnetic', () => {
    const nm = stonerDosCurves({ dosPerSpin: 1.0, stonerI: 0.6 });
    expect(nm.every((p) => Math.abs(p.up + p.down) < 1e-12)).toBe(true);

    const fm = stonerDosCurves({ dosPerSpin: 1.4, stonerI: 1.0 });
    const diff = fm.some((p) => Math.abs(p.up + p.down) > 0.5);
    expect(diff).toBe(true);
  });
});
