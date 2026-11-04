// Space-group analysis through moyo (the Rust successor of spglib, compiled to WebAssembly).
// @source S-032 (spglib and moyo), S-036 (space groups and lattices), D-003, D-045.
// Conventions (verified with moyo-wasm 0.21.0, see docs/verified-stack/moyo-node.reference.mjs):
//  - lattice.basis is [a1x, a1y, a1z, a2x, ...], which is our row-major Mat3 flattened;
//  - every other flat 3x3 from moyo is COLUMN-major: element (i, j) is at index i + 3 j;
//  - std_linear and prim_std_linear map the input basis to the new one: A_new (columns) = A_in (columns) * P, so with
//    our row convention the rows of the new cell are the rows of the input cell combined with P transposed.
import { atomicNumber, symbolOf } from './elements';
import { ParseError } from './errors';
import type { IntMat3 } from './pointgroup';
import type { Mat3, Structure, Vec3 } from './types';

export type SymmetrySetting = 'Standard' | 'Spglib';

/** The part of the moyo module this file uses; injected so tests, the worker and any future host can load it their way. */
export interface MoyoApi {
  analyze_cell(cellJson: string, symprec: number, setting: string): MoyoDatasetLike;
}
type Flat9 = readonly number[];
export interface MoyoCellLike {
  lattice: { basis: Flat9 };
  positions: readonly (readonly number[])[];
  numbers: readonly number[];
}
export interface MoyoDatasetLike {
  number: number;
  hall_number: number;
  hm_symbol: string;
  operations: { rotation: Flat9; translation: readonly number[] }[];
  orbits: readonly number[];
  wyckoffs: readonly string[];
  site_symmetry_symbols: readonly string[];
  std_cell: MoyoCellLike;
  std_linear: Flat9;
  std_origin_shift: readonly number[];
  pearson_symbol: string;
  prim_std_cell: MoyoCellLike;
  prim_std_linear: Flat9;
  prim_std_origin_shift: readonly number[];
  mapping_std_prim: readonly number[];
}

/** Column-major flat 9 numbers to a row-major Mat3: element (i, j) is at index i + 3 j. */
export const fromColumnMajor = (m: Flat9): Mat3 => [
  [m[0]!, m[3]!, m[6]!],
  [m[1]!, m[4]!, m[7]!],
  [m[2]!, m[5]!, m[8]!],
];
/** Row-major flat basis (a1x, a1y, a1z, a2x, ...) to rows. */
export const latticeFromBasis = (b: Flat9): Mat3 => [
  [b[0]!, b[1]!, b[2]!],
  [b[3]!, b[4]!, b[5]!],
  [b[6]!, b[7]!, b[8]!],
];
const rint = (x: number): number => Math.round(x) + 0;
const rotationFromMoyo = (m: Flat9): IntMat3 =>
  fromColumnMajor(m).map((r) => r.map(rint)) as unknown as IntMat3;

export interface SymmetryOperation {
  /** Integer rotation acting on fractional column vectors: x' = R x + t. */
  rotation: IntMat3;
  translation: Vec3;
}

export interface SymmetryResult {
  number: number;
  hmSymbol: string;
  hallNumber: number;
  pearson: string;
  operations: SymmetryOperation[];
  wyckoffs: string[];
  siteSymmetries: string[];
  /** Symmetry-equivalent atoms share an orbit index (indices into the input structure). */
  orbits: number[];
  stdCell: Structure;
  primStdCell: Structure;
  /** Input to standardized conventional basis, as a row-major matrix (element (i, j) = moyo index i + 3 j). */
  stdLinear: Mat3;
  stdOriginShift: Vec3;
  primStdLinear: Mat3;
  primStdOriginShift: Vec3;
  /** For each atom of the conventional standardized cell, the index of its atom in the primitive standardized cell. */
  mappingStdPrim: number[];
  symprec: number;
  setting: SymmetrySetting;
}

const v3 = (a: readonly number[]): Vec3 => [a[0]!, a[1]!, a[2]!];

/** Build the JSON moyo expects. Species must be element symbols known to the table. */
export function toMoyoCell(s: Structure): string {
  const numbers = s.species.map((sym) => {
    const z = atomicNumber(sym);
    if (z === undefined) throw new RangeError(`Unknown element symbol "${sym}".`);
    return z;
  });
  return JSON.stringify({
    lattice: { basis: [...s.lattice[0], ...s.lattice[1], ...s.lattice[2]] },
    positions: s.frac.map((f) => [f[0], f[1], f[2]]),
    numbers,
  });
}

/** A moyo cell back to our Structure (species symbols from atomic numbers). */
export function fromMoyoCell(c: MoyoCellLike, comment?: string): Structure {
  return {
    lattice: latticeFromBasis(c.lattice.basis),
    species: c.numbers.map((z) => symbolOf(z) ?? `Z${z}`),
    frac: c.positions.map(v3),
    ...(comment ? { comment } : {}),
  };
}

let registered: MoyoApi | undefined;
/** Register the loaded moyo module (the worker does this once after init). */
export const registerMoyo = (api: MoyoApi | undefined): void => {
  registered = api;
};

export interface AnalyzeOptions {
  symprec?: number;
  setting?: SymmetrySetting;
}

/** Analyze with an explicit moyo module. Throws RangeError for unknown elements and Error when moyo cannot find a symmetry. */
export function analyzeWith(api: MoyoApi, s: Structure, opts: AnalyzeOptions = {}): SymmetryResult {
  const symprec = opts.symprec ?? 1e-4;
  const setting = opts.setting ?? 'Standard';
  if (s.frac.length === 0) throw new RangeError('The structure has no atoms.');
  let d: MoyoDatasetLike;
  try {
    d = api.analyze_cell(toMoyoCell(s), symprec, setting);
  } catch (e) {
    if (e instanceof RangeError) throw e;
    throw new Error(
      `The symmetry search failed (${String(e).slice(0, 160)}). Try a larger tolerance, or check that no two atoms overlap.`,
      { cause: e },
    );
  }
  return {
    number: d.number,
    hmSymbol: d.hm_symbol,
    hallNumber: d.hall_number,
    pearson: d.pearson_symbol,
    operations: d.operations.map((o) => ({
      rotation: rotationFromMoyo(o.rotation),
      translation: v3(o.translation),
    })),
    wyckoffs: [...d.wyckoffs],
    siteSymmetries: [...d.site_symmetry_symbols],
    orbits: [...d.orbits],
    stdCell: fromMoyoCell(d.std_cell, s.comment),
    primStdCell: fromMoyoCell(d.prim_std_cell, s.comment),
    stdLinear: fromColumnMajor(d.std_linear),
    stdOriginShift: v3(d.std_origin_shift),
    primStdLinear: fromColumnMajor(d.prim_std_linear),
    primStdOriginShift: v3(d.prim_std_origin_shift),
    mappingStdPrim: [...d.mapping_std_prim],
    symprec,
    setting,
  };
}

/** Analyze with the registered moyo module. */
export function analyze(s: Structure, opts: AnalyzeOptions = {}): SymmetryResult {
  if (!registered) throw new Error('The symmetry engine is not loaded yet.');
  return analyzeWith(registered, s, opts);
}

export { ParseError };
