import { describe, expect, it } from 'vitest';
import { getScene, lookupStructure } from '../scene/library';
import { resolveScene } from '../scene/resolve';
import { cameraFrom } from './arcball';
import { frameFromResolved } from './fromSceneSpec';
import { eyeAt, fmt3, IslandView, pickText, VIEW_LABEL } from './islandView';

describe('island view readout (M16.4)', () => {
  it('names the view the way the e2e tests and screen readers expect', () => {
    // tests/e2e/scenes.spec.ts and viewer-labs.spec.ts find the view by this start of its label
    expect(VIEW_LABEL).toMatch(/^3D view\. Arrow keys rotate/);
    expect(VIEW_LABEL).toMatch(/R resets/);
    expect(VIEW_LABEL.includes(String.fromCharCode(0x2014))).toBe(false);
  });

  it('writes "x y z" with three decimals and never a negative zero', () => {
    expect(fmt3([1, -2.34567, 0])).toBe('1.000 -2.346 0.000');
    expect(fmt3([-0, -1e-9, -0.0004])).toBe('0.000 0.000 0.000');
    // parsed back by the e2e tests: a reset target reads as exactly [0, 0, 0]
    expect(fmt3([-1e-12, 0, 2e-5]).split(' ').map(Number)).toEqual([0, 0, 0]);
  });

  it('puts the eye on the view line at the requested distance', () => {
    const s = cameraFrom([0, -1, 0], [1, 2, 3], 10);
    const e = eyeAt(s, 4);
    expect(e[0]).toBeCloseTo(1, 9);
    expect(e[1]).toBeCloseTo(-2, 9);
    expect(e[2]).toBeCloseTo(3, 9);
    // a shorter apparent distance (an orthographic zoom) moves the reported eye closer to the target
    expect(Math.hypot(...eyeAt(s, 2).map((x, i) => x - s.target[i]!))).toBeCloseTo(2, 9);
  });

  it('reads a pick in one line', () => {
    expect(pickText(null)).toBe('');
    expect(pickText({ group: 'atoms', kind: 'atoms', index: 0, label: 'Na 1', position: [0, 1.5, -2] })).toBe(
      'Na 1 at (0.00, 1.50, -2.00).',
    );
    expect(
      pickText({ group: 'cut', kind: 'mesh', index: 3, label: '', position: [0, 0, 0], value: 0.012345 }),
    ).toBe('Value 0.0123 at (0.00, 0.00, 0.00).');
  });
});

/* The live contract the e2e tests read, run on the real engine with a fake renderer and DOM. */
type L = (e?: unknown) => void;
function fakeEl(doc: unknown, w = 400, h = 400) {
  const listeners = new Map<string, Set<L>>();
  const attrs = new Map<string, string>();
  return {
    style: {} as Record<string, string>,
    className: '',
    textContent: '',
    clientWidth: w,
    clientHeight: h,
    ownerDocument: doc,
    classList: { add: () => {} },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    removeAttribute: (k: string) => attrs.delete(k),
    appendChild: () => {},
    remove: () => {},
    addEventListener: (t: string, l: L) => listeners.set(t, (listeners.get(t) ?? new Set()).add(l)),
    removeEventListener: (t: string, l: L) => listeners.get(t)?.delete(l),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    fire: (t: string, e: unknown) => listeners.get(t)?.forEach((l) => l(e)),
    attrs,
  };
}
function live() {
  const doc = {
    hidden: false,
    documentElement: { getAttribute: () => null },
    createElement: () => fakeEl(doc),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const env = {
    document: doc,
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    devicePixelRatio: 1,
    now: () => 0,
  };
  const view = fakeEl(doc);
  const host = fakeEl(doc);
  const canvas = fakeEl(doc);
  const iv = new IslandView(view as unknown as HTMLElement, host as unknown as HTMLElement, {
    viewer: {
      env: env as never,
      theme: () => 'light',
      createRenderer: () => ({
        domElement: canvas as unknown as HTMLCanvasElement,
        setPixelRatio: () => {},
        setSize: () => {},
        render: () => {},
        dispose: () => {},
      }),
    },
  });
  iv.start();
  const key = (k: string) => view.fire('keydown', { key: k, preventDefault: () => {} });
  const cam = () => view.attrs.get('data-camera')!;
  const target = () => view.attrs.get('data-target')!.split(' ').map(Number);
  const dist = () => {
    const c = cam().split(' ').map(Number);
    const t = target();
    return Math.hypot(...c.map((x, i) => x - t[i]!));
  };
  return { iv, view, key, cam, target, dist };
}

describe('IslandView on a crystal preset (M16.4 e2e contract)', () => {
  const spec = getScene('sc');
  const frame = frameFromResolved(resolveScene(spec, lookupStructure), spec.alt);

  it('becomes a labelled, focusable 3D view only once it shows a frame', () => {
    const { iv, view } = live();
    expect(view.attrs.get('role')).toBeUndefined();
    iv.show(frame);
    expect(view.attrs.get('role')).toBe('group');
    expect(view.attrs.get('tabindex')).toBe('0');
    expect(view.attrs.get('aria-label')).toBe(VIEW_LABEL);
    expect(view.attrs.get('data-projection')).toBe('orthographic');
    iv.dispose();
    expect(view.attrs.get('role')).toBeUndefined();
  });

  it('arrow keys turn, W moves the target, R comes back to exactly the first readout', () => {
    const { iv, key, cam, target } = live();
    iv.show(frame);
    const home = cam();
    expect(target()).toEqual([0, 0, 0]);
    key('ArrowRight');
    expect(cam()).not.toBe(home);
    key('ArrowUp');
    key('q');
    key('w');
    expect(Math.hypot(...target())).toBeGreaterThan(0);
    key('r');
    expect(cam()).toBe(home);
    expect(target()).toEqual([0, 0, 0]);
  });

  it('zooming shortens the reported distance in orthographic projection too, and a reset restores it', () => {
    const { iv, key, cam, dist } = live();
    iv.show(frame);
    const home = cam();
    const far = dist();
    key('+');
    expect(dist()).toBeLessThan(far);
    iv.zoom(1 / 1.25);
    expect(dist()).toBeLessThan(far / 1.2);
    iv.goTo(frame.camera!, false);
    expect(cam()).toBe(home);
    key('p');
    expect(iv.viewer.isOrtho).toBe(false);
  });
});
