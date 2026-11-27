import { describe, expect, it } from 'vitest';
import m1 from '../../data/questions/module-01.json';
import m2 from '../../data/questions/module-02.json';
import m3 from '../../data/questions/module-03.json';
import m4 from '../../data/questions/module-04.json';
import m5 from '../../data/questions/module-05.json';
import m6 from '../../data/questions/module-06.json';
import m7 from '../../data/questions/module-07.json';
import m8 from '../../data/questions/module-08.json';
import { boxEnergyEV } from '../physics/box';
import { log10Big, slaterDeterminants } from '../physics/combinatorics';
import { HBAR2_OVER_2M_EV_A2 } from '../physics/constants';
import { runScf } from '../physics/scf1d';
import { loadQuestionBank } from '../learning/questions';
import { PLOT_IDS, renderPlot } from './plots';
import { resolveVisual } from './resolve';

const bank = loadQuestionBank({ m1, m2, m3, m4, m5, m6, m7, m8 });

describe('question visuals (M12.3)', () => {
  it('every question has a visual or a reasoned exemption', () => {
    for (const q of bank) expect(q.visual, q.id).toBeDefined();
    const none = bank.filter((q) => q.visual && 'none' in q.visual);
    for (const q of none) expect((q.visual as { none: string }).none.length, q.id).toBeGreaterThan(20);
    expect(none.length).toBeLessThanOrEqual(Math.ceil(bank.length * 0.06));
  });

  it('every visual resolves; plots and scenes give a flat SVG with a text alternative', () => {
    for (const q of bank) {
      const fig = resolveVisual(q.visual, q.id);
      if (!fig) continue;
      expect(fig.svg.startsWith('<svg'), q.id).toBe(true);
      expect(fig.svg, q.id).toContain('role="img"');
      expect(fig.svg, q.id).not.toMatch(/NaN|undefined|Infinity/);
      expect(fig.alt.length, q.id).toBeGreaterThan(20);
      expect(fig.caption.length, q.id).toBeGreaterThan(10);
      expect(JSON.stringify(fig), q.id).not.toContain('\u2014');
    }
  });

  it('every plot id is used or at least renders with default parameters', () => {
    const used = new Set(bank.flatMap((q) => (q.visual && 'plot' in q.visual ? [q.visual.plot] : [])));
    for (const id of PLOT_IDS) {
      if (id === 'steps' || id === 'orbital-slice' || id === 'occupation') continue; // need parameters
      expect(renderPlot(id, {}, 'alt text for the plot').svg, id).toContain('<svg');
    }
    expect(used.size).toBeGreaterThan(10);
  });

  it('an unknown plot or scene fails loudly', () => {
    expect(() => renderPlot('nope', {}, 'x')).toThrow(/unknown plot/);
    expect(() => resolveVisual({ scene: 'nope', caption: 'c', alt: 'a' })).toThrow(/unknown scene/);
  });

  it('box levels: the highest drawn level is the one the physics module gives (known ratio n^2)', () => {
    // E_n / E_1 = n^2 exactly, so level 5 sits 25 times as high as level 1 above the zero of the axis.
    expect(boxEnergyEV(5, 5) / boxEnergyEV(1, 5)).toBeCloseTo(25, 12);
    const svg = renderPlot('box-levels', { Ls: [5], nMax: 5 }, 'five levels').svg;
    const ys = [...svg.matchAll(/<line class="vp-curve"[^>]* y1="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(ys).toHaveLength(5);
    const y0 = 210 - 10 - 36; // bottom of the chart in plots.ts
    const h1 = y0 - ys[0]!;
    const h5 = y0 - ys[4]!;
    expect(h5 / h1).toBeCloseTo(25, 0);
  });

  it('box wave: n = 4 draws exactly three node markers', () => {
    const svg = renderPlot('box-wave', { L: 5, n: 4 }, 'n equals four').svg;
    expect((svg.match(/class="vp-node"/g) ?? []).length).toBe(3);
  });

  it('plots never print the answer to a numeric question as a number', () => {
    const numeric = bank.filter((q) => q.type === 'numeric');
    for (const q of numeric) {
      const fig = resolveVisual(q.visual, q.id);
      if (!fig || q.type !== 'numeric') continue;
      const texts = [...fig.svg.matchAll(/>([^<]+)</g)].map((m) => m[1]!);
      expect(
        texts.some((t) => t.trim() === String(q.answer)),
        q.id,
      ).toBe(false);
    }
  });
});

describe('lint plot list', () => {
  it('equals the registry', async () => {
    const { PLOT_IDS: linted } = await import('../../../scripts/lint-questions.mjs');
    expect([...linted].sort()).toEqual([...PLOT_IDS].sort());
  });
});

// M16.5: the guided path pictures that explain themselves. Each number they print is checked against the physics.
describe('guided path pictures (M16.5)', () => {
  const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]!);

  it('scf-iterations: one bar per step of the toy loop, the last step settled below the tolerance', () => {
    const r = runScf({ Z: 2, alpha: 0.3, tol: 1e-6 });
    const n = r.iterations.length;
    expect(r.iterations[n - 1]!.residual).toBeLessThan(1e-6);
    const last = renderPlot('scf-iterations', { Z: 2, alpha: 0.3, tol: 1e-6, step: n }, 'a').svg;
    expect(last.match(/class="vp-bar[^"]*"/g)).toHaveLength(n);
    expect(texts(last).join(' ')).toContain(`Step ${n} of ${n}`);
    expect(texts(last).join(' ')).toMatch(/Settled, the loop stops/);
    const first = renderPlot('scf-iterations', { Z: 2, alpha: 0.3, tol: 1e-6, step: 1 }, 'a').svg;
    expect(texts(first).join(' ')).toMatch(/Not settled yet/);
    // the bars still to come are drawn open, the chosen one highlighted
    expect(first.match(/vp-bar vp-later/g)).toHaveLength(n - 1);
    expect(first.match(/vp-bar vp-hot/g)).toHaveLength(1);
    // past the end clamps to the last step, never NaN
    expect(renderPlot('scf-iterations', { step: 999 }, 'a').svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('pw-sphere: the kept count is every grid wave with (hbar^2/2m) G^2 at or below the cutoff, and grows with it', () => {
    const count = (ecut: number) => {
      const g = (2 * Math.PI) / 4;
      let k = 0;
      for (let i = -7; i <= 7; i++)
        for (let j = -7; j <= 7; j++) if (HBAR2_OVER_2M_EV_A2 * g * g * (i * i + j * j) <= ecut) k++;
      return k;
    };
    let prev = 0;
    for (const ecut of [50, 100, 200, 400]) {
      const svg = renderPlot('pw-sphere', { cutoff: ecut, a: 4, span: 7 }, 'a').svg;
      const shown = Number(/(\d+) waves kept/.exec(texts(svg).join(' '))![1]);
      expect(shown, `${ecut} eV`).toBe(count(ecut));
      expect(svg.match(/vp-node vp-solid/g)).toHaveLength(shown);
      expect(shown).toBeGreaterThan(prev);
      prev = shown;
    }
  });

  it('bands-dos: unequal hoppings give an insulator, equal ones a metal', () => {
    expect(texts(renderPlot('bands-dos', { t2: 0.6 }, 'a').svg).join(' ')).toMatch(
      /A gap at the Fermi level/,
    );
    expect(texts(renderPlot('bands-dos', { t2: 1 }, 'a').svg).join(' ')).toMatch(/No gap at the Fermi level/);
  });

  it('real-reciprocal: |b| = 2 pi / a for a square cell, half as long for a twice-as-long side, 2 pi / (a sin 60) for a hexagon', () => {
    const lens = (lattice: string) =>
      /\|b1\| = ([\d.]+), \|b2\| = ([\d.]+)/
        .exec(texts(renderPlot('real-reciprocal', { lattice, a: 4 }, 'a').svg).join(' '))!
        .slice(1)
        .map(Number);
    expect(lens('square')).toEqual([1.57, 1.57]);
    expect(lens('rect')).toEqual([1.57, 0.79]);
    const hex = Math.round(((2 * Math.PI) / (4 * Math.sin(Math.PI / 3))) * 100) / 100;
    expect(lens('hex')).toEqual([hex, hex]);
  });

  it('density-map: the map strip is darkest where the curve is highest and empty at the walls', () => {
    const svg = renderPlot('density-map', { L: 5, electrons: 2 }, 'a').svg;
    const ops = [...svg.matchAll(/class="vp-heat"[^>]* fill-opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(ops).toHaveLength(48);
    expect(ops[0]!).toBeLessThan(0.05);
    expect(ops[47]!).toBeLessThan(0.05);
    expect(Math.max(...ops)).toBe(ops[24]);
  });

  it('exp-wall labels: the factor printed is the ratio of the last two counts', () => {
    const svg = renderPlot('exp-wall', { perElectron: 4, maxN: 20, labels: true }, 'a').svg;
    // C(80,20) / C(76,19), both computed by the combinatorics module
    const ratio = Math.round(
      10 ** (log10Big(slaterDeterminants(20, 80)) - log10Big(slaterDeterminants(19, 76))),
    );
    expect(texts(svg).join(' ')).toContain(`multiplied the count by ${ratio}`);
  });
});
