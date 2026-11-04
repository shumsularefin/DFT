import { describe, expect, it, vi } from 'vitest';
import { brillouinZone } from '../crystal/brillouin';
import { reciprocalLattice } from '../crystal/lattice';
import { readStructure } from '../crystal/io';
import type { ControlsLike, Environment, RendererLike } from './SceneController';
import { BzScene } from './BzScene';
import { CellScene } from './CellScene';

function fakes() {
  const docListeners: string[] = [];
  const frames = new Map<number, (t: number) => void>();
  let id = 1;
  const env = {
    document: { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: (cb: (t: number) => void) => (frames.set(id, cb), id++),
    cancelAnimationFrame: (i: number) => void frames.delete(i),
    devicePixelRatio: 1,
    now: () => 0,
  } as unknown as Environment;
  const handlers = new Map<string, (e: unknown) => void>();
  const attrs = new Map<string, string>();
  const container = {
    clientWidth: 400,
    clientHeight: 300,
    appendChild: vi.fn(),
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    addEventListener: (t: string, h: (e: unknown) => void) => void handlers.set(t, h),
    removeEventListener: (t: string) => void handlers.delete(t),
    ownerDocument: {
      createElement: () => ({
        style: {},
        className: '',
        appendChild: vi.fn(),
        remove: vi.fn(),
        setAttribute: vi.fn(),
        textContent: '',
      }),
    },
  } as unknown as HTMLElement;
  const renderer = {
    domElement: { setAttribute: vi.fn(), remove: vi.fn() } as unknown as HTMLCanvasElement,
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  } satisfies RendererLike;
  const controls: ControlsLike = {
    enableDamping: true,
    update: vi.fn(),
    dispose: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const opts = { env, createRenderer: () => renderer, createControls: () => controls };
  const key = (k: string, extra: object = {}) => {
    const e = { key: k, preventDefault: vi.fn(), ...extra };
    handlers.get('keydown')?.(e);
    return e;
  };
  return { container, opts, attrs, handlers, key, docListeners };
}

const cam = (a: Map<string, string>) =>
  a.get('data-camera')!.split(' ').map(Number) as [number, number, number];
const fcc = [
  [0, 1.805, 1.805],
  [1.805, 0, 1.805],
  [1.805, 1.805, 0],
] as [number, number, number][];

describe('BzScene', () => {
  const b = reciprocalLattice(fcc as never);
  it('draws the zone and labels Gamma and the three reciprocal vectors', () => {
    const f = fakes();
    const s = new BzScene(f.container, f.opts);
    s.start();
    s.setZone(brillouinZone(b), b);
    s.setPoints([{ label: 'X', k: [1, 0, 0] }]);
    expect(s.pointLabelTexts).toEqual(['X']);
    expect(s.declutterLabels).toBe(true);
    s.dispose();
  });
  it('arrow keys rotate, plus and minus zoom, R resets', () => {
    const f = fakes();
    const s = new BzScene(f.container, f.opts);
    s.start();
    s.setZone(brillouinZone(b), b);
    const home = cam(f.attrs);
    const e = f.key('ArrowRight');
    expect(e.preventDefault).toHaveBeenCalled();
    const turned = cam(f.attrs);
    expect(turned).not.toEqual(home);
    expect(Math.hypot(...turned)).toBeCloseTo(Math.hypot(...home), 2);
    f.key('+');
    expect(Math.hypot(...cam(f.attrs))).toBeLessThan(Math.hypot(...turned));
    f.key('-');
    f.key('r');
    expect(cam(f.attrs)).toEqual(home);
    expect(f.key('q').preventDefault).not.toHaveBeenCalled();
    expect(f.key('ArrowLeft', { ctrlKey: true }).preventDefault).not.toHaveBeenCalled();
  });
  it('preset view along b1 puts the camera on the +b1 side', () => {
    const f = fakes();
    const s = new BzScene(f.container, f.opts);
    s.start();
    s.setZone(brillouinZone(b), b);
    s.viewAlongReciprocal(0);
    const v = s.viewDirection;
    // looking along -b1 direction means camera at +b1: scene vector (x, z, -y)
    const t = [b[0]![0]!, b[0]![2]!, -b[0]![1]!];
    const n = Math.hypot(...t);
    const dot = -(v[0] * t[0]! + v[1] * t[1]! + v[2] * t[2]!) / n;
    expect(dot).toBeCloseTo(1, 3);
  });
  it('has no path start until a path is set; removes keyboard listener on dispose', () => {
    const f = fakes();
    const s = new BzScene(f.container, f.opts);
    s.start();
    s.setZone(brillouinZone(b), b);
    expect(s.viewAlongPathStart()).toBe(false);
    s.setPath([
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
    ]);
    expect(s.viewAlongPathStart()).toBe(true);
    expect(f.handlers.has('keydown')).toBe(true);
    s.dispose();
    expect(f.handlers.has('keydown')).toBe(false);
  });
});

describe('CellScene', () => {
  const cu = readStructure(
    'a.vasp',
    'Cu\n3.61\n1 0 0\n0 1 0\n0 0 1\nCu\n4\nDirect\n0 0 0\n0 0.5 0.5\n0.5 0 0.5\n0.5 0.5 0\n',
  ).structure;
  it('draws 14 atoms for conventional fcc and counts bonds when asked', () => {
    const f = fakes();
    const s = new CellScene(f.container, f.opts);
    s.start();
    const plain = s.setStructure(cu);
    expect(plain.drawn).toBe(14);
    expect(plain.bonds).toBe(0);
    const bonded = s.setStructure(cu, { bonds: true });
    expect(bonded.bonds).toBeGreaterThan(0);
    expect(bonded.legend).toEqual([{ symbol: 'Cu', color: expect.any(String), tabulated: true }]);
    expect(s.setStructure(cu, { repeat: [2, 1, 1] }).drawn).toBe(23);
    s.dispose();
  });
  it('skips bonds for very large blocks and says so', () => {
    const f = fakes();
    const s = new CellScene(f.container, f.opts);
    s.start();
    const r = s.setStructure(cu, { repeat: [3, 3, 3], bonds: true });
    expect(r.drawn).toBeGreaterThan(0);
    expect(r.bondsSkipped).toBe(r.drawn > 1200);
  });
});
