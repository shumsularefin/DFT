// Geometry behind the tour scene: rock salt, nearest neighbours at a/2 (S-036).
import { describe, expect, it } from 'vitest';
import { fmt } from '../kit';
import { withDefaults, type AtomsLayer, type Params, type SceneFrame } from '../types';
import { scenes } from './m00';

const build = (over: Params = {}): SceneFrame =>
  scenes['m00-tour']!.build(withDefaults(scenes['m00-tour']!, over));
const read = (f: SceneFrame, label: string) => f.readouts!.find((r) => r.label === label)!.value;

describe('m00-tour', () => {
  it('scales the cell with a: nearest neighbours at a/2 and volume a^3', () => {
    for (const a of [5, 5.64, 6.2]) {
      const f = build({ a });
      expect(read(f, 'Na to Cl')).toBe(`${fmt(a / 2, 2)} A`);
      expect(f.lattice![0][0]).toBeCloseTo(a, 12);
      const at = f.layers.find((l): l is AtomsLayer => l.kind === 'atoms')!;
      const far = Math.max(...at.positions.map((p) => p[0]));
      expect(far).toBeCloseTo(a, 9);
    }
  });
  it('repeats the cell: (2r + 1)^3 ions with the far faces', () => {
    for (const r of [1, 2, 3])
      expect(read(build({ repeat: r }), 'Atoms drawn')).toBe(String((2 * r + 1) ** 3));
  });
  it('picking the centre Cl outlines it and its six Na neighbours', () => {
    const f = build({ pick: true });
    const at = f.layers.find((l): l is AtomsLayer => l.kind === 'atoms')!;
    expect(at.highlight!.length).toBe(7);
    const lab = at.labels!;
    expect(lab[at.highlight![0]!]!.startsWith('Cl')).toBe(true);
    expect(at.highlight!.slice(1).every((i) => lab[i]!.startsWith('Na'))).toBe(true);
  });
});
