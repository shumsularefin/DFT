import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildCompositionHandoff,
  familySweep,
  MAP_BOUNDS,
  mixedSiteSweep,
  sweepToCsv,
  tauCurves,
} from './maps';
import { validateHandoff } from '../handoff';

const golden = JSON.parse(readFileSync('tests/reference/perovskite_reference.json', 'utf8'));

describe('perovskite maps and family sweep (M8.4)', () => {
  it('matches rcuo3_family_sweep golden values and null gaps for all three policies', () => {
    const B = [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS' as const, fraction: 1 }];
    const X = [{ el: 'O', ox: -2, cn: 6, fraction: 1 }];

    const policyMap: [string, 'cn12' | 'cn9' | 'highest'][] = [
      ['cn12_strict', 'cn12'],
      ['cn9_uniform', 'cn9'],
      ['highest_available', 'highest'],
    ];

    for (const [goldenKey, policy] of policyMap) {
      const goldenRows = golden.rcuo3_family_sweep.policies[goldenKey];
      if (!Array.isArray(goldenRows)) continue;
      const rows = familySweep(B, X, policy, 'ionic');
      for (const g of goldenRows) {
        const hit = rows.find((r) => r.el === g.R || r.el === g.el);
        expect(hit, `${goldenKey} ${g.R ?? g.el}`).toBeDefined();
        if (g.t === null || g.t === undefined) {
          expect(hit!.ok).toBe(false);
          expect(hit!.reason).toBeTruthy();
        } else {
          expect(hit!.ok).toBe(true);
          expect(hit!.t).toBeCloseTo(g.t, 6);
          expect(hit!.mu).toBeCloseTo(g.mu, 6);
          if (g.tau !== null && g.tau !== undefined) {
            expect(hit!.tau).toBeCloseTo(g.tau, 6);
          }
        }
      }
    }
  });

  it('uses exact octahedral radius-ratio bounds sqrt(2)-1 and sqrt(3)-1', () => {
    expect(MAP_BOUNDS.muMinLine).toBeCloseTo(Math.SQRT2 - 1, 12);
    expect(MAP_BOUNDS.muMaxLine).toBeCloseTo(Math.sqrt(3) - 1, 12);
    expect(MAP_BOUNDS.tauThreshold).toBe(4.18);
  });

  it('computes mixed-site sweep, tau curves, CSV export, and valid hand-off payload', () => {
    const A = [
      { el: 'Sr', ox: 2, cn: 12, fraction: 0.5 },
      { el: 'Ba', ox: 2, cn: 12, fraction: 0.5 },
    ];
    const B = [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }];
    const X = [{ el: 'O', ox: -2, cn: 6, fraction: 1 }];

    const mix = mixedSiteSweep(A, B, X, 'A', 'ionic', 10);
    expect(mix.length).toBe(11);
    expect(mix[0]!.t).toBeCloseTo(1.0016, 4);
    expect(mix[10]!.t).toBeGreaterThan(mix[0]!.t);

    const curves = tauCurves(1.4 / 0.605);
    expect(curves.map((c) => c.nA)).toEqual([1, 2, 3]);
    expect(curves.every((c) => c.points.length > 10)).toBe(true);

    const rows = familySweep(B, X, 'cn12', 'ionic');
    const csv = sweepToCsv(rows);
    expect(csv.startsWith('element,cn,status,')).toBe(true);
    expect(csv.split('\n').length).toBeGreaterThanOrEqual(17);

    const payload = buildCompositionHandoff(A, B, X, 'Sr0.5Ba0.5TiO3');
    expect(validateHandoff(payload)).toEqual(payload);
  });
});
