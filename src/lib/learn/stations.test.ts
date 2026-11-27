import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import stations from '../../content/learn/stations.json';
import { sceneIds } from '../scene/library';
import { PLOT_IDS, renderPlot } from '../visual/plots';
import { validateFrame } from '../viewer3d/kit';
import { SCENES, getSceneDef } from '../viewer3d/scenes/eager';
import { withDefaults } from '../viewer3d/types';
import { allStates, resolveStation, topicHref, validateStations, type Known, type Station } from './stations';
import { getScene } from '../scene/library';
import { runScf } from '../physics/scf1d';

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
const stages = Object.fromEntries([...SCENES].map(([id, d]) => [id, d.params.map((p) => p.id)]));
const known: Known = { sceneIds: sceneIds(), plotIds: PLOT_IDS, topicIds, sourceIds, stages };
const list = stations as unknown as Station[];
const EM = String.fromCharCode(0x2014);

describe('guided path stations (M12.4)', () => {
  it('the file passes the linter', () => {
    expect(validateStations(list, known)).toEqual([]);
  });

  it('has the fifteen stations of the work order, in order (real space and reciprocal space added in M16.5)', () => {
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
      'real-vs-reciprocal',
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
      } else if (s.visual.kind === 'stage') {
        expect(getSceneDef(s.visual.scene).badge, s.id).toBe(s.badge);
        if (s.visual.panel)
          expect(renderPlot(s.visual.panel.plot, s.visual.panel.params, s.alt).badge, `${s.id} panel`).toBe(
            s.badge,
          );
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
        } else if (shown.kind === 'stage') {
          const def = getSceneDef(shown.scene);
          // every value a station sets is one the scene itself offers
          for (const [k, x] of Object.entries(shown.params)) {
            const p = def.params.find((q) => q.id === k)!;
            expect(p, `${s.id} ${k}`).toBeDefined();
            if (p.kind === 'select')
              expect(
                p.options.map((o) => o.value),
                `${s.id} ${k}`,
              ).toContain(x);
            if (p.kind === 'slider' || p.kind === 'step') {
              expect(x as number).toBeGreaterThanOrEqual(p.min);
              expect(x as number).toBeLessThanOrEqual(p.max);
            }
            if (p.kind === 'toggle') expect(typeof x).toBe('boolean');
          }
          const frame = def.build(withDefaults(def, shown.params));
          expect(validateFrame(frame), `${s.id} ${v}`).toEqual([]);
          if (shown.panel)
            expect(renderPlot(shown.panel.plot, shown.panel.params, s.alt).svg.startsWith('<svg')).toBe(true);
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

  it('the picture of a stage station changes with its try-this control (M16.4, section 1 rule 3)', () => {
    for (const s of list) {
      if (s.visual.kind !== 'stage') continue;
      const describes = new Set(
        allStates(s).map((v) => {
          const shown = resolveStation(s, v);
          if (shown.kind !== 'stage') throw new Error(s.id);
          const def = getSceneDef(shown.scene);
          return def.build(withDefaults(def, shown.params)).describe;
        }),
      );
      expect(describes.size, s.id).toBe(allStates(s).length);
    }
  });

  it('the hydrogen and orbital stations are live 3D scenes with the plot kept beside them', () => {
    for (const id of ['atom-cloud', 'orbital']) {
      const s = list.find((x) => x.id === id)!;
      expect(s.visual.kind, id).toBe('stage');
      if (s.visual.kind === 'stage') {
        expect(s.visual.scene).toBe('m02-orbital');
        expect(s.visual.panel).toBeDefined();
      }
    }
    // the stations the e2e tests read as plots stay plots
    for (const id of ['kohn-sham', 'scf-loop'])
      expect(list.find((x) => x.id === id)!.visual.kind, id).toBe('plot');
  });

  it('resolves a stage station: option params merge over the visual, sliders set the scene and the panel', () => {
    const st: Station = {
      ...list[0]!,
      visual: {
        kind: 'stage',
        scene: 'm05-kmesh',
        params: { lattice: 'sc', n: 2 },
        panel: { plot: 'kmesh-grid', params: { n: 2, gamma: true } },
      },
      try: { kind: 'slider', label: 'n', param: 'n', min: 1, max: 8, step: 1, value: 2 },
    };
    expect(resolveStation(st, 5)).toEqual({
      kind: 'stage',
      scene: 'm05-kmesh',
      params: { lattice: 'sc', n: 5 },
      panel: { plot: 'kmesh-grid', params: { n: 5, gamma: true } },
    });
    const ch: Station = {
      ...st,
      visual: { kind: 'stage', scene: 'm02-orbital', params: { orbital: '1s', cloud: true }, camera: 'iso' },
      try: {
        kind: 'choice',
        label: 'x',
        initial: 0,
        options: [
          { label: 'one', params: { orbital: '2s' } },
          { label: 'two', params: { orbital: '2p_z' }, camera: 'top' },
        ],
      },
    };
    expect(resolveStation(ch, 1)).toEqual({
      kind: 'stage',
      scene: 'm02-orbital',
      params: { orbital: '2p_z', cloud: true },
      camera: 'top',
    });
    expect(resolveStation(ch, 0)).toMatchObject({ params: { orbital: '2s', cloud: true }, camera: 'iso' });
  });

  it('the linter checks stage visuals and stays backward compatible', () => {
    const base = list.find((s) => s.visual.kind === 'plot')!;
    const stage = (
      visual: unknown,
      t: unknown = { kind: 'choice', label: 'x', initial: 0, options: [{ label: 'a' }, { label: 'b' }] },
    ) =>
      validateStations([{ ...base, visual, try: t }], known)
        .map((i) => i.message)
        .join('|');
    expect(stage({ kind: 'stage', scene: 'm02-orbital', params: { orbital: '2s' } })).toBe('');
    expect(stage({ kind: 'stage', scene: 'm99-nope' })).toMatch(/unknown 3D scene/);
    expect(stage({ kind: 'stage', scene: 'm02-orbital', params: { colour: 'red' } })).toMatch(
      /unknown scene parameter "colour"/,
    );
    expect(stage({ kind: 'stage', scene: 'm02-orbital', params: { orbital: [1] } })).toMatch(
      /must be a number/,
    );
    expect(stage({ kind: 'stage', scene: 'm02-orbital', camera: 'sideways' })).toMatch(/camera/);
    expect(stage({ kind: 'stage', scene: 'm02-orbital', camera: { eye: [0, 0, 0] } })).toMatch(/camera/);
    expect(stage({ kind: 'stage', scene: 'm02-orbital', camera: { eye: [1, 1, 1], up: [0, 0, 1] } })).toBe(
      '',
    );
    expect(stage({ kind: 'stage', scene: 'm02-orbital', panel: { plot: 'nope', params: {} } })).toMatch(
      /unknown panel plot/,
    );
    expect(
      stage(
        { kind: 'stage', scene: 'm02-orbital' },
        {
          kind: 'choice',
          label: 'x',
          initial: 0,
          options: [{ label: 'a', panel: { n: 1 } }, { label: 'b' }],
        },
      ),
    ).toMatch(/panel the visual does not have/);
    expect(
      stage(
        { kind: 'stage', scene: 'm02-orbital' },
        {
          kind: 'choice',
          label: 'x',
          initial: 0,
          options: [{ label: 'a', params: { wrong: 1 } }, { label: 'b' }],
        },
      ),
    ).toMatch(/unknown scene parameter "wrong"/);
    expect(
      stage(
        { kind: 'stage', scene: 'm05-kmesh' },
        { kind: 'slider', label: 'n', param: 'n', min: 1, max: 8, step: 1, value: 4 },
      ),
    ).toBe('');
    expect(
      stage(
        { kind: 'stage', scene: 'm05-kmesh' },
        { kind: 'slider', label: 'n', param: 'size', min: 1, max: 8, step: 1, value: 4 },
      ),
    ).toMatch(/slider sets unknown scene parameter/);
    // a stage visual needs the stage list; the old station kinds need nothing new
    const old: Known = { ...known, stages: undefined };
    expect(
      validateStations([{ ...base, visual: { kind: 'stage', scene: 'm02-orbital' } }], old)[0]?.message,
    ).toMatch(/unknown 3D scene/);
    expect(
      validateStations(
        list.filter((x) => x.visual.kind !== 'stage'),
        old,
      ),
    ).toEqual([]);
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

  it('the loop slider reaches every step of the toy run and no more; read lines stay short (M16.5)', () => {
    const st = list.find((s) => s.id === 'scf-loop')!;
    if (st.visual.kind !== 'plot' || st.try.kind !== 'slider')
      throw new Error('scf-loop must be a plot with a slider');
    const p = st.visual.params as { Z: number; alpha: number; tol: number };
    expect(st.try.max).toBe(runScf({ Z: p.Z, alpha: p.alpha, tol: p.tol }).iterations.length);
    for (const s of list) for (const line of s.read ?? []) expect(line.length, s.id).toBeLessThanOrEqual(150);
  });
});
