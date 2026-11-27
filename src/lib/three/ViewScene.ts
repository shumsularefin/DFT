// Shared view behaviour of the Brillouin-zone and unit-cell scenes (M5.5): turn, zoom and pan with the pointer (the free arcball
// of M16, D-108:
// drag turns, wheel or pinch zooms, right-drag or Shift-drag moves), preset views, and the keyboard (arrow keys rotate, + and -
// zoom, W A S D move, R resets). Rotation and zoom are about the orbit target, so they keep working after a pan; reset and the
// preset views bring the target back to the origin. The canvas is hidden from assistive technology (it is a picture), so the
// focusable container carries the instructions, and the labels and readouts carry the content.
// Nothing animates by itself: views change instantly, so reduced motion needs no special case.
import { Quaternion, Vector3 } from 'three';
import { SceneController, type ControllerOptions } from './SceneController';

const STEP_DEG = 5;
const ZOOM_STEP = 1.15;
/** One W A S D press moves the view by this fraction of the camera distance. */
const PAN_STEP = 0.05;
const ORIGIN = new Vector3(0, 0, 0);

/** The part of the controls this class steers (the test fakes have none of it). */
interface OrbitLike {
  target?: Vector3;
  minDistance?: number;
  maxDistance?: number;
}

export class ViewScene extends SceneController {
  private home = new Vector3(4, 3, 4);
  private keyHandler: ((e: KeyboardEvent) => void) | undefined;
  private orbitHandler: (() => void) | undefined;
  /** Used when the controls carry no target of their own (tests). */
  private ownTarget = new Vector3();

  constructor(container: HTMLElement, options?: ControllerOptions) {
    super(container, options);
  }

  override start(): void {
    const first = !this.keyHandler;
    super.start();
    if (first && this.isRunning) {
      this.attachKeyboard();
      // a pointer drag moves the camera through the controls; keep the readout in step with it
      this.orbitHandler = () => this.writeCamera();
      this.controls?.addEventListener('change', this.orbitHandler);
    }
  }

  override dispose(): void {
    if (this.keyHandler) this.container.removeEventListener('keydown', this.keyHandler as EventListener);
    this.keyHandler = undefined;
    if (this.orbitHandler) this.controls?.removeEventListener('change', this.orbitHandler);
    this.orbitHandler = undefined;
    super.dispose();
  }

  private get orbit(): OrbitLike | undefined {
    return this.controls as unknown as OrbitLike | undefined;
  }

  /** The point the view turns about and looks at (scene coordinates). */
  get target(): Vector3 {
    return this.orbit?.target ?? this.ownTarget;
  }

