import { describe, it, expect } from 'vitest';
import { sourceLine, romanCn, ionLabel } from './format';
import { getRadius } from './shannon';
import { encodeState, decodeState, type ToolState } from './urlState';
import { explainT, explainMu, explainTau, FORMULAS } from './explain';

describe('source line', () => {
  it('matches the work order wording', () => {
    const r = getRadius({ el: 'Cu', ox: 3, cn: 6, spin: 'LS', kind: 'ionic' });
    expect(r.ok && sourceLine(r.entry)).toBe(
      'Shannon 1976, Cu3+, CN VI, low spin, ionic radius 0.54 Angstrom',
    );
  });
  it('helpers', () => {
    expect(romanCn(12)).toBe('XII');
    expect(ionLabel('O', -2)).toBe('O2-');
    expect(ionLabel('Cl', -1)).toBe('Cl-');
    expect(ionLabel('Na', 1)).toBe('Na+');
  });
});

describe('URL fragment', () => {
  const s: ToolState = {
    composition: {
      A: [
        { el: 'Sr', ox: 2, cn: 12, fraction: 0.5 },
        { el: 'Ba', ox: 2, cn: 12, fraction: 0.5 },
      ],
      B: [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS', fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
    },
    policy: 9,
  };
  it('round-trips', () => {
    expect(decodeState('#' + encodeState(s))).toEqual(s);
  });
  it('rejects malformed fragments', () => {
    for (const bad of [
      '',
      '#',
      '#A=x',
      '#A=Sr:2:12:::1&B=Ti:4:6:::1',
      '#A=Xx:2:12:::1&B=Ti:4:6:::1&X=O:-2:6:::1',
      '#A=Sr:2:12:::1&B=Ti:4:6:::1&X=O:-2:6:::1&p=7',
      '#A=Sr:2:12:::2&B=Ti:4:6:::1&X=O:-2:6:::1',
      '#A=Sr:2:12:XX::1&B=Ti:4:6:::1&X=O:-2:6:::1',
    ]) {
      expect(decodeState(bad), bad).toBeNull();
    }
  });
  it('defaults the policy to 12', () => {
    expect(decodeState('#A=Sr:2:12:::1&B=Ti:4:6:::1&X=O:-2:6:::1')?.policy).toBe(12);
  });
});

describe('explanations', () => {
  it('state the value and call themselves rules of thumb at every level', () => {
    for (const level of ['beginner', 'intermediate', 'pro'] as const) {
      expect(explainT(1.0016, level)).toMatch(/1\.00/);
      expect(explainT(1.0016, level).toLowerCase()).toMatch(/rule of thumb|heuristic|rules of thumb/);
      expect(explainMu(0.43, level).toLowerCase()).toMatch(/rule of thumb|heuristic|radius-ratio/);
      expect(explainTau(3.8, true, level)).toContain('4.18');
    }
    expect(explainT(0.7, 'beginner')).toContain('below');
    expect(explainT(1.1, 'beginner')).toContain('hexagonal');
    expect(explainMu(0.3, 'beginner')).toContain('outside');
    expect(explainTau(5, false, 'beginner')).toContain('non-perovskite');
  });
  it('contain no em dash', () => {
    const all = [
      explainT(1, 'pro'),
      explainMu(0.5, 'pro'),
      explainTau(3, true, 'pro'),
      ...Object.values(FORMULAS),
    ].join('');
    expect(all).not.toContain(String.fromCharCode(0x2014));
  });
});
