// Pointer and wheel input for a three camera through the pure arcball (M16.1, D-108). It replaces OrbitControls everywhere:
// OrbitControls keeps a polar angle and clamps it at the poles, so a crystal could not be turned over. Here every drag turns
// the camera's quaternion about a screen axis, so any orientation is reachable and nothing sticks.
// Stateless about the pose: every event reads the camera and the target as they are now, so code that moves the camera
// (preset views, reset, tweens) and the pointer never fight. It speaks the same small event protocol as OrbitControls
// ('start', 'change', 'end'), so SceneController and ViewScene keep working unchanged.
import type { Camera, Vector3 } from 'three';
import { coast, drag, pan, roll, zoom, DRAG_RAD_PER_PX, type CameraState } from './arcball';
import type { Quat, Vec3 } from './math';

export interface CameraLike {
  position: Vector3;
  quaternion: { x: number; y: number; z: number; w: number; set(x: number, y: number, z: number, w: number): unknown };
  up: Vector3;
  /** Perspective cameras have a field of view; orthographic ones use `zoom` (handled by the caller through `onOrthoZoom`). */
  fov?: number;
  updateMatrixWorld?(force?: boolean): void;
}

type Listener = () => void;

const WHEEL_STEP = 1.1;

export class ArcballControls {
  /** The point the camera turns about. Mutable, like OrbitControls.target. */
  target: Vector3;
  minDistance = 0.01;
  maxDistance = 1e6;
  /** Inertia after a drag (off under reduced motion). Same name as OrbitControls so callers need not care. */
  enableDamping = true;
  enabled = true;
  /** Zoom toward the point under the cursor (true) or the centre. */
  zoomToCursor = true;
  /** For an orthographic camera: called with a zoom factor instead of moving the camera (distance does not scale it). */
  onOrthoZoom: ((factor: number, ndc: [number, number]) => void) | undefined;

  private listeners = new Map<string, Set<Listener>>();
  private pointers = new Map<number, { x: number; y: number }>();
  private mode: 'rotate' | 'pan' | 'roll' | null = null;
  private last = { x: 0, y: 0, t: 0 };
  private pinch = 0;
  private spin = { axis: [0, 1, 0] as Vec3, speed: 0 };
  private cleanup: (() => void)[] = [];

