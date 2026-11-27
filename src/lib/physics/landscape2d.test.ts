import { describe, expect, it } from 'vitest';
import { LANDSCAPES, VALLEY_K, lineMinimum, relax, valleyAxes } from './landscape2d';

const valley = LANDSCAPES.valley;
const well = LANDSCAPES['double-well'];

describe('landscapes (closed forms)', () => {
  it('the gradient matches central finite differences on both landscapes', () => {
    for (const l of [valley, well])
      for (const [x, y] of [
        [0.3, -0.7],
        [-1.2, 0.4],
        [0.9, 1.3],
      ] as const) {
        const h = 1e-5;
        const gx = (l.energy(x + h, y) - l.energy(x - h, y)) / (2 * h);
        const gy = (l.energy(x, y + h) - l.energy(x, y - h)) / (2 * h);
        const [ax, ay] = l.gradient(x, y);
        expect(ax).toBeCloseTo(gx, 6);
        expect(ay).toBeCloseTo(gy, 6);
      }
  });
  it('every listed stationary point has zero gradient and the stated energy', () => {
    for (const l of [valley, well])
      for (const s of l.stationary) {
        const [gx, gy] = l.gradient(s.x, s.y);
        expect(Math.hypot(gx, gy)).toBeLessThan(1e-12);
        expect(l.energy(s.x, s.y)).toBeCloseTo(s.energy, 12);
      }
  });
  it('the double-well saddle is a maximum along x and a minimum along y', () => {
    expect(well.energy(0.05, 0)).toBeLessThan(1);
    expect(well.energy(0, 0.05)).toBeGreaterThan(1);
  });
});

describe('steepest descent with a fixed step (closed form on the quadratic valley)', () => {
  it('each valley axis shrinks by (1 - h k) per step', () => {
    const h = 0.12;
    const r = relax(valley, { method: 'sd', step: h, steps: 15 });
    const [u0, v0] = valleyAxes(...valley.start);
    r.path.forEach((s, n) => {
      const [u, v] = valleyAxes(s.x, s.y);
      expect(u).toBeCloseTo(u0 * (1 - h * VALLEY_K[0]) ** n, 10);
      expect(v).toBeCloseTo(v0 * (1 - h * VALLEY_K[1]) ** n, 10);
    });
  });
  it('is stable only for h < 2 / k_max: zig-zags below, runs away above', () => {
    const crit = 2 / VALLEY_K[1];
    const ok = relax(valley, { method: 'sd', step: 0.95 * crit, steps: 400 });
    expect(ok.diverged).toBe(false);
    expect(ok.convergedAt).toBeGreaterThan(0);
    const bad = relax(valley, { method: 'sd', step: 1.1 * crit, steps: 400 });
    expect(bad.diverged).toBe(true);
  });
});

describe('damped dynamics (heavy ball) against its characteristic roots', () => {
  it('follows x_n = A r1^n + B r2^n on a 1D quadratic (the stiff valley axis)', () => {
    // start on the stiff axis only (u = 0): the motion stays on v, x_{n+1} = x_n + (1-mu)(x_n - x_{n-1}) - h k x_n
    const k = VALLEY_K[1];
    const [h, mu] = [0.05, 0.4];
    const v0 = 0.8;
    const start: [number, number] = [-Math.sin(Math.PI / 6) * v0, Math.cos(Math.PI / 6) * v0];
    const r = relax(valley, { method: 'damped', step: h, damping: mu, steps: 12, start });
    // roots of r^2 - (2 - mu - h k) r + (1 - mu) = 0, with x_0 = v0 and x_1 = v0 (1 - h k)
    const b = 2 - mu - h * k;
    const disc = b * b - 4 * (1 - mu);
    const vs = r.path.map((s) => valleyAxes(s.x, s.y)[1]);
    if (disc < 0) {
      const mod = Math.sqrt(1 - mu);
      const th = Math.acos(b / (2 * mod));
      const x1 = v0 * (1 - h * k);
      // x_n = mod^n (C cos(n th) + D sin(n th))
      const C = v0;
      const D = (x1 / mod - C * Math.cos(th)) / Math.sin(th);
      vs.forEach((v, n) =>
        expect(v).toBeCloseTo(mod ** n * (C * Math.cos(n * th) + D * Math.sin(n * th)), 10),
      );
    } else {
      throw new Error('test parameters should give complex roots');
    }
  });
});

describe('conjugate gradient', () => {
  it('reaches the minimum of the quadratic valley in two steps, for any trial step', () => {
    for (const h of [0.02, 0.1, 0.3]) {
      const r = relax(valley, { method: 'cg', step: h, steps: 2 });
      const end = r.path[2]!;
      expect(Math.hypot(end.x, end.y)).toBeLessThan(1e-9);
      expect(r.convergedAt).toBe(2);
    }
  });
  it('the line search lands on the exact minimum of a parabola in one secant step', () => {
    const g = (a: number) => 3 * (a - 0.7); // E = 1.5 (a - 0.7)^2
    const ls = lineMinimum(g, 0.1);
    expect(ls.alpha).toBeCloseTo(0.7, 12);
    expect(ls.bracketed).toBe(true);
  });
  it('relaxes the curved double well into a minimum from a rattled start', () => {
    const r = relax(well, { method: 'cg', step: 0.1, steps: 30, start: [0.04, 1.5] });
    expect(r.convergedAt).toBeGreaterThan(0);
    const s = r.path[r.convergedAt]!;
    expect(s.energy).toBeLessThan(1e-4);
    expect(Math.abs(Math.abs(s.x) - 1)).toBeLessThan(0.02);
  });
});

describe('symmetry traps every optimiser on the saddle', () => {
  it('a start on x = 0 stays on x = 0 and settles on the saddle (zero force, E = 1)', () => {
    for (const method of ['sd', 'cg', 'damped'] as const) {
      const r = relax(well, { method, step: 0.05, steps: 120 });
      for (const s of r.path) expect(s.x).toBe(0);
      const last = r.path.at(-1)!;
      expect(last.energy).toBeCloseTo(1, 3);
      expect(last.force).toBeLessThan(0.01);
    }
  });
});
