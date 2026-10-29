import { describe, expect, it, vi } from 'vitest';
import { SceneController, type ControlsLike, type Environment, type RendererLike } from './SceneController';

type Listener = () => void;

/** A document, media query and observers that record every listener added and removed. */
function fakeEnv(opts: { reduced?: boolean } = {}) {
  const added: string[] = [];
  const removed: string[] = [];
  const docListeners = new Map<string, Set<Listener>>();
  const doc = {
    hidden: false,
    addEventListener: (t: string, l: Listener) => {
      added.push('document:' + t);
      docListeners.set(t, (docListeners.get(t) ?? new Set()).add(l));
    },
    removeEventListener: (t: string, l: Listener) => {
      removed.push('document:' + t);
      docListeners.get(t)?.delete(l);
    },
  };
  const mq = {
    matches: opts.reduced ?? false,
    addEventListener: () => added.push('mq:change'),
    removeEventListener: () => removed.push('mq:change'),
  };
  let ioCallback: ((e: { isIntersecting: boolean }[]) => void) | undefined;
  const frames = new Map<number, (t: number) => void>();
  let nextId = 1;
  let clock = 0;
  const env = {
    document: doc,
    matchMedia: () => mq,
    ResizeObserver: class {
      observe() {
        added.push('resize-observer');
      }
      disconnect() {
        removed.push('resize-observer');
      }
    },
    IntersectionObserver: class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        ioCallback = cb;
      }
      observe() {
        added.push('intersection-observer');
      }
      disconnect() {
        removed.push('intersection-observer');
      }
    },
    requestAnimationFrame: (cb: (t: number) => void) => {
      frames.set(nextId, cb);
      return nextId++;
    },
    cancelAnimationFrame: (id: number) => void frames.delete(id),
    devicePixelRatio: 3,
    now: () => clock,
  } as unknown as Environment;
  return {
    env,
    doc,
    added,
    removed,
    frames,
    fire: (type: string) => docListeners.get(type)?.forEach((l) => l()),
    setIntersecting: (v: boolean) => ioCallback?.([{ isIntersecting: v }]),
    runFrame(t = 16) {
      clock = t;
      const [id, cb] = [...frames][0] ?? [];
      if (id === undefined || !cb) return false;
      frames.delete(id);
      cb(t);
      return true;
    },
  };
}

function fakeContainer() {
  const children: unknown[] = [];
  const el = {
    clientWidth: 400,
    clientHeight: 300,
    appendChild: (c: unknown) => children.push(c),
    ownerDocument: {
      createElement: () => ({
        style: {},
        className: '',
        appendChild: vi.fn(),
        remove: vi.fn(),
        setAttribute: vi.fn(),
      }),
    },
  } as unknown as HTMLElement;
  return { el, children };
}

class Recording extends SceneController {
  updates: number[] = [];
  protected override update(dt: number) {
    this.updates.push(dt);
  }
}

function setup(opts: { reduced?: boolean } = {}) {
  const f = fakeEnv(opts);
  const c = fakeContainer();
  const renderer = {
    domElement: { setAttribute: vi.fn(), remove: vi.fn() } as unknown as HTMLCanvasElement,
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  } satisfies RendererLike;
  const controlsListeners: string[] = [];
  const controls: ControlsLike = {
    enableDamping: true,
    update: vi.fn(),
    dispose: vi.fn(),
    addEventListener: (t) => controlsListeners.push('+' + t),
    removeEventListener: (t) => controlsListeners.push('-' + t),
  };
  const ctl = new Recording(c.el, {
    env: f.env,
    createRenderer: () => renderer,
    createControls: () => controls,
  });
  return { f, c, renderer, controls, controlsListeners, ctl };
}