  private attachKeyboard(): void {
    const c = this.container;
    c.setAttribute('tabindex', '0');
    c.setAttribute('role', 'group');
    c.setAttribute(
      'aria-label',
      '3D view. Arrow keys rotate, plus and minus zoom, W A S D move, R resets the view. Drag to turn, scroll to zoom, right-drag or Shift-drag to move. The names of the points are listed as text on the page.',
    );
    this.keyHandler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.shiftKey ? 3 * STEP_DEG : STEP_DEG;
      switch (e.key) {
        case 'ArrowLeft':
          this.rotateView(-step, 0);
          break;
        case 'ArrowRight':
          this.rotateView(step, 0);
          break;
        case 'ArrowUp':
          this.rotateView(0, step);
          break;
        case 'ArrowDown':
          this.rotateView(0, -step);
          break;
        case '+':
        case '=':
          this.zoomView(1 / ZOOM_STEP);
          break;
        case '-':
        case '_':
          this.zoomView(ZOOM_STEP);
          break;
        case 'w':
        case 'W':
          this.panView(0, PAN_STEP);
          break;
        case 's':
        case 'S':
          this.panView(0, -PAN_STEP);
          break;
        case 'a':
        case 'A':
          this.panView(-PAN_STEP, 0);
          break;
        case 'd':
        case 'D':
          this.panView(PAN_STEP, 0);
          break;
        case 'r':
        case 'R':
          this.resetView();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    c.addEventListener('keydown', this.keyHandler as EventListener);
  }

  /** Where "reset" goes: a camera position (scene coordinates) looking at the origin. */
  protected setHome(position: Vector3): void {
    this.home = position.clone();
    const o = this.orbit;
    if (o && 'minDistance' in o) {
      // the wheel and pinch stay inside the same range as the + and - keys
      const r = this.home.length() || 1;
      o.minDistance = 0.25 * r;
      o.maxDistance = 6 * r;
    }
    this.moveCamera(position, ORIGIN);
  }

  private moveCamera(p: Vector3, target: Vector3 = this.target): void {
    const t = target.clone();
    const c = this.controls;
    // a drag leaves inertia in the controls; spend it now so it cannot nudge the view after a reset
    const damp = c?.enableDamping ?? false;
    if (c) {
      c.enableDamping = false;
      c.update();
    }
    this.camera.position.copy(p);
    this.target.copy(t);
    this.camera.lookAt(t);
    if (c) {
      c.update();
      c.enableDamping = damp;
    }
    this.writeCamera();
    this.requestRender();
  }

  /** Read by tests and by anyone inspecting the page: the camera position and orbit target in scene units. */
  private writeCamera(): void {
    const f = (v: Vector3) => [v.x, v.y, v.z].map((x) => x.toFixed(3)).join(' ');
    this.container.setAttribute('data-camera', f(this.camera.position));
    this.container.setAttribute('data-target', f(this.target));
  }

  resetView(): void {
    this.camera.up.set(0, 1, 0);
    this.moveCamera(this.home, ORIGIN);
  }

  /**
   * Turn the view by degrees: `dAzimuthDeg` about the screen's vertical axis, `dElevationDeg` about its horizontal axis,
   * both through the target. Nothing is clamped (M16, D-108): repeated presses carry the view over the pole and on, the way
   * the pointer does, so a crystal can be turned to any orientation.
   */
  rotateView(dAzimuthDeg: number, dElevationDeg: number): void {
    const t = this.target.clone();
    const offset = this.camera.position.clone().sub(t);
    const back = offset.clone().normalize();
    const up = this.camera.up.clone().sub(back.clone().multiplyScalar(this.camera.up.dot(back)));
    if (up.lengthSq() < 1e-12) up.set(0, 0, 1).sub(back.clone().multiplyScalar(back.z));
    up.normalize();
    const right = up.clone().cross(back).normalize();
    const turn = new Quaternion()
      .setFromAxisAngle(up, (-dAzimuthDeg * Math.PI) / 180)
      .multiply(new Quaternion().setFromAxisAngle(right, (-dElevationDeg * Math.PI) / 180));
    offset.applyQuaternion(turn);
    this.camera.up.copy(up.applyQuaternion(turn));
    this.moveCamera(offset.add(t), t);
  }

  /** Multiply the distance to the target; clamped so the view cannot flip through the centre or fly away. */
  zoomView(factor: number): void {
    const t = this.target.clone();
    const offset = this.camera.position.clone().sub(t);
    const home = this.home.length() || 1;
    const r = Math.max(0.25 * home, Math.min(6 * home, (offset.length() || 1) * factor));
    this.moveCamera(offset.setLength(r).add(t), t);
  }

  /** Slide the camera and its target sideways (dx) and up (dy), as fractions of the distance to the target. */
  panView(dx: number, dy: number): void {
    const t = this.target.clone();
    const forward = t.clone().sub(this.camera.position);
    const dist = forward.length() || 1;
    forward.normalize();
    const right = forward.clone().cross(this.camera.up).normalize();
    const up = right.clone().cross(forward).normalize();
    const shift = right.multiplyScalar(dx * dist).add(up.multiplyScalar(dy * dist));
    this.moveCamera(this.camera.position.clone().add(shift), t.add(shift));
  }

  /** Put the camera on the +direction side of the origin (scene coordinates), so the view looks down that axis towards the origin. */
  viewAlong(direction: readonly [number, number, number]): void {
    const d = new Vector3(...direction);
    if (d.lengthSq() === 0) return;
    d.normalize();
    // scene y is physics z (toScene): keep it up unless we look straight along it, then use the scene -z (physics y)
    const up = Math.abs(d.y) > 0.999 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
    this.camera.up.copy(up);
    const r = this.camera.position.distanceTo(this.target) || this.home.length();
    this.moveCamera(d.setLength(r), ORIGIN);
  }

  /** The viewing direction (from the camera to the target), for tests and readouts. */
  get viewDirection(): [number, number, number] {
    const d = this.target.clone().sub(this.camera.position).normalize();
    return [d.x, d.y, d.z];
  }
}
