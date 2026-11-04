import { describe, expect, it } from 'vitest';
import variants from '../../../data/kpath/hpkot/variants.json';
import { evalExpr } from './expr';

describe('evalExpr', () => {
  it('handles numbers, precedence and left-to-right division', () => {
    expect(evalExpr('1/2', {})).toBe(0.5);
    expect(evalExpr('-1/2', {})).toBe(-0.5);
    expect(evalExpr('2+3*4', {})).toBe(14);
    expect(evalExpr('8/2/2', {})).toBe(2);
    expect(evalExpr('(1+3)/4', {})).toBe(1);
    expect(evalExpr('1-x', { x: 0.25 })).toBe(0.75);
    expect(evalExpr('-1+x', { x: 0.25 })).toBe(-0.75);
    expect(evalExpr('1/2+D', { D: 0.125 })).toBe(0.625);
  });
  it('evaluates a real table expression', () => {
    // mC1 Z = (2 + a/c cos(beta)) / 4 / sin(beta)^2
    const v = { a: 4, c: 5, cosbeta: 0.2, sinbeta: Math.sqrt(1 - 0.04) };
    expect(evalExpr('(2+a/c*cosbeta)/4/sinbeta/sinbeta', v)).toBeCloseTo((2 + 0.16) / 4 / 0.96, 12);
  });
  it('reports bad input', () => {
    expect(() => evalExpr('1+', {})).toThrow(SyntaxError);
    expect(() => evalExpr('(1', {})).toThrow(SyntaxError);
    expect(() => evalExpr('1 $ 2', {})).toThrow(SyntaxError);
    expect(() => evalExpr('q', {})).toThrow(ReferenceError);
  });
  it('parses every expression in the converted tables', () => {
    const vars = new Proxy({} as Record<string, number>, { get: () => 0.3 });
    let n = 0;
    const all = Object.values(variants.variants) as unknown as {
      kparams: [string, string][];
      points: Record<string, string[]>;
    }[];
    for (const v of all) {
      for (const [, e] of v.kparams) {
        expect(Number.isFinite(evalExpr(e, vars))).toBe(true);
        n++;
      }
      for (const c of Object.values(v.points))
        for (const e of c) {
          evalExpr(e, vars);
          n++;
        }
    }
    expect(n).toBeGreaterThan(300);
  });
});