describe('SceneController', () => {
  it('renders on demand: one frame at start, none afterwards, many requests draw once', () => {
    const { f, renderer, ctl } = setup();
    ctl.start();
    expect(f.runFrame()).toBe(true);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(f.runFrame()).toBe(false); // no permanent loop
    ctl.requestRender();
    ctl.requestRender();
    ctl.requestRender();
    f.runFrame();
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it('caps the device pixel ratio', () => {
    const { renderer, ctl } = setup();
    ctl.start();
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(2); // env dpr is 3
    ctl.setDprCap(1);
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
  });

  it('loops while animating and stops when told to', () => {
    const { f, renderer, ctl } = setup();
    ctl.start();
    f.runFrame();
    ctl.setAnimating(true);
    for (let i = 0; i < 5; i++) expect(f.runFrame(16 * (i + 2))).toBe(true);
    ctl.setAnimating(false);
    f.runFrame(200); // the frame already queued draws once more
    expect(f.runFrame()).toBe(false);
    expect(renderer.render.mock.calls.length).toBeGreaterThanOrEqual(7);
  });

  it('with reduced motion never loops and damping is off; step() advances one frame', () => {
    const { f, controls, ctl } = setup({ reduced: true });
    ctl.start();
    f.runFrame();
    expect(controls.enableDamping).toBe(false);
    ctl.setAnimating(true);
    f.runFrame();
    expect(f.runFrame()).toBe(false);
    expect(ctl.updates).toEqual([]);
    ctl.step(0.5);
    f.runFrame();
    expect(ctl.updates).toEqual([0.5]);
  });

  it('pauses when the page is hidden or the view is off screen, and resumes', () => {
    const { f, renderer, ctl } = setup();
    ctl.start();
    f.runFrame();
    ctl.setAnimating(true);
    f.setIntersecting(false);
    expect(f.frames.size).toBe(0);
    const drawn = renderer.render.mock.calls.length;
    ctl.requestRender();
    f.runFrame();
    expect(renderer.render.mock.calls.length).toBe(drawn); // inactive: no draw
    f.setIntersecting(true);
    expect(f.frames.size).toBe(1);
    f.doc.hidden = true;
    f.fire('visibilitychange');
    expect(f.frames.size).toBe(0);
    f.doc.hidden = false;
    f.fire('visibilitychange');
    expect(f.frames.size).toBe(1);
  });

  it('dispose releases every listener and observer, the controls and the renderer', () => {
    const { f, c, renderer, controls, controlsListeners, ctl } = setup();
    ctl.start();
    ctl.addLights();
    ctl.addInstancedSpheres(
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
      0.2,
      0xff0000,
    );
    ctl.addLineSegments(
      [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
      ],
      0x00ff00,
    );
    ctl.addLabel('A', [0, 0, 0]);
    f.runFrame();
    expect(f.added.length).toBeGreaterThan(0);
    ctl.dispose();
    expect([...f.added].sort()).toEqual([...f.removed].sort());
    expect(controls.dispose).toHaveBeenCalledTimes(1);
    expect(
      controlsListeners
        .filter((x) => x[0] === '+')
        .map((x) => x.slice(1))
        .sort(),
    ).toEqual(
      controlsListeners
        .filter((x) => x[0] === '-')
        .map((x) => x.slice(1))
        .sort(),
    );
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(f.frames.size).toBe(0);
    expect(c.children.length).toBeGreaterThan(0);
    ctl.dispose(); // idempotent
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    ctl.requestRender();
    expect(f.frames.size).toBe(0);
  });

  it('disposes geometries and materials of everything it created', () => {
    const { ctl } = setup();
    ctl.start();
    const mesh = ctl.addInstancedSpheres([[0, 0, 0]], 0.2, 0xff0000);
    const lines = ctl.addLineSegments(
      [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
      ],
      0x00ff00,
    );
    const spies = [
      vi.spyOn(mesh.geometry, 'dispose'),
      vi.spyOn(mesh.material as { dispose(): void }, 'dispose'),
      vi.spyOn(lines.geometry, 'dispose'),
      vi.spyOn(lines.material as { dispose(): void }, 'dispose'),
    ];
    ctl.dispose();
    for (const s of spies) expect(s).toHaveBeenCalled();
  });

  it('does not leak renderers over 20 open and close cycles', () => {
    let alive = 0;
    const f = fakeEnv();
    for (let i = 0; i < 20; i++) {
      const ctl = new SceneController(fakeContainer().el, {
        env: f.env,
        createRenderer: () => {
          alive++;
          return {
            domElement: { setAttribute: vi.fn(), remove: vi.fn() } as unknown as HTMLCanvasElement,
            setPixelRatio: vi.fn(),
            setSize: vi.fn(),
            render: vi.fn(),
            dispose: () => void alive--,
          };
        },
        createControls: () => ({
          enableDamping: true,
          update: vi.fn(),
          dispose: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      });
      ctl.start();
      f.runFrame();
      expect(alive).toBe(1);
      ctl.dispose();
      expect(alive).toBe(0);
    }
    expect(alive).toBe(0);
    expect([...f.added].sort()).toEqual([...f.removed].sort());
  });

  it('stop() then start() resumes without creating a second renderer', () => {
    let created = 0;
    const f = fakeEnv();
    const ctl = new SceneController(fakeContainer().el, {
      env: f.env,
      createRenderer: () => {
        created++;
        return {
          domElement: { setAttribute: vi.fn(), remove: vi.fn() } as unknown as HTMLCanvasElement,
          setPixelRatio: vi.fn(),
          setSize: vi.fn(),
          render: vi.fn(),
          dispose: vi.fn(),
        };
      },
      createControls: () => ({
        enableDamping: true,
        update: vi.fn(),
        dispose: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    ctl.start();
    ctl.stop();
    expect(ctl.isRunning).toBe(false);
    ctl.start();
    expect(created).toBe(1);
    expect(ctl.isRunning).toBe(true);
  });
});
