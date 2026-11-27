// The performance scene shows the numbers of the work-split library for each state.
import { describe, expect, it } from 'vitest';
import { splitWork, toySpeedup } from '../../physics/workSplit';
import { withDefaults } from '../types';
import { CORES_PER_NODE, PERF_SYSTEMS, scenes, workInput } from './m07b';

const def = scenes['m07b-parallel']!;

describe('m07b-parallel', () => {
  it('the default state is the worked example of the topic: 3.20 GB of wavefunctions', () => {
    expect(PERF_SYSTEMS.page).toMatchObject({ npw: 20000, nbands: 500, nk: 10, nspin: 2 });
    const f = def.build(withDefaults(def));
    expect(f.describe).toMatch(/3\.20 GB in all/);
  });

  it('draws one block per k-point, band group and NCORE slice', () => {
    const p = { ...withDefaults(def), system: 'bulk', nodes: 2, kpar: '4', ncore: '2' };
    const l = splitWork(workInput(p));
    const f = def.build(p);
    const boxes = f.layers
      .filter((x) => x.group === 'blocks' && x.kind === 'mesh')
      .reduce((a, x) => a + (x as { indices: number[] }).indices.length / 36, 0);
    expect(boxes).toBe(56 * l.npar * 2);
    expect(f.layers.filter((x) => x.group === 'blocks').length).toBe(4);
  });

  it('shows the NBANDS rounding when there are more band groups than bands', () => {
    const p = { ...withDefaults(def), system: 'bulk', nodes: 8, kpar: '1', ncore: '1' };
    expect(workInput(p).ranks).toBe(8 * CORES_PER_NODE);
    const f = def.build(p);
    expect(f.describe).toMatch(/rounded up from 32 to 128/);
    expect(f.layers.some((x) => x.group === 'padding')).toBe(true);
  });

  it('readouts carry the toy speed-up of the library', () => {
    const p = { ...withDefaults(def), nodes: 2, kpar: '2', serial: 0.1 };
    const w = workInput(p);
    const t = toySpeedup(w, splitWork(w), 0.1);
    const f = def.build(p);
    expect(f.readouts!.at(-1)!.value).toBe(`${t.speedup.toFixed(1)} x, ${(t.efficiency * 100).toFixed(0)} %`);
  });

  it('an impossible layout is reported, not drawn', () => {
    const f = def.build({ ...withDefaults(def), nodes: 1, kpar: '8', ncore: '4' });
    expect(f.describe).toMatch(/not valid/);
    expect(f.layers.some((x) => x.group === 'blocks')).toBe(false);
  });
});
