// Types for the Screening Studio data files, kept in sync with scripts/mp/schema.json (schema.test.ts checks).
// Field names follow the Materials Project summary endpoint.
// @source S-044 (Materials Project summary fields), S-024 (attribution)
import schemaJson from '../../../scripts/mp/schema.json';

export type JsonSchema = { [key: string]: unknown };
export const MP_SCHEMA = schemaJson as unknown as JsonSchema & {
  'x-schemaVersion': number;
  'x-budgets': MpBudgets;
  'x-keywords': string[];
  $defs: Record<string, JsonSchema>;
};

export interface MpBudgets {
  /** index.json, gzipped bytes. */
  indexGzipBytes: number;
  /** Shard packing target, gzipped bytes. */
  shardGzipTargetBytes: number;
  /** Hard maximum for one shard, gzipped bytes. */
  shardGzipMaxBytes: number;
  /** Whole dataset, gzipped bytes. */
  totalGzipBytes: number;
}
export const MP_BUDGETS: MpBudgets = MP_SCHEMA['x-budgets'];
export const MP_SCHEMA_VERSION = 1 as const;

export type Ordering = 'NM' | 'FM' | 'FiM' | 'AFM' | 'Unknown' | null;
export const CRYSTAL_SYSTEMS = [
  'Triclinic',
  'Monoclinic',
  'Orthorhombic',
  'Tetragonal',
  'Trigonal',
  'Hexagonal',
  'Cubic',
] as const;
export type CrystalSystem = (typeof CRYSTAL_SYSTEMS)[number];
export type Vec3 = [number, number, number];

export interface MpCurrent {
  schemaVersion: 1;
  dbVersion: string;
  /** Relative to public/data/mp/, for example "2026.04.13/manifest.json". */
  manifest: string;
}

export interface MpFileEntry {
  path: string;
  sha256: string;
  bytes: number;
  gzipBytes: number;
}

export interface MpManifest {
  schemaVersion: 1;
  /** True for sample or mock data. The Studio shows a "Synthetic demo data" banner; the deploy gate refuses it. */
  synthetic: boolean;
  dbVersion: string;
  generated: string;
  count: number;
  starterCount: number;
  shardTargetGzipBytes: number;
  licence: string;
  attribution: string;
  source: {
    client: string;
    clientVersion: string;
    query: Record<string, unknown>;
    fetched: string;
    mock: boolean;
    skipped?: Record<string, number>;
  };
  files: MpFileEntry[];
}
export const MANIFEST_KEYS = [
  'schemaVersion',
  'synthetic',
  'dbVersion',
  'generated',
  'count',
  'starterCount',
  'shardTargetGzipBytes',
  'licence',
  'attribution',
  'source',
  'files',
] as const satisfies readonly (keyof MpManifest)[];

/** One array per field, each of length count. Units: Å³, g/cm³, eV/atom, eV, Bohr magneton. */
export interface MpIndexColumns {
  material_id: string[];
  formula_pretty: string[];
  /** Indices into MpIndex.symbols. */
  elements: number[][];
  nsites: number[];
  volume: number[];
  density: number[];
  energy_above_hull: number[];
  formation_energy_per_atom: (number | null)[];
  band_gap: number[];
  is_gap_direct: (boolean | null)[];
  is_metal: (boolean | null)[];
  is_magnetic: (boolean | null)[];
  ordering: Ordering[];
  total_magnetization: (number | null)[];
  num_magnetic_sites: (number | null)[];
  /** Index into MpIndex.spaceGroups. */
  spacegroup: number[];
  is_stable: boolean[];
  theoretical: boolean[];
  /** Starter shard id ("000" ...) or null when the material ships no structure. */
  shard: (string | null)[];
}
export const INDEX_COLUMNS = [
  'material_id',
  'formula_pretty',
  'elements',
  'nsites',
  'volume',
  'density',
  'energy_above_hull',
  'formation_energy_per_atom',
  'band_gap',
  'is_gap_direct',
  'is_metal',
  'is_magnetic',
  'ordering',
  'total_magnetization',
  'num_magnetic_sites',
  'spacegroup',
  'is_stable',
  'theoretical',
  'shard',
] as const satisfies readonly (keyof MpIndexColumns)[];

export interface MpSpaceGroup {
  number: number;
  symbol: string;
  crystalSystem: CrystalSystem;
}

export interface MpIndex {
  schemaVersion: 1;
  dbVersion: string;
  count: number;
  symbols: string[];
  spaceGroups: MpSpaceGroup[];
  columns: MpIndexColumns;
}

export interface MpStructure {
  /** Rows are a, b, c in Å. */
  lattice: [Vec3, Vec3, Vec3];
  species: string[];
  frac: Vec3[];
}

export interface MpSummary {
  material_id: string;
  formula_pretty: string;
  chemsys: string;
  elements: string[];
  nelements: number;
  nsites: number;
  volume: number;
  density: number;
  energy_above_hull: number;
  formation_energy_per_atom: number | null;
  is_stable: boolean;
  band_gap: number;
  is_gap_direct: boolean | null;
  is_metal: boolean | null;
  is_magnetic: boolean | null;
  ordering: Ordering;
  total_magnetization: number | null;
  num_magnetic_sites: number | null;
  symmetry: { crystal_system: CrystalSystem; symbol: string; number: number; point_group: string };
  theoretical: boolean;
}
export const SUMMARY_KEYS = [
  'material_id',
  'formula_pretty',
  'chemsys',
  'elements',
  'nelements',
  'nsites',
  'volume',
  'density',
  'energy_above_hull',
  'formation_energy_per_atom',
  'is_stable',
  'band_gap',
  'is_gap_direct',
  'is_metal',
  'is_magnetic',
  'ordering',
  'total_magnetization',
  'num_magnetic_sites',
  'symmetry',
  'theoretical',
] as const satisfies readonly (keyof MpSummary)[];

export interface MpShardEntry {
  material_id: string;
  structure: MpStructure;
  summary: MpSummary;
}

export interface MpShard {
  schemaVersion: 1;
  dbVersion: string;
  shard: string;
  entries: MpShardEntry[];
}
