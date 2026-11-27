// Physics of the module 2 scenes, checked against the tested libraries they are built from.
import { describe, expect, it } from 'vitest';
import { box3dEnergyEV, box3dPeakDensity, box3dPsi, boxEnergyEV, boxPairPsi } from '../../physics/box';
import { chainLevels, harrisonHopping } from '../../physics/chain1d';
import {
  deBroglie,
  groupVelocity,
  kFromEnergy,
  packetPsi,
  probabilityBetween,
} from '../../physics/wavepacket';
import { fmt } from '../kit';
import {
  withDefaults,
  type ArrowsLayer,
  type Layer,
  type MeshLayer,
  type Params,
  type SceneFrame,
} from '../types';
import { scenes } from './m02';

const build = (id: string, over: Params = {}): SceneFrame =>
  scenes[id]!.build(withDefaults(scenes[id]!, over));
const read = (f: SceneFrame, label: string) => f.readouts!.find((r) => r.label === label)!.value;
const inGroup = (f: SceneFrame, g: string): Layer[] => f.layers.filter((l) => l.group === g);
const meshes = (f: SceneFrame, g: string) => inGroup(f, g).filter((l): l is MeshLayer => l.kind === 'mesh');

describe('m02-box: the 3D particle in a box', () => {
  it('reports the energy of box3dEnergyEV and the textbook degeneracies', () => {
    const f = build('m02-box', { nx: 1, ny: 1, nz: 2, lz: 5 });
    expect(read(f, 'Energy')).toBe(`${fmt(box3dEnergyEV([1, 1, 2], [5, 5, 5]), 2)} eV`);
    expect(read(f, 'Energy')).toBe(`${fmt(6 * boxEnergyEV(1, 5), 2)} eV`);
    expect(read(f, 'Degeneracy')).toBe('3');
    // stretching z lowers (1, 1, 2) below its partners, which stay a pair
    expect(read(build('m02-box', { nx: 1, ny: 1, nz: 2, lz: 6 }), 'Degeneracy')).toBe('1');
    expect(read(build('m02-box', { nx: 2, ny: 1, nz: 1, lz: 6 }), 'Degeneracy')).toBe('2');
    expect(read(f, 'Ground state')).toBe(`${fmt(3 * boxEnergyEV(1, 5), 2)} eV`);
  });
  it('the surface lies where |psi|^2 = level x peak and is coloured by the sign of psi', () => {
    const L: [number, number, number] = [5, 5, 7];
    const level = 0.3;
    const f = build('m02-box', { nx: 2, ny: 1, nz: 3, lz: 7, level });
    const [m] = meshes(f, 'density');
    expect(m!.positions.length).toBeGreaterThan(300);
    const target = level * box3dPeakDensity(L);
    let dev = 0;
    const nv = m!.positions.length / 3;
    for (let i = 0; i < nv; i++) {
      const [x, y, z] = [m!.positions[3 * i]!, m!.positions[3 * i + 1]!, m!.positions[3 * i + 2]!];
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(z).toBeLessThanOrEqual(7 + 1e-9);
      const psi = box3dPsi([2, 1, 3], L, x, y, z);
      dev += Math.abs(psi * psi - target) / target;
      expect(m!.values![i]).toBe(Math.sign(psi));
    }
    expect(dev / nv).toBeLessThan(0.08); // linear interpolation on a 23 to 32 point grid
    // 2 x 1 x 3 lobes, of both signs
    expect(new Set(m!.values).size).toBe(2);
  });
  it('the ladder shows the chosen level at its energy', () => {
    const f = build('m02-box', { nx: 3, ny: 3, nz: 3 });
    expect(f.describe).toContain(`${fmt(27 * boxEnergyEV(1, 5), 2)} eV`);
    expect(read(f, 'Nodal planes')).toBe('6');
  });
});

