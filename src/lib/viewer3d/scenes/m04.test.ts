// Physics of the module 4 scenes against the libraries, the golden SCF file and exact rules.
import { describe, expect, it } from 'vitest';
import golden from '../../../../tests/reference/scf1d_reference.json';
import { runScf } from '../../physics/scf1d';
import { withDefaults, type Params } from '../types';
import { densityCoordinates, helperSystem, landscapeState, scenes, scf } from './m04';
import { kohnSham, model } from './toy1d';

const build = (id: string, p: Params = {}) => {
  const d = scenes[id]!;
  return d.build(withDefaults(d, p));
};
const readout = (f: ReturnType<typeof build>, label: string) =>
  f.readouts!.find((r) => r.label === label)!.value;

describe('m04-hohenberg-kohn (one electron in a 2D landscape, S-011)', () => {
  it('a constant shifts the energy by exactly that constant and leaves the density as it was', () => {
    const a = landscapeState(2, 1, 0);
    const b = landscapeState(2, 1, 0.8);
    expect(Math.abs(b.E - a.E - 0.8)).toBeLessThan(1e-8);
    let worst = 0;
    for (let k = 0; k < a.n.length; k++) worst = Math.max(worst, Math.abs(a.n[k]! - b.n[k]!));
    expect(worst).toBeLessThan(1e-8);
    expect(
      parseFloat(readout(build('m04-hohenberg-kohn', { shift: 0.8 }), 'Density change from the constant')),
    ).toBeLessThan(1e-8);
  });
  it('the potential read back from the density matches the landscape (1e-5 hartree where n is not tiny)', () => {
    const f = build('m04-hohenberg-kohn', { invert: true });
    expect(parseFloat(readout(f, 'Read-back error'))).toBeLessThan(1e-5);
    expect(f.layers.some((l) => l.group === 'recovered')).toBe(true);
  });
  it('a different landscape gives a different density: a deeper second well pulls the electron over', () => {
    const share = (depth: number) =>
      parseFloat(readout(build('m04-hohenberg-kohn', { depth }), 'Share near well 2'));
    expect(share(1.5)).toBeLessThan(share(2));
    expect(share(2)).toBeLessThan(share(2.5));
    expect(share(2.5)).toBeGreaterThan(80);
  });
  it('the density holds one electron', () => {
    const { n } = landscapeState(2, 1, 0);
    let s = 0;
    for (const v of n) s += v * (12 / 48) ** 2;
    expect(Math.abs(s - 1)).toBeLessThan(1e-12);
  });
});

describe('m04-kohn-sham (exact Kohn-Sham inversion, S-012, S-145)', () => {
  for (const Z of [1, 2])
    it(`Z = ${Z}: at t = 1 the helper density equals the interacting one and its orbital energy is -I`, () => {
      const s = model(Z, 1);
      const hs = helperSystem(Z, 1);
      let mis = 0;
      for (let i = 0; i < s.M; i++) mis += Math.abs(hs.n[i]! - s.density[i]!) * s.h;
      expect(mis).toBeLessThan(1e-6);
      expect(Math.abs(hs.eps + kohnSham(Z).ionisation)).toBeLessThan(1e-8);
      // at t = 0 the helper electrons only see v_ext and the density is visibly wrong
      expect(
        parseFloat(readout(build('m04-kohn-sham', { Z: String(Z), t: 0 }), 'Density mismatch')),
      ).toBeGreaterThan(0.1);
    });
  it('the two wavefunctions differ although the densities agree (overlap below 100 %)', () => {
    expect(
      parseFloat(readout(build('m04-kohn-sham', { Z: '1', t: 1 }), 'Wavefunction overlap')),
    ).toBeLessThan(99);
  });
});

describe('m04-xc-hole (sum rules, S-049)', () => {
  it('the xc and the exchange hole hold -1 electron, the correlation hole 0', () => {
    for (const ref of [-2, 0, 1.5])
      for (const Z of ['1', '2']) {
        const sum = (hole: string) =>
          parseFloat(readout(build('m04-xc-hole', { Z, hole, ref }), 'Hole integral (sum rule)'));
        expect(sum('xc')).toBeCloseTo(-1, 3);
        expect(sum('x')).toBeCloseTo(-1, 3);
        expect(Math.abs(sum('c'))).toBeLessThan(1e-3);
      }
  });
  it('the exchange hole of two electrons in one orbital removes half the density at the electron; correlation digs deeper', () => {
    expect(readout(build('m04-xc-hole', { hole: 'x' }), 'Removed at the electron')).toBe('50 %');
    expect(
      parseFloat(readout(build('m04-xc-hole', { hole: 'xc' }), 'Removed at the electron')),
    ).toBeGreaterThan(50);
  });
});

describe('m04-scf-loop and m04-scf-path (scf1d, golden scf1d_reference.json)', () => {
  for (const g of golden.cases)
    it(`Z = ${g.Z}: the scene loop converges in the golden ${g.iterations} iterations at alpha ${g.mixing_alpha}`, () => {
      const r = scf(g.Z, g.mixing_alpha);
      expect(r.converged).toBe(true);
      expect(r.iterations.length).toBe(g.iterations);
      expect(Math.abs(r.energy - g.E_HF)).toBeLessThan(1e-6);
      const f = build('m04-scf-loop', { Z: String(g.Z), alpha: g.mixing_alpha });
      expect(readout(f, 'Outcome')).toBe(`converged in ${g.iterations} steps`);
    });
  it('alpha = 1: Z = 2 converges in 14 steps, Z = 1 ends in a two-state oscillation (as scf1d.test records)', () => {
    expect(readout(build('m04-scf-loop', { Z: '2', alpha: 1 }), 'Outcome')).toBe('converged in 14 steps');
    expect(readout(build('m04-scf-path', { Z: '1', alpha: 1 }), 'Outcome')).toBe('oscillating');
    const tail = scf(1, 1).iterations.slice(-10);
    expect(tail.every((i) => i.residual > 0.4)).toBe(true);
  });
  it('the step readout is the residual of that iteration of runScf', () => {
    const r = runScf({ Z: 2, alpha: 0.3, maxIterations: 20 });
    const f = build('m04-scf-loop', { Z: '2', alpha: 0.3, step: 12 });
    expect(readout(f, 'Residual |n_out - n_in|')).toBe(r.iterations[11]!.residual.toExponential(2));
  });
  it('the fixed point does not depend on the mixing: converging runs end on the same density coordinates', () => {
    const a = scf(2, 0.3);
    const b = scf(2, 0.9);
    const ca = densityCoordinates(a, a.density);
    const cb = densityCoordinates(b, b.density);
    expect(Math.abs(ca[0] - cb[0])).toBeLessThan(1e-9);
    expect(Math.abs(ca[1] - cb[1])).toBeLessThan(1e-9);
  });
});
