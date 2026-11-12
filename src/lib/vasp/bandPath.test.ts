import { describe, expect, it } from 'vitest';
import { bandAxis } from './bandPath';
import type { Vec3 } from '../crystal/types';

const cubic = [
  [2, 0, 0],
  [0, 2, 0],
  [0, 0, 2],
] as const;
const line = (pts: [Vec3, Vec3, string, string][], n: number) => ({
  pointsPerSegment: n,
  segments: pts.map(([from, to, fromLabel, toLabel]) => ({ from, to, fromLabel, toLabel })),
});

describe('bandAxis', () => {
  // Gamma to X along (0,0,0) -> (0.5,0,0) in a 2 A cubic cell: |k| = 0.5 * 2 pi / 2
  const k: Vec3[] = [
    [0, 0, 0],
    [0.25, 0, 0],
    [0.5, 0, 0],
  ];
  it('measures the path length in 1/Angstrom when the lattice is known', () => {
    const a = bandAxis(k, { lattice: cubic });
    expect(a.toScale).toBe(true);
    expect(a.x[2]).toBeCloseTo(0.5 * Math.PI, 10);
  });
  it('labels the end points of a line-mode path', () => {
    const a = bandAxis(k, { lattice: cubic, line: line([[[0, 0, 0], [0.5, 0, 0], 'GAMMA', 'X']], 3) });
    expect(a.ticks.map((t) => t.label)).toEqual(['Γ', 'X']);
    expect(a.ticks[1]!.x).toBeCloseTo(a.x[2]!, 12);
  });
  it('does not advance at a jump between segments and joins the two labels', () => {
    const kk: Vec3[] = [
      [0, 0, 0],
      [0.5, 0, 0],
      [0.5, 0.5, 0], // new segment starts elsewhere
      [0.5, 0.5, 0.5],
    ];
    const a = bandAxis(kk, {
      lattice: cubic,
      line: line(
        [
          [[0, 0, 0], [0.5, 0, 0], 'G', 'X'],
          [[0.5, 0.5, 0], [0.5, 0.5, 0.5], 'M', 'R'],
        ],
        2,
      ),
    });
    expect(a.x[2]).toBeCloseTo(a.x[1]!, 12);
    expect(a.ticks.map((t) => t.label)).toEqual(['Γ', 'X|M', 'R']);
  });
  it('warns and skips labels when the counts disagree', () => {
    const a = bandAxis(k, { line: line([[[0, 0, 0], [0.5, 0, 0], 'G', 'X']], 5) });
    expect(a.ticks).toEqual([]);
    expect(a.warnings[0]).toMatch(/labels are not drawn/);
    expect(a.toScale).toBe(false);
  });
});
