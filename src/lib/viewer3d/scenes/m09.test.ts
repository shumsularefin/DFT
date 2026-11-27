// Physics of the module 9 scenes: the numbers each frame prints are checked against closed forms or sum rules.
import { describe, expect, it } from 'vitest';
import { HBAR2_OVER_2M_EV_A2 } from '../../physics/constants';
import { overlap1s, ZETA_H2 } from '../../physics/diatomic';
import { fermiLevel, meshEigenvalues, modelById } from '../../physics/tightbinding3d';
import { withDefaults, type Params, type SceneFrame } from '../types';
import { scenes } from './m09';

const frame = (id: string, p: Params = {}): SceneFrame => {
  const def = scenes[id]!;
  return def.build({ ...withDefaults(def), ...p });
};
const readout = (f: SceneFrame, start: string): string => {
  const r = f.readouts.find((x) => x.label.startsWith(start));
  if (!r) throw new Error(`no readout "${start}" in ${f.readouts.map((x) => x.label).join(' | ')}`);
  return r.value;
};
const num = (s: string, i = 0): number => Number((s.match(/-?\d+(\.\d+)?/g) ?? [])[i]);
const HBAR2_OVER_M = 2 * HBAR2_OVER_2M_EV_A2;

describe('m09-bands', () => {
  it('the indirect model has a 1.20 eV gap from Gamma to L', () => {
    const f = frame('m09-bands', { model: 'fcc-indirect', mix: 0 });
    expect(readout(f, 'Gap')).toBe('1.20 eV (indirect)');
    expect(f.describe).toContain('indirect gap of 1.20 eV');
  });
  it('the direct model has a 1.50 eV gap at Gamma', () => {
    expect(readout(frame('m09-bands', { model: 'fcc-direct', mix: 0 }), 'Gap')).toBe('1.50 eV (direct)');
  });
  it('masses follow the closed forms: hole hbar^2 / (2 |t| a^2), electron at L hbar^2 / (2 |t2| a^2)', () => {
    const m = readout(frame('m09-bands', { model: 'fcc-indirect', mix: 0 }), 'Masses');
    const a = 5.43;
    expect(num(m, 0)).toBeCloseTo(HBAR2_OVER_M / (2 * 0.2 * a * a), 2);
    expect(num(m, 1)).toBeCloseTo(HBAR2_OVER_M / (2 * 0.3 * a * a), 2);
  });
  it('the fcc metal band is 16 t wide, starts at -12 t at Gamma (energies from the Fermi level), m* = hbar^2 / (2 t a^2)', () => {
    const f = frame('m09-bands', { model: 'fcc-metal', cursor: 0 });
    expect(readout(f, 'Band width')).toBe('8.00 eV');
    const ef = fermiLevel(meshEigenvalues(modelById('fcc-metal'), 24), 0.5);
    expect(num(readout(f, 'E at the cursor'))).toBeCloseTo(-6 - ef, 2);
    expect(num(readout(f, 'm*/me'))).toBeCloseTo(HBAR2_OVER_M / (2 * 0.5 * 3.61 * 3.61), 2);
  });
  it('mixing the two bands widens the gap', () => {
    const g0 = num(readout(frame('m09-bands', { model: 'fcc-direct', mix: 0 }), 'Gap'));
    const g1 = num(readout(frame('m09-bands', { model: 'fcc-direct', mix: 1 }), 'Gap'));
    // at Gamma the gap becomes sqrt(1.5^2 + 4 V^2)
    expect(g1).toBeCloseTo(Math.sqrt(1.5 ** 2 + 4), 2);
    expect(g1).toBeGreaterThan(g0);
  });
});

describe('m09-dos', () => {
  it('a filled valence band holds two electrons (two spins) below the gap, by tetrahedra and by Gaussians', () => {
    // the trapezoid rule halves the last bin at the band edge E = 0, so a percent is lost at the default NEDOS
    expect(num(readout(frame('m09-dos', { method: 'tetra' }), 'Electrons below'))).toBeCloseTo(2, 1);
    expect(num(readout(frame('m09-dos', { method: 'tetra', nedos: 3001 }), 'Electrons below'))).toBeCloseTo(
      2,
      2,
    );
    expect(
      num(readout(frame('m09-dos', { method: 'gaussian', sigma: 0.05 }), 'Electrons below')),
    ).toBeCloseTo(2, 1);
  });
  it('the half-filled metal holds one electron below the Fermi level', () => {
    expect(
      num(
        readout(
          frame('m09-dos', { model: 'fcc-metal', method: 'tetra', kmesh: 16, nedos: 2001 }),
          'Electrons below',
        ),
      ),
    ).toBeCloseTo(1, 1);
  });
  it('wide Gaussians close part of the gap; tetrahedra keep it', () => {
    const tetra = readout(frame('m09-dos', { method: 'tetra' }), 'Gap');
    const wide = readout(frame('m09-dos', { method: 'gaussian', sigma: 0.5 }), 'Gap');
    expect(num(tetra, 1)).toBeGreaterThan(num(wide, 1));
  });
  it('prints the VASP energy step (EMAX - EMIN) / (NEDOS - 1)', () => {
    const f = frame('m09-dos', { nedos: 51 });
    expect(f.describe).toContain('on 51 energies');
  });
});

