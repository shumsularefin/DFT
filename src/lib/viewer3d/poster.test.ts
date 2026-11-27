import { describe, expect, it } from 'vitest';
import { atoms, lines } from './kit';
import { resolveColor } from './palette3d';
import { POSTER_LIMITS, posterCounts, posterSVG } from './poster';
import { SCENES } from './scenes/eager';
import { withDefaults } from './types';

describe('posterSVG', () => {
  it('draws every registered scene within the size caps, deterministically and without NaN', () => {
    expect(SCENES.size).toBeGreaterThan(0);
    for (const def of SCENES.values()) {
      const frame = def.build(withDefaults(def, {}));
      const svg = posterSVG(frame);
      expect(svg).toBe(posterSVG(frame));
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      expect(svg.startsWith('<svg')).toBe(true);
      const c = posterCounts(svg);
      expect(c.polygon).toBeLessThanOrEqual(POSTER_LIMITS.triangles + POSTER_LIMITS.segments);
      expect(c.circle).toBeLessThanOrEqual(POSTER_LIMITS.atoms + POSTER_LIMITS.points);
      expect(svg.length).toBeLessThan(160_000);
    }
  });

  it('paints far to near, so the nearer atom is drawn last', () => {
    const near = resolveColor('c0', 'light');
    const far = resolveColor('c1', 'light');
    for (const order of [
      [0, 1],
      [1, 0],
    ]) {
      const pos: [number, number, number][] = [
        [0.5, 0, 1],
        [-0.5, 0, -1],
      ];
      const col = [near, far] as `#${string}`[];
      const frame = {
        layers: [
          atoms(
            order.map((i) => pos[i]!),
            0.4,
            order.map((i) => col[i]!),
          ),
        ],
        describe: 'Two atoms.',
      };
      const svg = posterSVG(frame, { camera: 'top' });
      expect(svg.lastIndexOf(near)).toBeGreaterThan(svg.lastIndexOf(far));
    }
  });

  it('shows only the visible groups and lets ink follow the theme', () => {
    const frame = {
      layers: [
        atoms([[0, 0, 0]], 0.4, 'c0', 'a'),
        lines(
          [
            [
              [0, 0, 0],
              [1, 0, 0],
            ],
          ],
          'ink',
          'edges',
        ),
      ],
      describe: 'An atom and an edge.',
    };
    expect(posterCounts(posterSVG(frame, { groups: ['a'] })).line).toBe(0);
    expect(posterSVG(frame)).toContain('class="v3p-ink-stroke"');
  });
});
