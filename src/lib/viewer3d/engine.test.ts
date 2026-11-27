import { describe, expect, it, vi } from 'vitest';
import { InstancedMesh, Mesh, type Object3D } from 'three';
import type { Environment } from '../three/SceneController';
import { viewDirection } from './arcball';
import { atoms, labels } from './kit';
import { angleBetween, normalize, type Vec3 } from './math';
import { SCENES } from './scenes/eager';
import type { SceneFrame } from './types';
import { buildLayers, cameraForSpec, disposeTree, FOV, Viewer3D } from './Viewer3D';

type L = (e?: unknown) => void;

/** A DOM element with just what the viewer and the controls touch. */
function fakeEl(doc: unknown, w = 400, h = 300) {
  const listeners = new Map<string, Set<L>>();
  const attrs = new Map<string, string>();
  const children: unknown[] = [];
  const el = {
    style: {} as Record<string, string>,
    className: '',
    textContent: '',
    clientWidth: w,
    clientHeight: h,
    ownerDocument: doc,
    classList: { add: vi.fn() },
    children,
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    appendChild: (c: unknown) => children.push(c),
    remove: vi.fn(),
    addEventListener: (t: string, l: L) => listeners.set(t, (listeners.get(t) ?? new Set()).add(l)),
    removeEventListener: (t: string, l: L) => listeners.get(t)?.delete(l),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    fire: (t: string, e: unknown) => listeners.get(t)?.forEach((l) => l(e)),
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    attrs,
  };
  return el;
}

