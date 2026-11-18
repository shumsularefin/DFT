import { describe, expect, it } from 'vitest';
import kp from '../../tests/reference/kpaths.json';
import { gentleRelax, mergeDuplicates, setLattice, supercellOp, wrap } from './crystal/ops';
import { symbolOf } from './crystal/elements';
import type { Mat3, Structure, Vec3 } from './crystal/types';
import {
  canRedo,
  canUndo,
  createHistory,
  push,
  redo,
  redoLabel,
  undo,
  undoLabel,
  type History,
} from './history';

const i = (
  kp.structures as unknown as Record<
    string,
    { input: { lattice_rows: Mat3; frac_coords: Vec3[]; atomic_numbers: number[] } }
  >
).rocksalt_NaCl!.input;
const NaCl: Structure = {
  lattice: i.lattice_rows,
  species: i.atomic_numbers.map((z) => symbolOf(z)!),
  frac: i.frac_coords,
};

describe('history', () => {
  it('5 operations undone and redone return identical states', () => {
    const ops: ((s: Structure) => { structure: Structure; description: string })[] = [
      (s) => wrap({ ...s, frac: s.frac.map((f) => [f[0] + 1, f[1], f[2]] as Vec3) }),
      (s) =>
        supercellOp(s, [
          [2, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ]),
      (s) => mergeDuplicates({ ...s, species: [...s.species, 'Na'], frac: [...s.frac, [0.001, 0, 0]] }),
      (s) =>
        setLattice(
          s,
          [
            [11.4, 0, 0],
            [0, 5.7, 0],
            [0, 0, 5.7],
          ],
          'fractional',
        ),
      (s) =>
        gentleRelax({
          ...s,
          frac: s.frac.map((f, k) => (k === 1 ? ([f[0] + 0.01, f[1], f[2]] as Vec3) : f)),
        }),
    ];
    let h: History<Structure> = createHistory(NaCl);
    const states: Structure[] = [NaCl];
    for (const op of ops) {
      const r = op(h.present.state);
      h = push(h, r.structure, r.description);
      states.push(r.structure);
    }
    const snapshot = JSON.stringify(states);
    for (let k = 5; k > 0; k--) {
      expect(h.present.state).toBe(states[k]);
      h = undo(h);
    }
    expect(h.present.state).toBe(NaCl);
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    for (let k = 1; k <= 5; k++) {
      h = redo(h);
      expect(h.present.state).toBe(states[k]);
    }
    expect(canRedo(h)).toBe(false);
    expect(redo(h)).toBe(h);
    expect(JSON.stringify(states)).toBe(snapshot); // nothing was mutated
  });
  it('labels, discarding redo on a new push, and the cap', () => {
    let h = createHistory(0, 3);
    h = push(h, 1, 'one');
    h = push(h, 2, 'two');
    expect(undoLabel(h)).toBe('two');
    h = undo(h);
    expect(redoLabel(h)).toBe('two');
    h = push(h, 5, 'five');
    expect(canRedo(h)).toBe(false);
    for (let k = 0; k < 5; k++) h = push(h, 10 + k, `n${k}`);
    expect(h.past).toHaveLength(3);
    expect(h.past.map((e) => e.state)).toEqual([11, 12, 13]);
    expect(() => createHistory(0, 0)).toThrow(RangeError);
  });
});
