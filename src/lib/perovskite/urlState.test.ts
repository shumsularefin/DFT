import { describe, expect, it } from 'vitest';
import {
  decodeCompositionHash,
  defaultOccupant,
  encodeCompositionHash,
  hasLanthanide,
  resolveLnCn,
} from './urlState';
import { evaluatePerovskite } from './checks';

describe('perovskite URL state and Ln policy helpers', () => {
  it('round-trips a mixed-site composition through URL hash', () => {
    const state = {
      A: [
        { el: 'Sr', ox: 2, cn: 12, fraction: 0.5 },
        { el: 'Ba', ox: 2, cn: 12, fraction: 0.5 },
      ],
      B: [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
      kind: 'ionic' as const,
      lnPolicy: 'cn12' as const,
    };
    const hash = encodeCompositionHash(state);
    expect(decodeCompositionHash(hash)).toEqual(state);
  });

  it('resolves NdCuO3 CN 9 policy to match golden t = 0.9342', () => {
    expect(hasLanthanide([{ el: 'Nd', ox: 3, cn: 12, fraction: 1 }])).toBe(true);
    const cn9 = resolveLnCn('Nd', 3, 'cn9');
    expect(cn9).toBe(9);
    const res = evaluatePerovskite({
      A: [{ el: 'Nd', ox: 3, cn: cn9, fraction: 1 }],
      B: [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS', fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
    });
    expect(res.ok).toBe(true);
    expect(res.factors!.t).toBeCloseTo(0.9342, 4);
  });

  it('picks sensible defaults for Sr, Ti, and O', () => {
    const a = defaultOccupant('Sr', 'A');
    const b = defaultOccupant('Ti', 'B');
    const x = defaultOccupant('O', 'X');
    const res = evaluatePerovskite({ A: [a], B: [b], X: [x] });
    expect(res.ok).toBe(true);
    expect(res.factors!.t).toBeCloseTo(1.0016, 4);
  });
});
