// 3D renderer of a resolved SceneSpec (M12.2), built on ViewScene (orbit, zoom, touch, keyboard, reset). It draws exactly the
// geometry `resolveScene` produced, the same geometry the SVG projection is made from. Atoms are instanced spheres with an
// outline (colour is never the only cue), polyhedra are translucent faces with edges, spins are arrows (solid head for up,
// open cone for down) with real HTML "+" and "-" labels.
import {
  BackSide,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
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
} from 'three';
import { VESTA_MATERIAL, VESTA_SIZES } from './vestaStyle';
import type { Vec3 } from '../crystal/types';
import { cameraDirection } from '../scene/project';
import type { ResolvedScene } from '../scene/resolve';
import { toScene } from './cellEdges';
import { disposeObject, type ControllerOptions } from './SceneController';
import { ViewScene } from './ViewScene';

export interface SpecSceneOptions {
  /** Outline and bond colour, normally the page text colour. */
  ink: string;
  /** Polyhedra, plane and reciprocal-vector colour. */
  accent: string;
  muted: string;
}
export const DEFAULT_SPEC_OPTIONS: SpecSceneOptions = { ink: '#222222', accent: '#a2431f', muted: '#7b8494' };

const S = (p: Vec3): Vector3 => new Vector3(...toScene(p[0], p[1], p[2]));

export class SpecScene extends ViewScene {
  private group: Group | undefined;
  private extra: HTMLElement[] = [];

  constructor(container: HTMLElement, options?: ControllerOptions) {
    super(container, options);
    // atoms use a lit material; without a light they render as black discs
    this.addHeadlight();
  }

