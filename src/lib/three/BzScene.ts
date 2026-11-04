// 3D Brillouin zone (M5.5): translucent faces with visible edges, the reciprocal vectors as labelled arrows, Gamma at the
// origin, high-symmetry points as small spheres with real HTML labels, the k-path as thick lines with direction ticks,
// an optional k-mesh and an axes helper. Geometry comes from `brillouinZone` (M5.2); this file only draws it.
import {
  ArrowHelper,
  AxesHelper,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BrillouinZone } from '../crystal/brillouin';
import type { Mat3, Vec3 } from '../crystal/types';
import { BZ_COLORS } from './bzColors';
import { toScene } from './cellEdges';
import { disposeObject, type ControllerOptions } from './SceneController';
import { ViewScene } from './ViewScene';

export interface BzPoint {
  /** Text shown on the label (already in display form, for example "Γ" or "X₁"). */
  label: string;
  /** Cartesian position in 1/Angstrom. */
  k: Vec3;
}

export { BZ_COLORS };

export class BzScene extends ViewScene {
  private zoneGroup: Group | undefined;
  private pointGroup: Group | undefined;
  private pathGroup: Group | undefined;
  private meshPoints: Points | undefined;
  private axes: AxesHelper | undefined;
  private size = 1;
  private zoneLabels: HTMLElement[] = [];
  private pointLabels: HTMLElement[] = [];
  private pathStart: Vector3 | undefined;
  private recip: Mat3 | undefined;

  constructor(container: HTMLElement, options?: ControllerOptions) {
    super(container, options);
    this.declutterLabels = true;
  }

