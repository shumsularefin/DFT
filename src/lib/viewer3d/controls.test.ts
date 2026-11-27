import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { cameraFrom } from './arcball';
import { ArcballControls } from './controls';

function fakeDom() {
  const t = new EventTarget() as EventTarget & Record<string, unknown>;
  Object.assign(t, {
    style: {},
    clientWidth: 600,
    clientHeight: 400,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }),
    setPointerCapture() {},
    releasePointerCapture() {},
  });
  return t as unknown as HTMLElement;
}
const pe = (type: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  Object.assign(new Event(type), {
    pointerId: 1,
    button: 0,
    clientX: x,
    clientY: y,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    ...extra,
  });

describe('ArcballControls on a three camera', () => {
  it('state and apply round trip', () => {
    const cam = new PerspectiveCamera(35, 1.5, 0.1, 100);
    const c = new ArcballControls(cam, fakeDom(), () => new Vector3());
    const s = cameraFrom([1, 2, 3], [0.5, 0, 0], 7);
    c.apply(s);
    const r = c.state;
    expect(r.dist).toBeCloseTo(7, 9);
    r.q.forEach((v, i) => expect(Math.abs(v)).toBeCloseTo(Math.abs(s.q[i]!), 9));
    // three agrees on where the camera looks
    const d = new Vector3();
    cam.getWorldDirection(d);
    const toTarget = new Vector3(0.5, 0, 0).sub(cam.position).normalize();
    expect(d.dot(toTarget)).toBeCloseTo(1, 9);
  });

  it('a long vertical drag goes over the pole without sticking', () => {
    const cam = new PerspectiveCamera(35, 1.5, 0.1, 100);
    const dom = fakeDom();
    const c = new ArcballControls(cam, dom, () => new Vector3());
    c.apply(cameraFrom([1, 0, 0], [0, 0, 0], 10, [0, 0, 1]));
    c.enableDamping = false;
    dom.dispatchEvent(pe('pointerdown', 300, 200));
    let maxZ = -1;
    for (let i = 1; i <= 120; i++) {
      dom.dispatchEvent(pe('pointermove', 300, 200 + i * 10));
      maxZ = Math.max(maxZ, cam.position.z / cam.position.length());
    }
    dom.dispatchEvent(pe('pointerup', 300, 1400));
    expect(maxZ).toBeGreaterThan(0.999); // the camera reached the top and went past it
    expect(cam.position.length()).toBeCloseTo(10, 6);
  });

  it('wheel zooms and the limits hold; events are emitted', () => {
    const cam = new PerspectiveCamera(35, 1.5, 0.1, 100);
    const dom = fakeDom();
    const c = new ArcballControls(cam, dom, () => new Vector3());
    c.minDistance = 2;
    c.maxDistance = 20;
    c.apply(cameraFrom([0, -1, 0], [0, 0, 0], 10));
    let changes = 0;
    c.addEventListener('change', () => changes++);
    for (let i = 0; i < 50; i++)
      dom.dispatchEvent(
        Object.assign(new Event('wheel'), {
          deltaY: -100,
          deltaMode: 0,
          clientX: 300,
          clientY: 200,
          preventDefault() {},
        }),
      );
    expect(c.state.dist).toBeCloseTo(2, 6);
    expect(changes).toBe(50);
    c.dispose();
    dom.dispatchEvent(
      Object.assign(new Event('wheel'), {
        deltaY: 100,
        deltaMode: 0,
        clientX: 300,
        clientY: 200,
        preventDefault() {},
      }),
    );
    expect(changes).toBe(50);
  });
});
