import { describe, expect, it } from 'vitest';
import { baderPartition, cropToLevel, exponentialAtom, gaussianAtom } from './badergrid';

type V3 = [number, number, number];

function sample(f: (x: number, y: number, z: number) => number, lo: V3, hi: V3, grid: V3) {
  const h = [0, 1, 2].map((k) => (hi[k]! - lo[k]!) / (grid[k]! - 1)) as V3;
  const values = new Float64Array(grid[0] * grid[1] * grid[2]);
  for (let k = 0; k < grid[2]; k++)
    for (let j = 0; j < grid[1]; j++)
      for (let i = 0; i < grid[0]; i++)
        values[i + grid[0] * (j + grid[1] * k)] = f(lo[0] + i * h[0], lo[1] + j * h[1], lo[2] + k * h[2]);
  return { values, h };
}

describe('exponential atom density', () => {
  it('integrates to N (radial quadrature of 4 pi r^2 rho)', () => {
    const rho = exponentialAtom(3, 2.2, [0, 0, 0]);
    let s = 0;
    const dr = 1e-4;
    for (let r = dr / 2; r < 30; r += dr) s += 4 * Math.PI * r * r * rho(r, 0, 0) * dr;
    expect(s).toBeCloseTo(3, 6);
  });
});

describe('Gaussian atom density and the crop helper', () => {
  it('a Gaussian atom summed on a grid of spacing below its width gives N within 1e-6', () => {
    const rho = gaussianAtom(7, 3, [0.03, -0.02, 0.01]);
    const g: V3 = [41, 41, 41];
    const { values, h } = sample(rho, [-3, -3, -3], [3, 3, 3], g);
    const s = values.reduce((a, b) => a + b, 0) * h[0] * h[1] * h[2];
    expect(Math.abs(s - 7)).toBeLessThan(1e-6);
  });

  it('cropping keeps every point next to the level and nothing far from it', () => {
    const rho = gaussianAtom(1, 2, [0, 0, 0]);
    const g: V3 = [31, 31, 31];
    const { values } = sample(rho, [-3, -3, -3], [3, 3, 3], g);
    const c = cropToLevel(values, g, 0.1)!;
    // the sphere rho = 0.1 has radius sqrt(ln(10 (2/pi)^1.5) / 2) = 0.87, about 4.4 grid steps of 0.2
    expect(c.grid[0]).toBeGreaterThanOrEqual(9);
    expect(c.grid[0]).toBeLessThanOrEqual(13);
    expect(c.values[0 + c.grid[0] * (0 + c.grid[1] * 0)]).toBe(
      values[c.offset[0] + 31 * (c.offset[1] + 31 * c.offset[2])],
    );
    expect(cropToLevel(values, g, 10)).toBeNull();
  });
});

describe('on-grid Bader partition (S-029)', () => {
  it('one atom: one basin holding every grid electron, close to N', () => {
    const rho = exponentialAtom(2, 2, [0.05, 0.02, -0.03]);
    const g: V3 = [40, 40, 40];
    const { values, h } = sample(rho, [-6, -6, -6], [6, 6, 6], g);
    const r = baderPartition(values, g, h);
    expect(r.maxima.length).toBe(1);
    expect(r.charges[0]).toBeCloseTo(r.total, 12);
    expect(Math.abs(r.total - 2) / 2).toBeLessThan(0.03);
  });

  it('two identical atoms: two basins of equal charge, the split on the mid plane', () => {
    const a = exponentialAtom(4, 2, [-1.2, 0, 0]);
    const b = exponentialAtom(4, 2, [1.2, 0, 0]);
    const g: V3 = [48, 36, 36];
    const lo: V3 = [-5, -4, -4];
    const { values, h } = sample((x, y, z) => a(x, y, z) + b(x, y, z), lo, [5, 4, 4], g);
    const r = baderPartition(values, g, h);
    expect(r.maxima.length).toBe(2);
    expect(r.charges[0]! + r.charges[1]!).toBeCloseTo(r.total, 10);
    expect(Math.abs(r.charges[0]! - r.charges[1]!) / r.total).toBeLessThan(1e-9);
    // every point left of the mid plane sits in the basin of the left atom
    const left = r.basin[r.maxima[0]!]!;
    for (let i = 0; i < g[0] / 2; i++) expect(r.basin[i + g[0] * (18 + g[1] * 18)]).toBe(left);
  });

  it('unequal atoms: the boundary on the bond axis sits at the density minimum found by bisection', () => {
    const a = exponentialAtom(1, 1.4, [-1.3, 0, 0]);
    const b = exponentialAtom(7, 2.6, [1.3, 0, 0]);
    const rho = (x: number, y: number, z: number) => a(x, y, z) + b(x, y, z);
    // independent: d rho / dx = 0 on the axis between the nuclei, by bisection
    const d = (x: number) => rho(x + 1e-7, 0, 0) - rho(x - 1e-7, 0, 0);
    let lo = -1.2;
    let hi = 1.2;
    for (let i = 0; i < 80; i++) {
      const m = (lo + hi) / 2;
      if (d(m) < 0) lo = m;
      else hi = m;
    }
    const xmin = (lo + hi) / 2;
    const g: V3 = [61, 41, 41];
    const box0: V3 = [-6, -4, -4];
    const { values, h } = sample(rho, box0, [6, 4, 4], g);
    const r = baderPartition(values, g, h);
    expect(r.maxima.length).toBe(2);
    const axis = (i: number) => r.basin[i + g[0] * (20 + g[1] * 20)]!;
    const first = axis(0);
    let cut = 0;
    while (cut < g[0] && axis(cut) === first) cut++;
    const xb = box0[0] + (cut - 0.5) * h[0];
    expect(Math.abs(xb - xmin)).toBeLessThanOrEqual(h[0]);
    // the compact, many-electron atom keeps most of the charge
    const right = r.basin[r.maxima.find((m) => m % g[0] > g[0] / 2)!]!;
    expect(r.charges[right]! / r.total).toBeGreaterThan(0.8);
  });
});
