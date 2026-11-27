// The scene contract of the 3D handbook (M16.1, M16.3). A scene is a pure generator: parameters in, plain typed layers out.
// Layers never hold three.js objects, so every scene is built and tested in Node, the build-time poster (SVG) and the
// no-WebGL view are drawn from the same layers, and the live engine (Viewer3D) only turns them into GPU meshes.
// Coordinates are physics coordinates (x, y, z) with z up, in whatever length unit the scene states (usually Angstrom).
import type { Vec3 } from './math';

export type { Vec3 };

/** Honest badge (CLAUDE.md "Be honest in the UI"; M16 section 1 rule 5). `sample`: example or synthetic data, shows a banner. */
export type Badge = 'computed' | 'toy-model' | 'illustrative' | 'sample';

/**
 * A colour: a theme tone that follows light and dark mode, or a literal `#rrggbb`. Tones: ink (text colour), muted (cell
 * edges, guides), accent, pos and neg (two signs: orange and blue, colour-blind safe, S-057), and c0 to c7 (the atom palette).
 */
export type Color =
  | 'ink'
  | 'muted'
  | 'accent'
  | 'pos'
  | 'neg'
  | 'c0'
  | 'c1'
  | 'c2'
  | 'c3'
  | 'c4'
  | 'c5'
  | 'c6'
  | 'c7'
  | `#${string}`;

interface LayerBase {
  /** Group id used by stage states and the Layers menu (for example "atoms", "cell", "path"). Several layers may share one. */
  group: string;
  /** Human name of the group for the Layers menu; the first layer of a group names it. */
  name?: string;
}

/** Spheres. One draw call per colour. `labels` are what a pick reads ("Ti 1", "Gamma"). */
export interface AtomsLayer extends LayerBase {
  kind: 'atoms';
  positions: Vec3[];
  /** One radius for all, or one per atom. */
  radius: number | number[];
  /** One colour for all, or one per atom. */
  color: Color | Color[];
  labels?: string[];
  /** Indices drawn with an extra outline shell (never colour alone). */
  highlight?: number[];
  opacity?: number;
}

/** Straight segments: bonds, cell edges, guides, nodal lines. */
export interface LinesLayer extends LayerBase {
  kind: 'lines';
  segments: [Vec3, Vec3][];
  color: Color;
  dashed?: boolean;
  /** Draw as tubes of this radius instead of hairlines (bonds). */
  tube?: number;
}

/** A path through space: a k-path, a trajectory, a wave, a curve over a parameter. */
export interface CurveLayer extends LayerBase {
  kind: 'curve';
  points: Vec3[];
  color: Color;
  closed?: boolean;
  /** Tube radius; hairline when absent. */
  tube?: number;
}

/** Arrows: spins, forces, lattice vectors, fields. `head: 'open'` draws a wire cone (spin down), not colour alone. */
export interface ArrowsLayer extends LayerBase {
  kind: 'arrows';
  from: Vec3[];
  vectors: Vec3[];
  color: Color | Color[];
  head?: 'solid' | 'open' | ('solid' | 'open')[];
  /** Shaft radius as a fraction of the arrow length (default 0.04). */
  thickness?: number;
}

/**
 * Triangle mesh: isosurfaces, polyhedra, planes, zones, any surface. `positions` is flat xyz; `indices` flat triangles
 * (omitted: every three vertices make a triangle). `values` (one per vertex) are coloured by `colormap` when given.
 */
export interface MeshLayer extends LayerBase {
  kind: 'mesh';
  positions: number[];
  indices?: number[];
  color: Color;
  values?: number[];
  colormap?: 'diverging' | 'sequential';
  /** Range of `values` mapped onto the colormap; defaults to the data range (symmetric about 0 for diverging). */
  range?: [number, number];
  opacity?: number;
  wireframe?: boolean;
  /** Also draw the triangle edges as lines (polyhedra, zone faces). */
  edges?: boolean;
}

/** Many small dots: an electron cloud, a k-mesh, sampled points. */
export interface PointsLayer extends LayerBase {
  kind: 'points';
  positions: Vec3[];
  color: Color | Color[];
  /** Dot radius in scene units. */
  size: number;
  labels?: string[];
}

/** Text placed in 3D (real HTML over the canvas, read by screen readers through the description). */
export interface LabelsLayer extends LayerBase {
  kind: 'labels';
  items: { text: string; at: Vec3 }[];
}

export type Layer =
  AtomsLayer | LinesLayer | CurveLayer | ArrowsLayer | MeshLayer | PointsLayer | LabelsLayer;

export interface Readout {
  label: string;
  value: string;
}

/** Camera request of a frame or a stage state. A named crystal view needs `lattice` on the frame. */
export type CameraSpec =
  | 'iso'
  | 'a'
  | 'b'
  | 'c'
  | 'a*'
  | 'b*'
  | 'c*'
  | 'top'
  | 'front'
  | 'side'
  | { eye: Vec3; up?: Vec3; zoom?: number };

/** What a generator returns for one set of parameter values. */
export interface SceneFrame {
  layers: Layer[];
  /** Plain-language description of exactly what this frame shows, generated from the same numbers (rule 4). */
  describe: string;
  readouts?: Readout[];
  /** Lattice rows a, b, c in scene coordinates: enables the crystal views (along a, b, c, a*, b*, c*, [uvw], (hkl)). */
  lattice?: [Vec3, Vec3, Vec3];
  /** Default camera for this frame (a state may override it). */
  camera?: CameraSpec;
  /** Orthographic projection by default (crystals, like VESTA). Perspective otherwise. */
  ortho?: boolean;
  /** Centre and radius to frame; computed from the layers when absent. */
  bounds?: { center: Vec3; radius: number };
  /** Axis labels for surfaces over two variables, shown in the legend: [x, y, z]. */
  axes?: [string, string, string];
}

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

interface ParamBase {
  id: string;
  label: string;
  /** True when the parameter changes the geometry or the physics (rule 3); a stage needs at least one. */
  physics?: boolean;
}

export interface SliderParam extends ParamBase {
  kind: 'slider';
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  /** Digits shown in the readout. */
  digits?: number;
}
export interface SelectParam extends ParamBase {
  kind: 'select';
  options: { value: string; label: string }[];
  value: string;
}
export interface ToggleParam extends ParamBase {
  kind: 'toggle';
  value: boolean;
}
/** Integer steps of an algorithm (SCF iterations, ionic steps, NEB iterations); a step bar with play. */
export interface StepParam extends ParamBase {
  kind: 'step';
  min: number;
  max: number;
  value: number;
  /** Seconds per step while playing (default 0.7). */
  interval?: number;
}
/** Continuous time for a periodic motion (a phonon mode, a wave); play advances it, it wraps at `period`. */
export interface TimeParam extends ParamBase {
  kind: 'time';
  period: number;
  value: number;
}

export type ParamDef = SliderParam | SelectParam | ToggleParam | StepParam | TimeParam;

export interface SceneDef {
  id: string;
  title: string;
  badge: Badge;
  /** Source ids for the physics (S-xxx in docs/SCIENCE_SOURCES.md). */
  sources: string[];
  params: ParamDef[];
  /** Shown as a visible banner (sample or synthetic data, toy models). */
  banner?: string;
  build(p: Params): SceneFrame;
}

export type SceneModule = { scenes: Record<string, SceneDef> };

/** Fill in every parameter with its default, then the given overrides. Unknown keys are ignored. */
export function withDefaults(def: SceneDef, over: Params = {}): Params {
  const out: Params = {};
  for (const p of def.params) out[p.id] = p.id in over ? over[p.id]! : p.value;
  return out;
}
