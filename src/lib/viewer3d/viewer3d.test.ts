import { describe, expect, it } from 'vitest';
import kpaths from '../../../tests/reference/kpaths.json';
import {
  cameraFrom,
  coast,
  drag,
  interpolate,
  lookAlong,
  ndcToWorld,
  pan,
  position,
  roll,
  up,
  viewDirection,
  worldToNdc,
  zoom,
  DRAG_RAD_PER_PX,
  type CameraState,
} from './arcball';
import { angleBetween, cross, dot, norm, normalize, quatFromAxisAngle, rotate, type Vec3 } from './math';
import { RenderLoop, type Scheduler } from './loop';
import {
  directionView,
  namedView,
  parseIndices,
  planeNormalView,
  reciprocal,
  viewAngle,
  type Lattice,
} from './views';

const deg = Math.PI / 180;
const qlen = (s: CameraState) => Math.hypot(...s.q);
const start = (): CameraState => cameraFrom([1, -1, 0.6], [0, 0, 0], 10);

describe('arcball camera (no pole lock)', () => {
  it('200 upward drags of 2 degrees go over the pole and back with no jump', () => {
    let s = start();
    const px = (2 * deg) / DRAG_RAD_PER_PX;
    let prev = viewDirection(s);
    let maxStep = 0;
    let minZ = 1;
    let maxZ = -1;
    for (let i = 0; i < 200; i++) {
      s = drag(s, 0, px);
      const v = viewDirection(s);
      maxStep = Math.max(maxStep, angleBetween(prev, v));
      minZ = Math.min(minZ, v[2]);
      maxZ = Math.max(maxZ, v[2]);
      prev = v;
    }
    expect(maxStep).toBeLessThanOrEqual(2.01 * deg);
    // 400 degrees of turning passes straight over both poles: the view looks (nearly) straight down and straight up
    expect(minZ).toBeLessThan(-0.99);
    expect(maxZ).toBeGreaterThan(0.99);
  });

  it('the quaternion stays unit after 10 000 random drags, rolls and zooms', () => {
    let s = start();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < 10000; i++) {
      s = drag(s, rnd() * 40, rnd() * 40);
      if (i % 17 === 0) s = roll(s, rnd() * 0.3);
      if (i % 31 === 0) s = zoom(s, 1 + rnd() * 0.1, { minDist: 1, maxDist: 100 });
    }
    expect(Math.abs(qlen(s) - 1)).toBeLessThan(1e-12);
    expect(s.q[3]).toBeGreaterThanOrEqual(0);
  });

  it('a drag to the right turns the front of the object to the right', () => {
    const s0 = cameraFrom([0, -1, 0], [0, 0, 0], 10); // looking along +y, x to the right, z up
    const front: Vec3 = [0, -1, 0]; // the point facing the camera
    const s1 = drag(s0, 30, 0);
    const [x0] = worldToNdc(s0, front);
    const [x1] = worldToNdc(s1, front);
    expect(x1).toBeGreaterThan(x0);
  });

  it('lookAlong works along every axis, poles included, with a right-handed frame', () => {
    const dirs: Vec3[] = [
      [0, 0, 1],
      [0, 0, -1],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 1],
      [-0.2, 0.1, -3],
    ];
    for (const d of dirs) {
      const q = lookAlong(d, [0, 0, 1]);
      const v = rotate(q, [0, 0, -1]);
      expect(angleBetween(v, d)).toBeLessThan(1e-9);
      const x = rotate(q, [1, 0, 0]);
      const y = rotate(q, [0, 1, 0]);
      expect(Math.abs(dot(x, y))).toBeLessThan(1e-12);
      expect(norm(cross(x, y))).toBeCloseTo(1, 12);
    }
    // up hint respected when possible
    const q = lookAlong([1, 0, 0], [0, 0, 1]);
    expect(rotate(q, [0, 1, 0])[2]).toBeCloseTo(1, 12);
  });

  it('zoom to the cursor keeps the point under the cursor fixed (within 0.5 px)', () => {
    const s = start();
    const ndc: [number, number] = [0.4, -0.3];
    const aspect = 1.5;
    const p = ndcToWorld(s, ndc, aspect);
    const s2 = zoom(s, 0.5, { minDist: 0.1, maxDist: 1e3 }, ndc, aspect);
    const [x, y] = worldToNdc(s2, p, aspect);
    const H = 600;
    expect((Math.abs(x - ndc[0]) * (H * aspect)) / 2).toBeLessThan(0.5);
    expect((Math.abs(y - ndc[1]) * H) / 2).toBeLessThan(0.5);
    expect(s2.dist).toBeCloseTo(5, 12);
  });

  it('zoom respects the limits and pan follows the pointer', () => {
    const s = start();
    expect(zoom(s, 1e-6, { minDist: 2, maxDist: 50 }).dist).toBe(2);
    expect(zoom(s, 1e6, { minDist: 2, maxDist: 50 }).dist).toBe(50);
    const p = pan(s, 100, 0, 600);
    // content follows the pointer: the old target moves right on screen
    const [x] = worldToNdc(p, s.target);
    expect(x).toBeGreaterThan(0);
  });

  it('interpolate and coast are smooth and end where they should', () => {
    const a = start();
    const b = cameraFrom([0, 0, 1], [1, 2, 3], 4);
    const mid = interpolate(a, b, 0.5);
    expect(Math.abs(qlen(mid) - 1)).toBeLessThan(1e-12);
    const end = interpolate(a, b, 1);
    expect(angleBetween(viewDirection(end), viewDirection(b))).toBeLessThan(1e-9);
    expect(end.dist).toBeCloseTo(4, 12);
    let c = { state: a, speed: 3 };
    for (let i = 0; i < 120; i++) c = coast(c.state, [0, 1, 0], c.speed, 1 / 60);
    expect(c.speed).toBeLessThan(0.01);
  });

  it('roll turns the picture about the line of sight only', () => {
    const s = start();
    const r = roll(s, 0.7);
    expect(angleBetween(viewDirection(s), viewDirection(r))).toBeLessThan(1e-12);
    expect(angleBetween(up(s), up(r))).toBeCloseTo(0.7, 10);
    expect(norm(position(r))).toBeCloseTo(10, 10);
  });
});