function setup(opts: { reduced?: boolean; theme?: 'light' | 'dark' } = {}) {
  const frames = new Map<number, (t: number) => void>();
  let next = 1;
  let clock = 0;
  const docListeners = new Set<L>();
  const doc = {
    hidden: false,
    documentElement: { getAttribute: () => null },
    defaultView: undefined,
    createElement: () => fakeEl(doc),
    addEventListener: (_t: string, l: L) => docListeners.add(l),
    removeEventListener: (_t: string, l: L) => docListeners.delete(l),
  };
  const env = {
    document: doc,
    matchMedia: () => ({
      matches: opts.reduced ?? false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
    requestAnimationFrame: (cb: (t: number) => void) => (frames.set(next, cb), next++),
    cancelAnimationFrame: (id: number) => void frames.delete(id),
    devicePixelRatio: 2,
    now: () => clock,
  } as unknown as Environment;
  const container = fakeEl(doc);
  const canvas = fakeEl(doc);
  const renderer = {
    domElement: canvas as unknown as HTMLCanvasElement,
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
  const v = new Viewer3D(container as unknown as HTMLElement, {
    env,
    createRenderer: () => renderer,
    theme: () => opts.theme ?? 'light',
  });
  const run = (dt = 16) => {
    clock += dt;
    const [id, cb] = [...frames][0] ?? [];
    if (id === undefined || !cb) return false;
    frames.delete(id);
    cb(clock);
    return true;
  };
  const drain = (max = 200) => {
    let n = 0;
    while (run() && n < max) n++;
    return n;
  };
  return { v, renderer, canvas, container, doc, docListeners, run, drain, frames };
}

const cube: SceneFrame = {
  layers: [
    atoms(
      [
        [0, 0, 0],
        [2, 0, 0],
        [0, 2, 0],
        [0, 0, 2],
      ],
      0.5,
      ['c0', 'c1', 'c1', 'c2'],
      'atoms',
      { labels: ['Na', 'Cl', 'Cl', 'Cl'] },
    ),
    labels([{ text: 'origin', at: [0, 0, 0] }], 'text'),
  ],
  describe: 'Four atoms.',
};

const dirOf = (v: Viewer3D) => viewDirection(v.state);

describe('Viewer3D', () => {
  it('renders on demand: one frame for a new frame, none while idle', () => {
    const { v, renderer, run, drain } = setup({ reduced: true });
    v.setFrame(cube);
    drain();
    const calls = renderer.render.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(run()).toBe(false);
    v.invalidate();
    v.invalidate();
    drain();
    expect(renderer.render.mock.calls.length).toBe(calls + 1);
  });

  it('frames the bounds and answers the camera words', () => {
    const { v, container } = setup({ reduced: true });
    v.setFrame({ ...cube, camera: 'top' });
    expect(angleBetween(dirOf(v), [0, 0, -1])).toBeLessThan(1e-9);
    expect(container.attrs.get('data-camera')).toMatch(/\S/);
    v.goTo('front', false);
    expect(angleBetween(dirOf(v), [0, 1, 0])).toBeLessThan(1e-9);
    v.goTo('side', false);
    expect(angleBetween(dirOf(v), [-1, 0, 0])).toBeLessThan(1e-9);
    // the whole frame fits: distance gives the bounding sphere the vertical field of view
    const r = 0.5 + Math.hypot(1, 1, 1) * 1; // atoms at the corners of a 2 A tetrahedron, centre about (0.5, 0.5, 0.5)
    expect(v.state.dist).toBeGreaterThan((r / Math.sin((FOV * Math.PI) / 360)) * 0.8);
  });

  it('views along lattice directions and plane normals when the frame has a lattice', () => {
    const { v } = setup({ reduced: true });
    const lattice: [Vec3, Vec3, Vec3] = [
      [3, 0, 0],
      [0, 4, 0],
      [0, 0, 5],
    ];
    v.setFrame({ ...cube, lattice, camera: 'c' });
    expect(angleBetween(dirOf(v), [0, 0, -1])).toBeLessThan(1e-9);
    expect(v.viewIndices('direction', [1, 0, 0])).toBe(true);
    expect(angleBetween(dirOf(v), [-1, 0, 0])).toBeLessThan(1e-9);
    expect(v.viewIndices('plane', [1, 1, 0])).toBe(true);
    expect(angleBetween(dirOf(v), normalize([-1 / 3, -1 / 4, 0]))).toBeLessThan(1e-9);
    const { v: w } = setup({ reduced: true });
    w.setFrame(cube);
    expect(w.viewIndices('direction', [1, 0, 0])).toBe(false);
  });

  it('tweens camera moves, but cuts them under reduced motion', () => {
    const a = setup();
    a.v.setFrame(cube);
    a.drain();
    a.v.goTo('top');
    expect(a.drain()).toBeGreaterThan(5);
    expect(angleBetween(dirOf(a.v), [0, 0, -1])).toBeLessThan(1e-6);
    const b = setup({ reduced: true });
    b.v.setFrame(cube);
    b.drain();
    b.v.goTo('top');
    expect(angleBetween(dirOf(b.v), [0, 0, -1])).toBeLessThan(1e-9);
    expect(b.drain()).toBeLessThanOrEqual(1);
    expect(b.v.isReducedMotion).toBe(true);
  });

  it('refits a bigger or smaller picture: same direction and relative zoom, centred, with a reset view framed on it', () => {
    const { v } = setup({ reduced: true });
    v.setFrame(cube);
    v.rotate(30, 15);
    v.zoom(0.8);
    const dir = dirOf(v);
    const d1 = v.state.dist;
    const big: SceneFrame = {
      layers: [
        atoms(
          [
            [0, 0, 0],
            [20, 0, 0],
            [0, 20, 0],
            [0, 0, 20],
          ],
          0.5,
          ['c0', 'c1', 'c1', 'c2'],
          'atoms',
        ),
      ],
      describe: 'Four atoms, ten times further apart.',
    };
    v.setFrame(big, null, 'refit');
    expect(angleBetween(dirOf(v), dir)).toBeLessThan(1e-9);
    // about ten times further, so the bigger picture fills the view as the small one did
    expect(v.state.dist / d1).toBeGreaterThan(7);
    expect(v.state.dist / d1).toBeLessThan(12);
    // centred on the new picture: the same point the reset view turns about
    const centre = [...v.state.target];
    v.reset(false);
    expect(Math.hypot(...v.state.target.map((t, i) => t - centre[i]!))).toBeLessThan(1e-9);
    v.setFrame(cube, null, 'refit');
    v.setFrame(big, null, 'refit');
    v.setFrame(cube, null, 'refit');
    // reset at the big picture gives a full view of it, so back on the cube the zoom is the full-view zoom again
    expect(v.state.dist).toBeGreaterThan(d1);
    // the reset view is the frame's own camera framed on the new bounds, not the old one
    v.setFrame(big, null, 'refit');
    v.reset(false);
    expect(v.state.dist / d1).toBeGreaterThan(7);
    // false still keeps the camera exactly
    const kept = v.state.dist;
    v.setFrame(cube, null, false);
    expect(v.state.dist).toBe(kept);
  });

  it('refits with a tween unless reduced motion', () => {
    const a = setup();
    a.v.setFrame(cube);
    a.drain();
    a.v.setFrame(
      {
        ...cube,
        layers: [
          atoms(
            [
              [0, 0, 0],
              [9, 0, 0],
            ],
            0.5,
            ['c0', 'c1'],
            'atoms',
          ),
        ],
      },
      null,
      'refit',
      true,
    );
    expect(a.drain()).toBeGreaterThan(5);
  });

  it('switches projection and keeps the apparent size', () => {
    const { v, container } = setup({ reduced: true });
    v.setFrame(cube);
    const d = v.state.dist;
    v.setOrtho(true);
    expect(v.isOrtho).toBe(true);
    expect(container.attrs.get('data-projection')).toBe('orthographic');
    expect(v.ortho.top).toBeCloseTo(d * Math.tan((FOV * Math.PI) / 360), 9);
    v.setOrtho(false);
    expect(v.state.dist).toBeCloseTo(d, 9);
  });

  it('reports the apparent distance in both projections, and an orthographic zoom changes it', () => {
    const { v } = setup({ reduced: true });
    v.setFrame(cube);
    const d = v.state.dist;
    expect(v.apparentDistance).toBeCloseTo(d, 9);
    v.setOrtho(true);
    expect(v.apparentDistance).toBeCloseTo(d, 9);
    v.zoom(0.5);
    expect(v.state.dist).toBeCloseTo(d, 9); // the camera does not move in orthographic projection
    expect(v.apparentDistance).toBeCloseTo(d * 0.5, 6);
    v.reset(false);
    expect(v.apparentDistance).toBeCloseTo(d, 6);
  });

  it('hides and shows layer groups and lists them in order', () => {
    const { v } = setup({ reduced: true });
    v.setFrame(cube, ['text']);
    expect(v.isVisible('atoms')).toBe(false);
    expect(v.groupList.map((g) => g.id)).toEqual(['atoms', 'text']);
    v.setGroups(null);
    expect(v.isVisible('atoms')).toBe(true);
  });

  it('picks the atom under the cursor and reports its label', () => {
    const { v } = setup({ reduced: true });
    v.setFrame({
      layers: [atoms([[0, 0, 0]], 0.6, 'c0', 'atoms', { labels: ['Si'] })],
      describe: 'One atom.',
      camera: 'front',
    });
    const hit = v.pick(200, 150);
    expect(hit?.label).toBe('Si');
    expect(hit?.group).toBe('atoms');
    expect(v.pick(2, 2)).toBeNull();
  });

  it('places labels in screen space and hides those behind the camera', () => {
    const { v, container, drain } = setup({ reduced: true });
    v.setFrame(cube);
    drain();
    const overlay = container.children[1] as ReturnType<typeof fakeEl>;
    const label = overlay.children[0] as ReturnType<typeof fakeEl>;
    expect(label.textContent).toBe('origin');
    expect(label.style.transform).toMatch(/translate\(-50%, -50%\) translate\([\d.-]+px, [\d.-]+px\)/);
  });

  it('turns, zooms and resets from code', () => {
    const { v } = setup({ reduced: true });
    v.setFrame(cube);
    const start = dirOf(v);
    const d = v.state.dist;
    v.rotate(90, 0);
    expect(angleBetween(dirOf(v), start)).toBeCloseTo(Math.PI / 2, 6);
    v.zoom(0.5);
    expect(v.state.dist).toBeCloseTo(d * 0.5, 6);
    v.reset(false);
    expect(angleBetween(dirOf(v), start)).toBeLessThan(1e-9);
  });

  it('pauses while the tab is hidden and stops cleanly on dispose', () => {
    const { v, canvas, renderer, docListeners, doc, frames } = setup({ reduced: true });
    v.setFrame(cube);
    expect(canvas.listenerCount()).toBeGreaterThan(0);
    doc.hidden = true;
    docListeners.forEach((l) => l());
    v.invalidate();
    expect(frames.size).toBe(0);
    v.dispose();
    expect(renderer.dispose).toHaveBeenCalled();
    expect(canvas.listenerCount()).toBe(0);
    expect(docListeners.size).toBe(0);
    v.dispose(); // twice is harmless
  });
});

describe('cameraForSpec', () => {
  it('follows the VESTA up rule along lattice vectors', () => {
    const lattice: [Vec3, Vec3, Vec3] = [
      [3, 0, 0],
      [0, 3, 0],
      [0, 0, 3],
    ];
    const a = cameraForSpec('a', { lattice });
    expect(angleBetween(a.up, [0, 0, 1])).toBeLessThan(1e-9);
    const c = cameraForSpec('c', { lattice });
    expect(angleBetween(c.up, [0, 1, 0])).toBeLessThan(1e-9);
    expect(cameraForSpec({ eye: [0, 0, 2], up: [0, 1, 0], zoom: 2 }, {}).zoom).toBe(2);
  });
});

describe('buildLayers', () => {
  it('builds and disposes every scene frame in the registry, and colours by theme', () => {
    const doc = { createElement: () => fakeEl(undefined) } as unknown as Document;
    let objects = 0;
    for (const def of SCENES.values()) {
      const params = Object.fromEntries(def.params.map((p) => [p.id, p.value]));
      const frame = def.build(params as never);
      for (const theme of ['light', 'dark'] as const) {
        const built = buildLayers(frame.layers, theme, doc);
        built.root.traverse(() => objects++);
        const geos: { dispose: () => void }[] = [];
        built.root.traverse((o: Object3D) => {
          const g = (o as Mesh).geometry;
          if (g) geos.push(vi.spyOn(g, 'dispose') as never);
        });
        disposeTree(built.root);
        for (const s of geos) expect(s).toHaveBeenCalled();
      }
    }
    expect(objects).toBeGreaterThan(0);
  });

  it('draws a highlight shell around picked atoms', () => {
    const doc = { createElement: () => fakeEl(undefined) } as unknown as Document;
    const layers = [
      atoms(
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        0.3,
        'c0',
        'a',
      ),
    ];
    const plain = buildLayers(layers, 'light', doc);
    const lit = buildLayers(layers, 'light', doc, new Set(['a:1']));
    const count = (b: typeof plain) => b.root.children.filter((o) => o instanceof InstancedMesh).length;
    expect(count(lit)).toBe(count(plain) + 1);
  });
});
