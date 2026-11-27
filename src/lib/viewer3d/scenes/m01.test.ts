// Numbers behind the module 1 scenes: the cost ladder from physics/scaling.ts, the reciprocal cell and k-mesh of the
// roadmap, and the antiferromagnetic order of the probes scene.
import { describe, expect, it } from 'vitest';
import { log10RelativeCost } from '../../physics/scaling';
import { fmt } from '../kit';
import {
  withDefaults,
  type ArrowsLayer,
  type AtomsLayer,
  type Params,
  type SceneFrame,
  type Vec3,
} from '../types';
import { afmSign, scenes } from './m01';

const build = (id: string, over: Params = {}): SceneFrame =>
  scenes[id]!.build(withDefaults(scenes[id]!, over));
const read = (f: SceneFrame, label: string) => f.readouts!.find((r) => r.label === label)!.value;

describe('m01-ladder: cost over size and method', () => {
  it('places each marker at the log10 relative cost of physics/scaling.ts', () => {
    const f = build('m01-ladder', { size: 1 });
    const m = f.layers.find((l): l is AtomsLayer => l.kind === 'atoms' && l.group === 'markers')!;
    const formal = ['dft', 'hf', 'mp2', 'ccsd', 'ccsdt'] as const;
    expect(m.positions.length).toBe(5);
    m.positions.forEach((p, i) => expect(p[2]).toBeCloseTo(0.5 * log10RelativeCost(formal[i]!, 10), 12));
    // ten times the size: DFT 10^3, CCSD(T) 10^7
    expect(read(f, 'DFT cost')).toBe('10^3.0 x');
    expect(read(f, 'CCSD(T) cost')).toBe('10^7.0 x');
  });
  it('a method is affordable exactly when its cost is under the budget plane', () => {
    const f = build('m01-ladder', { size: 1, budget: 4.5 });
    // only methods with a formal exponent get a verdict; the qualitative curves carry no marker
    expect(read(f, 'Affordable')).toBe('DFT, HF');
    expect(read(build('m01-ladder', { size: 2, budget: 5 }), 'Affordable')).toBe('none');
    expect(read(build('m01-ladder', { size: 2, budget: 6 }), 'Affordable')).toBe('DFT');
    expect(read(build('m01-ladder', { size: 0, budget: 1 }), 'Affordable')).toBe(
      'DFT, HF, MP2, CCSD, CCSD(T)',
    );
  });
});

describe('m01-roadmap: stations of a first project', () => {
  it('the zone width is 2 pi / a and shrinks as the cell grows', () => {
    for (const a of [3.8, 3.905, 4.05]) {
      const f = build('m01-roadmap', { a, station: 3 });
      expect(read(f, 'Zone width 2 pi / a')).toBe(`${fmt((2 * Math.PI) / a, 3)} 1/A`);
    }
  });
  it('the SCF station holds an n x n x n mesh with spacing |b| / n (KSPACING, S-019)', () => {
    const f = build('m01-roadmap', { station: 2, kmesh: 5, a: 4 });
    const k = f.layers.find((l) => l.kind === 'points' && l.group === 'station-2')!;
    if (k.kind !== 'points') throw new Error('points');
    expect(k.positions.length).toBe(125);
    expect(read(f, 'k spacing')).toBe(`${fmt((2 * Math.PI) / 4 / 5, 3)} 1/A (5 divisions)`);
  });
  it('stations ahead of the current one are dashed', () => {
    const f = build('m01-roadmap', { station: 2 });
    const cell = (i: number) => f.layers.filter((l) => l.group === `station-${i}` && l.kind === 'lines');
    expect(cell(1).every((l) => l.kind === 'lines' && !l.dashed)).toBe(true);
    expect(cell(4).filter((l) => l.kind === 'lines' && !l.dashed).length).toBe(0);
  });
});

describe('m01-probes: one crystal, several questions', () => {
  it('the NiO-type order has zero net moment over the magnetic cell (2 x 2 x 2 conventional cells)', () => {
    const a = 5.64;
    const fcc: Vec3[] = [
      [0, 0, 0],
      [0.5, 0.5, 0],
      [0.5, 0, 0.5],
      [0, 0.5, 0.5],
    ];
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++)
        for (let k = 0; k < 2; k++)
          for (const f of fcc) {
            sum += afmSign([(f[0] + i) * a, (f[1] + j) * a, (f[2] + k) * a], a);
            n++;
          }
    expect(n).toBe(32);
    expect(sum).toBe(0);
    // nearest cation neighbours: 6 of the 12 are antiparallel, as in NiO
    const anti = [
      [0.5, 0.5, 0],
      [-0.5, -0.5, 0],
      [0.5, -0.5, 0],
      [-0.5, 0.5, 0],
      [0.5, 0, 0.5],
      [-0.5, 0, -0.5],
      [0.5, 0, -0.5],
      [-0.5, 0, 0.5],
      [0, 0.5, 0.5],
      [0, -0.5, -0.5],
      [0, 0.5, -0.5],
      [0, -0.5, 0.5],
    ].filter((d) => afmSign([d[0]! * a, d[1]! * a, d[2]! * a], a) < 0).length;
    expect(anti).toBe(6);
  });
  it('the drawn spins balance too, up with solid heads and down with open heads', () => {
    const f = build('m01-probes', { probe: 'magnetism' });
    const s = f.layers.find((l): l is ArrowsLayer => l.kind === 'arrows' && l.group === 'probe')!;
    const up = s.vectors.filter((v) => v[2] > 0).length;
    expect(up * 2).toBe(s.vectors.length);
    s.vectors.forEach((v, i) => expect((s.head as string[])[i]).toBe(v[2] > 0 ? 'solid' : 'open'));
  });
  it('the pushed atom moves by the slider and the force points back', () => {
    const f = build('m01-probes', { probe: 'forces', shift: 0.5 });
    const ar = f.layers.find((l): l is ArrowsLayer => l.kind === 'arrows' && l.group === 'probe')!;
    expect(ar.from[0]![0]).toBeCloseTo(5.64 / 2 + 0.5, 9);
    expect(ar.vectors[0]![0]).toBeLessThan(0);
  });
});

describe('m01-scales: three scales', () => {
  it('a 3 x 3 x 3 block drawn with its far faces holds 7^3 ions', () => {
    expect(read(build('m01-scales', { scale: 'block' }), 'Ions shown')).toBe('343');
    expect(read(build('m01-scales', { scale: 'cell' }), 'Ions shown')).toBe('27');
  });
});
