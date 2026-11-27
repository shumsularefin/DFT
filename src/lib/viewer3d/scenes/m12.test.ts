// Physics of the module 12 scenes against the tested libraries, closed forms and golden files.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { invert6 } from '../../mechanics/elastic';
import { opticalPoint } from '../../optics/derived';
import { HBAR2_OVER_2M_EV_A2 } from '../../physics/constants';
import { directionalYoung } from '../../physics/elasticdir';
import { lorentzEps } from '../../physics/lorentz';
import { diatomicOmega, zoneBoundaryGap } from '../../physics/phononchain';
import { alongDirection, matVec, symmetricEigen3 } from '../../physics/tensor3';
import { withDefaults, type CurveLayer, type MeshLayer } from '../types';
import {
  baderModel,
  dielectricTensor,
  effectiveMass,
  elasticState,
  energyAboveHull,
  eosData,
  eosFitFor,
  eosPressure,
  opticsEps,
  OPTICS_MODEL,
  scenes,
  slabPotential,
} from './m12';

const build = (id: string, over: Record<string, number | string | boolean> = {}) => {
  const def = scenes[id]!;
  return def.build(withDefaults(def, over));
};
const readout = (f: ReturnType<typeof build>, label: string) =>
  f.readouts!.find((r) => r.label === label)!.value;

describe('m12-phonon-chain', () => {
  it('reads out the closed-form frequency and gap', () => {
    const f = build('m12-phonon-chain', { q: 0.5, ratio: 3, branch: 'optical' });
    expect(readout(f, 'Frequency')).toBe(`${diatomicOmega(Math.PI / 2, 1, 3)[1].toFixed(3)} sqrt(K/m1)`);
    const [lo, hi] = zoneBoundaryGap(1, 3);
    expect(readout(f, 'Gap at pi/a')).toBe(`${lo.toFixed(3)} to ${hi.toFixed(3)}`);
  });

  it('the branch curves lie on the analytic dispersion at the chosen mass ratio', () => {
    const f = build('m12-phonon-chain', { ratio: 2.5 });
    const [ac, op] = f.layers.filter((l): l is CurveLayer => l.kind === 'curve' && l.group === 'branches');
    for (const [c, b] of [
      [ac!, 0],
      [op!, 1],
    ] as const)
      for (const pt of c.points) {
        const q = (pt[0] * Math.PI) / 8;
        expect(pt[2]).toBeCloseTo(2.5 * diatomicOmega(q, 1, 2.5)[b], 10);
        expect(pt[1]).toBeCloseTo(3, 12);
      }
  });

  it('a rigid translation at Gamma, and the surfaces close the gap at equal masses', () => {
    const f = build('m12-phonon-chain', { q: 0, branch: 'acoustic' });
    expect(f.describe).toMatch(/rigid translation/);
    const g = build('m12-phonon-chain', { ratio: 1, q: 1 });
    expect(readout(g, 'Gap at pi/a')).toBe(`${Math.SQRT2.toFixed(3)} to ${Math.SQRT2.toFixed(3)}`);
  });
});

describe('m12-elastic-strain', () => {
  it('energy density is C11 e1^2 / 2 for a stretch of a cubic crystal, in meV per cubic Angstrom', () => {
    const s = elasticState('cubic', 'e1', 2);
    expect(s.uMeV).toBeCloseTo(((168.4 * 0.02 ** 2) / 2 / 160.21766) * 1000, 6);
    expect(s.sigma[0]).toBeCloseTo(168.4 * 0.02, 10);
    expect(s.sigma[1]).toBeCloseTo(121.4 * 0.02, 10);
  });

  it('flags the C12 > C11 tensor as unstable and its energy surface as a saddle', () => {
    expect(elasticState('unstable', 'e1', 1).stab.stable).toBe(false);
    expect(elasticState('cubic', 'e1', 1).stab.stable).toBe(true);
    const f = build('m12-elastic-strain', { tensor: 'unstable' });
    const mesh = f.layers.find((l): l is MeshLayer => l.kind === 'mesh' && l.group === 'energy')!;
    expect(Math.min(...mesh.values!)).toBeLessThan(0);
    expect(f.describe).toMatch(/saddle/);
  });

  it('the Young surface reaches 1/S33 along z for the hexagonal tensor', () => {
    const f = build('m12-elastic-strain', { tensor: 'hexagonal', show: 'young' });
    const mesh = f.layers.find((l): l is MeshLayer => l.kind === 'mesh' && l.group === 'young')!;
    const s = invert6(elasticState('hexagonal', 'e1', 0).c)!;
    expect(mesh.values![0]).toBeCloseTo(1 / s[2]![2]!, 9);
    expect(mesh.values![0]).toBeCloseTo(directionalYoung(s, [0, 0, 1]), 9);
  });
});