describe('m02-packet: a free wave packet', () => {
  it('reports the de Broglie wavelength and the group velocity of the library', () => {
    const f = build('m02-packet', { energy: 25 });
    const k = kFromEnergy(25);
    expect(read(f, 'Wavelength')).toBe(`${fmt(deBroglie(k), 2)} A`);
    expect(read(f, 'Speed')).toBe(`${fmt(groupVelocity(k), 1)} A/fs`);
  });
  it('the density at the chosen time peaks under the classical particle', () => {
    const f = build('m02-packet', { energy: 10, width: 1.5, time: 0.5 });
    const now = inGroup(f, 'now')[0]!;
    const ball = inGroup(f, 'particle')[0]!;
    if (now.kind !== 'curve' || ball.kind !== 'atoms') throw new Error('layers');
    const top = now.points.reduce((a, b) => (b[2] > a[2] ? b : a));
    const step = now.points[1]![0] - now.points[0]![0];
    expect(Math.abs(top[0] - ball.positions[0]![0])).toBeLessThanOrEqual(step);
  });
  it('the packet spreads: the density at t = 1 fs is lower than at t = 0', () => {
    const f0 = build('m02-packet', { time: 0 });
    const f1 = build('m02-packet', { time: 0.99 });
    const peak = (f: SceneFrame) =>
      Math.max(...(inGroup(f, 'now')[0] as { points: number[][] }).points.map((p) => p[2]!));
    expect(peak(f1)).toBeLessThan(0.6 * peak(f0));
  });
});