describe('m09-density', () => {
  it('the grid holds two electrons and the overlap is the closed form', () => {
    const f = frame('m09-density', { bond: 1.4 });
    expect(num(readout(f, 'Grid mean'))).toBeCloseTo(2, 1);
    expect(num(readout(f, 'Overlap'))).toBeCloseTo(overlap1s(ZETA_H2, 1.4), 3);
  });
  it('the difference density moves a fraction of an electron and switches the isosurface', () => {
    const f = frame('m09-density', { show: 'difference' });
    const moved = num(readout(f, 'Charge moved'));
    expect(moved).toBeGreaterThan(0.05);
    expect(moved).toBeLessThan(0.5);
    expect(f.describe).not.toBe(frame('m09-density', { show: 'total' }).describe);
  });
});

describe('m09-forces', () => {
  it('the perfect crystal at its equilibrium constant has no force and no pressure', () => {
    const f = frame('m09-forces', { disp: 0, strain: 0 });
    expect(num(readout(f, 'Largest force'))).toBeCloseTo(0, 3);
    expect(num(readout(f, 'Pressure'))).toBeCloseTo(0, 1);
  });
  it('forces add to zero and pull the displaced atom back', () => {
    const f = frame('m09-forces', { disp: 0.2 });
    expect(num(readout(f, 'Total drift'))).toBeCloseTo(0, 3);
    expect(num(readout(f, 'Largest force'))).toBeGreaterThan(0.05);
  });
  it('a squeezed cell reports positive pressure, a stretched one negative', () => {
    expect(num(readout(frame('m09-forces', { strain: -2, kind: 'iso' }), 'Pressure'))).toBeGreaterThan(0);
    expect(num(readout(frame('m09-forces', { strain: 2, kind: 'iso' }), 'Pressure'))).toBeLessThan(0);
  });
});

describe('m09-relax', () => {
  it('BFGS meets the force criterion before steepest descent with the same POTIM', () => {
    const bfgs = num(readout(frame('m09-relax', { method: 'bfgs', potim: 0.5 }), 'Criterion met'));
    const sd = readout(frame('m09-relax', { method: 'sd', potim: 0.5 }), 'Criterion met');
    expect(bfgs).toBeGreaterThan(0);
    if (/^\d+$/.test(sd)) expect(bfgs).toBeLessThan(Number(sd));
  });
  it('the energy above the lowest one falls along the run', () => {
    const e0 = num(readout(frame('m09-relax', { step: 0 }), 'E minus lowest'));
    const e20 = num(readout(frame('m09-relax', { step: 20 }), 'E minus lowest'));
    expect(e20).toBeLessThan(e0);
  });
});

describe('m09-cohp', () => {
  it('two electrons: ICOHP = 2 H_AB and bond order 1; four electrons: ICOHP 0 and bond order 0', () => {
    const h2 = frame('m09-cohp', { electrons: '2', hop: 2.5, delta: 0 });
    expect(num(readout(h2, 'ICOHP'))).toBeCloseTo(-5, 2);
    expect(num(readout(h2, 'Bond order'))).toBe(1);
    const he2 = frame('m09-cohp', { electrons: '4', hop: 2.5, delta: 0 });
    expect(Math.abs(num(readout(he2, 'ICOHP')))).toBeLessThan(0.005);
    expect(num(readout(he2, 'Bond order'))).toBe(0);
  });
  it('the levels split by 2 sqrt(H_AB^2 + (delta / 2)^2)', () => {
    const v = readout(frame('m09-cohp', { hop: 2, delta: 3 }), 'Levels');
    expect(num(v, 1) - num(v, 0)).toBeCloseTo(2 * Math.hypot(2, 1.5), 2);
  });
});

describe('m09-wannier', () => {
  it('the centre sits on the strong bond: +1/4 when v > w, -1/4 when w > v', () => {
    expect(num(readout(frame('m09-wannier', { dimer: 0.4, smooth: 1 }), 'Wannier centre'))).toBeCloseTo(
      0.25,
      3,
    );
    expect(num(readout(frame('m09-wannier', { dimer: -0.4, smooth: 1 }), 'Wannier centre'))).toBeCloseTo(
      -0.25,
      3,
    );
  });
  it('a scrambled gauge has a much larger spread', () => {
    const smooth = num(readout(frame('m09-wannier', { smooth: 1 }), 'Spread'));
    const rough = num(readout(frame('m09-wannier', { smooth: 0 }), 'Spread'));
    expect(rough).toBeGreaterThan(10 * smooth);
  });
  it('the gap is 2 |v - w|', () => {
    const v = readout(frame('m09-wannier', { dimer: 0.4 }), 'Hoppings');
    expect(num(v, 2)).toBeCloseTo(2 * Math.abs(num(v, 0) - num(v, 1)), 2);
  });
});
