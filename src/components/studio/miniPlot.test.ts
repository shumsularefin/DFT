import { describe, expect, it } from 'vitest';
import { niceTicks, renderPlot } from './miniPlot';

describe('miniPlot', () => {
  it('picks 1, 2, 2.5 or 5 steps that cover the range', () => {
    expect(niceTicks(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-1.3, 1.3)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(niceTicks(3, 3)).toEqual([3]);
  });
  it('draws lines, markers, axis titles and escapes text', () => {
    const svg = renderPlot(
      [{ x: [1, 2, 3], y: [3, 1, 2], mode: 'lines+markers', name: 'E <a>' }],
      { title: 'E & k', xaxis: { title: 'k' }, yaxis: { title: { text: 'E (eV)' } } },
      600,
      300,
    );
    expect(svg).toContain('<polyline');
    expect(svg.match(/<circle/g)).toHaveLength(3);
    expect(svg).toContain('E &amp; k');
    expect(svg).toContain('aria-label="E &amp; k: E (eV) against k"');
    expect(svg).not.toContain('<a>');
  });
  it('skips non-finite points and honours a fixed range', () => {
    const svg = renderPlot(
      [{ x: [0, 1, 2], y: [0, Number.NaN, 2], mode: 'markers' }],
      { yaxis: { range: [0, 4] } },
      400,
      200,
    );
    expect(svg.match(/<circle/g)).toHaveLength(2);
    expect(svg).toContain('>4<');
  });
});