describe('m12-eos', () => {
  const ref = JSON.parse(readFileSync('tests/reference/eos_reference.json', 'utf8')) as {
    cases: {
      name: string;
      volumes: number[];
      energies: number[];
      pymatgen: { v0: number; b0_GPa: number; b1: number };
    }[];
  };
  const find = (name: string) => ref.cases.find((c) => c.name === name)!;

  it('uses the golden set A points and reproduces the pymatgen fits', () => {
    for (const [set, name] of [
      ['clean7', 'set_a_birch_murnaghan_clean'],
      ['wide11', 'set_a_birch_murnaghan_clean_wide'],
      ['noisy11', 'set_a_birch_murnaghan_noisy'],
    ] as const) {
      const c = find(name);
      eosData(set).forEach((d, i) => {
        expect(d.volume).toBeCloseTo(c.volumes[i]!, 10);
        expect(d.energy).toBeCloseTo(c.energies[i]!, 10);
      });
      const f = eosFitFor(set, 'birch_murnaghan');
      expect(f.params.v0).toBeCloseTo(c.pymatgen.v0, 3);
      expect(Math.abs(f.b0GPa - c.pymatgen.b0_GPa) / c.pymatgen.b0_GPa).toBeLessThan(1e-3);
    }
    const m = find('set_a_murnaghan_noisy');
    expect(m.volumes.length).toBe(11);
  });

  it('pressure is zero at V0, positive when compressed; the cell edge is (4 V)^(1/3)', () => {
    const f = eosFitFor('clean7', 'birch_murnaghan');
    expect(Math.abs(eosPressure(f, f.params.v0))).toBeLessThan(1e-8);
    expect(eosPressure(f, 0.95 * f.params.v0)).toBeGreaterThan(0);
    // dP/dV at V0 = -B0 / V0
    const h = 1e-4 * f.params.v0;
    const dp = (eosPressure(f, f.params.v0 + h) - eosPressure(f, f.params.v0 - h)) / (2 * h);
    expect(dp * f.params.v0).toBeCloseTo(-f.params.b0, 5);
    const frame = build('m12-eos', { volume: 0.95 });
    expect(readout(frame, 'Volume')).toContain(`a = ${Math.cbrt(4 * 0.95 * f.params.v0).toFixed(3)}`);
  });

  it('the marker sits at the bottom of the enthalpy valley for its own pressure', () => {
    const f = eosFitFor('clean7', 'birch_murnaghan');
    const v = 0.93 * f.params.v0;
    const pv = eosPressure(f, v);
    // E(V') + P(V) V' is smallest at V' = V
    const h = [0.9, 0.92, 0.93, 0.94, 0.96].map((r) => energyAt(f, r * f.params.v0) + pv * r * f.params.v0);
    expect(Math.min(...h)).toBe(h[2]);
  });
});

function energyAt(f: ReturnType<typeof eosFitFor>, v: number) {
  const x = (f.params.v0 / v) ** (2 / 3);
  const p = f.params;
  return p.e0 + ((9 * p.v0 * p.b0) / 16) * ((x - 1) ** 3 * p.b1 + (x - 1) ** 2 * (6 - 4 * x));
}

