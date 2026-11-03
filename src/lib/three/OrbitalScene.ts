// 3D point cloud of a one-electron orbital (M2.3). The cloud comes from src/lib/physics/hydrogen.ts.
// Orange points: wavefunction positive. Blue points: negative. Optional wireframe spheres mark radial nodes.
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
} from 'three';
import { SceneController, disposeObject, type ControllerOptions } from './SceneController';

export const POSITIVE_COLOR = '#e8590c';
export const NEGATIVE_COLOR = '#1971c2';

export class OrbitalScene extends SceneController {
  private cloud: Points | undefined;
  private nodes = new Group();
  private axes: LineSegments | undefined;
  private extent = 10;

  constructor(container: HTMLElement, options?: ControllerOptions) {
    super(container, options);
    this.camera.position.set(14, 10, 14);
    this.camera.lookAt(0, 0, 0);
  }

  override start(): void {
    super.start();
    this.nodes.visible = false;
    this.scene.add(this.nodes);
    this.axes = this.addLineSegments(
      [
        [
          [-1, 0, 0],
          [1, 0, 0],
        ],
        [
          [0, -1, 0],
          [0, 1, 0],
        ],
        [
          [0, 0, -1],
          [0, 0, 1],
        ],
      ],
      '#7b8494',
    );
    this.requestRender();
  }

  /** Replace the cloud. `positions` are in a0, three numbers per point; `signs` is +1 or -1 per point. */
  setCloud(positions: Float32Array, signs: Int8Array, extent: number): void {
    if (this.cloud) {
      this.scene.remove(this.cloud);
      disposeObject(this.cloud);
    }
    const count = signs.length;
    const colors = new Float32Array(count * 3);
    const pos = new Color(POSITIVE_COLOR);
    const neg = new Color(NEGATIVE_COLOR);
    for (let i = 0; i < count; i++) {
      const c = signs[i]! < 0 ? neg : pos;
      colors[3 * i] = c.r;
      colors[3 * i + 1] = c.g;
      colors[3 * i + 2] = c.b;
    }
    // physics z points up on screen: scene (x, y, z) = (x, z, -y), a plain rotation, so handedness is kept
    const mapped = new Float32Array(positions.length);
    for (let i = 0; i < count; i++) {
      mapped[3 * i] = positions[3 * i]!;
      mapped[3 * i + 1] = positions[3 * i + 2]!;
      mapped[3 * i + 2] = -positions[3 * i + 1]!;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(mapped, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const material = new PointsMaterial({
      size: Math.max(0.05, extent * 0.012),
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.cloud = new Points(geometry, material);
    this.scene.add(this.cloud);
    this.extent = extent;
    this.axes?.scale.setScalar(extent * 0.6);
    const d = extent * 2.4;
    this.camera.position.set(d, d * 0.7, d);
    this.camera.lookAt(0, 0, 0);
    this.controls?.update();
    this.requestRender();
  }

  /** Wireframe spheres at the given radii (a0). */
  setNodes(radii: readonly number[]): void {
    for (const child of [...this.nodes.children]) {
      this.nodes.remove(child);
      disposeObject(child);
    }
    for (const r of radii) {
      const mesh = new Mesh(
        new SphereGeometry(r, 28, 18),
        new MeshBasicMaterial({ color: '#868e96', wireframe: true, transparent: true, opacity: 0.35 }),
      );
      this.nodes.add(mesh);
    }
    this.requestRender();
  }

  showNodes(on: boolean): void {
    this.nodes.visible = on;
    this.requestRender();
  }

  get cloudExtent(): number {
    return this.extent;
  }

  /** Number of points currently drawn (for tests and readouts). */
  get pointCount(): number {
    return this.cloud ? (this.cloud.geometry.getAttribute('position')?.count ?? 0) : 0;
  }
}

export function createScene(container: HTMLElement): OrbitalScene {
  return new OrbitalScene(container);
}
