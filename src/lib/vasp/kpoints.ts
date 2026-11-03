// KPOINTS: mesh sizes, mesh coordinates, text writers and a parser.
// @source S-019 (VASP wiki: KPOINTS, KSPACING), S-042 (author's Workflow Handbook), S-007 (Monkhorst and Pack 1976)
//
// ROUNDING RULES (Q-004 is OPEN: the rule VASP and VASPKIT apply has not been read or run):
//   ratio_i = |b_i| / spacing, with |b_i| the reciprocal vector length INCLUDING 2 pi.
//   'ceil'      N_i = max(1, ceil(ratio_i))               default (D-016): never gives a coarser mesh than asked
//   'round'     N_i = max(1, floor(ratio_i + 0.5))        round half up
//   'plus0.999' N_i = max(1, floor(ratio_i + 0.999))      the "int(x + 0.999)" candidate
// Calibration protocol (the author, 5 minutes per run): see Q-004 in docs/OPEN_QUESTIONS.md. Fcc Cu primitive
// a = 3.61 with KSPACING 0.3, 0.28 and 0.30145 separates the three rules (golden file kspacing_candidates).
import { ParseError } from '../crystal/errors';
import { reciprocalLattice, latticeParameters } from '../crystal/lattice';
import { norm } from '../crystal/linalg';
import type { Mat3, Structure, Vec3 } from '../crystal/types';

export type RoundingRule = 'ceil' | 'round' | 'plus0.999';
export const DEFAULT_RULE: RoundingRule = 'ceil';
export type Mesh = readonly [number, number, number];
export interface MeshResult {
  mesh: Mesh;
  /** The rule that produced the mesh (the UI must show it, because Q-004 is open). */
  rule: RoundingRule;
  /** Unrounded ratios |b_i| / spacing. */
  ratios: Vec3;
}

const TWO_PI = 2 * Math.PI;

function applyRule(x: number, rule: RoundingRule): number {
  const n = rule === 'ceil' ? Math.ceil(x) : rule === 'round' ? Math.floor(x + 0.5) : Math.floor(x + 0.999);
  return Math.max(1, n);
}

/** Reciprocal lengths including 2 pi, in 1/Angstrom. */
export const reciprocalLengths = (m: Mat3): Vec3 => {
  const r = reciprocalLattice(m);
  return [norm(r[0]), norm(r[1]), norm(r[2])];
};

/** Mesh from the VASP KSPACING tag (1/Angstrom, with 2 pi in |b|). */
export function meshFromKspacing(
  m: Mat3,
  kspacingInvA: number,
  rule: RoundingRule = DEFAULT_RULE,
): MeshResult {
  if (!(kspacingInvA > 0) || !Number.isFinite(kspacingInvA))
    throw new RangeError('KSPACING must be positive');
  const b = reciprocalLengths(m);
  const ratios: Vec3 = [b[0] / kspacingInvA, b[1] / kspacingInvA, b[2] / kspacingInvA];
  return {
    mesh: [applyRule(ratios[0], rule), applyRule(ratios[1], rule), applyRule(ratios[2], rule)],
    rule,
    ratios,
  };
}

/** VASPKIT "resolution" in units of 2 pi / Angstrom: spacing = 2 pi x resolution. */
export function meshFromResolution(
  m: Mat3,
  resolution: number,
  rule: RoundingRule = DEFAULT_RULE,
): MeshResult {
  if (!(resolution > 0) || !Number.isFinite(resolution)) throw new RangeError('resolution must be positive');
  return meshFromKspacing(m, TWO_PI * resolution, rule);
}

/**
 * VASP "Auto" length mode: N_i = max(1, int(length x |b_i| + 0.5)) with |b_i| WITHOUT 2 pi.
 * UNVERIFIED (Q-018): recalled from the VASP wiki KPOINTS page.
 */
export function meshFromLength(m: Mat3, length: number): Mesh {
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError('length must be positive');
  const b = reciprocalLengths(m);
  const n = (x: number) => Math.max(1, Math.floor(length * (x / TWO_PI) + 0.5));
  return [n(b[0]), n(b[1]), n(b[2])];
}

const fold = (x: number) => (Math.abs(x) < 1e-15 ? 0 : x);

/** Monkhorst-Pack coordinates (2r - n - 1) / (2n), r = 1..n. */
export const monkhorstPackCoords = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => fold((2 * (i + 1) - n - 1) / (2 * n)));

/** Gamma-centred coordinates i / n folded into (-1/2, 1/2]. */
export const gammaCoords = (n: number): number[] =>
  Array.from({ length: n }, (_, i) => fold(i / n > 0.5 ? i / n - 1 : i / n));

/** Number of points in the full (not symmetry-reduced) mesh. The irreducible count needs symmetry (M4.5, M5.1). */
export const kpointCount = (mesh: Mesh): number => mesh[0] * mesh[1] * mesh[2];

// ---- symmetry risk -------------------------------------------------------------------------------------------

const near = (x: number, t: number, tol: number) => Math.abs(x - t) <= tol;

