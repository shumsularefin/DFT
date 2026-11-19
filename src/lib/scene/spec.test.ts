import { describe, expect, it } from 'vitest';
import { assertSpec, validateSpec } from './spec';

const ok = {
  id: 'demo',
  badge: 'illustrative',
  alt: 'A cubic cell with one atom',
  structure: {
    lattice: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    species: ['X'],
    frac: [[0, 0, 0]],
  },
};

describe('validateSpec', () => {
  it('accepts a minimal spec', () => expect(validateSpec(ok)).toEqual([]));
  it('requires alt', () => {
    const rest: Record<string, unknown> = { ...ok };
    delete rest.alt;
    expect(validateSpec(rest).map((i) => i.path)).toContain('alt');
  });
  it('rejects a spin count that differs from the site count', () => {
    const issues = validateSpec({ ...ok, spins: [1, -1] });
    expect(issues.some((i) => i.path === 'spins' && /site count/.test(i.message))).toBe(true);
  });
  it('accepts a 3-vector spin and a number spin', () => {
    expect(validateSpec({ ...ok, spins: [[0, 0, 1]] })).toEqual([]);
    expect(validateSpec({ ...ok, spins: [1] })).toEqual([]);
  });
  it('checks the badge, repeat, planes, camera and steps', () => {
    expect(validateSpec({ ...ok, badge: 'real' }).map((i) => i.path)).toContain('badge');
    expect(validateSpec({ ...ok, repeat: [1, 4, 1] }).map((i) => i.path)).toContain('repeat');
    expect(validateSpec({ ...ok, planes: [{ hkl: [0, 0, 0] }] })).not.toEqual([]);
    expect(validateSpec({ ...ok, camera: 'z' }).map((i) => i.path)).toContain('camera');
    expect(validateSpec({ ...ok, steps: [{ text: 'no title' }] })).not.toEqual([]);
    expect(validateSpec({ ...ok, steps: [{ title: 'one', spins: [1, 1] }] })).not.toEqual([]);
  });
  it('accepts a structure reference', () => {
    expect(validateSpec({ ...ok, structure: { ref: 'fcc' } })).toEqual([]);
  });
  it('assertSpec lists the problems', () => {
    expect(() => assertSpec({ ...ok, alt: '' })).toThrow(/alt/);
  });
});
