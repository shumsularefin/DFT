// 3D real-space unit cell (M5.5): the cell edges (every cell of the block), atoms as instanced spheres sized by covalent
// radius (S-021) and coloured by element from the Okabe-Ito palette (S-057), each with a thin outline so a pale colour
// still reads on a pale page, optional bonds, and a supercell repeat of 1 to 3 per axis.
import {
  BackSide,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  Color,
} from 'three';
import { cellAtoms, cellOrigins } from '../crystal/cellAtoms';
import { bondPairs, covalentRadius } from '../crystal/covalent';
import type { Structure, Vec3 } from '../crystal/types';
import { toScene } from './cellEdges';
import { speciesColors } from './palette';
import { disposeObject, type ControllerOptions } from './SceneController';
import { parallelepiped } from './solid';
import { ViewScene } from './ViewScene';

export interface CellOptions {
  repeat: readonly [number, number, number];
  bonds: boolean;
  /** Atom sphere radius as a fraction of the covalent radius (a drawing choice, not physics). */
  atomScale: number;
  /** Outline colour, normally the page text colour. */
  outline: string;
}

export const DEFAULT_CELL_OPTIONS: CellOptions = {
  repeat: [1, 1, 1],
  bonds: false,
  atomScale: 0.5,
  outline: '#222222',
};
/** Above this many atoms bonds are not computed (the pair search is quadratic). */
export const MAX_BOND_ATOMS = 1200;

export interface CellSummary {
  /** Atoms drawn, including periodic images on the boundary. */
  drawn: number;
  bonds: number;
  /** Element, colour and whether the radius came from the table. */
  legend: { symbol: string; color: string; tabulated: boolean }[];
  bondsSkipped: boolean;
}

export class CellScene extends ViewScene {
  private group: Group | undefined;
  private lattice: Structure['lattice'] | undefined;

  constructor(container: HTMLElement, options?: ControllerOptions) {
    super(container, options);
  }

  /** Draw the structure. Positions are centred on the middle of the block so orbiting turns about it. */
  setStructure(s: Structure, opts: Partial<CellOptions> = {}): CellSummary {
    const o = { ...DEFAULT_CELL_OPTIONS, ...opts };
    if (this.group) {
      this.scene.remove(this.group);
      disposeObject(this.group);
    }
    this.lattice = s.lattice;
    const g = new Group();
    const [na, nb, nc] = o.repeat;
    const block = [
      [na * s.lattice[0][0], na * s.lattice[0][1], na * s.lattice[0][2]],
      [nb * s.lattice[1][0], nb * s.lattice[1][1], nb * s.lattice[1][2]],
      [nc * s.lattice[2][0], nc * s.lattice[2][1], nc * s.lattice[2][2]],
    ] as const;
    const centre: Vec3 = [
      (block[0][0] + block[1][0] + block[2][0]) / 2,
      (block[0][1] + block[1][1] + block[2][1]) / 2,
      (block[0][2] + block[1][2] + block[2][2]) / 2,
    ];
    const at = (v: Vec3): Vector3 =>
      new Vector3(...toScene(v[0] - centre[0], v[1] - centre[1], v[2] - centre[2]));
    const extent = Math.max(Math.hypot(...block[0]), Math.hypot(...block[1]), Math.hypot(...block[2]), 1e-6);

    // cell outlines: one parallelepiped per cell
    const ep: number[] = [];
    for (const origin of cellOrigins(s.lattice, o.repeat)) {
      const cell = parallelepiped(s.lattice, origin);
      for (const [a, b] of cell.edges) {
        const p = at(cell.vertices[a]!);
        const q = at(cell.vertices[b]!);
        ep.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
    }
    const eg = new BufferGeometry();
    eg.setAttribute('position', new Float32BufferAttribute(ep, 3));
    g.add(new LineSegments(eg, new LineBasicMaterial({ color: new Color('#7b8494') })));

    // atoms, one instanced mesh (plus outline mesh) per element
    const atoms = cellAtoms(s, o.repeat, true);
    const colors = speciesColors(s.species);
    const legend: CellSummary['legend'] = [];
    const m = new Matrix4();
    for (const [symbol, color] of colors) {
      const { radius, tabulated } = covalentRadius(symbol);
      legend.push({ symbol, color, tabulated });
      const mine = atoms.filter((a) => a.species === symbol);
      const geo = new SphereGeometry(radius * o.atomScale, 24, 16);
      const body = new InstancedMesh(
        geo,
        new MeshStandardMaterial({ color: new Color(color), roughness: 0.5 }),
        mine.length,
      );
      const rim = new InstancedMesh(
        new SphereGeometry(radius * o.atomScale * 1.08, 24, 16),
        new MeshBasicMaterial({ color: new Color(o.outline), side: BackSide }),
        mine.length,
      );
      mine.forEach((a, i) => {
        const p = at(a.cart);
        m.makeTranslation(p.x, p.y, p.z);
        body.setMatrixAt(i, m);
        rim.setMatrixAt(i, m);
      });
      body.instanceMatrix.needsUpdate = rim.instanceMatrix.needsUpdate = true;
      g.add(rim, body);
    }

    // bonds
    let bondCount = 0;
    let bondsSkipped = false;
    if (o.bonds) {
      if (atoms.length > MAX_BOND_ATOMS) bondsSkipped = true;
      else {
        const pairs = bondPairs(
          atoms.map((a) => a.cart),
          atoms.map((a) => a.species),
        );
        bondCount = pairs.length;
        const cyl = new CylinderGeometry(extent * 0.006, extent * 0.006, 1, 8, 1, true);
        const mat = new MeshBasicMaterial({ color: new Color(o.outline) });
        const up = new Vector3(0, 1, 0);
        for (const [i, j] of pairs) {
          const p = at(atoms[i]!.cart);
          const q = at(atoms[j]!.cart);
          const d = q.clone().sub(p);
          const mesh = new Mesh(cyl, mat);
          mesh.scale.set(1, d.length(), 1);
          mesh.quaternion.copy(new Quaternion().setFromUnitVectors(up, d.clone().normalize()));
          mesh.position.copy(p.clone().add(q).multiplyScalar(0.5));
          g.add(mesh);
        }
      }
    }

    this.scene.add(g);
    this.group = g;
    this.setHome(new Vector3(1, 0.7, 1).setLength(extent * 2.4));
    return { drawn: atoms.length, bonds: bondCount, legend, bondsSkipped };
  }

  /** Look down lattice vector a, b or c (index 0 to 2). */
  viewAlongLattice(i: 0 | 1 | 2): void {
    const a = this.lattice?.[i];
    if (a) this.viewAlong(toScene(a[0], a[1], a[2]));
  }
}

export function createScene(container: HTMLElement): CellScene {
  return new CellScene(container);
}