  /** Draw (or redraw, for a new step) a resolved scene. Keeps the camera unless `resetCamera` is set. */
  setResolved(
    r: ResolvedScene,
    lattice: readonly (readonly number[])[],
    opts: Partial<SpecSceneOptions> = {},
    resetCamera = true,
  ): void {
    const o = { ...DEFAULT_SPEC_OPTIONS, ...opts };
    if (this.group) {
      this.scene.remove(this.group);
      disposeObject(this.group);
    }
    for (const el of this.extra) this.removeLabel(el);
    this.extra = [];
    const g = new Group();
    const ink = new Color(o.ink);

    const seg = (pairs: [Vec3, Vec3][], color: string) => {
      const pos: number[] = [];
      for (const [a, b] of pairs) {
        const p = S(a);
        const q = S(b);
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.add(new LineSegments(geo, new LineBasicMaterial({ color: new Color(color) })));
    };
    seg(r.cellEdges, o.muted);
    seg(r.bonds, o.ink);

    // atoms: one instanced mesh and one outline mesh per element
    const m = new Matrix4();
    const bySpecies = new Map<string, typeof r.atoms>();
    for (const a of r.atoms) bySpecies.set(a.species, [...(bySpecies.get(a.species) ?? []), a]);
    for (const [, list] of bySpecies) {
      const first = list[0]!;
      const body = new InstancedMesh(
        new SphereGeometry(first.radius, ...VESTA_SIZES.sphereSegments),
        new MeshStandardMaterial({ color: new Color(first.color), ...VESTA_MATERIAL.atom }),
        list.length,
      );
      const rim = new InstancedMesh(
        new SphereGeometry(first.radius * 1.08, 24, 16),
        new MeshBasicMaterial({ color: ink, side: BackSide }),
        list.length,
      );
      list.forEach((a, i) => {
        const p = S(a.cart);
        m.makeTranslation(p.x, p.y, p.z);
        body.setMatrixAt(i, m);
        rim.setMatrixAt(i, m);
      });
      body.instanceMatrix.needsUpdate = rim.instanceMatrix.needsUpdate = true;
      g.add(rim, body);
      // a highlighted atom gets a ring-like extra shell (outline thickens), still not colour alone
      list.forEach((a) => {
        if (!a.highlighted) return;
        const shell = new Mesh(
          new SphereGeometry(a.radius * 1.35, 20, 12),
          new MeshBasicMaterial({ color: new Color(o.accent), wireframe: true }),
        );
        shell.position.copy(S(a.cart));
        g.add(shell);
      });
    }

    // polyhedra: translucent faces (fan-triangulated) plus edges
    for (const poly of r.polyhedra) {
      const pos: number[] = [];
      for (const f of poly.faces)
        for (let i = 1; i < f.length - 1; i++)
          for (const idx of [f[0]!, f[i]!, f[i + 1]!]) {
            const p = S(poly.vertices[idx]!);
            pos.push(p.x, p.y, p.z);
          }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.add(
        new Mesh(
          geo,
          new MeshBasicMaterial({
            color: new Color(o.accent),
            transparent: true,
            opacity: 0.22,
            side: DoubleSide,
            depthWrite: false,
          }),
        ),
      );
      seg(
        poly.edges.map(([i, j]) => [poly.vertices[i]!, poly.vertices[j]!] as [Vec3, Vec3]),
        o.accent,
      );
    }

    // planes
    for (const pl of r.planes) {
      if (pl.polygon.length < 3) continue;
      const pos: number[] = [];
      for (let i = 1; i < pl.polygon.length - 1; i++)
        for (const idx of [0, i, i + 1]) {
          const p = S(pl.polygon[idx]!);
          pos.push(p.x, p.y, p.z);
        }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.add(
        new Mesh(
          geo,
          new MeshBasicMaterial({
            color: new Color(o.accent),
            transparent: true,
            opacity: 0.3,
            side: DoubleSide,
            depthWrite: false,
          }),
        ),
      );
      seg(
        pl.polygon.map((p, i) => [p, pl.polygon[(i + 1) % pl.polygon.length]!] as [Vec3, Vec3]),
        o.accent,
      );
    }

    // arrows: spins (ink) and lattice vectors (accent)
    const up = new Vector3(0, 1, 0);
    const arrow = (from: Vec3, to: Vec3, color: string, head: 'solid' | 'open') => {
      const p = S(from);
      const d = S(to).sub(p);
      const len = d.length();
      if (len < 1e-9) return;
      const hl = Math.min(0.35 * len, 0.12 * r.extent);
      const hr = hl * 0.4;
      const shaft = new Mesh(
        new CylinderGeometry(hr * 0.22, hr * 0.22, len - hl, 8),
        new MeshBasicMaterial({ color: new Color(color) }),
      );
      const cone = new Mesh(
        new ConeGeometry(hr, hl, 12),
        head === 'solid'
          ? new MeshBasicMaterial({ color: new Color(color) })
          : new MeshBasicMaterial({ color: new Color(color), wireframe: true }),
      );
      const dir = d.clone().normalize();
      const q = new Quaternion().setFromUnitVectors(up, dir);
      shaft.quaternion.copy(q);
      cone.quaternion.copy(q);
      shaft.position.copy(p).addScaledVector(dir, (len - hl) / 2);
      cone.position.copy(p).addScaledVector(dir, len - hl / 2);
      g.add(shaft, cone);
    };
    for (const s of r.spins) {
      const to: Vec3 = [s.from[0] + s.vector[0], s.from[1] + s.vector[1], s.from[2] + s.vector[2]];
      arrow(s.from, to, o.ink, s.sign > 0 ? 'solid' : 'open');
      this.extra.push(this.addLabel(s.sign > 0 ? '+' : '−', toScene(to[0], to[1], to[2])));
    }
    for (const v of r.vectors) {
      arrow(v.from, v.to, o.accent, 'solid');
      this.extra.push(this.addLabel(v.label, toScene(v.to[0], v.to[1], v.to[2])));
    }
    for (const l of r.labels) this.extra.push(this.addLabel(l.text, toScene(l.at[0], l.at[1], l.at[2])));

    this.scene.add(g);
    this.group = g;
    this.lastLattice = lattice;
    if (resetCamera) this.setCamera(r.camera, r.extent, lattice);
    else this.requestRender();
  }

  private lastLattice: readonly (readonly number[])[] | undefined;

  /** Put the camera on a preset or explicit direction, at a distance that frames the block. */
  setCamera(camera: ResolvedScene['camera'], extent: number, lattice = this.lastLattice): void {
    if (!lattice) return;
    const d = cameraDirection(camera, lattice);
    this.setHome(new Vector3(d[0], d[1], d[2]).setLength(extent * 2.4));
  }

  override dispose(): void {
    if (this.group) disposeObject(this.group);
    this.group = undefined;
    this.extra = [];
    super.dispose();
  }
}

export function createScene(container: HTMLElement): SpecScene {
  return new SpecScene(container);
}
