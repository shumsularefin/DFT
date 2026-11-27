// The shared 3D engine (M16.1, D-108): one renderer, one scene, the plain-data layers of `types.ts`, a free arcball camera
// (perspective or orthographic), render on demand, picking, HTML labels, theme colours, context-loss recovery and a full
// dispose(). Used by the topic stage, the learn path and the Scene island. Physics coordinates, z up.
import {
  AmbientLight,
  BackSide,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Camera,
  type Material,
} from 'three';
import { browserEnvironment, type Environment } from '../three/SceneController';
import { cameraFrom, cameraKey, interpolate, type CameraState } from './arcball';
import { ArcballControls } from './controls';
import { frameBounds } from './kit';
import { RenderLoop } from './loop';
import { rotate, type Vec3 } from './math';
import { colormap, resolveColor, type Theme } from './palette3d';
import type { CameraSpec, Color as Tone, Layer, SceneFrame } from './types';
import { cameraForSpec, ISO_EYE } from './viewSpec';
import { directionView, planeNormalView } from './views';

export { cameraForSpec };

export const FOV = 35;
const TWEEN_MS = 400;

export interface PickResult {
  group: string;
  kind: Layer['kind'];
  index: number;
  label: string;
  position: Vec3;
  /** Interpolated value of a colour-mapped mesh at the hit point. */
  value?: number;
}

export interface Viewer3DOptions {
  env?: Environment;
  /** For Node tests: a renderer with the same small surface as WebGLRenderer. */
  createRenderer?: () => {
    domElement: HTMLCanvasElement;
    setPixelRatio(r: number): void;
    setSize(w: number, h: number, s?: boolean): void;
    render(s: Scene, c: Camera): void;
    dispose(): void;
    info?: { memory: { geometries: number; textures: number }; render: { calls: number; triangles: number } };
  };
  /** Theme reader; default looks at the page. */
  theme?: () => Theme;
}

