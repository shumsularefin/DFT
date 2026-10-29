// The one base class for 3D views (D-007). Vanilla Three.js, no React. Renders on demand, pauses when hidden
// or off screen, honours reduced motion, and releases every GPU resource and listener in dispose().
import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  Float32BufferAttribute,
  type Material,
  type Texture,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface RendererLike {
  domElement: HTMLCanvasElement;
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}

export interface ControlsLike {
  enableDamping: boolean;
  update(): unknown;
  dispose(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Everything the controller takes from its environment, so tests need no GPU and no browser. */
export interface Environment {
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'hidden'>;
  matchMedia?: (q: string) => Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;
  ResizeObserver?: new (cb: () => void) => { observe(el: Element): void; disconnect(): void };
  IntersectionObserver?: new (cb: (entries: { isIntersecting: boolean }[]) => void) => {
    observe(el: Element): void;
    disconnect(): void;
  };
  requestAnimationFrame: (cb: (t: number) => void) => number;
  cancelAnimationFrame: (id: number) => void;
  devicePixelRatio: number;
  now: () => number;
}

export interface ControllerOptions {
  createRenderer?: (container: HTMLElement) => RendererLike;
  createControls?: (camera: PerspectiveCamera, canvas: HTMLElement) => ControlsLike;
  env?: Environment;
}

export function browserEnvironment(): Environment {
  return {
    document,
    matchMedia: (q) => matchMedia(q),
    ResizeObserver: globalThis.ResizeObserver,
    IntersectionObserver: globalThis.IntersectionObserver as Environment['IntersectionObserver'],
    requestAnimationFrame: (cb) => requestAnimationFrame(cb),
    cancelAnimationFrame: (id) => cancelAnimationFrame(id),
    devicePixelRatio: globalThis.devicePixelRatio || 1,
    now: () => performance.now(),
  };
}

const SETTLE_MS = 700;

export class SceneController {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(45, 1, 0.1, 1000);
  protected renderer: RendererLike | undefined;
  protected controls: ControlsLike | undefined;

  private readonly env: Environment;
  private dprCap = 2;
  private running = false;
  private disposed = false;
  private frame = 0;
  private animating = false;
  private interacting = false;
  private settleUntil = 0;
  private onScreen = true;
  private reducedMotion = false;
  private lastTime = 0;
  private cleanups: (() => void)[] = [];
  private owned: { dispose(): void }[] = [];
  private labels: { el: HTMLElement; position: Vector3 }[] = [];
  private overlay: HTMLElement | undefined;

  constructor(
    protected readonly container: HTMLElement,
    private readonly options: ControllerOptions = {},
  ) {
    this.env = options.env ?? browserEnvironment();
    this.camera.position.set(4, 3, 6);
    this.camera.lookAt(0, 0, 0);
  }

  get isRunning(): boolean {
    return this.running;
  }
  get isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  /** Create the renderer, attach observers and draw the first frame. Safe to call once. */
  start(): void {
    if (this.running || this.disposed) return;
    if (this.renderer) {
      // resumed after stop(): everything is still attached
      this.running = true;
      this.requestRender();
      return;
    }
    const { env } = this;
    this.renderer = this.options.createRenderer
      ? this.options.createRenderer(this.container)
      : (new WebGLRenderer({ antialias: true, alpha: true }) as unknown as RendererLike);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.renderer.domElement);
    this.overlay = this.container.ownerDocument.createElement('div');
    this.overlay.className = 'scene-labels';
    this.container.appendChild(this.overlay);

    const mq = env.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = mq?.matches ?? false;
    if (mq) {
      const onChange = () => this.applyMotion(mq.matches);
      mq.addEventListener('change', onChange);
      this.cleanups.push(() => mq.removeEventListener('change', onChange));
    }

    this.controls = this.options.createControls
      ? this.options.createControls(this.camera, this.renderer.domElement)
      : (new OrbitControls(this.camera, this.renderer.domElement) as unknown as ControlsLike);
    this.controls.enableDamping = !this.reducedMotion;
    const onChange = () => this.requestRender();
    const onStart = () => (this.interacting = true);
    const onEnd = () => {
      this.interacting = false;
      this.settleUntil = env.now() + SETTLE_MS;
      this.requestRender();
    };
    this.controls.addEventListener('change', onChange);
    this.controls.addEventListener('start', onStart);
    this.controls.addEventListener('end', onEnd);
    this.cleanups.push(() => {
      this.controls?.removeEventListener('change', onChange);
      this.controls?.removeEventListener('start', onStart);
      this.controls?.removeEventListener('end', onEnd);
    });

    const onVisibility = () => this.updateActive();
    env.document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => env.document.removeEventListener('visibilitychange', onVisibility));

    if (env.ResizeObserver) {
      const ro = new env.ResizeObserver(() => this.resize());
      ro.observe(this.container);
      this.cleanups.push(() => ro.disconnect());
    }
    if (env.IntersectionObserver) {
      const io = new env.IntersectionObserver((entries) => {
        this.onScreen = entries.some((e) => e.isIntersecting);
        this.updateActive();
      });
      io.observe(this.container);
      this.cleanups.push(() => io.disconnect());
    }

    this.running = true;
    this.resize();
    this.requestRender();
  }

