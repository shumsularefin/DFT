import { describe, expect, it } from 'vitest';
import { decompose, fractions, hullFacets, stability, type HullPhase } from './hull';
import { mulberry32 } from './lennardJones';

const ELEMENTS: HullPhase[] = [
  { name: 'A', counts: [1, 0, 0], energy: 0 },
  { name: 'B', counts: [0, 1, 0], energy: 0 },
  { name: 'C', counts: [0, 0, 1], energy: 0 },
];

/** Independent reference: the lower envelope at x is the lowest mixture of at most three phases containing x. */
function bruteHull(phases: readonly HullPhase[], x: readonly number[]): number {
  const X = phases.map((p) => fractions(p.counts));
  let best = Infinity;
  const n = phases.length;
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++)
      for (let k = j; k < n; k++) {
        // solve x = a Xi + b Xj + c Xk with a + b + c = 1 in the (xB, xC) plane
        const [p, q, r] = [X[i]!, X[j]!, X[k]!];
        const d = (q[1]! - p[1]!) * (r[2]! - p[2]!) - (r[1]! - p[1]!) * (q[2]! - p[2]!);
        const cands: number[][] = [];
        if (Math.abs(d) > 1e-12) {
          const b = ((x[1]! - p[1]!) * (r[2]! - p[2]!) - (r[1]! - p[1]!) * (x[2]! - p[2]!)) / d;
          const c = ((q[1]! - p[1]!) * (x[2]! - p[2]!) - (x[1]! - p[1]!) * (q[2]! - p[2]!)) / d;
          cands.push([1 - b - c, b, c]);
        } else {
          // pairs on a line: x = (1 - t) Xi + t Xj
          for (const [u, v] of [
            [p, q],
            [p, r],
            [q, r],
          ] as const) {
            const dd = [1, 2].map((m) => v[m]! - u[m]!);
            const L2 = dd[0]! ** 2 + dd[1]! ** 2;
            if (L2 < 1e-12) {
              if (Math.hypot(x[1]! - u[1]!, x[2]! - u[2]!) < 1e-9)
                cands.push(u === p ? [1, 0, 0] : u === q ? [0, 1, 0] : [0, 0, 1]);
              continue;
            }
            const t = ((x[1]! - u[1]!) * dd[0]! + (x[2]! - u[2]!) * dd[1]!) / L2;
            const off = Math.hypot(u[1]! + t * dd[0]! - x[1]!, u[2]! + t * dd[1]! - x[2]!);
            if (off > 1e-9) continue;
            const w = [0, 0, 0];
            const iu = u === p ? 0 : u === q ? 1 : 2;
            const iv = v === p ? 0 : v === q ? 1 : 2;
            w[iu] = w[iu]! + 1 - t;
            w[iv] = w[iv]! + t;
            cands.push(w);
          }
        }
        for (const w of cands) {
          if (w.some((v) => v < -1e-9)) continue;
          best = Math.min(
            best,
            w[0]! * phases[i]!.energy + w[1]! * phases[j]!.energy + w[2]! * phases[k]!.energy,
          );
        }
      }
  return best;
}

describe('convex hull (S-044, S-120)', () => {
  it('reproduces the worked binary example of the topic: A3B is 0.10 eV/atom above the A-AB line', () => {
    const phases: HullPhase[] = [
      ...ELEMENTS,
      { name: 'AB', counts: [1, 1, 0], energy: -1.0 },
      { name: 'A3B', counts: [3, 1, 0], energy: -0.4 },
    ];
    const s = stability(phases);
    const d = s.phases[4]!;
    expect(d.hullEnergy).toBeCloseTo(-0.5, 12);
    expect(d.aboveHull).toBeCloseTo(0.1, 12);
    const byName = Object.fromEntries(d.products.map((p) => [phases[p.phase]!.name, p.fraction]));
    expect(byName.A).toBeCloseTo(0.5, 12);
    expect(byName.AB).toBeCloseTo(0.5, 12);
    expect(s.phases[3]!.aboveHull).toBe(0);
  });

  it('agrees with a brute-force lower envelope on random ternary systems', () => {
    const rand = mulberry32(17);
    for (let trial = 0; trial < 25; trial++) {
      const phases: HullPhase[] = [...ELEMENTS];
      for (let k = 0; k < 9; k++) {
        const c: [number, number, number] = [
          1 + Math.floor(rand() * 3),
          Math.floor(rand() * 3),
          Math.floor(rand() * 3),
        ];
        phases.push({ name: `P${k}`, counts: c, energy: -0.8 * rand() });
      }
      const facets = hullFacets(phases);
      // the facets tile the composition triangle (area 1/2 in the xB, xC plane) without overlap
      let area = 0;
      for (const f of facets) {
        const [p, q, r] = f.map((i) => fractions(phases[i]!.counts));
        area += Math.abs((q![1] - p![1]) * (r![2] - p![2]) - (r![1] - p![1]) * (q![2] - p![2])) / 2;
      }
      expect(area).toBeCloseTo(0.5, 9);
      for (const p of phases) {
        const d = decompose(phases, facets, p.counts, p.energy);
        expect(d.hullEnergy).toBeCloseTo(bruteHull(phases, fractions(p.counts)), 9);
        // the products recombine to the composition
        const mix = [0, 1, 2].map((m) =>
          d.products.reduce((s, q) => s + q.fraction * fractions(phases[q.phase]!.counts)[m]!, 0),
        );
        fractions(p.counts).forEach((x, m) => expect(mix[m]!).toBeCloseTo(x, 9));
      }
      for (let q = 0; q < 10; q++) {
        const xb = rand();
        const xc = rand() * (1 - xb);
        const counts: [number, number, number] = [1 - xb - xc, xb, xc];
        expect(decompose(phases, facets, counts).hullEnergy).toBeCloseTo(bruteHull(phases, counts), 9);
      }
    }
  });

  it('makes a phase stable once its energy drops below the hull', () => {
    const phases: HullPhase[] = [
      ...ELEMENTS,
      { name: 'AB', counts: [1, 1, 0], energy: -0.5 },
      { name: 'ABC', counts: [1, 1, 1], energy: -0.1 },
    ];
    expect(stability(phases).phases[4]!.aboveHull).toBeCloseTo(-0.1 - (2 / 3) * -0.5, 12);
    phases[4] = { ...phases[4]!, energy: -0.5 };
    expect(stability(phases).phases[4]!.aboveHull).toBe(0);
  });
});
