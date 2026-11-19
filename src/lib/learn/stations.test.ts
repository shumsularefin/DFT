import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import stations from '../../content/learn/stations.json';
import { sceneIds } from '../scene/library';
import { PLOT_IDS, renderPlot } from '../visual/plots';
import { allStates, resolveStation, topicHref, validateStations, type Known, type Station } from './stations';
import { getScene } from '../scene/library';

const root = path.resolve(__dirname, '../../..');
const topicIds = fs
  .readdirSync(path.join(root, 'src/content/handbook'), { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.mdx'))
  .map((f) =>
    f
      .replace(/\.mdx$/, '')
      .split(path.sep)
      .join('/'),
  );
const sourceIds = [
  ...fs.readFileSync(path.join(root, 'docs/SCIENCE_SOURCES.md'), 'utf8').matchAll(/^\| (S-\d{3}) \|/gm),
].map((m) => m[1]!);
const known: Known = { sceneIds: sceneIds(), plotIds: PLOT_IDS, topicIds, sourceIds };
const list = stations as unknown as Station[];
const EM = String.fromCharCode(0x2014);

describe('guided path stations (M12.4)', () => {
  it('the file passes the linter', () => {
    expect(validateStations(list, known)).toEqual([]);
  });

  it('has the fourteen stations of the work order, in order', () => {
    expect(list.map((s) => s.id)).toEqual([
      'atom-cloud',
      'orbital',
      'exponential-wall',
      'density-map',
      'kohn-sham',
      'scf-loop',
      'unit-cell',
      'periodic-images',
      'plane-waves',
      'reciprocal-space',
      'kpoint-mesh',
      'bands-dos',
      'spin-orderings',
      'first-folder',
    ]);
  });

  it('the badge of a plot station is the badge the plot itself carries', () => {
    for (const s of list) {
      if (s.visual.kind === 'plot') {
        expect(renderPlot(s.visual.plot, s.visual.params, s.alt).badge, s.id).toBe(s.badge);
      } else {
        expect(getScene(s.visual.scene).badge, s.id).toBe(s.badge);
      }
    }
  });

  it('every reachable state of every station draws', () => {
    for (const s of list) {
      for (const v of allStates(s)) {
        const shown = resolveStation(s, v);
        if (shown.kind === 'plot') {
          const out = renderPlot(shown.plot, shown.params, s.alt);
          expect(out.svg.startsWith('<svg'), `${s.id} ${v}`).toBe(true);
        } else {
          expect(() => getScene(shown.scene), `${s.id} ${v}`).not.toThrow();
        }
      }
    }
  });

  it('a scene choice that swaps scenes keeps the badge of every scene it can show', () => {
    for (const s of list) {
      if (s.try.kind !== 'choice' || s.visual.kind !== 'scene') continue;
      for (const o of s.try.options) {
        if (o.scene) expect(getScene(o.scene).badge, `${s.id} ${o.label}`).toBe(s.badge);
      }
    }
  });

  it('resolve ignores a bad value and falls back to the start', () => {
    const slider = list.find((s) => s.try.kind === 'slider')!;
    const a = resolveStation(slider, Number.NaN);
    const b = resolveStation(slider);
    expect(a).toEqual(b);
    const choice = list.find((s) => s.try.kind === 'choice')!;
    expect(resolveStation(choice, 99)).toEqual(resolveStation(choice));
  });

  it('writes no em dash and links to handbook topics', () => {
    expect(JSON.stringify(list).includes(EM)).toBe(false);
    expect(topicHref('02-quantum-basics/orbitals')).toBe('/handbook/02-quantum-basics/orbitals/');
  });

  it('the linter catches a broken station', () => {
    const bad = [
      { ...list[0]!, topic: 'nope/nope', badge: 'real', sources: ['S-' + '999'], sentences: ['one'] },
    ];
    const msgs = validateStations(bad, known)
      .map((i) => i.message)
      .join('|');
    expect(msgs).toMatch(/does not exist/);
    expect(msgs).toMatch(/badge/);
    expect(msgs).toMatch(/unknown source/);
    expect(msgs).toMatch(/three/);
  });
});
