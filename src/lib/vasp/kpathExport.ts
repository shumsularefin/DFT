// Path table and file writers for a band-structure k-path: segment lengths, points per segment, VASP line-mode KPOINTS,
// KPATH.in, KPOINTS_OPT and a plain coordinate list (CSV and JSON). Pure functions, no DOM.
// @source S-019 (VASP wiki: KPOINTS, line-mode format), S-006 (HPKOT paths), S-005 (Setyawan-Curtarolo paths), S-042 (author's Workflow Handbook: routes A and B), S-058 (VASPKIT KPATH.in layout)
//
// Geometry: a segment from k1 to k2 (fractional coordinates in the basis of the reciprocal primitive lattice B, rows,
// WITH the factor 2 pi) has length |(k2 - k1) B| in 1/Angstrom. VASP line mode writes `n` points on every segment, both
// end points included, and takes ONE n for the whole file (so a segment with its own count cannot be written in
// line mode; see `lineModeCount`).
import { qToCartesian } from '../crystal/kmesh';
import type { KPathAny, KPathConvention } from '../crystal/kpath';
import type { Mat3, Vec3 } from '../crystal/types';

export type Spacing = { mode: 'count'; n: number } | { mode: 'density'; perInvA: number };

export const MIN_POINTS = 2;
export const MAX_POINTS = 1000;

export interface PathSegment {
  index: number;
  /** Label as stored (HPKOT "GAMMA", "W_2"; Setyawan-Curtarolo "\\Gamma", "A_1"). */
  from: string;
  to: string;
  /** Plain ASCII label for files ("GAMMA", "W_2"). */
  fromFile: string;
  toFile: string;
  kFrom: Vec3;
  kTo: Vec3;
  /** |(kTo - kFrom) B| in 1/Angstrom, with the factor 2 pi. */
  length: number;
  /** Points on this segment, both ends included. */
  points: number;
  /** True when the number was set by hand for this segment. */
  overridden: boolean;
  /** Spacing between neighbouring points in 1/Angstrom, length / (points - 1). */
  spacing: number;
  /** True when this segment starts where the previous one ended (a continuous line); false at a jump. */
  continuous: boolean;
}

export interface PathTable {
  convention: KPathConvention;
  segments: PathSegment[];
  totalPoints: number;
  totalLength: number;
  /** The one number written into a line-mode file: the largest count over the segments. */
  lineModeCount: number;
  /** True when segments differ in their count, so a line-mode file cannot hold them all exactly. */
  countsDiffer: boolean;
  reciprocal: Mat3;
}

const clampPoints = (n: number): number =>
  Math.min(MAX_POINTS, Math.max(MIN_POINTS, Number.isFinite(n) ? Math.round(n) : MIN_POINTS));

/** Plain ASCII form of a point label for KPOINTS comments: no backslash, Greek names in capitals. */
export function fileLabel(label: string): string {
  return label.replace(/^\\/, '').replace(/^(Gamma|Delta|Lambda|Sigma)/, (g) => g.toUpperCase());
}

const same = (a: Vec3, b: Vec3): boolean => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9;

/**
 * Build the segment table. `density` mode gives each segment ceil(length * density) points (at least 2), so the
 * points per 1/Angstrom is a target, not an exact spacing. `overrides` maps a segment index to a hand-set count.
 */
