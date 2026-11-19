import { describe, expect, it } from 'vitest';
import m1 from '../../data/questions/module-01.json';
import m2 from '../../data/questions/module-02.json';
import m3 from '../../data/questions/module-03.json';
import m4 from '../../data/questions/module-04.json';
import m5 from '../../data/questions/module-05.json';
import m6 from '../../data/questions/module-06.json';
import m7 from '../../data/questions/module-07.json';
import { boxEnergyEV } from '../physics/box';
import { loadQuestionBank } from '../learning/questions';
import { PLOT_IDS, renderPlot } from './plots';
import { resolveVisual } from './resolve';

const bank = loadQuestionBank({ m1, m2, m3, m4, m5, m6, m7 });

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