  /** Draw the zone and the reciprocal vectors (rows of `reciprocal`, 1/Angstrom). Replaces any earlier zone. */
  setZone(zone: BrillouinZone, reciprocal: Mat3): void {
    this.removeGroup(this.zoneGroup);
    for (const l of this.zoneLabels) this.removeLabel(l);
    this.zoneLabels = [];
    this.recip = reciprocal;
    const toS = (v: Vec3): Vector3 => new Vector3(...toScene(v[0], v[1], v[2]));
    this.size = Math.max(...zone.vertices.map((v) => Math.hypot(v[0], v[1], v[2])), 1e-6);
    const g = new Group();

    // faces: a triangle fan per convex face, one mesh for all of them
    const pos: number[] = [];
    for (const f of zone.faces) {
      const ids = f.vertexIds;
      for (let i = 1; i + 1 < ids.length; i++)
        for (const id of [ids[0]!, ids[i]!, ids[i + 1]!]) {
          const p = toS(zone.vertices[id]!);
          pos.push(p.x, p.y, p.z);
        }
    }
    const fg = new BufferGeometry();
    fg.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.add(
      new Mesh(
        fg,
        new MeshBasicMaterial({
          color: new Color(BZ_COLORS.faces),
          transparent: true,
          opacity: 0.16,
          side: DoubleSide,
          depthWrite: false,
        }),
      ),
    );

    // edges
    const ep: number[] = [];
    for (const [a, b] of zone.edges) {
      const p = toS(zone.vertices[a]!);
      const q = toS(zone.vertices[b]!);
      ep.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
    const eg = new BufferGeometry();
    eg.setAttribute('position', new Float32BufferAttribute(ep, 3));
    const edges = this.makeLines(eg, BZ_COLORS.edges);
    g.add(edges);

    // Gamma at the origin
    g.add(
      new Mesh(
        new SphereGeometry(this.size * 0.03, 16, 12),
        new MeshBasicMaterial({ color: BZ_COLORS.gamma }),
      ),
    );
    this.zoneLabels.push(this.addLabel('Γ', [0, 0, 0]));

    // reciprocal vectors b1, b2, b3 from the origin
    reciprocal.forEach((b, i) => {
      const dir = toS(b);
      const len = dir.length();
      if (len === 0) return;
      const arrow = new ArrowHelper(
        dir.clone().normalize(),
        new Vector3(0, 0, 0),
        len,
        new Color(BZ_COLORS.vectors).getHex(),
        len * 0.12,
        len * 0.06,
      );
      g.add(arrow);
      this.zoneLabels.push(this.addLabel(`b${'₁₂₃'[i]}`, [dir.x * 1.06, dir.y * 1.06, dir.z * 1.06]));
    });

    this.scene.add(g);
    this.zoneGroup = g;
    this.setHome(new Vector3(1, 0.75, 1).setLength(this.size * 3.4));
  }

  /** Spheres with labels for the given points. Pass an empty list to clear them. */
  setPoints(points: readonly BzPoint[]): void {
    this.removeGroup(this.pointGroup);
    for (const l of this.pointLabels) this.removeLabel(l);
    this.pointLabels = [];
    const g = new Group();
    const geo = new SphereGeometry(this.size * 0.025, 12, 10);
    const mat = new MeshBasicMaterial({ color: BZ_COLORS.points });
    for (const p of points) {
      const s = toScene(p.k[0], p.k[1], p.k[2]);
      const m = new Mesh(geo, mat);
      m.position.set(...s);
      g.add(m);
      this.pointLabels.push(this.addLabel(p.label, s));
    }
    this.scene.add(g);
    this.pointGroup = g;
    this.requestRender();
  }

  /** The path as thick segments (cylinders) with a small cone at the middle of each pointing along the direction of travel. */
  setPath(segments: readonly (readonly [Vec3, Vec3])[]): void {
    this.removeGroup(this.pathGroup);
    this.pathStart = undefined;
    const g = new Group();
    const r = this.size * 0.008;
    const cyl = new CylinderGeometry(r, r, 1, 8, 1, true);
    const cone = new ConeGeometry(r * 3, r * 8, 10);
    const mat = new MeshBasicMaterial({ color: BZ_COLORS.path });
    const up = new Vector3(0, 1, 0);
    for (const [a, b] of segments) {
      const p = new Vector3(...toScene(a[0], a[1], a[2]));
      const q = new Vector3(...toScene(b[0], b[1], b[2]));
      const d = q.clone().sub(p);
      const len = d.length();
      if (len < 1e-9) continue; // a jump between equal points draws nothing
      this.pathStart ??= p.clone();
      const quat = new Quaternion().setFromUnitVectors(up, d.clone().normalize());
      const seg = new Mesh(cyl, mat);
      seg.scale.set(1, len, 1);
      seg.quaternion.copy(quat);
      seg.position.copy(p.clone().add(q).multiplyScalar(0.5));
      g.add(seg);
      const tick = new Mesh(cone, mat);
      tick.quaternion.copy(quat);
      tick.position.copy(p.clone().add(q).multiplyScalar(0.5));
      g.add(tick);
    }
    this.scene.add(g);
    this.pathGroup = g;
    this.requestRender();
  }

  /** Optional k-mesh points (Cartesian k, 3 numbers each). Pass null to remove. */
  setMesh(cart: Float64Array | null): void {
    if (this.meshPoints) {
      this.scene.remove(this.meshPoints);
      disposeObject(this.meshPoints);
      this.meshPoints = undefined;
    }
    if (cart && cart.length) {
      const pos = new Float32Array(cart.length);
      for (let i = 0; i < cart.length / 3; i++) {
        const s = toScene(cart[3 * i]!, cart[3 * i + 1]!, cart[3 * i + 2]!);
        pos.set(s, 3 * i);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      this.meshPoints = new Points(
        geo,
        new PointsMaterial({ color: BZ_COLORS.mesh, size: this.size * 0.03, sizeAttenuation: true }),
      );
      this.scene.add(this.meshPoints);
    }
    this.requestRender();
  }

  /** Show or hide the x, y, z axes helper (physics axes: x right, y into the page, z up in the default view). */
  setAxes(on: boolean): void {
    if (on && !this.axes) {
      // scene axes: x, y (up), z. Physics x is scene x, physics y is scene -z, physics z is scene y.
      this.axes = new AxesHelper(this.size * 1.3);
      this.scene.add(this.axes);
    } else if (!on && this.axes) {
      this.scene.remove(this.axes);
      this.axes.dispose();
      this.axes = undefined;
    }
    this.requestRender();
  }

  /** Look down reciprocal vector b1, b2 or b3 (index 0 to 2). */
  viewAlongReciprocal(i: 0 | 1 | 2): void {
    const b = this.recip?.[i];
    if (b) this.viewAlong(toScene(b[0], b[1], b[2]));
  }

  /** Look from the start of the path towards the zone centre. False when there is no path. */
  viewAlongPathStart(): boolean {
    if (!this.pathStart) return false;
    this.viewAlong([this.pathStart.x, this.pathStart.y, this.pathStart.z]);
    return true;
  }

  get hasPath(): boolean {
    return !!this.pathStart;
  }
  get pointLabelTexts(): string[] {
    return this.pointLabels.map((l) => l.textContent ?? '');
  }

  private makeLines(geo: BufferGeometry, color: string) {
    return new LineSegments(geo, new LineBasicMaterial({ color: new Color(color) }));
  }

  private removeGroup(g: Group | undefined): void {
    if (!g) return;
    this.scene.remove(g);
    disposeObject(g);
  }
}

export function createScene(container: HTMLElement): BzScene {
  return new BzScene(container);
}