  constructor(
    private readonly camera: CameraLike & Camera,
    private readonly dom: HTMLElement,
    targetFactory: () => Vector3,
  ) {
    this.target = targetFactory();
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      dom.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => dom.removeEventListener(type, fn as EventListener, opts));
    };
    dom.style.touchAction = 'none';
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('pointercancel', (e) => this.up(e));
    on('wheel', (e) => this.wheel(e), { passive: false });
    on('contextmenu', (e) => e.preventDefault());
  }

  addEventListener(type: string, fn: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }
  private emit(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }

  /** The camera as a pure arcball state. */
  get state(): CameraState {
    const p = this.camera.position;
    const t = this.target;
    const q = this.camera.quaternion;
    return { q: [q.x, q.y, q.z, q.w], dist: Math.max(1e-9, Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z)), target: [t.x, t.y, t.z] };
  }

  /** Put the camera at a pure arcball state. */
  apply(s: CameraState): void {
    const [x, y, z, w] = s.q as Quat;
    this.camera.quaternion.set(x, y, z, w);
    this.target.set(...s.target);
    // position = target + q (0, 0, dist); up = q (0, 1, 0)
    const ix = w * 0 + y * s.dist - z * 0;
    const iy = w * 0 + z * 0 - x * s.dist;
    const iz = w * s.dist + x * 0 - y * 0;
    const iw = -x * 0 - y * 0 - z * s.dist;
    const px = ix * w + iw * -x + iy * -z - iz * -y;
    const py = iy * w + iw * -y + iz * -x - ix * -z;
    const pz = iz * w + iw * -z + ix * -y - iy * -x;
    this.camera.position.set(s.target[0] + px, s.target[1] + py, s.target[2] + pz);
    const ux = 2 * (x * y - w * z);
    const uy = 1 - 2 * (x * x + z * z);
    const uz = 2 * (y * z + w * x);
    this.camera.up.set(ux, uy, uz);
    this.camera.updateMatrixWorld?.(true);
    this.emit('change');
  }

  private size(): { w: number; h: number } {
    const r = this.dom.getBoundingClientRect?.();
    return { w: Math.max(1, r?.width || this.dom.clientWidth || 1), h: Math.max(1, r?.height || this.dom.clientHeight || 1) };
  }

  private ndc(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.dom.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 1, height: 1 };
    return [((e.clientX - r.left) / (r.width || 1)) * 2 - 1, 1 - ((e.clientY - r.top) / (r.height || 1)) * 2];
  }

  private limits() {
    return { minDist: this.minDistance, maxDist: this.maxDistance };
  }

  /** Turn by a drag of (dx, dy) pixels (also used by the keyboard). */
  rotateBy(dx: number, dy: number): void {
    this.apply(drag(this.state, dx, dy));
  }
  /** Turn by degrees about the screen's vertical (yaw) and horizontal (pitch) axes. */
  rotateDegrees(yawDeg: number, pitchDeg: number): void {
    const px = (d: number) => (d * Math.PI) / 180 / DRAG_RAD_PER_PX;
    this.apply(drag(drag(this.state, px(yawDeg), 0), 0, px(-pitchDeg)));
  }
  rollDegrees(deg: number): void {
    this.apply(roll(this.state, (deg * Math.PI) / 180));
  }
  zoomBy(factor: number, ndc?: [number, number]): void {
    if (this.onOrthoZoom) {
      this.onOrthoZoom(factor, ndc ?? [0, 0]);
      this.emit('change');
      return;
    }
    const { w, h } = this.size();
    this.apply(zoom(this.state, factor, this.limits(), this.zoomToCursor ? ndc : undefined, w / h, this.camera.fov ?? 35));
  }
  panBy(dx: number, dy: number): void {
    const { h } = this.size();
    const fov = this.camera.fov ?? 35;
    this.apply(pan(this.state, dx, dy, h, fov));
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    this.dom.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.spin.speed = 0;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.mode = 'pan';
    } else {
      this.mode = e.button === 1 || e.shiftKey ? 'pan' : e.button === 2 ? (e.altKey ? 'pan' : 'roll') : 'rotate';
      if (e.button === 2 && !e.altKey && e.ctrlKey) this.mode = 'pan';
    }
    this.last = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.emit('start');
  }

  private move(e: PointerEvent): void {
    if (!this.enabled || !this.pointers.has(e.pointerId)) return;
    const prev = this.pointers.get(e.pointerId)!;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (this.pinch > 0 && d > 0) this.zoomBy(this.pinch / d, this.ndc({ clientX: (a!.x + b!.x) / 2, clientY: (a!.y + b!.y) / 2 }));
      this.pinch = d;
      this.panBy((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (!dx && !dy) return;
    if (this.mode === 'rotate') {
      this.rotateBy(dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - this.last.t) / 1000;
      const len = Math.hypot(dx, dy);
      this.spin = { axis: [dy / len, dx / len, 0], speed: Math.min(12, (len * DRAG_RAD_PER_PX) / dt) };
      this.last = { x: e.clientX, y: e.clientY, t: now };
    } else if (this.mode === 'pan') this.panBy(dx, dy);
    else if (this.mode === 'roll') {
      // roll by the angle the pointer sweeps around the centre of the view
      const r = this.dom.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 1, height: 1 };
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const a0 = Math.atan2(prev.y - cy, prev.x - cx);
      const a1 = Math.atan2(e.clientY - cy, e.clientX - cx);
      let da = a1 - a0;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      this.apply(roll(this.state, -da));
    }
  }

  private up(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this.dom.releasePointerCapture?.(e.pointerId);
    if (this.pointers.size === 0) {
      // a pause before release means no throw
      if (performance.now() - this.last.t > 80 || this.mode !== 'rotate' || !this.enableDamping) this.spin.speed = 0;
      this.mode = null;
      this.pinch = 0;
      this.emit('end');
    }
  }

  private wheel(e: WheelEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    const steps = Math.max(-5, Math.min(5, e.deltaY / (e.deltaMode === 1 ? 3 : 100)));
    this.zoomBy(WHEEL_STEP ** steps, this.ndc(e));
  }

  /** True while it is still coasting: the render loop keeps drawing. `dt` in seconds. */
  coasting(dt: number): boolean {
    if (!this.enableDamping || this.spin.speed < 0.02 || this.mode) return false;
    const r = coast(this.state, this.spin.axis, this.spin.speed, dt || 1 / 60);
    this.spin.speed = r.speed;
    this.apply(r.state);
    return this.spin.speed >= 0.02;
  }

  /** Called once per frame by SceneController (OrbitControls protocol). Returns whether the view moved. */
  update(): boolean {
    return this.coasting(1 / 60);
  }

  stopCoasting(): void {
    this.spin.speed = 0;
  }

  dispose(): void {
    for (const c of this.cleanup.splice(0)) c();
    this.listeners.clear();
    this.pointers.clear();
  }
}
