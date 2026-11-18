// SceneSpec (M12.2): one small JSON format for every 3D picture on the site. Pure data and a validator, no drawing.
// @source S-021 (covalent radii for bonds), S-043 (VESTA-style polyhedra convention), S-057 (colour-blind-safe palette)
import type { Structure, Vec3 } from '../crystal/types';

export type SceneBadge = 'computed' | 'toy-model' | 'illustrative';
export type CameraPreset = 'a' | 'b' | 'c' | 'iso';
export type Camera = CameraPreset | { azimuth: number; elevation: number };

export interface PolyhedraSpec {
  centre: string[];
  ligand: string[];
  /** Largest centre-ligand distance counted, in Angstrom. */
  cutoffA: number;
}

export interface VectorSpec {
  /** `real`: a lattice vector (a, b, c); `reciprocal`: a reciprocal lattice vector (a*, b*, c*). */
  space: 'real' | 'reciprocal';
  index: 0 | 1 | 2;
  label?: string;
}

export interface PlaneSpec {
  hkl: [number, number, number];
}

export interface ShowSpec {
  atoms?: boolean;
  bonds?: boolean;
  cell?: boolean;
  labels?: boolean;
  polyhedra?: PolyhedraSpec;
}

/** One number per site (collinear: sign and magnitude in mu_B) or a 3-vector per site (non-collinear). */
export type SpinSpec = readonly (number | Vec3)[];

/** What a step may change. Everything else is inherited from the spec. */
export interface SceneStep {
  title: string;
  text?: string;
  show?: ShowSpec;
  spins?: SpinSpec;
  highlight?: number[];
  camera?: Camera;
  planes?: PlaneSpec[];
  vectors?: VectorSpec[];
}

export interface SceneSpec {
  id: string;
  badge: SceneBadge;
  /** Text alternative, required: the picture is never the only carrier of the message. */
  alt: string;
  caption?: string;
  structure: Structure | { ref: string };
  repeat?: [number, number, number];
  show?: ShowSpec;
  spins?: SpinSpec;
  planes?: PlaneSpec[];
  vectors?: VectorSpec[];
  highlight?: number[];
  camera?: Camera;
  steps?: SceneStep[];
}

export interface Issue {
  path: string;
  message: string;
}

const BADGES: readonly SceneBadge[] = ['computed', 'toy-model', 'illustrative'];
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isVec3 = (x: unknown): x is Vec3 => Array.isArray(x) && x.length === 3 && x.every(isNum);

export const isStructureRef = (s: SceneSpec['structure']): s is { ref: string } =>
  isObj(s) && typeof (s as { ref?: unknown }).ref === 'string';

function checkStructure(s: unknown, path: string, out: Issue[]): number | null {
  if (!isObj(s)) {
    out.push({ path, message: 'structure must be an object' });
    return null;
  }
  if (typeof s.ref === 'string') return null; // count known only after lookup
  const lat = s.lattice;
  if (!Array.isArray(lat) || lat.length !== 3 || !lat.every(isVec3)) {
    out.push({ path: `${path}.lattice`, message: 'lattice must be three rows of three numbers' });
  }
  const sp = s.species;
  const fr = s.frac;
  if (!Array.isArray(sp) || !sp.every((x) => typeof x === 'string' && x.length > 0)) {
    out.push({ path: `${path}.species`, message: 'species must be a list of element symbols' });
    return null;
  }
  if (!Array.isArray(fr) || !fr.every(isVec3)) {
    out.push({ path: `${path}.frac`, message: 'frac must be a list of fractional coordinates' });
    return null;
  }
  if (sp.length !== fr.length)
    out.push({ path, message: `species count (${sp.length}) must equal site count (${fr.length})` });
  return fr.length;
}

function checkSpins(spins: unknown, nSites: number | null, path: string, out: Issue[]): void {
  if (!Array.isArray(spins)) {
    out.push({ path, message: 'spins must be a list' });
    return;
  }
  if (nSites !== null && spins.length !== nSites)
    out.push({ path, message: `spins count (${spins.length}) must equal site count (${nSites})` });
  spins.forEach((s, i) => {
    if (!isNum(s) && !isVec3(s))
      out.push({ path: `${path}[${i}]`, message: 'a spin is a number or a 3-vector' });
  });
}

function checkShow(show: unknown, path: string, out: Issue[]): void {
  if (!isObj(show)) {
    out.push({ path, message: 'show must be an object' });
    return;
  }
  for (const k of ['atoms', 'bonds', 'cell', 'labels'])
    if (show[k] !== undefined && typeof show[k] !== 'boolean')
      out.push({ path: `${path}.${k}`, message: `${k} must be true or false` });
  const p = show.polyhedra;
  if (p !== undefined) {
    if (
      !isObj(p) ||
      !Array.isArray(p.centre) ||
      !Array.isArray(p.ligand) ||
      p.centre.length === 0 ||
      p.ligand.length === 0 ||
      !isNum(p.cutoffA) ||
      p.cutoffA <= 0
    )
      out.push({
        path: `${path}.polyhedra`,
        message: 'polyhedra needs centre, ligand (element lists) and cutoffA > 0',
      });
  }
}

