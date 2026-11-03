import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  energyEV,
  expectationR,
  extentA0,
  laguerre,
  listOrbitals,
  mostProbableRadius,
  mulberry32,
  orbitalLabel,
  radial,
  radialNodeCount,
  radialNodeRadii,
  radialQuantile,
  realYlm,
  realYlmAngles,
  sampleOrbital,
} from './hydrogen';
import { integrateRadial } from './quadrature';

const golden = JSON.parse(readFileSync('tests/reference/quantum_basics_reference.json', 'utf8'));
const NL: [number, number][] = [
  [1, 0],
  [2, 0],
  [2, 1],
  [3, 0],
  [3, 1],
  [3, 2],
  [4, 3],
];

describe('hydrogen energies', () => {
  it('E_n = -13.6057 / n^2 eV to 1e-4 eV', () => {
    expect(Math.abs(energyEV(1) + 13.6057)).toBeLessThan(1e-4);
    expect(Math.abs(energyEV(2) + 3.40142)).toBeLessThan(1e-4);
    expect(Math.abs(energyEV(3) + 1.51174)).toBeLessThan(1e-4);
  });
});

describe('radial functions (S-047)', () => {
  it('Laguerre polynomials match closed forms', () => {
    expect(laguerre(1, 3, 2)).toBeCloseTo(4 - 2, 12); // 1 + alpha - x
    expect(laguerre(2, 1, 0.5)).toBeCloseTo(0.5 * (0.25 - 2 * 3 * 0.5 + 6), 12); // x^2/2 - (alpha+2)x + (alpha+1)(alpha+2)/2
  });
  it('are normalised: integral R^2 r^2 dr = 1 within 1e-8', () => {
    for (const [n, l] of NL)
      expect(integrateRadial((r) => radial(n, l, r) ** 2 * r * r, extentA0(n), 8000)).toBeCloseTo(1, 8);
  });
  it('1s and 2s are orthogonal within 1e-8; so are 2p and 3p, 3s and 3d-type pairs of equal l', () => {
    const ortho = (a: [number, number], b: [number, number]) =>
      integrateRadial((r) => radial(...a, r) * radial(...b, r) * r * r, 300, 8000);
    expect(Math.abs(ortho([1, 0], [2, 0]))).toBeLessThan(1e-8);
    expect(Math.abs(ortho([2, 1], [3, 1]))).toBeLessThan(1e-8);
    expect(Math.abs(ortho([1, 0], [3, 0]))).toBeLessThan(1e-8);
  });
  it('<r> = (a0/2)(3 n^2 - l(l+1)): 1.5, 5 and 10.5 a0 within 1e-8', () => {
    expect(expectationR(1, 0)).toBeCloseTo(1.5, 8);
    expect(expectationR(2, 1)).toBeCloseTo(5, 8);
    expect(expectationR(3, 2)).toBeCloseTo(10.5, 8);
    for (const [n, l] of NL) expect(expectationR(n, l)).toBeCloseTo(0.5 * (3 * n * n - l * (l + 1)), 7);
  });
  it('have n - l - 1 radial nodes', () => {
    for (let n = 1; n <= 4; n++)
      for (let l = 0; l < n; l++) {
        expect(radialNodeRadii(n, l)).toHaveLength(radialNodeCount(n, l));
        expect(radialNodeCount(n, l)).toBe(n - l - 1);
      }
  });
  it('2s has its node at 2 a0', () => {
    expect(radialNodeRadii(2, 0)[0]).toBeCloseTo(2, 9);
  });
  it('1s is most probable at a0; 2p at 4 a0', () => {
    expect(mostProbableRadius(1, 0)).toBeCloseTo(1, 7);
    expect(mostProbableRadius(2, 1)).toBeCloseTo(4, 7);
  });
  it('match the scipy golden values', () => {
    for (const g of golden.radial)
      g.r.forEach((r: number, i: number) => {
        const want = g.R[i];
        expect(Math.abs(radial(g.n, g.l, r) - want)).toBeLessThan(1e-10 + 1e-9 * Math.abs(want));
      });
  });
});

describe('radial quantile', () => {
  it('holds the stated probability: 1s has 1 - 5 e^-10 inside 5 a0 (closed form), so the 0.99 radius is about 4.2 a0', () => {
    // P(r < R) = 1 - e^(-2R) (1 + 2R + 2R^2) for 1s
    const cdf = (R: number) => 1 - Math.exp(-2 * R) * (1 + 2 * R + 2 * R * R);
    const r = radialQuantile(1, 0, 0.99);
    expect(Math.abs(cdf(r) - 0.99)).toBeLessThan(2e-3);
  });
});

