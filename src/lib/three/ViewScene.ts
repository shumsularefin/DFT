// Shared view behaviour of the Brillouin-zone and unit-cell scenes (M5.5): orbit about the origin, preset views, and the
// keyboard (arrow keys rotate, + and - zoom, R resets). The canvas is hidden from assistive technology (it is a picture),
// so the focusable container carries the instructions, and the labels and readouts carry the content.
// Nothing animates by itself: views change instantly, so reduced motion needs no special case.
import { Vector3 } from 'three';
import { SceneController, type ControllerOptions } from './SceneController';

const STEP_DEG = 5;
const ZOOM_STEP = 1.15;

export class ViewScene extends SceneController {
  private home = new Vector3(4, 3, 4);
  private keyHandler: ((e: KeyboardEvent) => void) | undefined;

  constructor(container: HTMLElement, options?: ControllerOptions) {
    super(container, options);
  }

  override start(): void {
    const first = !this.keyHandler;
    super.start();
    if (first && this.isRunning) this.attachKeyboard();
  }

  override dispose(): void {
    if (this.keyHandler) this.container.removeEventListener('keydown', this.keyHandler as EventListener);
    this.keyHandler = undefined;
    super.dispose();
  }

  private attachKeyboard(): void {
    const c = this.container;
    c.setAttribute('tabindex', '0');
    c.setAttribute('role', 'group');
    c.setAttribute(
      'aria-label',
      '3D view. Arrow keys rotate, plus and minus zoom, R resets the view. The names of the points are listed as text on the page.',
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
    this.moveCamera(position);
  }

  private moveCamera(p: Vector3): void {
    this.camera.position.copy(p);
    const target = (this.controls as unknown as { target?: Vector3 } | undefined)?.target;
    target?.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
    this.controls?.update();
    // read by tests and by anyone inspecting the page: the camera position in scene units
    this.container.setAttribute('data-camera', [p.x, p.y, p.z].map((x) => x.toFixed(3)).join(' '));
    this.requestRender();
  }

  resetView(): void {
    this.moveCamera(this.home);
  }

  /** Turn about the vertical axis (azimuth) and the horizontal one (elevation), in degrees. Elevation stops short of the poles. */
  rotateView(dAzimuthDeg: number, dElevationDeg: number): void {
    const p = this.camera.position.clone();
    const r = p.length() || 1;
    let az = Math.atan2(p.x, p.z) + (dAzimuthDeg * Math.PI) / 180;
    let el = Math.asin(Math.max(-1, Math.min(1, p.y / r))) + (dElevationDeg * Math.PI) / 180;
    const limit = (89 * Math.PI) / 180;
    el = Math.max(-limit, Math.min(limit, el));
    az = Math.atan2(Math.sin(az), Math.cos(az));
    this.moveCamera(
      new Vector3(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az)),
    );
  }

  /** Multiply the distance to the origin; clamped so the view cannot flip through the centre or fly away. */
  zoomView(factor: number): void {
    const home = this.home.length() || 1;
    const r = Math.max(0.25 * home, Math.min(6 * home, (this.camera.position.length() || 1) * factor));
    this.moveCamera(this.camera.position.clone().setLength(r));
  }

  /** Put the camera on the +direction side of the origin (scene coordinates), so the view looks down that axis towards the origin. */
  viewAlong(direction: readonly [number, number, number]): void {
    const d = new Vector3(...direction);
    if (d.lengthSq() === 0) return;
    // looking straight along the vertical would make "up" undefined; stay a hair off the pole
    if (Math.abs(d.clone().normalize().y) > 0.9999) d.add(new Vector3(0, 0, 1e-3 * Math.sign(d.y || 1)));
    const r = this.camera.position.length() || this.home.length();
    this.moveCamera(d.setLength(r));
  }

  /** The viewing direction (from the camera to the origin), for tests and readouts. */
  get viewDirection(): [number, number, number] {
    const d = this.camera.position.clone().negate().normalize();
    return [d.x, d.y, d.z];
  }
}