type Struct = { hpkot: { primitive_lattice_rows: number[][] }; input: { lattice_rows: number[][] } };
const lattices = Object.entries((kpaths as { structures: Record<string, Struct> }).structures).flatMap(
  ([name, s]) => [
    [`${name} input`, s.input.lattice_rows as unknown as Lattice] as const,
    [`${name} primitive`, s.hpkot.primitive_lattice_rows as unknown as Lattice] as const,
  ],
);

describe('crystal views on every reference lattice', () => {
  it.each(lattices)('%s', (_name, l) => {
    const r = reciprocal(l);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) expect(dot(l[i]!, r[j]!)).toBeCloseTo(i === j ? 1 : 0, 9);
    const names = ['a', 'b', 'c', 'a*', 'b*', 'c*'] as const;
    const vecs = [l[0], l[1], l[2], r[0], r[1], r[2]];
    names.forEach((n, k) => {
      const v = namedView(n, l);
      expect(viewAngle(v, vecs[k]!)).toBeLessThan(1e-9);
      expect(dot(v.eye, normalize(vecs[k]!))).toBeGreaterThan(0); // camera on the +d side
      // camera built from the view looks down -eye and its up is the projected hint
      const s = cameraFrom(v.eye, [0, 0, 0], 10, v.up);
      expect(angleBetween(viewDirection(s), v.eye.map((x) => -x) as Vec3)).toBeLessThan(1e-9);
    });
    // view along a: c projects to screen-up
    const along = namedView('a', l);
    const s = cameraFrom(along.eye, [0, 0, 0], 10, along.up);
    if (norm(cross(normalize(l[0]), normalize(l[2]))) > 1e-3) expect(dot(up(s), l[2])).toBeGreaterThan(0);
    // [100] is the a direction; (001) normal is c*
    expect(viewAngle(directionView([1, 0, 0], l)!, l[0])).toBeLessThan(1e-9);
    expect(viewAngle(planeNormalView([0, 0, 1], l)!, r[2])).toBeLessThan(1e-9);
    expect(namedView('iso', l).eye.every(Number.isFinite)).toBe(true);
  });

  it('parses Miller and direction indices in common spellings', () => {
    expect(parseIndices('1 1 0')).toEqual([1, 1, 0]);
    expect(parseIndices('[110]')).toEqual([1, 1, 0]);
    expect(parseIndices('(1-10)')).toEqual([1, -1, 0]);
    expect(parseIndices('1,1,0')).toEqual([1, 1, 0]);
    expect(parseIndices('[-1 2 -3]')).toEqual([-1, 2, -3]);
    expect(parseIndices('000')).toBeNull();
    expect(parseIndices('1 1')).toBeNull();
    expect(parseIndices('a b c')).toBeNull();
    expect(
      directionView(
        [0, 0, 0],
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
      ),
    ).toBeNull();
  });
});

describe('render on demand', () => {
  const fake = () => {
    const q = new Map<number, (t: number) => void>();
    let n = 0;
    let t = 0;
    const sched: Scheduler = {
      request: (cb) => (q.set(++n, cb), n),
      cancel: (id) => void q.delete(id),
    };
    const flush = (steps = 1) => {
      for (let i = 0; i < steps; i++) {
        t += 16;
        const cbs = [...q.values()];
        q.clear();
        cbs.forEach((cb) => cb(t));
      }
    };
    return { sched, flush, size: () => q.size };
  };

  it('draws nothing when idle and once for many invalidations', () => {
    const f = fake();
    const loop = new RenderLoop(f.sched, () => false);
    f.flush(10);
    expect(loop.frames).toBe(0);
    loop.invalidate();
    loop.invalidate();
    loop.invalidate();
    f.flush(5);
    expect(loop.frames).toBe(1);
    expect(loop.pending).toBe(false);
  });

  it('keeps going while the frame asks, then stops; pause drops frames', () => {
    const f = fake();
    let left = 5;
    const dts: number[] = [];
    const loop = new RenderLoop(f.sched, (dt) => (dts.push(dt), --left > 0));
    loop.invalidate();
    f.flush(20);
    expect(loop.frames).toBe(5);
    expect(dts[0]).toBe(0);
    expect(dts[1]).toBeCloseTo(0.016, 6);
    left = 100;
    loop.invalidate();
    f.flush(2);
    loop.pause();
    f.flush(10);
    expect(loop.frames).toBe(7);
    loop.resume();
    f.flush(1);
    expect(loop.frames).toBe(8);
    loop.dispose();
    f.flush(5);
    expect(loop.frames).toBe(8);
  });
});

describe('math', () => {
  it('rotates by axis-angle like the right-hand rule', () => {
    const v = rotate(quatFromAxisAngle([0, 0, 1], Math.PI / 2), [1, 0, 0]);
    expect(v[0]).toBeCloseTo(0, 12);
    expect(v[1]).toBeCloseTo(1, 12);
  });
});