export function buildPathTable(
  r: KPathAny,
  spacing: Spacing,
  overrides: Readonly<Record<number, number>> = {},
): PathTable {
  const b = r.reciprocalPrimitive;
  const coord = (label: string): Vec3 => (r.pointCoords[label] ?? [0, 0, 0]) as Vec3;
  const segments: PathSegment[] = [];
  r.path.forEach(([from, to], index) => {
    const kFrom = coord(from);
    const kTo = coord(to);
    const cf = qToCartesian(kFrom, b);
    const ct = qToCartesian(kTo, b);
    const length = Math.hypot(ct[0] - cf[0], ct[1] - cf[1], ct[2] - cf[2]);
    const hand = overrides[index];
    const base =
      spacing.mode === 'count' ? clampPoints(spacing.n) : clampPoints(Math.ceil(length * spacing.perInvA));
    const points = hand !== undefined ? clampPoints(hand) : base;
    const prev = segments[index - 1];
    segments.push({
      index,
      from,
      to,
      fromFile: fileLabel(from),
      toFile: fileLabel(to),
      kFrom,
      kTo,
      length,
      points,
      overridden: hand !== undefined,
      spacing: points > 1 ? length / (points - 1) : length,
      continuous: prev ? same(prev.kTo, kFrom) : true,
    });
  });
  const counts = segments.map((s) => s.points);
  return {
    convention: r.convention,
    segments,
    totalPoints: counts.reduce((a, c) => a + c, 0),
    totalLength: segments.reduce((a, s) => a + s.length, 0),
    lineModeCount: counts.length ? Math.max(...counts) : MIN_POINTS,
    countsDiffer: new Set(counts).size > 1,
    reciprocal: b,
  };
}

// ---- k-point coordinate list -----------------------------------------------------------------------------------

export interface PathPoint {
  index: number;
  segment: number;
  /** ASCII label, only on the two end points of a segment. */
  label: string | undefined;
  frac: Vec3;
  cart: Vec3;
  /** Distance along the path in 1/Angstrom. A jump between two segments adds nothing. */
  distance: number;
}

/** All points of the path, segment by segment, each segment with its own count and both end points. */
export function pathPoints(t: PathTable): PathPoint[] {
  const out: PathPoint[] = [];
  let base = 0;
  t.segments.forEach((s, si) => {
    const n = s.points;
    for (let j = 0; j < n; j++) {
      const u = n === 1 ? 0 : j / (n - 1);
      const frac: Vec3 = [
        s.kFrom[0] + u * (s.kTo[0] - s.kFrom[0]),
        s.kFrom[1] + u * (s.kTo[1] - s.kFrom[1]),
        s.kFrom[2] + u * (s.kTo[2] - s.kFrom[2]),
      ];
      out.push({
        index: out.length,
        segment: si,
        label: j === 0 ? s.fromFile : j === n - 1 ? s.toFile : undefined,
        frac,
        cart: qToCartesian(frac, t.reciprocal),
        distance: base + u * s.length,
      });
    }
    base += s.length;
  });
  return out;
}

// ---- text writers ----------------------------------------------------------------------------------------------

const f10 = (x: number): string => {
  const t = x.toFixed(10);
  return Number(t) === 0 ? (0).toFixed(10) : t;
};
const row = (k: Vec3, label: string): string => `${k.map(f10).join(' ')} ! ${label}`;
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ');

/**
 * VASP line-mode text: comment, points per segment, `Line-mode`, `Reciprocal`, then pairs of points with `! label`
 * comments and a blank line between segments. The count is `lineModeCount` unless given.
 */
export function writeKpathLineMode(t: PathTable, comment: string, count: number = t.lineModeCount): string {
  const body = t.segments.map((s) => `${row(s.kFrom, s.fromFile)}\n${row(s.kTo, s.toFile)}`);
  return [
    oneLine(comment),
    String(clampPoints(count)),
    'Line-mode',
    'Reciprocal',
    body.join('\n\n'),
    '',
  ].join('\n');
}

export interface KpathHeader {
  /** Space group short symbol, e.g. "Fm-3m". */
  spacegroup: string;
  /** Lattice name in the convention, e.g. "cF2" or "FCC". */
  lattice: string;
}

const conventionName = (c: KPathConvention): string => (c === 'HPKOT' ? 'HPKOT' : 'Setyawan-Curtarolo');

/** First line of KPOINTS. It names the convention so the file explains itself months later. */
export function kpointsComment(t: PathTable, h: KpathHeader): string {
  return `${conventionName(t.convention)} k-path for ${h.spacegroup.replace(/\s+/g, '')} (${h.lattice}), ${t.lineModeCount} points per segment`;
}

/** KPOINTS for a non-self-consistent band run (route B) or any line-mode run. */
export const writeKpoints = (t: PathTable, h: KpathHeader): string =>
  writeKpathLineMode(t, kpointsComment(t, h));

