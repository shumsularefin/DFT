import { describe, expect, it } from 'vitest';
import { METAL_EXACT, dispersion, energyPerSite, erf, errorSeries, referenceEnergy } from './tightbinding2d';

describe('erf (textbook values, Abramowitz and Stegun Table 7.1, S-053)', () => {
  it('matches tabulated values to 1e-14', () => {
    expect(erf(0)).toBe(0);
    expect(erf(0.5)).toBeCloseTo(0.5204998778130465, 14);
    expect(erf(1)).toBeCloseTo(0.8427007929497149, 14);
    expect(erf(2)).toBeCloseTo(0.9953222650189527, 14);
    expect(erf(-1)).toBeCloseTo(-0.8427007929497149, 14);
    expect(erf(7)).toBe(1);
  });
});

describe('dispersion', () => {
  it('has bandwidth 8 t, minimum at Gamma and maximum at M', () => {
    expect(dispersion(0, 0)).toBe(-4);
    expect(dispersion(Math.PI, Math.PI)).toBeCloseTo(4, 12);
    expect(dispersion(Math.PI / 2, Math.PI / 2)).toBeCloseTo(0, 12);
  });
});

describe('exact half-filled energy -8 t / pi^2', () => {
  // Derivation: occupied where |kx| + |ky| < pi. The cosine terms give -4 * integral((pi - |k|) cos k dk) = -16 and
  // -4 * integral(sin |k| dk) = -16, total -32 / (4 pi^2) = -8 / pi^2 = -0.810569 (also seen on a 4000 x 4000 midpoint grid: -0.8105694).
  it('constant', () => expect(METAL_EXACT).toBeCloseTo(-0.810569, 6));
  it('a dense mesh agrees', () => expect(energyPerSite(2000, 0, 0)).toBeCloseTo(METAL_EXACT, 6));
  it('Delta = 0 and sigma = 0 reference is the exact number', () =>
    expect(referenceEnergy(0, 0)).toBe(METAL_EXACT));
});

const SIZES = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
describe('metal converges algebraically, insulator exponentially', () => {
  const metal = errorSeries(SIZES, 0, 0);
  const ref4000 = energyPerSite(4000, 1, 0);
  const ins = errorSeries(SIZES, 1, 0, ref4000);
  const ratios = (e: { error: number }[]) => e.slice(1).map((p, i) => p.error / e[i]!.error);
  it('insulator at Delta = 1 t: error at N = 24 below 1e-7, every ratio for N >= 6 below 0.35', () => {
    expect(ins.at(-1)!.error).toBeLessThan(1e-7);
    for (const r of ratios(ins)) expect(r).toBeLessThan(0.35);
  });
  it('metal: error at N = 24 above 1e-3 and the ratios rise with N', () => {
    expect(metal.at(-1)!.error).toBeGreaterThan(1e-3);
    const r = ratios(metal);
    for (let i = 1; i < r.length; i++) expect(r[i]!).toBeGreaterThan(r[i - 1]! - 1e-9);
  });
  it('the metal error is far larger than the insulator error at N = 24', () => {
    expect(metal.at(-1)!.error / ins.at(-1)!.error).toBeGreaterThan(1e4);
  });
});

describe('smearing', () => {
  it('sigma -> 0 recovers the unsmeared value and a wider sigma lowers the metal error at small N', () => {
    expect(energyPerSite(24, 0, 1e-9)).toBeCloseTo(energyPerSite(24, 0, 0), 9);
    const sharp = errorSeries([8], 0, 0)[0]!.error;
    const smooth = errorSeries([8], 0, 0.3, referenceEnergy(0, 0.3, 400))[0]!.error;
    expect(smooth).toBeLessThan(sharp);
  });
  it('rejects bad input', () => {
    expect(() => energyPerSite(0, 0, 0)).toThrow(RangeError);
    expect(() => energyPerSite(4, -1, 0)).toThrow(RangeError);
  });
});