function metricIsHexagonal(m: Mat3): boolean {
  const p = latticeParameters(m);
  return (
    near(p.a, p.b, 1e-3 * p.a) &&
    near(p.alpha, 90, 1e-2) &&
    near(p.beta, 90, 1e-2) &&
    (near(p.gamma, 120, 1e-2) || near(p.gamma, 60, 1e-2))
  );
}

function metricIsFccPrimitive(m: Mat3): boolean {
  const p = latticeParameters(m);
  return (
    near(p.a, p.b, 1e-3 * p.a) &&
    near(p.b, p.c, 1e-3 * p.b) &&
    near(p.alpha, 60, 1e-2) &&
    near(p.beta, 60, 1e-2) &&
    near(p.gamma, 60, 1e-2)
  );
}

export type MeshKind = 'gamma' | 'monkhorst-pack';

/**
 * True when a Monkhorst-Pack mesh with even n is known to break the lattice symmetry. Known only for the hexagonal
 * and fcc-primitive metrics (golden `mesh_point_group_symmetry`: hcp Mg and fcc Cu break at even n; sc and bcc do not).
 * Gamma-centred meshes always return false. Anything else returns false because it is not known, not because it is safe.
 */
export function meshSymmetryRisk(m: Mat3, kind: MeshKind, n: number): boolean {
  if (kind === 'gamma' || n % 2 !== 0) return false;
  return metricIsHexagonal(m) || metricIsFccPrimitive(m);
}

export interface Centering {
  centering: 'gamma' | 'either';
  reason: string;
}

/** Recommend a mesh centring from the cell metric. */
export function recommendCentering(s: Structure): Centering {
  const m = s.lattice;
  if (metricIsHexagonal(m)) {
    return {
      centering: 'gamma',
      reason:
        'Use Gamma-centred meshes for hexagonal and trigonal cells (author handbook rule, S-042). Measured here: an even Monkhorst-Pack mesh on a hexagonal cell (hcp Mg) does not keep the lattice symmetry, while Gamma-centred meshes do (Q-017).',
    };
  }
  if (metricIsFccPrimitive(m)) {
    return {
      centering: 'gamma',
      reason:
        'The face-centred cubic primitive cell has a = b = c and all angles 60 degrees. Measured here: an even Monkhorst-Pack mesh on it (fcc Cu) does not keep the lattice symmetry, while Gamma-centred meshes do (Q-017). Use a Gamma-centred mesh.',
    };
  }
  const p = latticeParameters(m);
  if (
    near(p.a, p.b, 1e-3 * p.a) &&
    near(p.b, p.c, 1e-3 * p.b) &&
    near(p.alpha, p.beta, 1e-2) &&
    near(p.beta, p.gamma, 1e-2) &&
    !near(p.alpha, 90, 1e-2)
  ) {
    return {
      centering: 'gamma',
      reason:
        'Use Gamma-centred meshes for hexagonal and trigonal cells (author handbook rule, S-042). This is a rule of thumb for rhombohedral cells: the symmetry breaking was not measured for this cell.',
    };
  }
  return {
    centering: 'either',
    reason:
      'No rule in the handbook requires Gamma centring for this cell shape. Both centrings are acceptable; converge the mesh either way.',
  };
}

// ---- writers -------------------------------------------------------------------------------------------------

const num = (x: number) => String(fold(x));
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');

export function writeMeshKpoints(
  mesh: Mesh,
  kind: MeshKind = 'gamma',
  shift: Vec3 = [0, 0, 0],
  comment = 'Automatic mesh',
): string {
  return [
    oneLine(comment),
    '0',
    kind === 'gamma' ? 'Gamma' : 'Monkhorst-Pack',
    ` ${mesh.join(' ')}`,
    ` ${shift.map(num).join(' ')}`,
    '',
  ].join('\n');
}

export const writeGammaOnly = (comment = 'Gamma point only'): string =>
  writeMeshKpoints([1, 1, 1], 'gamma', [0, 0, 0], comment);

export function writeAutoKpoints(length: number, comment = 'Fully automatic mesh'): string {
  return [oneLine(comment), '0', 'Auto', ` ${num(length)}`, ''].join('\n');
}

export interface WeightedK {
  k: Vec3;
  weight: number;
}
export type KCoords = 'reciprocal' | 'cartesian';

export function writeExplicitKpoints(
  points: readonly WeightedK[],
  coords: KCoords = 'reciprocal',
  comment = 'Explicit k-points',
): string {
  return [
    oneLine(comment),
    String(points.length),
    coords === 'reciprocal' ? 'Reciprocal' : 'Cartesian',
    ...points.map((p) => ` ${p.k.map(num).join(' ')} ${num(p.weight)}`),
    '',
  ].join('\n');
}

export interface LineSegment {
  from: Vec3;
  to: Vec3;
  fromLabel?: string;
  toLabel?: string;
}

