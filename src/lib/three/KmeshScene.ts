// 3D view of a k-mesh in the reciprocal cell (M4.5): one dot per mesh point (optionally coloured by symmetry orbit),
// a larger marker at Gamma and the reciprocal cell as a wireframe parallelepiped centred on Gamma.
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
} from 'three';
import type { Mat3 } from '../crystal/types';
import { cellEdges, toScene } from './cellEdges';
import { SceneController, disposeObject, type ControllerOptions } from './SceneController';

export const GAMMA_COLOR = '#d6336c';

export class KmeshScene extends SceneController {
  private points: Points | undefined;
  private gamma: Mesh | undefined;
  private cell: LineSegments | undefined;

  constructor(container: HTMLElement, options?: ControllerOptions) {
    super(container, options);
    this.camera.position.set(4, 3, 4);
    this.camera.lookAt(0, 0, 0);
  }

  /** `cart` holds Cartesian k (1/Angstrom), 3 per point; `rgb` holds 3 numbers in 0..1 per point. */
  setMesh(cart: Float64Array, rgb: Float32Array, cell: Mat3): void {
    this.clear();
    const n = cart.length / 3;
    const pos = new Float32Array(cart.length);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = toScene(cart[3 * i]!, cart[3 * i + 1]!, cart[3 * i + 2]!);
      pos[3 * i] = x;
      pos[3 * i + 1] = y;
      pos[3 * i + 2] = z;
    }
    const size = Math.max(...cell.map((r) => Math.hypot(r[0], r[1], r[2])), 0.1);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(rgb, 3));
    this.points = new Points(
      g,
      new PointsMaterial({
        vertexColors: true,
        size: Math.max(0.03, (size * 0.9) / Math.cbrt(Math.max(n, 1)) / 3),
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this.points);
    this.gamma = new Mesh(
      new SphereGeometry(size * 0.04, 16, 12),
      new MeshBasicMaterial({ color: GAMMA_COLOR }),
    );
    this.scene.add(this.gamma);
    this.cell = this.addLineSegments(cellEdges(cell), '#7b8494');
    const d = size * 1.9;
    this.camera.position.set(d, d * 0.75, d);
    this.camera.lookAt(0, 0, 0);
    this.controls?.update();
    this.requestRender();
  }

  /** Turn the view about the vertical axis (keyboard alternative to dragging). */
  rotate(degrees: number): void {
    const t = (degrees * Math.PI) / 180;
    const { x, z } = this.camera.position;
    this.camera.position.x = x * Math.cos(t) - z * Math.sin(t);
    this.camera.position.z = x * Math.sin(t) + z * Math.cos(t);
    this.camera.lookAt(0, 0, 0);
    this.controls?.update();
    this.requestRender();
  }

  private clear(): void {
    for (const o of [this.points, this.gamma, this.cell]) {
      if (!o) continue;
      this.scene.remove(o);
      disposeObject(o);
    }
    this.points = this.gamma = this.cell = undefined;
  }

  get pointCount(): number {
    return this.points ? (this.points.geometry.getAttribute('position')?.count ?? 0) : 0;
  }
}

export function createScene(container: HTMLElement): KmeshScene {
  return new KmeshScene(container);
}