describe('m02-helix: the wavefunction as a helix', () => {
  it('the helix is (x, Re psi, Im psi) of the library packet', () => {
    const f = build('m02-helix', { k: 1.5, width: 1.2 });
    const h = inGroup(f, 'psi')[0]!;
    if (h.kind !== 'curve') throw new Error('curve');
    const amp = (2 * Math.PI * 1.2 * 1.2) ** -0.25;
    const A = 2.5 / amp;
    for (const q of [h.points[100]!, h.points[150]!, h.points[170]!]) {
      const [re, im] = packetPsi({ k0: 1.5, sigma0: 1.2 }, q[0] / 0.6, 0);
      expect(q[1]).toBeCloseTo(A * re, 9);
      expect(q[2]).toBeCloseTo(A * im, 9);
    }
  });
  it('turns once per wavelength, the other way for negative k', () => {
    const turn = (k: number) => {
      const h = inGroup(build('m02-helix', { k, width: 3 }), 'psi')[0] as { points: number[][] };
      let total = 0;
      for (let i = 140; i < 160; i++) {
        let d =
          Math.atan2(h.points[i + 1]![2]!, h.points[i + 1]![1]!) -
          Math.atan2(h.points[i]![2]!, h.points[i]![1]!);
        d = ((d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        total += d;
      }
      const dx = (h.points[160]![0]! - h.points[140]![0]!) / 0.6;
      return total / dx;
    };
    expect(turn(2)).toBeCloseTo(2, 2); // d(phase)/dx = k at the centre of a packet at t = 0
    expect(turn(-2)).toBeCloseTo(-2, 2);
  });
  it('the probe reads the probability of the library', () => {
    const f = build('m02-helix', { k: 2, width: 1.5, probe: -1.3 });
    const pr = probabilityBetween({ k0: 2, sigma0: 1.5 }, 0, -1.8, -0.8);
    expect(read(f, 'P(within 0.5 A)')).toBe(`${fmt(pr * 100, 1)} %`);
  });
});

describe('m02-pauli: exchange symmetry and filling', () => {
  const z = (f: SceneFrame) => {
    const m = meshes(f, 'surface')[0]!;
    return m.positions.filter((_, i) => i % 3 === 2);
  };
  it('swapping the electrons flips the sign of the antisymmetric surface and leaves the symmetric one', () => {
    const a0 = z(build('m02-pauli', { kind: 'antisymmetric', swap: false }));
    const a1 = z(build('m02-pauli', { kind: 'antisymmetric', swap: true }));
    a0.forEach((v, i) => expect(a1[i]).toBeCloseTo(-v, 12));
    const s0 = z(build('m02-pauli', { kind: 'symmetric', swap: false }));
    const s1 = z(build('m02-pauli', { kind: 'symmetric', swap: true }));
    s0.forEach((v, i) => expect(s1[i]).toBeCloseTo(v, 12));
  });
  it('the antisymmetric surface follows boxPairPsi, is zero on the diagonal and vanishes for a = b', () => {
    const f = build('m02-pauli', { pair: '1-3' });
    const m = meshes(f, 'surface')[0]!;
    let peak = 0;
    for (let i = 0; i <= 40; i++)
      for (let j = 0; j <= 40; j++)
        peak = Math.max(peak, Math.abs(boxPairPsi(1, 3, 5, (5 * i) / 40, (5 * j) / 40, 'antisymmetric')));
    for (let i = 0; i < m.positions.length; i += 3) {
      const [x1, x2] = [m.positions[i]! / 1.6, m.positions[i + 1]! / 1.6];
      expect(m.positions[i + 2]).toBeCloseTo((2.5 / peak) * boxPairPsi(1, 3, 5, x1, x2, 'antisymmetric'), 9);
      if (Math.abs(x1 - x2) < 1e-12) expect(Math.abs(m.positions[i + 2]!)).toBeLessThan(1e-9);
    }
    expect(z(build('m02-pauli', { pair: '1-1' })).every((v) => v === 0)).toBe(true);
  });
  it('fills two per level with opposite spins, and totals the box energies', () => {
    const f = build('m02-pauli', { electrons: 5 });
    const s = inGroup(f, 'spins')[0] as ArrowsLayer;
    expect(s.from.length).toBe(5);
    const heads = s.head as string[];
    expect(heads.filter((h) => h === 'solid').length).toBe(3);
    expect(heads.filter((h) => h === 'open').length).toBe(2);
    const e = (n: number) => boxEnergyEV(n, 5);
    expect(read(f, 'Total energy')).toBe(`${fmt(2 * e(1) + 2 * e(2) + e(3), 2)} eV`);
    expect(read(f, 'Highest filled level')).toBe('n = 3');
    const off = build('m02-pauli', { electrons: 5, pauli: false });
    expect(read(off, 'Total energy')).toBe(`${fmt(5 * e(1), 2)} eV`);
  });
});

describe('m02-chain: levels to bands', () => {
  it('draws one plate per level at the energies of the chain', () => {
    const d = 2.1;
    const f = build('m02-chain', { atoms: 7, distance: d, delta: 0.3 });
    const t = harrisonHopping(d, 2.5);
    const ref = chainLevels(7, t, 0.3).energies;
    const plates = meshes(f, 'levels').map((m) => m.positions[2]! / 0.9);
    expect(plates.length).toBe(7);
    plates.forEach((e, i) => expect(e).toBeCloseTo(ref[i]!, 9));
    expect(read(f, 'Hopping t')).toBe(`${fmt(t, 2)} t0`);
  });
  it('two equal atoms give bonding and antibonding at -t and +t', () => {
    const f = build('m02-chain', { atoms: 2, distance: 2.5, delta: 0 });
    expect(f.describe).toContain('bonding level at -1.00');
    expect(f.describe).toContain('antibonding level at 1.00');
  });
  it('an alternating chain opens a gap of at least 2 Delta at half filling; closer atoms widen the band', () => {
    const f = build('m02-chain', { atoms: 20, delta: 0.5 });
    expect(Number(read(f, 'Gap above filled levels').split(' ')[0])).toBeGreaterThanOrEqual(1);
    const far = Number(
      read(build('m02-chain', { atoms: 20, distance: 3.5 }), 'Spread of levels').split(' ')[0],
    );
    const near = Number(
      read(build('m02-chain', { atoms: 20, distance: 1.8 }), 'Spread of levels').split(' ')[0],
    );
    expect(near).toBeGreaterThan(3 * far);
  });
});

describe('m02-orbital: clip plane', () => {
  it('cuts away y < 0 and shows psi on the cut plane', () => {
    const f = build('m02-orbital', { orbital: '2p_z', clip: true });
    for (const m of meshes(f, 'lobes'))
      for (let i = 1; i < m.positions.length; i += 3) expect(m.positions[i]).toBeGreaterThanOrEqual(-1e-9);
    const cut = meshes(f, 'cut')[0]!;
    expect(cut.colormap).toBe('diverging');
    expect(Math.min(...cut.values!)).toBeLessThan(0);
    expect(Math.max(...cut.values!)).toBeGreaterThan(0);
    expect(meshes(build('m02-orbital', { orbital: '2p_z' }), 'cut').length).toBe(0);
  });
});