function checkCamera(c: unknown, path: string, out: Issue[]): void {
  if (c === undefined) return;
  if (typeof c === 'string' && ['a', 'b', 'c', 'iso'].includes(c)) return;
  if (isObj(c) && isNum(c.azimuth) && isNum(c.elevation)) return;
  out.push({ path, message: "camera must be 'a', 'b', 'c', 'iso' or { azimuth, elevation }" });
}

function checkPlanesVectors(x: Record<string, unknown>, path: string, out: Issue[]): void {
  if (x.planes !== undefined) {
    if (!Array.isArray(x.planes)) out.push({ path: `${path}.planes`, message: 'planes must be a list' });
    else
      x.planes.forEach((p, i) => {
        const h = isObj(p) ? p.hkl : undefined;
        if (
          !Array.isArray(h) ||
          h.length !== 3 ||
          !h.every((n) => Number.isInteger(n)) ||
          h.every((n) => n === 0)
        )
          out.push({
            path: `${path}.planes[${i}]`,
            message: 'a plane needs integer Miller indices, not all zero',
          });
      });
  }
  if (x.vectors !== undefined) {
    if (!Array.isArray(x.vectors)) out.push({ path: `${path}.vectors`, message: 'vectors must be a list' });
    else
      x.vectors.forEach((v, i) => {
        if (
          !isObj(v) ||
          (v.space !== 'real' && v.space !== 'reciprocal') ||
          ![0, 1, 2].includes(v.index as number)
        )
          out.push({
            path: `${path}.vectors[${i}]`,
            message: "a vector needs space 'real' or 'reciprocal' and index 0 to 2",
          });
      });
  }
  if (
    x.highlight !== undefined &&
    (!Array.isArray(x.highlight) || !x.highlight.every((n) => Number.isInteger(n) && n >= 0))
  )
    out.push({ path: `${path}.highlight`, message: 'highlight must be a list of site indices' });
}

/** Validate unknown data as a SceneSpec. Returns every problem found; an empty list means the spec is usable. */
export function validateSpec(spec: unknown): Issue[] {
  const out: Issue[] = [];
  if (!isObj(spec)) return [{ path: '', message: 'a scene spec must be an object' }];
  if (typeof spec.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(spec.id))
    out.push({ path: 'id', message: 'id must be lowercase letters, digits and hyphens' });
  if (!BADGES.includes(spec.badge as SceneBadge))
    out.push({ path: 'badge', message: "badge must be 'computed', 'toy-model' or 'illustrative'" });
  if (typeof spec.alt !== 'string' || spec.alt.trim().length < 10)
    out.push({ path: 'alt', message: 'alt (the text alternative) is required' });
  const n = checkStructure(spec.structure, 'structure', out);
  if (spec.repeat !== undefined) {
    const r = spec.repeat;
    if (!Array.isArray(r) || r.length !== 3 || !r.every((k) => Number.isInteger(k) && k >= 1 && k <= 3))
      out.push({ path: 'repeat', message: 'repeat must be three integers from 1 to 3 (display only)' });
  }
  if (spec.show !== undefined) checkShow(spec.show, 'show', out);
  if (spec.spins !== undefined) checkSpins(spec.spins, n, 'spins', out);
  checkCamera(spec.camera, 'camera', out);
  checkPlanesVectors(spec, '', out);
  if (spec.steps !== undefined) {
    if (!Array.isArray(spec.steps) || spec.steps.length === 0)
      out.push({ path: 'steps', message: 'steps must be a non-empty list' });
    else
      spec.steps.forEach((st, i) => {
        const p = `steps[${i}]`;
        if (!isObj(st) || typeof st.title !== 'string' || !st.title) {
          out.push({ path: p, message: 'a step needs a title' });
          return;
        }
        if (st.show !== undefined) checkShow(st.show, `${p}.show`, out);
        if (st.spins !== undefined) checkSpins(st.spins, n, `${p}.spins`, out);
        checkCamera(st.camera, `${p}.camera`, out);
        checkPlanesVectors(st, p, out);
      });
  }
  return out;
}

/** Throws with every problem listed. For build time, where a bad spec must fail the build. */
export function assertSpec(spec: unknown): asserts spec is SceneSpec {
  const issues = validateSpec(spec);
  if (issues.length)
    throw new Error(
      `invalid scene spec${isObj(spec) && typeof spec.id === 'string' ? ` "${spec.id}"` : ''}:\n` +
        issues.map((i) => `  ${i.path || '(root)'}: ${i.message}`).join('\n'),
    );
}
