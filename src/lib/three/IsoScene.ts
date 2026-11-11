// 3D view of isosurfaces of a periodic grid (M7.5): one or more triangle meshes (from marching cubes) inside the cell
// outline. Meshes are in Cartesian Angstrom with the origin at a cell corner; the view is centred on the middle of the cell.
// Orbit, keyboard and reset come from ViewScene.
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { Mat3 } from '../crystal/types';
import { toScene } from './cellEdges';
import { parallelepiped } from './solid';
import { disposeObject, type ControllerOptions } from './SceneController';
import { ViewScene } from './ViewScene';

export interface IsoSurface {
  positions: Float32Array;
  indices: Uint32Array;
  color: string;
}

export class IsoScene extends ViewScene {
  private group: Group | undefined;

  constructor(container: HTMLElement, options?: ControllerOptions) {
    super(container, options);
  }

  setSurfaces(surfaces: readonly IsoSurface[], lattice: Mat3): void {
    if (this.group) {
      this.scene.remove(this.group);
      disposeObject(this.group);
    }
    const g = new Group();
    const centre: [number, number, number] = [
      (lattice[0][0] + lattice[1][0] + lattice[2][0]) / 2,
      (lattice[0][1] + lattice[1][1] + lattice[2][1]) / 2,
      (lattice[0][2] + lattice[1][2] + lattice[2][2]) / 2,
    ];
    const to = (x: number, y: number, z: number) => toScene(x - centre[0], y - centre[1], z - centre[2]);
    const cell = parallelepiped(lattice);
    const ep: number[] = [];
    for (const [a, b] of cell.edges) {
      ep.push(...to(...cell.vertices[a]!), ...to(...cell.vertices[b]!));
    }
    const eg = new BufferGeometry();
    eg.setAttribute('position', new Float32BufferAttribute(ep, 3));
    g.add(new LineSegments(eg, new LineBasicMaterial({ color: new Color('#7b8494') })));
    for (const s of surfaces) {
      const pos = new Float32Array(s.positions.length);
      for (let i = 0; i < s.positions.length; i += 3) {
        const p = to(s.positions[i]!, s.positions[i + 1]!, s.positions[i + 2]!);
        pos[i] = p[0];
        pos[i + 1] = p[1];
        pos[i + 2] = p[2];
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geo.setIndex(Array.from(s.indices));
      geo.computeVertexNormals();
      g.add(
        new Mesh(
          geo,
          new MeshStandardMaterial({
            color: new Color(s.color),
            roughness: 0.55,
            side: DoubleSide,
            transparent: true,
            opacity: 0.85,
          }),
        ),
      );
    }
    this.scene.add(g);
    this.group = g;
    const extent = Math.max(
      Math.hypot(...lattice[0]),
      Math.hypot(...lattice[1]),
      Math.hypot(...lattice[2]),
      1e-6,
    );
    this.setHome(new Vector3(1, 0.7, 1).setLength(extent * 2.4));
  }
}

export function createScene(container: HTMLElement): IsoScene {
  return new IsoScene(container);
}
