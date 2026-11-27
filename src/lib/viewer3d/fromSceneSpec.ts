// The M12.2 scene presets (SceneSpec, resolved by `resolveScene`) as a frame of the 3D engine (M16.4, D-121). Pure, no
// three.js: the same resolved geometry the flat SVG is drawn from becomes plain layers, so the Scene island, the guided
// path and the flat view cannot disagree. Drawn in the shared Studio look (D-122): element colours, two-tone half bonds,
// atom radius = covalent radius x 0.42, translucent polyhedra with edges, spin arrows with an open head for spin down.
// Coordinates stay physics coordinates (z up, Angstrom) with the middle of the displayed block at the origin.
// @source S-021 (covalent radii), S-043 (polyhedra convention)
import { covalentRadius } from '../crystal/covalent';
import { cameraDirection } from '../scene/project';
import type { ResolvedScene } from '../scene/resolve';
import type { Camera } from '../scene/spec';
import { VESTA_SIZES } from '../three/vestaStyle';
import { frameBounds, speciesTones } from './kit';
import { norm, type Vec3 } from './math';
import type { CameraSpec, Color, Layer, SceneFrame } from './types';

/** The minus sign of a spin-down label (U+2212), as on the flat view. */
export const MINUS = '−';

/** A copy as the engine's mutable vector (the crystal library's vectors are read-only). */
const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const key = (p: readonly number[]): string => p.map((x) => (Math.abs(x) < 5e-7 ? 0 : x).toFixed(6)).join(',');

/**
 * A preset camera as an engine camera. Along a, b, c use the engine's crystal views (they need `lattice`); iso and an
 * azimuth and elevation keep exactly the direction of the flat view (`cameraDirection`, scene axes x, z, -y) so the flat
 * picture and the live one start from the same side.
 */
export function cameraOfPreset(camera: Camera, lattice: readonly (readonly number[])[]): CameraSpec {
  if (camera === 'a' || camera === 'b' || camera === 'c') return camera;
  const d = cameraDirection(camera, lattice);
  const eye: Vec3 = [d[0], -d[2], d[1]];
  const up: Vec3 = Math.abs(eye[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1];
  return { eye, up };
}

/** The layers, lattice, camera and bounds of a resolved preset. `describe` is the preset's text alternative. */
export function frameFromResolved(r: ResolvedScene, describe: string): SceneFrame {
  const layers: Layer[] = [];
  const tones = speciesTones(r.structure.species);
  const tone = (el: string): Color => tones.get(el) ?? 'muted';
  const speciesAt = new Map<string, string>();
  for (const a of r.atoms) speciesAt.set(key(a.cart), a.species);

  if (r.atoms.length)
    layers.push({
      kind: 'atoms',
      group: 'atoms',
      name: 'Atoms',
      positions: r.atoms.map((a) => v3(a.cart)),
      radius: r.atoms.map((a) => covalentRadius(a.species).radius * VESTA_SIZES.atomScale),
      color: r.atoms.map((a) => tone(a.species)),
      labels: r.atoms.map((a) => `${a.species} ${a.site + 1}${a.image ? ' (image)' : ''}`),
      highlight: r.atoms.flatMap((a, i) => (a.highlighted ? [i] : [])),
    });

  // two-tone bonds as in the Studio viewer: each half in the colour of the atom it starts from (one layer per element)
  if (r.bonds.length) {
    const halves = new Map<string, [Vec3, Vec3][]>();
    const push = (el: string, s: [Vec3, Vec3]) => {
      if (!halves.has(el)) halves.set(el, []);
      halves.get(el)!.push(s);
    };
    for (const [pa, pb] of r.bonds) {
      const a = v3(pa);
      const b = v3(pb);
      const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      push(speciesAt.get(key(a)) ?? '', [a, mid]);
      push(speciesAt.get(key(b)) ?? '', [mid, b]);
    }
    for (const [el, segments] of halves)
      layers.push({
        kind: 'lines',
        group: 'bonds',
        name: 'Bonds',
        segments,
        color: el ? tone(el) : 'ink',
        tube: VESTA_SIZES.bondRadius,
      });
  }

  if (r.cellEdges.length)
    layers.push({
      kind: 'lines',
      group: 'cell',
      name: 'Unit cell',
      segments: r.cellEdges.map(([a, b]) => [v3(a), v3(b)]),
      color: 'muted',
    });

  // coordination polyhedra in the colour of their centre atom, translucent, with edges (VESTA convention)
  for (const p of r.polyhedra) {
    const positions: number[] = [];
    for (const f of p.faces)
      for (let i = 1; i < f.length - 1; i++)
        for (const idx of [f[0]!, f[i]!, f[i + 1]!]) positions.push(...p.vertices[idx]!);
    const el = speciesAt.get(key(p.centre));
    layers.push({
      kind: 'mesh',
      group: 'polyhedra',
      name: 'Polyhedra',
      positions,
      color: el ? tone(el) : 'accent',
      opacity: VESTA_SIZES.polyhedronOpacity,
      edges: true,
    });
  }

  for (const pl of r.planes) {
    if (pl.polygon.length < 3) continue;
    const positions: number[] = [];
    for (let i = 1; i < pl.polygon.length - 1; i++)
      for (const idx of [0, i, i + 1]) positions.push(...pl.polygon[idx]!);
    layers.push({
      kind: 'mesh',
      group: 'planes',
      name: `Plane (${pl.hkl.join(' ')})`,
      positions,
      color: 'accent',
      opacity: 0.3,
      edges: true,
    });
  }

  // magnetic moments: a solid head for spin up, an open (wire) head for spin down, and a + or minus label at the tip,
  // so the two never differ by colour alone
  if (r.spins.length) {
    const tip = (s: (typeof r.spins)[number]): Vec3 => [
      s.from[0] + s.vector[0],
      s.from[1] + s.vector[1],
      s.from[2] + s.vector[2],
    ];
    layers.push(
      {
        kind: 'arrows',
        group: 'spins',
        name: 'Magnetic moments',
        from: r.spins.map((s) => v3(s.from)),
        vectors: r.spins.map((s) => v3(s.vector)),
        color: 'ink',
        head: r.spins.map((s) => (s.sign > 0 ? 'solid' : 'open')),
      },
      {
        kind: 'labels',
        group: 'spins',
        items: r.spins.map((s) => ({ text: s.sign > 0 ? '+' : MINUS, at: tip(s) })),
      },
    );
  }

  if (r.vectors.length)
    layers.push(
      {
        kind: 'arrows',
        group: 'vectors',
        name: 'Lattice vectors',
        from: r.vectors.map((v) => v3(v.from)),
        vectors: r.vectors.map((v) => [v.to[0] - v.from[0], v.to[1] - v.from[1], v.to[2] - v.from[2]]),
        color: 'accent',
      },
      { kind: 'labels', group: 'vectors', items: r.vectors.map((v) => ({ text: v.label, at: v3(v.to) })) },
    );

  if (r.labels.length)
    layers.push({
      kind: 'labels',
      group: 'labels',
      name: 'Labels',
      items: r.labels.map((l) => ({ text: l.text, at: v3(l.at) })),
    });

  // the block is centred on the origin, so the view turns about the origin and a reset brings the target back there
  const b = frameBounds(layers);
  const radius = Math.max(1e-3, b.radius + norm(b.center));
  const lattice = r.structure.lattice.map(v3) as [Vec3, Vec3, Vec3];
  return {
    layers,
    describe,
    lattice,
    ortho: true,
    camera: cameraOfPreset(r.camera, r.structure.lattice),
    bounds: { center: [0, 0, 0], radius },
  };
}