function pageTheme(el: HTMLElement): Theme {
  const doc = el.ownerDocument;
  const attr = doc.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  return doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface Built {
  root: Group;
  groups: Map<string, Object3D[]>;
  labels: { el: HTMLElement; at: Vector3; group: string }[];
  pickables: Object3D[];
}

export class Viewer3D {
  readonly scene = new Scene();
  readonly persp = new PerspectiveCamera(FOV, 1, 0.01, 1000);
  readonly ortho = new OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  private renderer: ReturnType<NonNullable<Viewer3DOptions['createRenderer']>> | undefined;
  private controls: ArcballControls | undefined;
  private loop: RenderLoop;
  private env: Environment;
  private overlay: HTMLElement | undefined;
  private built: Built | undefined;
  private frame: SceneFrame | undefined;
  private visible: Set<string> | null = null;
  private home: CameraState = cameraFrom(ISO_EYE, [0, 0, 0], 10);
  private bounds = { center: [0, 0, 0] as Vec3, radius: 5 };
  private orthoHalf = 5;
  private useOrtho = false;
  private tween:
    { from: CameraState; to: CameraState; t0: number; fromHalf: number; toHalf: number } | undefined;
  private reducedMotion = false;
  private onScreen = true;
  private cleanups: (() => void)[] = [];
  private disposed = false;
  private highlighted = new Set<string>();
  private themeOf: () => Theme;
  private lastTheme: Theme = 'light';
  /** Called after every camera change (the stage updates its readout and data attributes). */
  onCamera: ((s: CameraState) => void) | undefined;
  /** Called when the WebGL context is lost for good (the stage falls back to the poster). */
  onContextLost: (() => void) | undefined;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: Viewer3DOptions = {},
  ) {
    this.env = options.env ?? browserEnvironment();
    this.themeOf = options.theme ?? (() => pageTheme(container));
    this.loop = new RenderLoop(
      {
        request: (cb) => this.env.requestAnimationFrame(cb),
        cancel: (id) => this.env.cancelAnimationFrame(id),
      },
      (dt) => this.draw(dt),
    );
  }

  get frames(): number {
    return this.loop.frames;
  }
  get camera(): Camera {
    return this.useOrtho ? this.ortho : this.persp;
  }
  get isOrtho(): boolean {
    return this.useOrtho;
  }
  get state(): CameraState {
    return this.controls?.state ?? this.home;
  }
  get info() {
    return this.renderer?.info;
  }

  /** Create the renderer and attach input and observers. */
  start(): void {
    if (this.renderer || this.disposed) return;
    const r = this.options.createRenderer
      ? this.options.createRenderer()
      : (new WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'low-power',
        }) as unknown as NonNullable<ReturnType<NonNullable<Viewer3DOptions['createRenderer']>>>);
    this.renderer = r;
    const canvas = r.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.classList.add('v3d-canvas');
    this.container.appendChild(canvas);
    const doc = this.container.ownerDocument;
    this.overlay = doc.createElement('div');
    this.overlay.className = 'v3d-labels';
    this.overlay.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.overlay);

    const head = new DirectionalLight(0xffffff, 1.7);
    head.position.set(0.6, 1, 2);
    const head2 = head.clone();
    this.persp.add(head);
    this.ortho.add(head2);
    this.scene.add(new AmbientLight(0xffffff, 1.15), this.persp, this.ortho);

    this.controls = new ArcballControls(this.persp, canvas, () => new Vector3());
    this.controls.onOrthoZoom = undefined;
    this.controls.addEventListener('change', () => this.changed());
    this.controls.addEventListener('start', () => (this.tween = undefined));
    this.controls.addEventListener('end', () => this.loop.invalidate());

    const env = this.env;
    const mq = env.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.setReducedMotion(mq?.matches ?? false);
    if (mq) {
      const fn = () => this.setReducedMotion(mq.matches);
      mq.addEventListener('change', fn);
      this.cleanups.push(() => mq.removeEventListener('change', fn));
    }
    const vis = () => this.updateActive();
    env.document.addEventListener('visibilitychange', vis);
    this.cleanups.push(() => env.document.removeEventListener('visibilitychange', vis));
    if (env.ResizeObserver) {
      const ro = new env.ResizeObserver(() => this.resize());
      ro.observe(this.container);
      this.cleanups.push(() => ro.disconnect());
    }
    if (env.IntersectionObserver) {
      const io = new env.IntersectionObserver((es) => {
        this.onScreen = es.some((e) => e.isIntersecting);
        this.updateActive();
      });
      io.observe(this.container);
      this.cleanups.push(() => io.disconnect());
    }
    const lost = (e: Event) => {
      e.preventDefault();
      this.loop.pause();
    };
    const restored = () => {
      this.loop.resume();
      if (this.frame) this.setFrame(this.frame, this.visible ? [...this.visible] : null, false);
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    this.cleanups.push(() => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    });
    const win = doc.defaultView;
    if (win && 'MutationObserver' in win) {
      const mo = new win.MutationObserver(() => this.retheme());
      mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
      this.cleanups.push(() => mo.disconnect());
      const dark = win.matchMedia?.('(prefers-color-scheme: dark)');
      if (dark) {
        const fn = () => this.retheme();
        dark.addEventListener('change', fn);
        this.cleanups.push(() => dark.removeEventListener('change', fn));
      }
    }
    this.resize();
  }

  private setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    if (this.controls) this.controls.enableDamping = !on;
    if (on) this.tween = undefined;
  }

  get isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  private updateActive(): void {
    if (this.onScreen && !this.env.document.hidden) this.loop.resume();
    else this.loop.pause();
  }

  resize(): void {
    if (!this.renderer) return;
    const w = Math.max(1, this.container.clientWidth || 1);
    const h = Math.max(1, this.container.clientHeight || 1);
    this.renderer.setPixelRatio(Math.min(this.env.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.updateOrtho();
    this.loop.invalidate();
  }

  private get aspect(): number {
    return this.persp.aspect || 1;
  }

  private updateOrtho(): void {
    const a = this.aspect;
    this.ortho.left = -this.orthoHalf * a;
    this.ortho.right = this.orthoHalf * a;
    this.ortho.top = this.orthoHalf;
    this.ortho.bottom = -this.orthoHalf;
    this.ortho.updateProjectionMatrix();
    if (this.controls && this.useOrtho) {
      // pan and zoom speeds of the arcball use a field of view; give it the one that matches the orthographic frustum
      const d = this.state.dist;
      this.persp.fov = (2 * Math.atan(this.orthoHalf / d) * 180) / Math.PI;
    }
  }

  private changed(): void {
    this.syncOrtho();
    const s = this.state;
    this.container.setAttribute('data-camera', cameraKey(s));
    this.onCamera?.(s);
    this.loop.invalidate();
  }

  private syncOrtho(): void {
    this.ortho.position.copy(this.persp.position);
    this.ortho.quaternion.copy(this.persp.quaternion);
    this.ortho.up.copy(this.persp.up);
    const d = this.state.dist;
    const R = this.bounds.radius;
    for (const c of [this.persp, this.ortho] as (PerspectiveCamera | OrthographicCamera)[]) {
      c.near = Math.max(1e-3, Math.min(d * 0.02, Math.max(1e-3, d - 4 * R)));
      c.far = d + 8 * R + 10;
    }
    this.persp.updateProjectionMatrix();
    this.ortho.updateProjectionMatrix();
  }

  /** Perspective or orthographic projection. Orthographic keeps the apparent size of the current view. */
  setOrtho(on: boolean): void {
    if (on === this.useOrtho) return;
    const d = this.state.dist;
    if (on) {
      this.orthoHalf = d * Math.tan((FOV * Math.PI) / 360);
      this.useOrtho = true;
      if (this.controls)
        this.controls.onOrthoZoom = (f, ndc) => {
          const half = Math.max(
            this.bounds.radius * 0.02,
            Math.min(this.bounds.radius * 30, this.orthoHalf * f),
          );
          const k = half / this.orthoHalf;
          const s = this.state;
          const right = rotate(s.q, [1, 0, 0]);
          const up = rotate(s.q, [0, 1, 0]);
          const off = [0, 1, 2].map(
            (i) => right[i]! * ndc[0] * this.orthoHalf * this.aspect + up[i]! * ndc[1] * this.orthoHalf,
          );
          this.orthoHalf = half;
          this.controls!.apply({ ...s, target: s.target.map((t, i) => t + off[i]! * (1 - k)) as Vec3 });
          this.updateOrtho();
        };
    } else {
      this.useOrtho = false;
      this.persp.fov = FOV;
      // keep the apparent size: move the camera to the distance whose perspective view is as wide
      const dist = this.orthoHalf / Math.tan((FOV * Math.PI) / 360);
      if (this.controls) {
        this.controls.onOrthoZoom = undefined;
        this.controls.apply({ ...this.state, dist });
      }
    }
    this.updateOrtho();
    this.container.setAttribute('data-projection', on ? 'orthographic' : 'perspective');
    this.changed();
  }

  /** Show a frame. `groups` limits the visible layer groups (null: all). `cameraSpec` moves the camera (undefined: keep). */
  setFrame(
    frame: SceneFrame,
    groups: string[] | null = null,
    resetCamera: boolean | CameraSpec = true,
  ): void {
    if (!this.renderer) this.start();
    const theme = this.themeOf();
    this.lastTheme = theme;
    this.clearBuilt();
    this.frame = frame;
    this.built = buildLayers(frame.layers, theme, this.container.ownerDocument, this.highlighted);
    this.scene.add(this.built.root);
    for (const l of this.built.labels) this.overlay?.appendChild(l.el);
    this.setGroups(groups);
    const b = frame.bounds ?? frameBounds(frame.layers);
    this.bounds = { center: [...b.center] as Vec3, radius: Math.max(b.radius, 1e-3) };
    if (this.controls) {
      this.controls.minDistance = this.bounds.radius * 0.05;
      this.controls.maxDistance = this.bounds.radius * 40;
    }
    if (resetCamera !== false) {
      const spec = resetCamera === true ? frame.camera : resetCamera;
      if (frame.ortho !== undefined && resetCamera === true) this.setOrtho(frame.ortho);
      this.goTo(spec, false);
    } else this.syncOrtho();
    this.loop.invalidate();
  }

  /** The camera a spec asks for, framed on the current bounds. */
  stateFor(spec: CameraSpec | undefined): CameraState {
    const { eye, up, zoom } = cameraForSpec(spec, this.frame ?? {});
    const dist = ((this.bounds.radius / Math.sin((FOV * Math.PI) / 360)) * 1.04) / zoom;
    return cameraFrom(eye, this.bounds.center, dist, up);
  }

  /** Move to a camera spec; tweened unless reduced motion (or `animate` is false). Also sets the reset view. */
  goTo(spec: CameraSpec | undefined, animate = true): void {
    const to = this.stateFor(spec);
    this.home = to;
    this.moveTo(to, animate);
  }

  /** View along a lattice direction [uvw] or the normal of (hkl). Returns false when the frame has no lattice. */
  viewIndices(kind: 'direction' | 'plane', idx: [number, number, number]): boolean {
    const l = this.frame?.lattice;
    if (!l) return false;
    const v = kind === 'direction' ? directionView(idx, l) : planeNormalView(idx, l);
    if (!v) return false;
    this.moveTo(cameraFrom(v.eye, this.bounds.center, this.state.dist, v.up), true);
    return true;
  }

  get hasLattice(): boolean {
    return !!this.frame?.lattice;
  }

  private moveTo(to: CameraState, animate: boolean): void {
    const halfTo = to.dist * Math.tan((FOV * Math.PI) / 360);
    if (!this.controls) {
      this.home = to;
      return;
    }
    this.controls.stopCoasting();
    if (animate && !this.reducedMotion) {
      this.tween = { from: this.state, to, t0: this.env.now(), fromHalf: this.orthoHalf, toHalf: halfTo };
      this.loop.invalidate();
    } else {
      this.tween = undefined;
      if (this.useOrtho) this.orthoHalf = halfTo;
      this.controls.apply(to);
      this.updateOrtho();
    }
  }

  reset(animate = true): void {
    this.moveTo(this.home, animate);
  }

  rotate(yawDeg: number, pitchDeg: number): void {
    this.controls?.rotateDegrees(yawDeg, pitchDeg);
  }
  roll(deg: number): void {
    this.controls?.rollDegrees(deg);
  }
  zoom(factor: number): void {
    this.controls?.zoomBy(factor);
  }
  pan(dxFrac: number, dyFrac: number): void {
    const h = this.container.clientHeight || 400;
    this.controls?.panBy(dxFrac * h, dyFrac * h);
  }

  setGroups(groups: string[] | null): void {
    this.visible = groups ? new Set(groups) : null;
    if (!this.built) return;
    for (const [g, objs] of this.built.groups) for (const o of objs) o.visible = this.isVisible(g);
    this.loop.invalidate();
  }

  isVisible(group: string): boolean {
    return !this.visible || this.visible.has(group);
  }

  /** Layer groups of the current frame with their names, in drawing order. */
  get groupList(): { id: string; name: string }[] {
    const out = new Map<string, string>();
    for (const l of this.frame?.layers ?? []) if (!out.has(l.group)) out.set(l.group, l.name ?? l.group);
    return [...out].map(([id, name]) => ({ id, name }));
  }

  /** Atoms or points to draw with an outline shell, by "group:index". Rebuilds the current frame. */
  setHighlight(keys: string[]): void {
    this.highlighted = new Set(keys);
    if (this.frame) this.setFrame(this.frame, this.visible ? [...this.visible] : null, false);
  }

  private retheme(): void {
    if (this.frame && this.themeOf() !== this.lastTheme)
      this.setFrame(this.frame, this.visible ? [...this.visible] : null, false);
  }

  /** What is under the screen point (client pixels): an atom, a point, a mesh value. */
  pick(clientX: number, clientY: number): PickResult | null {
    if (!this.built || !this.renderer) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    const ray = new Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(
      this.built.pickables.filter((o) => o.visible && o.parent?.visible !== false),
      false,
    );
    for (const h of hits) {
      const info = h.object.userData as {
        group: string;
        kind: Layer['kind'];
        indices?: number[];
        labels?: string[];
        values?: number[];
        positions?: Vec3[];
      };
      if (h.instanceId !== undefined && info.indices) {
        const index = info.indices[h.instanceId]!;
        return {
          group: info.group,
          kind: info.kind,
          index,
          label: info.labels?.[index] ?? `${info.kind} ${index + 1}`,
          position: info.positions![index]!,
        };
      }
      if (info.kind === 'mesh' && info.values && h.face) {
        const { a, b, c } = h.face;
        const bary = h.barycoord ?? new Vector3(1 / 3, 1 / 3, 1 / 3);
        const value = info.values[a]! * bary.x + info.values[b]! * bary.y + info.values[c]! * bary.z;
        return {
          group: info.group,
          kind: 'mesh',
          index: h.faceIndex ?? 0,
          label: '',
          position: [h.point.x, h.point.y, h.point.z],
          value,
        };
      }
    }
    return null;
  }

  /** Ask for a redraw (after an outside change). */
  invalidate(): void {
    this.loop.invalidate();
  }

  private draw(dt: number): boolean {
    if (!this.renderer || !this.controls) return false;
    let more = false;
    if (this.tween) {
      const k = Math.min(1, (this.env.now() - this.tween.t0) / TWEEN_MS);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      if (this.useOrtho) this.orthoHalf = this.tween.fromHalf + (this.tween.toHalf - this.tween.fromHalf) * e;
      this.controls.apply(interpolate(this.tween.from, this.tween.to, e));
      this.updateOrtho();
      if (k >= 1) this.tween = undefined;
      else more = true;
    } else if (this.controls.coasting(dt)) more = true;
    this.syncOrtho();
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
    this.container.setAttribute('data-frames', String(this.loop.frames));
    return more;
  }

  private placeLabels(): void {
    if (!this.built?.labels.length) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = new Vector3();
    for (const l of this.built.labels) {
      if (!this.isVisible(l.group)) {
        l.el.style.display = 'none';
        continue;
      }
      v.copy(l.at).project(this.camera);
      const show = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      l.el.style.display = show ? '' : 'none';
      if (show)
        l.el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  }

  private clearBuilt(): void {
    if (!this.built) return;
    this.scene.remove(this.built.root);
    disposeTree(this.built.root);
    for (const l of this.built.labels) l.el.remove();
    this.built = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.dispose();
    for (const c of this.cleanups.splice(0)) c();
    this.clearBuilt();
    this.controls?.dispose();
    this.controls = undefined;
    disposeTree(this.scene);
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.overlay?.remove();
    this.renderer = undefined;
  }
}

/* Layer builders. Everything is created inside one Group so dispose is one traversal. */

const sphereGeo = (detail: 'high' | 'low') =>
  detail === 'high' ? new SphereGeometry(1, 28, 18) : new SphereGeometry(1, 14, 10);
const Y = new Vector3(0, 1, 0);

function segmentMatrix(a: Vec3, b: Vec3, r: number, m = new Matrix4()): Matrix4 {
  const va = new Vector3(...a);
  const d = new Vector3(...b).sub(va);
  const len = d.length() || 1e-9;
  const q = new Quaternion().setFromUnitVectors(Y, d.clone().divideScalar(len));
  return m.compose(va.add(d.multiplyScalar(0.5)), q, new Vector3(r, len, r));
}

function std(color: string, opacity = 1, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: new Color(color), roughness: 0.45, metalness: 0.05 });
  if (opacity < 1) {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
  }
  Object.assign(m, extra);
  return m;
}