/**
 * KPATH.in: the same line-mode content as KPOINTS, which is what the author's protocol relies on (`cp KPATH.in KPOINTS`).
 * The exact layout VASPKIT writes has not been checked (Q-039), so this is VASPKIT-style, not a copy of its output.
 */
/** VASPKIT row: each coordinate right-aligned in 15 columns with 10 decimals, then five spaces and the bare label. */
const vaspkitRow = (k: Vec3, label: string): string =>
  `${k.map((x) => f10(x).padStart(15)).join('')}     ${label}`;

/**
 * KPATH.in in the layout VASPKIT writes (S-058): comment, count, `Line-Mode`, `Reciprocal`, then point pairs with
 * bare labels and a blank line between segments. VASP reads it as a line-mode KPOINTS file (`cp KPATH.in KPOINTS`).
 */
export function writeKpathIn(t: PathTable, h: KpathHeader): string {
  const body = t.segments.map((s) => `${vaspkitRow(s.kFrom, s.fromFile)}\n${vaspkitRow(s.kTo, s.toFile)}`);
  return [
    oneLine(`K-path (KPATH.in), ${kpointsComment(t, h)}`),
    String(clampPoints(t.lineModeCount)).padStart(5),
    'Line-Mode',
    'Reciprocal',
    body.join('\n\n'),
    '',
  ].join('\n');
}

/** KPOINTS_OPT for VASP 6.3 and later (route A). Same line-mode content; the uniform mesh stays in KPOINTS. */
export const writeKpointsOpt = (t: PathTable, h: KpathHeader): string =>
  writeKpathLineMode(t, `KPOINTS_OPT, ${kpointsComment(t, h)}`);

const csvCell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV of every point: index, segment, label, fractional and Cartesian coordinates, cumulative distance. */
export function writePathCsv(t: PathTable): string {
  const head = 'index,segment,label,k1,k2,k3,kx,ky,kz,distance';
  const lines = pathPoints(t).map((p) =>
    [
      String(p.index),
      String(p.segment),
      csvCell(p.label ?? ''),
      ...p.frac.map(f10),
      ...p.cart.map(f10),
      f10(p.distance),
    ].join(','),
  );
  return [head, ...lines, ''].join('\n');
}

/** JSON of every point with the table. Units: 1/Angstrom, factor 2 pi included. */
export function writePathJson(t: PathTable, h: KpathHeader): string {
  return (
    JSON.stringify(
      {
        convention: conventionName(t.convention),
        spacegroup: h.spacegroup,
        lattice: h.lattice,
        units:
          '1/Angstrom, with the factor 2 pi; fractional coordinates are in the basis of reciprocal_lattice (rows)',
        reciprocal_lattice: t.reciprocal,
        segments: t.segments.map((s) => ({
          from: s.fromFile,
          to: s.toFile,
          length: s.length,
          points: s.points,
        })),
        points: pathPoints(t).map((p) => ({
          index: p.index,
          segment: p.segment,
          label: p.label ?? null,
          frac: p.frac,
          cart: p.cart,
          distance: p.distance,
        })),
      },
      null,
      2,
    ) + '\n'
  );
}

/** Short guidance that goes next to the KPOINTS_OPT download (the author's protocol, S-042). */
export const ROUTE_NOTES = {
  routeA:
    'Route A (VASP 6.3 or newer, one run): keep the uniform mesh in KPOINTS, save this file as KPOINTS_OPT in the same folder, and run the SCF without ICHARG = 11. After the SCF has converged, VASP also computes the bands on the KPOINTS_OPT points in the same job.',
  routeB:
    'Route B (any VASP 5.4 or 6.x): converge an SCF on the uniform mesh first and keep its CHGCAR. Then use the KPOINTS file from this page in a new folder together with that CHGCAR and set ICHARG = 11, which reads the density and keeps it fixed. A line-mode path is not a valid sampling of the zone, so it must never be the mesh of the SCF itself.',
  cell: 'Use the standardized primitive cell from this page (download it below) as the POSCAR for either route. The coordinates in the file are fractions of that cell’s reciprocal vectors, so another cell would put the points in the wrong places.',
} as const;