  /** Stop drawing and release the loop; the scene stays so the view can be started again. */
  stop(): void {
    this.running = false;
    this.cancelFrame();
  }

  setDprCap(cap: number): void {
    this.dprCap = Math.max(1, cap);
    this.resize();
  }

  /** Fit the canvas to the container and redraw. */
  resize(): void {
    if (!this.renderer) return;
    const w = Math.max(1, this.container.clientWidth || 1);
    const h = Math.max(1, this.container.clientHeight || 1);
    this.renderer.setPixelRatio(Math.min(this.env.devicePixelRatio, this.dprCap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Turn continuous animation on or off. With reduced motion it never loops; use step() instead. */
  setAnimating(on: boolean): void {
    this.animating = on;
    if (on) this.requestRender();
  }

  /** One animation step, for reduced motion (a "Step" button) or tests. */
  step(dt = 1 / 30): void {
    this.update(dt);
    this.requestRender();
  }

  /** Override in a subclass to advance the scene. `dt` is in seconds. */
  protected update(dt: number): void {
    void dt;
  }

  /** Ask for one frame. Many calls before the frame fires still draw once. */
  requestRender(): void {
    if (!this.running || this.frame) return;
    this.frame = this.env.requestAnimationFrame((t) => this.tick(t));
  }

  private get wantsLoop(): boolean {
    return (
      (this.animating && !this.reducedMotion) ||
      this.interacting ||
      (this.controls?.enableDamping === true && this.env.now() < this.settleUntil)
    );
  }

  private get active(): boolean {
    return this.running && this.onScreen && !this.env.document.hidden;
  }

  private tick(t: number): void {
    this.frame = 0;
    if (!this.active) return;
    const dt = this.lastTime ? Math.min(0.1, (t - this.lastTime) / 1000) : 0;
    this.lastTime = t;
    if (this.animating && !this.reducedMotion) this.update(dt);
    this.controls?.update();
    this.renderer?.render(this.scene, this.camera);
    this.positionLabels();
    if (this.wantsLoop) this.requestRender();
    else this.lastTime = 0;
  }

  private updateActive(): void {
    if (this.active) this.requestRender();
    else this.cancelFrame();
  }

  private applyMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (this.controls) this.controls.enableDamping = !reduced;
    if (reduced) this.animating = false;
    this.requestRender();
  }

  private cancelFrame(): void {
    if (this.frame) this.env.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastTime = 0;
  }

  /* Helpers. Everything created here is released by dispose(). */

  addLights(): void {
    const ambient = new AmbientLight(0xffffff, 0.8);
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 8, 6);
    this.scene.add(ambient, sun);
  }

  /** One draw call for many spheres. */
  addInstancedSpheres(
    positions: readonly [number, number, number][],
    radius: number,
    color: number | string,
  ): InstancedMesh {
    const geometry = new SphereGeometry(radius, 20, 14);
    const material = new MeshStandardMaterial({ color: new Color(color), roughness: 0.5 });
    const mesh = new InstancedMesh(geometry, material, positions.length);
    const m = new Matrix4();
    positions.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    return mesh;
  }

  /** Line segments from a flat list of point pairs. */
  addLineSegments(
    pairs: readonly [[number, number, number], [number, number, number]][],
    color: number | string,
  ): LineSegments {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(pairs.flat(2), 3));
    const lines = new LineSegments(geometry, new LineBasicMaterial({ color: new Color(color) }));
    this.scene.add(lines);
    return lines;
  }

  /** An open polyline, for example a path. */
  addLine(points: readonly [number, number, number][], color: number | string): Line {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points.flat(), 3));
    const line = new Line(geometry, new LineBasicMaterial({ color: new Color(color) }));
    this.scene.add(line);
    return line;
  }

  /** Text label as a real HTML element placed over the canvas by projection: selectable and readable by screen readers. */
  addLabel(text: string, position: [number, number, number]): HTMLElement {
    const el = this.container.ownerDocument.createElement('span');
    el.className = 'scene-label';
    el.textContent = text;
    this.overlay?.appendChild(el);
    this.labels.push({ el, position: new Vector3(...position) });
    return el;
  }

  /** Register a disposable (geometry, material, texture, controls) so dispose() releases it. */
  own<T extends { dispose(): void }>(thing: T): T {
    this.owned.push(thing);
    return thing;
  }

  private positionLabels(): void {
    if (!this.labels.length) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = new Vector3();
    for (const { el, position } of this.labels) {
      v.copy(position).project(this.camera);
      const visible = v.z < 1;
      el.style.display = visible ? '' : 'none';
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  }

  /** Release listeners, observers, GPU resources and the canvas. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    for (const c of this.cleanups.splice(0)) c();
    this.controls?.dispose();
    this.controls = undefined;
    disposeObject(this.scene);
    for (const o of this.owned.splice(0)) o.dispose();
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.overlay?.remove();
    this.labels = [];
    this.renderer = undefined;
  }
}

/** Dispose geometries, materials and the textures they hold for everything under `root`. */
export function disposeObject(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    mesh.geometry?.dispose();
    const mats: Material[] = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of mats) {
      for (const value of Object.values(m))
        if ((value as Texture | undefined)?.isTexture) (value as Texture).dispose();
      m.dispose();
    }
    (obj as InstancedMesh).dispose?.();
  });
}