export function writeLineMode(
  segments: readonly LineSegment[],
  pointsPerSegment: number,
  coords: KCoords = 'reciprocal',
  comment = 'k-path',
): string {
  const lab = (l?: string) => (l ? ` ! ${oneLine(l)}` : '');
  const body = segments.map(
    (s) => `${s.from.map(num).join(' ')}${lab(s.fromLabel)}\n${s.to.map(num).join(' ')}${lab(s.toLabel)}`,
  );
  return [
    oneLine(comment),
    String(pointsPerSegment),
    'Line-mode',
    coords === 'reciprocal' ? 'Reciprocal' : 'Cartesian',
    body.join('\n\n'),
    '',
  ].join('\n');
}

// ---- parser --------------------------------------------------------------------------------------------------

export type ParsedKpoints =
  | { kind: 'mesh'; centering: MeshKind; mesh: Mesh; shift: Vec3; comment: string }
  | { kind: 'auto'; length: number; comment: string }
  | { kind: 'explicit'; coords: KCoords; points: WeightedK[]; comment: string }
  | { kind: 'line'; coords: KCoords; pointsPerSegment: number; segments: LineSegment[]; comment: string };

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/;
function n(tok: string | undefined, line: number, what: string): number {
  if (tok === undefined || !NUM.test(tok))
    throw new ParseError(`expected a number for ${what}, found "${tok ?? ''}"`, line);
  return Number(tok.replace(/[dD]/, 'e'));
}
function triple(text: string | undefined, line: number, what: string): Vec3 {
  if (text === undefined) throw new ParseError(`missing ${what}`, line);
  const t = text.trim().split(/\s+/);
  return [n(t[0], line, what), n(t[1], line, what), n(t[2], line, what)];
}
const posInt = (x: number, line: number, what: string) => {
  if (!Number.isInteger(x) || x < 1) throw new ParseError(`${what} must be a positive integer`, line);
  return x;
};

/** Parse KPOINTS text (mesh, Auto, explicit list, line mode). Throws ParseError with the line number. */
export function parseKpoints(text: string): ParsedKpoints {
  const lines = text.split(/\r?\n/);
  if (lines.length < 3) throw new ParseError('file is too short to be a KPOINTS file', lines.length);
  const comment = lines[0]!.trim();
  const count = n(lines[1]!.trim().split(/\s+/)[0], 2, 'the number of k-points');
  const mode = (lines[2] ?? '').trim();
  if (mode === '') throw new ParseError('missing the mode line', 3);
  const c = mode[0]!.toLowerCase();

  if (count === 0) {
    if (c === 'a') {
      return { kind: 'auto', length: n((lines[3] ?? '').trim().split(/\s+/)[0], 4, 'the length'), comment };
    }
    if (c !== 'g' && c !== 'm') throw new ParseError(`unknown mesh mode "${mode}"`, 3);
    const t = (lines[3] ?? '').trim().split(/\s+/);
    const mesh: Mesh = [
      posInt(n(t[0], 4, 'N1'), 4, 'N1'),
      posInt(n(t[1], 4, 'N2'), 4, 'N2'),
      posInt(n(t[2], 4, 'N3'), 4, 'N3'),
    ];
    const shiftLine = (lines[4] ?? '').trim();
    const shift: Vec3 = shiftLine === '' ? [0, 0, 0] : triple(shiftLine, 5, 'the shift');
    return { kind: 'mesh', centering: c === 'g' ? 'gamma' : 'monkhorst-pack', mesh, shift, comment };
  }

  posInt(count, 2, 'the count');
  if (c === 'l') {
    const coordLine = (lines[3] ?? '').trim();
    if (coordLine === '') throw new ParseError('missing the coordinate mode line', 4);
    const coords: KCoords = /^[cCkK]/.test(coordLine) ? 'cartesian' : 'reciprocal';
    const pts: { k: Vec3; label?: string }[] = [];
    for (let i = 4; i < lines.length; i++) {
      const raw = lines[i]!.trim();
      if (raw === '') continue;
      const [body, ...rest] = raw.split('!');
      const label = rest.join('!').trim();
      pts.push({ k: triple(body, i + 1, 'a k-point'), ...(label ? { label } : {}) });
    }
    if (pts.length === 0 || pts.length % 2 !== 0)
      throw new ParseError('line mode needs pairs of points', lines.length);
    const segments: LineSegment[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      segments.push({
        from: a.k,
        to: b.k,
        ...(a.label ? { fromLabel: a.label } : {}),
        ...(b.label ? { toLabel: b.label } : {}),
      });
    }
    return { kind: 'line', coords, pointsPerSegment: count, segments, comment };
  }

  const coords: KCoords = c === 'c' || c === 'k' ? 'cartesian' : 'reciprocal';
  const points: WeightedK[] = [];
  for (let i = 0; i < count; i++) {
    const ln = 4 + i;
    const row = lines[3 + i];
    if (row === undefined || row.trim() === '')
      throw new ParseError(`expected ${count} k-points, found only ${i}`, ln);
    const t = row.trim().split(/\s+/);
    points.push({
      k: [n(t[0], ln, 'kx'), n(t[1], ln, 'ky'), n(t[2], ln, 'kz')],
      weight: n(t[3], ln, 'the weight'),
    });
  }
  return { kind: 'explicit', coords, points, comment };
}
