// 3D view of the plane-wave sphere (M4.4): reciprocal lattice points inside a translucent sphere of radius G_cut,
// with the reciprocal cell as a wireframe. Geometry comes from src/lib/physics/planewaves.ts.
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
import { SceneController, disposeObject, type ControllerOptions } from './SceneController';

export const POINT_COLOR = '#e8590c';
export const SPHERE_COLOR = '#1971c2';

/** Physics (x, y, z) to scene (x, z, -y): z points up, handedness kept. */
const toScene = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

export class EncutScene extends SceneController {
  private points: Points | undefined;
  private sphere: Mesh | undefined;
  private cell: LineSegments | undefined;
  private radius = 1;

  constructor(container: HTMLElement, options?: ControllerOptions) {
    super(container, options);
    this.camera.position.set(4, 3, 4);
    this.camera.lookAt(0, 0, 0);
  }

  /** Replace the point set. `vectors` are Cartesian G in 1/Angstrom (3 numbers each); `cell` is the reciprocal basis. */
  setBasis(vectors: Float64Array, gCut: number, cell: Mat3): void {
    this.clear();
    const n = vectors.length / 3;
    const pos = new Float32Array(vectors.length);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = toScene(vectors[3 * i]!, vectors[3 * i + 1]!, vectors[3 * i + 2]!);
      pos[3 * i] = x;
      pos[3 * i + 1] = y;
      pos[3 * i + 2] = z;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.points = new Points(
      g,
      new PointsMaterial({ color: POINT_COLOR, size: Math.max(0.06, gCut * 0.035), sizeAttenuation: true }),
    );
    this.scene.add(this.points);
    this.radius = Math.max(gCut, 0.1);
    this.sphere = new Mesh(
      new SphereGeometry(this.radius, 36, 24),
      new MeshBasicMaterial({ color: SPHERE_COLOR, transparent: true, opacity: 0.1, depthWrite: false }),
    );
    this.scene.add(this.sphere);
    const corners: [number, number, number][] = [];
    for (const a of [-0.5, 0.5])
      for (const b of [-0.5, 0.5])
        for (const c of [-0.5, 0.5])
          corners.push(
            toScene(
              a * cell[0][0] + b * cell[1][0] + c * cell[2][0],
              a * cell[0][1] + b * cell[1][1] + c * cell[2][1],
              a * cell[0][2] + b * cell[1][2] + c * cell[2][2],
            ),
          );
    // corner index = 4a + 2b + c; edges join corners that differ in one bit
    const pairs: [[number, number, number], [number, number, number]][] = [];
    for (let i = 0; i < 8; i++)
      for (const bit of [1, 2, 4]) if (!(i & bit)) pairs.push([corners[i]!, corners[i | bit]!]);
    this.cell = this.addLineSegments(pairs, '#7b8494');
    const d = this.radius * 2.6;
    this.camera.position.set(d, d * 0.7, d);
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
    for (const o of [this.points, this.sphere, this.cell]) {
      if (!o) continue;
      this.scene.remove(o);
      disposeObject(o);
    }
    this.points = this.sphere = this.cell = undefined;
  }

  get pointCount(): number {
    return this.points ? (this.points.geometry.getAttribute('position')?.count ?? 0) : 0;
  }
}

export function createScene(container: HTMLElement): EncutScene {
  return new EncutScene(container);
}