describe('m12-dielectric', () => {
  it('recovers the preset principal values at any tilt and keeps the trace', () => {
    for (const tilt of [0, 25, 60]) {
      const { eps } = dielectricTensor('monoclinic', tilt);
      const { values } = symmetricEigen3(eps);
      expect(values[0]).toBeCloseTo(4.5, 12);
      expect(values[2]).toBeCloseTo(8.5, 12);
      expect(eps[0][0] + eps[1][1] + eps[2][2]).toBeCloseTo(19, 12);
    }
  });

  it('D is parallel to E along a principal axis and on the ellipsoid in general', () => {
    const f = build('m12-dielectric', { symmetry: 'uniaxial', theta: 0 });
    expect(readout(f, 'Angle between D and E')).toBe('0.0 degree');
    expect(readout(f, 'eps along E')).toBe('8.000');
    const { eps } = dielectricTensor('biaxial', 0);
    const n = [0.48, 0.6, 0.64];
    const d = matVec(eps, n);
    // D / eps lies on the unit sphere: the ellipsoid is the image of the unit sphere under eps
    const back = d.map((x, i) => x / [4.5, 6, 8.5][i]!);
    expect(Math.hypot(...back)).toBeCloseTo(1, 12);
    expect(alongDirection(eps, n)).toBeCloseTo(0.48 ** 2 * 4.5 + 0.6 ** 2 * 6 + 0.64 ** 2 * 8.5, 12);
  });
});

describe('m12-optics', () => {
  it('the field along x and along z gives the xx and zz oscillators', () => {
    const x = lorentzEps(3.1, OPTICS_MODEL.xx, OPTICS_MODEL.epsInf);
    const z = lorentzEps(3.1, OPTICS_MODEL.zz, OPTICS_MODEL.epsInf);
    expect(opticsEps(3.1, 0.3, 0)[1]).toBeCloseTo(x[1], 12);
    expect(opticsEps(3.1, 0.3, 90)[1]).toBeCloseTo(z[1], 12);
    expect(opticsEps(3.1, 0.3, 45)[0]).toBeCloseTo((x[0] + z[0]) / 2, 12);
  });

  it('reads out alpha and R from the tested optics formulas', () => {
    const f = build('m12-optics', { energy: 4.4, angle: 90 });
    const [e1, e2] = opticsEps(4.4, 0.3, 90);
    const op = opticalPoint(4.4, e1, e2);
    expect(readout(f, 'Reflectivity')).toBe(op.reflectivity.toFixed(3));
    expect(readout(f, 'Absorption alpha')).toBe(`${(op.alphaPerCm / 1e5).toFixed(2)} x 10^5 /cm`);
  });
});

describe('m12-bader', () => {
  it('two identical atoms split evenly and the grid holds all 8 electrons', () => {
    const m = baderModel('same', 2.6, 0);
    expect(Math.abs(m.qa - m.qb)).toBeLessThan(1e-6);
    expect(m.total).toBeCloseTo(8, 3);
  });

  it('moving electrons from A to B raises the charge in the basin of B by about as much', () => {
    const m0 = baderModel('polar', 2.6, 0);
    const m1 = baderModel('polar', 2.6, 0.4);
    expect(m1.qb - m0.qb).toBeGreaterThan(0.3);
    expect(m1.qb - m0.qb).toBeLessThan(0.45);
    expect(m1.qa + m1.qb).toBeCloseTo(m1.total, 10);
  });
});

describe('m12-property-hub', () => {
  it('energy above the hull: ABC over the AB-BC-AC facet by -120 + 470/3 meV/atom, zero once below it', () => {
    expect(energyAboveHull([1 / 3, 1 / 3, 1 / 3], -120).eHull).toBeCloseTo(-120 + 470 / 3, 9);
    expect(energyAboveHull([1 / 3, 1 / 3, 1 / 3], -200).eHull).toBe(0);
    expect(energyAboveHull([1 / 3, 1 / 3, 1 / 3], -120).into.sort()).toEqual(['AB', 'AC', 'BC']);
  });

  it('the work function read in the vacuum converges to the model value as the vacuum grows', () => {
    const phi = (vac: number) => slabPotential(4 * 2 + vac / 2, vac) + 4.6;
    expect(Math.abs(phi(20) - 4.6)).toBeLessThan(0.01);
    expect(4.6 - phi(4)).toBeGreaterThan(0.5);
    expect(phi(10)).toBeGreaterThan(phi(6));
  });

  it('effective mass from the curvature: hbar^2 / (2 m_e t a^2)', () => {
    expect(effectiveMass(1)).toBeCloseTo(HBAR2_OVER_2M_EV_A2 / 9, 12);
    const f = build('m12-property-hub', { family: 'effective-mass', hopping: 2 });
    expect(readout(f, 'm* at Gamma')).toBe(`${(HBAR2_OVER_2M_EV_A2 / 18).toFixed(3)} m_e`);
  });
});