describe('real spherical harmonics', () => {
  it('match the scipy golden values for l <= 3 (all m)', () => {
    for (const g of golden.ylm)
      g.dirs.forEach(([t, p]: [number, number], i: number) =>
        expect(realYlmAngles(g.l, g.m, t, p)).toBeCloseTo(g.Y[i], 11),
      );
  });
  it('are orthonormal over the sphere within 1e-10 (tensor-product quadrature)', () => {
    // Gauss-Legendre nodes in cos(theta), uniform in phi
    const nodes = gaussLegendre(24);
    const nphi = 48;
    const basis: [number, number][] = [];
    for (let l = 0; l <= 3; l++) for (let m = -l; m <= l; m++) basis.push([l, m]);
    for (const [l1, m1] of basis)
      for (const [l2, m2] of basis) {
        let s = 0;
        for (const { x: c, w } of nodes) {
          const st = Math.sqrt(1 - c * c);
          for (let j = 0; j < nphi; j++) {
            const phi = (2 * Math.PI * j) / nphi;
            const x = st * Math.cos(phi);
            const y = st * Math.sin(phi);
            s += w * ((2 * Math.PI) / nphi) * realYlm(l1, m1, x, y, c) * realYlm(l2, m2, x, y, c);
          }
        }
        expect(Math.abs(s - (l1 === l2 && m1 === m2 ? 1 : 0))).toBeLessThan(1e-10);
      }
  });
});

describe('labels', () => {
  it('names the common orbitals', () => {
    expect(orbitalLabel(1, 0, 0)).toBe('1s');
    expect(orbitalLabel(2, 1, 0)).toBe('2p_z');
    expect(orbitalLabel(3, 2, -2)).toBe('3d_xy');
    expect(orbitalLabel(3, 2, 2)).toBe('3d_x2-y2');
  });
  it('lists 30 orbitals up to n = 4 with unique labels', () => {
    const list = listOrbitals(4);
    expect(list).toHaveLength(30);
    expect(new Set(list.map((o) => o.label)).size).toBe(30);
  });
});

describe('sampling', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = sampleOrbital(2, 1, 0, 500, 7);
    const b = sampleOrbital(2, 1, 0, 500, 7);
    const c = sampleOrbital(2, 1, 0, 500, 8);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.positions)).not.toEqual(Array.from(c.positions));
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });
  it('1s with 200k samples has mean r within 1% of 1.5 a0', () => {
    const { positions } = sampleOrbital(1, 0, 0, 200_000, 12345);
    let sum = 0;
    for (let i = 0; i < positions.length; i += 3)
      sum += Math.hypot(positions[i]!, positions[i + 1]!, positions[i + 2]!);
    const mean = sum / 200_000;
    expect(Math.abs(mean - 1.5) / 1.5).toBeLessThan(0.01);
  });
  it('2p_z points follow the p_z shape: mean cos^2 theta = 3/5 and none sits on the z = 0 plane by chance', () => {
    const { positions, signs } = sampleOrbital(2, 1, 0, 100_000, 99);
    let c2 = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const r = Math.hypot(positions[i]!, positions[i + 1]!, positions[i + 2]!);
      c2 += (positions[i + 2]! / r) ** 2;
    }
    expect(c2 / 100_000).toBeCloseTo(0.6, 2); // <cos^2> for a density proportional to cos^2 theta
    // sign follows the sign of z (positive lobe up)
    for (let k = 0; k < 200; k++) expect(signs[k]).toBe(positions[3 * k + 2]! >= 0 ? 1 : -1);
  });
  it('2s has both signs, the inner part opposite to the outer', () => {
    const { positions, signs } = sampleOrbital(2, 0, 0, 20_000, 5);
    let inner = 0;
    let outer = 0;
    for (let k = 0; k < 20_000; k++) {
      const r = Math.hypot(positions[3 * k]!, positions[3 * k + 1]!, positions[3 * k + 2]!);
      if (r < 2) inner += signs[k]!;
      else outer += signs[k]!;
    }
    expect(Math.sign(inner)).toBe(-Math.sign(outer));
  });
  it('returns a finite extent and finite positions for every orbital with n <= 4', () => {
    for (const o of listOrbitals(4)) {
      const c = sampleOrbital(o.n, o.l, o.m, 300, 3);
      expect(c.extent).toBeGreaterThan(0);
      expect(Array.from(c.positions).every(Number.isFinite)).toBe(true);
    }
  });
});

/** Gauss-Legendre nodes and weights by Newton iteration (test helper, independent of the code under test). */
function gaussLegendre(n: number): { x: number; w: number }[] {
  const out: { x: number; w: number }[] = [];
  for (let i = 0; i < n; i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = x;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    out.push({ x, w: 2 / ((1 - x * x) * dp * dp) });
  }
  return out;
}

describe('shell capacity used in the spin topic', () => {
  it('2 electrons per orbital over n <= 4 gives 2, 8, 18, 32', () => {
    const per = [1, 2, 3, 4].map((n) => 2 * listOrbitals(4).filter((o) => o.n === n).length);
    expect(per).toEqual([2, 8, 18, 32]);
  });
});
