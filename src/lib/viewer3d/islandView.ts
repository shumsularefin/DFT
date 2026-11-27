// The live 3D view of the React islands (M16.4, D-121): the Scene island and the guided path mount the shared engine
// (Viewer3D) through this one small wrapper, so they turn, zoom, pan, roll and reset exactly like the topic stage. Vanilla
// DOM, loaded lazily with three.js when a view goes live, never with the page.
// The wrapper owns the focusable view element (role group, key map in its label, the arrow keys and R), and writes the
// camera readout the e2e tests and the page read: `data-camera` is the eye position and `data-target` the point the view
// turns about, both "x y z" with three decimals. In orthographic projection the eye sits at the apparent distance (the
// distance a perspective camera would need for the same picture), so zooming changes the readout in both projections.
import { position, type CameraState } from './arcball';
import type { CameraSpec, SceneFrame } from './types';
import { Viewer3D, type PickResult, type Viewer3DOptions } from './Viewer3D';

export { loadScene } from './scenes/index';
export { cameraOfPreset, frameFromResolved } from './fromSceneSpec';
export { withDefaults } from './types';

export const VIEW_LABEL =
  '3D view. Arrow keys rotate, plus and minus zoom, W A S D move, Q and E roll, P switches perspective and flat projection, R resets the view. Drag to turn it any way, scroll to zoom, Shift-drag to move, right-drag to roll. The text description says what it shows.';

const ROTATE_DEG = 5;
const ZOOM_STEP = 1.15;
const PAN_STEP = 0.05;

/** "x y z" with three decimals and no negative zero (a reset must read the same as the first view). */
export const fmt3 = (p: readonly number[]): string =>
  p.map((x) => (Math.abs(x) < 5e-4 ? 0 : x).toFixed(3)).join(' ');

/** The eye of a camera state moved to `dist` along its own view line. */
export function eyeAt(s: CameraState, dist: number): [number, number, number] {
  return position({ ...s, dist });
}

export interface IslandViewOptions {
  /** Called with a one-line reading of what a click picked (empty when nothing). */
  onPick?: (text: string) => void;
  /** Called after every camera change. */
  onCamera?: () => void;
  /** Engine options (Node tests inject a renderer and an environment). */
  viewer?: Viewer3DOptions;
}

export class IslandView {
  readonly viewer: Viewer3D;
  private cleanups: (() => void)[] = [];
  private labelled = false;

  constructor(
    private readonly view: HTMLElement,
    host: HTMLElement,
    private readonly options: IslandViewOptions = {},
  ) {
    this.viewer = new Viewer3D(host, options.viewer);
    this.viewer.onCamera = () => {
      this.write();
      this.options.onCamera?.();
    };
  }

  start(): void {
    this.viewer.start();
    this.wireKeys();
    this.wirePick();
  }

  /** The readout of the current camera, in physics coordinates. */
  private write(): void {
    const s = this.viewer.state;
    this.view.setAttribute('data-camera', fmt3(eyeAt(s, this.viewer.apparentDistance)));
    this.view.setAttribute('data-target', fmt3(s.target));
    this.view.setAttribute('data-projection', this.viewer.isOrtho ? 'orthographic' : 'perspective');
  }

  /**
   * Draw a frame. `camera`: true resets to the frame's own camera and projection, false keeps the view (a new step of the
   * same picture), a camera spec moves there without a tween.
   */
  show(frame: SceneFrame, camera: boolean | CameraSpec = true): void {
    if (camera === true) {
      // a frame that names no projection is drawn in perspective, whatever the previous frame asked for
      if (frame.ortho === undefined) this.viewer.setOrtho(false);
      this.viewer.setFrame(frame, null, true);
    } else if (camera === false) this.viewer.setFrame(frame, null, false);
    else {
      this.viewer.setFrame(frame, null, false);
      this.viewer.setOrtho(frame.ortho ?? false);
      this.viewer.goTo(camera, false);
    }
    this.write();
    // the view becomes a focusable, labelled group only once it is live and has a camera to report
    if (!this.labelled) {
      this.labelled = true;
      this.view.setAttribute('tabindex', '0');
      this.view.setAttribute('role', 'group');
      this.view.setAttribute('aria-roledescription', '3D view');
      this.view.setAttribute('aria-label', VIEW_LABEL);
    }
  }

  goTo(spec: CameraSpec, animate = true): void {
    this.viewer.goTo(spec, animate);
  }
  zoom(factor: number): void {
    this.viewer.zoom(factor);
  }
  /** Back to the last requested view, without a tween, so a reset reads exactly as the view did. */
  reset(): void {
    this.viewer.reset(false);
  }

  private wireKeys(): void {
    const v = this.viewer;
    const fn = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.shiftKey ? 3 * ROTATE_DEG : ROTATE_DEG;
      switch (e.key) {
        case 'ArrowLeft':
          v.rotate(-step, 0);
          break;
        case 'ArrowRight':
          v.rotate(step, 0);
          break;
        case 'ArrowUp':
          v.rotate(0, step);
          break;
        case 'ArrowDown':
          v.rotate(0, -step);
          break;
        case '+':
        case '=':
          v.zoom(1 / ZOOM_STEP);
          break;
        case '-':
        case '_':
          v.zoom(ZOOM_STEP);
          break;
        case 'w':
        case 'W':
          v.pan(0, -PAN_STEP);
          break;
        case 's':
        case 'S':
          v.pan(0, PAN_STEP);
          break;
        case 'a':
        case 'A':
          v.pan(-PAN_STEP, 0);
          break;
        case 'd':
        case 'D':
          v.pan(PAN_STEP, 0);
          break;
        case 'q':
        case 'Q':
          v.roll(-step);
          break;
        case 'e':
        case 'E':
          v.roll(step);
          break;
        case 'p':
        case 'P':
          v.setOrtho(!v.isOrtho);
          break;
        case 'r':
        case 'R':
          this.reset();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    this.view.addEventListener('keydown', fn);
    this.cleanups.push(() => this.view.removeEventListener('keydown', fn));
  }

  /** A click that did not drag reads what is under the pointer and outlines a picked atom. */
  private wirePick(): void {
    const onPick = this.options.onPick;
    if (!onPick) return;
    let down: { x: number; y: number } | null = null;
    const press = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const release = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      const hit = this.viewer.pick(e.clientX, e.clientY);
      onPick(pickText(hit));
      this.viewer.setHighlight(hit?.kind === 'atoms' ? [`${hit.group}:${hit.index}`] : []);
    };
    this.view.addEventListener('pointerdown', press);
    this.view.addEventListener('pointerup', release);
    this.cleanups.push(() => {
      this.view.removeEventListener('pointerdown', press);
      this.view.removeEventListener('pointerup', release);
    });
  }

  dispose(): void {
    for (const c of this.cleanups.splice(0)) c();
    this.viewer.dispose();
    for (const a of ['tabindex', 'role', 'aria-roledescription', 'aria-label']) this.view.removeAttribute(a);
    this.labelled = false;
  }
}

/** One line for a pick: the item's label and where it is, or a value at a point. */
export function pickText(hit: PickResult | null): string {
  if (!hit) return '';
  const at = hit.position.map((x) => x.toFixed(2)).join(', ');
  return hit.value !== undefined
    ? `Value ${hit.value.toPrecision(3)} at (${at}).`
    : `${hit.label} at (${at}).`;
}