function byColor<T>(
  n: number,
  color: Tone | Tone[],
  theme: Theme,
  f: (hex: string, idx: number[]) => T,
): T[] {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const hex = resolveColor(Array.isArray(color) ? (color[i] ?? color[0]!) : color, theme);
    if (!groups.has(hex)) groups.set(hex, []);
    groups.get(hex)!.push(i);
  }
  return [...groups].map(([hex, idx]) => f(hex, idx));
}

export function buildLayers(
  layers: readonly Layer[],
  theme: Theme,
  doc: Document,
  highlighted: Set<string> = new Set(),
): Built {
  const root = new Group();
  const groups = new Map<string, Object3D[]>();
  const labels: Built['labels'] = [];
  const pickables: Object3D[] = [];
  const add = (group: string, o: Object3D) => {
    root.add(o);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(o);
  };
  const m = new Matrix4();
  const ink = resolveColor('ink', theme);
  for (const l of layers) {
    switch (l.kind) {
      case 'atoms': {
        const n = l.positions.length;
        const detail = n > 400 ? 'low' : 'high';
        const radius = (i: number) => (typeof l.radius === 'number' ? l.radius : (l.radius[i] ?? 0.3));
        for (const mesh of byColor(n, l.color, theme, (hex, idx) => {
          const im = new InstancedMesh(sphereGeo(detail), std(hex, l.opacity ?? 1), idx.length);
          idx.forEach((i, k) => {
            const r = radius(i);
            im.setMatrixAt(
              k,
              m.compose(new Vector3(...l.positions[i]!), new Quaternion(), new Vector3(r, r, r)),
            );
          });
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          im.userData = {
            group: l.group,
            kind: 'atoms',
            indices: idx,
            labels: l.labels,
            positions: l.positions,
          };
          pickables.push(im);
          return im;
        }))
          add(l.group, mesh);
        const hi = [
          ...(l.highlight ?? []),
          ...[...highlighted].filter((k) => k.startsWith(`${l.group}:`)).map((k) => Number(k.split(':')[1])),
        ].filter((i) => i >= 0 && i < n);
        if (hi.length) {
          const shell = new InstancedMesh(
            sphereGeo('low'),
            new MeshBasicMaterial({ color: new Color(ink), side: BackSide }),
            hi.length,
          );
          hi.forEach((i, k) => {
            const r = radius(i) * 1.22;
            shell.setMatrixAt(
              k,
              m.compose(new Vector3(...l.positions[i]!), new Quaternion(), new Vector3(r, r, r)),
            );
          });
          shell.instanceMatrix.needsUpdate = true;
          add(l.group, shell);
        }
        break;
      }
      case 'points': {
        const n = l.positions.length;
        for (const mesh of byColor(n, l.color, theme, (hex, idx) => {
          const im = new InstancedMesh(new IcosahedronGeometry(1, n > 1500 ? 0 : 1), std(hex), idx.length);
          idx.forEach((i, k) =>
            im.setMatrixAt(
              k,
              m.compose(
                new Vector3(...l.positions[i]!),
                new Quaternion(),
                new Vector3(l.size, l.size, l.size),
              ),
            ),
          );
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          im.userData = {
            group: l.group,
            kind: 'points',
            indices: idx,
            labels: l.labels,
            positions: l.positions,
          };
          if (l.labels) pickables.push(im);
          return im;
        }))
          add(l.group, mesh);
        break;
      }
      case 'lines': {
        const hex = resolveColor(l.color, theme);
        if (l.tube) {
          const im = new InstancedMesh(
            new CylinderGeometry(1, 1, 1, 10, 1, true),
            std(hex),
            l.segments.length,
          );
          l.segments.forEach(([a, b], k) => im.setMatrixAt(k, segmentMatrix(a, b, l.tube!, m)));
          im.instanceMatrix.needsUpdate = true;
          add(l.group, im);
        } else {
          const g = new BufferGeometry();
          g.setAttribute(
            'position',
            new Float32BufferAttribute(
              l.segments.flatMap(([a, b]) => [...a, ...b]),
              3,
            ),
          );
          const mat = l.dashed
            ? new LineDashedMaterial({ color: new Color(hex), dashSize: 0.18, gapSize: 0.12 })
            : new LineBasicMaterial({ color: new Color(hex) });
          const seg = new LineSegments(g, mat);
          if (l.dashed) seg.computeLineDistances();
          add(l.group, seg);
        }
        break;
      }
      case 'curve': {
        const hex = resolveColor(l.color, theme);
        const pts = l.closed ? [...l.points, l.points[0]!] : l.points;
        if (l.tube) {
          const im = new InstancedMesh(new CylinderGeometry(1, 1, 1, 8, 1, true), std(hex), pts.length - 1);
          for (let k = 0; k + 1 < pts.length; k++)
            im.setMatrixAt(k, segmentMatrix(pts[k]!, pts[k + 1]!, l.tube, m));
          im.instanceMatrix.needsUpdate = true;
          add(l.group, im);
          const joints = new InstancedMesh(new SphereGeometry(1, 8, 6), std(hex), pts.length);
          pts.forEach((p, k) =>
            joints.setMatrixAt(
              k,
              m.compose(new Vector3(...p), new Quaternion(), new Vector3(l.tube!, l.tube!, l.tube!)),
            ),
          );
          joints.instanceMatrix.needsUpdate = true;
          add(l.group, joints);
        } else {
          const g = new BufferGeometry();
          g.setAttribute('position', new Float32BufferAttribute(pts.flat(), 3));
          add(l.group, new Line(g, new LineBasicMaterial({ color: new Color(hex) })));
        }
        break;
      }
      case 'arrows': {
        const n = l.from.length;
        const heads = (i: number) => (Array.isArray(l.head) ? (l.head[i] ?? 'solid') : (l.head ?? 'solid'));
        const th = l.thickness ?? 0.04;
        for (const objs of byColor(n, l.color, theme, (hex, idx) => {
          const shafts = new InstancedMesh(new CylinderGeometry(1, 1, 1, 10), std(hex), idx.length);
          const solid = idx.filter((i) => heads(i) === 'solid');
          const open = idx.filter((i) => heads(i) === 'open');
          const solidHeads = new InstancedMesh(
            new ConeGeometry(1, 1, 16),
            std(hex),
            Math.max(1, solid.length),
          );
          const openHeads = new InstancedMesh(
            new ConeGeometry(1, 1, 12, 1, true),
            std(hex, 1, { wireframe: true }),
            Math.max(1, open.length),
          );
          solidHeads.count = solid.length;
          openHeads.count = open.length;
          let s = 0;
          let o = 0;
          idx.forEach((i, k) => {
            const a = l.from[i]!;
            const v = l.vectors[i]!;
            const len = Math.hypot(...v);
            if (len < 1e-12) {
              shafts.setMatrixAt(k, m.makeScale(0, 0, 0));
              return;
            }
            const r = th * len;
            const headLen = Math.min(0.35 * len, 6 * r);
            const tipBase: Vec3 = [
              a[0] + (v[0] * (len - headLen)) / len,
              a[1] + (v[1] * (len - headLen)) / len,
              a[2] + (v[2] * (len - headLen)) / len,
            ];
            shafts.setMatrixAt(k, segmentMatrix(a, tipBase, r, m));
            const tip: Vec3 = [a[0] + v[0], a[1] + v[1], a[2] + v[2]];
            const hm = segmentMatrix(tipBase, tip, 2.6 * r, new Matrix4());
            if (heads(i) === 'solid') solidHeads.setMatrixAt(s++, hm);
            else openHeads.setMatrixAt(o++, hm);
          });
          for (const im of [shafts, solidHeads, openHeads]) im.instanceMatrix.needsUpdate = true;
          return [shafts, solidHeads, openHeads];
        }))
          for (const o of objs) add(l.group, o);
        break;
      }
      case 'mesh': {
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(l.positions, 3));
        if (l.indices) g.setIndex(l.indices);
        g.computeVertexNormals();
        const hex = resolveColor(l.color, theme);
        const mat = std(hex, l.opacity ?? 1, { side: DoubleSide, wireframe: !!l.wireframe });
        if (l.values && l.colormap) {
          g.setAttribute('color', new Float32BufferAttribute(colormap(l.values, l.colormap, l.range), 3));
          mat.vertexColors = true;
          mat.color = new Color(0xffffff);
        }
        const mesh = new Mesh(g, mat);
        mesh.userData = { group: l.group, kind: 'mesh', values: l.values };
        if (l.values) pickables.push(mesh);
        add(l.group, mesh);
        if (l.edges)
          add(
            l.group,
            new LineSegments(
              new EdgesGeometry(g, 20),
              new LineBasicMaterial({ color: new Color(resolveColor('muted', theme)) }),
            ),
          );
        break;
      }
      case 'labels': {
        for (const it of l.items) {
          const el = doc.createElement('span');
          el.className = 'v3d-label';
          el.textContent = it.text;
          labels.push({ el, at: new Vector3(...it.at), group: l.group });
        }
        if (!groups.has(l.group)) groups.set(l.group, []);
        break;
      }
    }
  }
  return { root, groups, labels, pickables };
}

export function disposeTree(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    mesh.geometry?.dispose();
    const mats: Material[] = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const mat of mats) mat.dispose();
    (obj as InstancedMesh).dispose?.();
  });
}
