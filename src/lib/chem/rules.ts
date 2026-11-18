// The validity engine's thresholds, in one table. Each is a documented convention (D-063 to D-066),
// not a law of nature, so every rule that uses one is flagged heuristic in the UI.
// @source S-021 (covalent radii, used in B001 to B003), S-022 (Pauling's rules, B006 and B007),
// @source S-023 (charge-neutrality screening, B005), S-045 (Hume-Rothery rules, B009)

export type RuleCode =
  'B001' | 'B002' | 'B003' | 'B004' | 'B005' | 'B006' | 'B007' | 'B008' | 'B009' | 'B010' | 'B011' | 'B012';

export interface Learn {
  module: number;
  /** Concept id in src/data/concepts.json. */
  concept: string;
}

export interface RuleInfo {
  code: RuleCode;
  name: string;
  /** Rules built on a threshold or rule of thumb; shown with a "Heuristic" label. */
  heuristic: boolean;
  sources: string[];
  /** Decision entry that records the convention. */
  decision: string;
  learn: Learn;
}

export const THRESHOLDS = {
  /** B001: distance below this fraction of the covalent-radius sum is an overlap (error). */
  overlapFactor: 0.5,
  /** B002: distance below this fraction is a short contact (warning). */
  shortContactFactor: 0.75,
  /** B001 and B010: same-element atoms closer than this (angstrom) are duplicates to merge. */
  mergeDistance: 0.1,
  /** B003: spheres of this fraction of the covalent radius; their total volume above V needs B001-level overlap. */
  denseSphereFactor: 0.5,
  /** B004: allowed cell-angle range (degrees) and minimum volume per atom (angstrom^3). */
  minAngle: 20,
  maxAngle: 160,
  minVolumePerAtom: 1,
  /** B005: at most this many oxidation states per element (mixed valence, e.g. Fe3O4). */
  maxStatesPerElement: 2,
  /** B006 and B007: a cation-anion pair counts as ionic when the Pauling difference reaches this. */
  ionicDeltaX: 1.0,
  /** B006 and B007: coordination shell = anions within this factor of the shortest cation-anion distance. */
  shellFactor: 1.2,
  /** B007: allowed relative deviation of the bond-strength sum from the anion valence. */
  bondSumTolerance: 0.25,
  /** B009: radius mismatch against the majority element (fraction). */
  humeRotheryRadius: 0.15,
  /** B009: Pauling electronegativity difference. */
  humeRotheryDeltaX: 0.4,
} as const;

/**
 * B006 radius-ratio limits: the smallest r_cation / r_anion at which the anions around a cation stop touching
 * each other first, for each coordination polyhedron. Derived in validity.test.ts:
 * triangle 2/sqrt(3) - 1, tetrahedron sqrt(3/2) - 1, octahedron sqrt(2) - 1, cube sqrt(3) - 1.
 */
export const RADIUS_RATIO_LIMITS: { minCN: number; polyhedron: string; limit: number }[] = [
  { minCN: 8, polyhedron: 'cube', limit: Math.sqrt(3) - 1 },
  { minCN: 6, polyhedron: 'octahedron', limit: Math.SQRT2 - 1 },
  { minCN: 4, polyhedron: 'tetrahedron', limit: Math.sqrt(1.5) - 1 },
  { minCN: 3, polyhedron: 'triangle', limit: 2 / Math.sqrt(3) - 1 },
];

/** The limit for an observed coordination number, or undefined below CN 3 (no polyhedron). */
export const radiusRatioLimit = (cn: number) => RADIUS_RATIO_LIMITS.find((r) => cn >= r.minCN);

const MB: Learn = { module: 11, concept: 'material-builder' };
export const RULES: Record<RuleCode, RuleInfo> = {
  B001: {
    code: 'B001',
    name: 'Atoms overlap',
    heuristic: true,
    sources: ['S-021'],
    decision: 'D-063',
    learn: MB,
  },
  B002: {
    code: 'B002',
    name: 'Short contact',
    heuristic: true,
    sources: ['S-021'],
    decision: 'D-063',
    learn: MB,
  },
  B003: {
    code: 'B003',
    name: 'Cell too dense',
    heuristic: true,
    sources: ['S-021'],
    decision: 'D-063',
    learn: MB,
  },
  B004: {
    code: 'B004',
    name: 'Cell nearly degenerate',
    heuristic: true,
    sources: [],
    decision: 'D-063',
    learn: { module: 6, concept: 'lattice-vectors' },
  },
  B005: {
    code: 'B005',
    name: 'Charge neutrality',
    heuristic: true,
    sources: ['S-023', 'S-051', 'S-034'],
    decision: 'D-064',
    learn: { module: 10, concept: 'ionic-radii' },
  },
  B006: {
    code: 'B006',
    name: "Pauling's first rule (radius ratio)",
    heuristic: true,
    sources: ['S-022', 'S-001'],
    decision: 'D-065',
    learn: { module: 10, concept: 'ionic-radii' },
  },
  B007: {
    code: 'B007',
    name: "Pauling's second rule (bond strength)",
    heuristic: true,
    sources: ['S-022'],
    decision: 'D-065',
    learn: { module: 10, concept: 'ionic-radii' },
  },
  B008: {
    code: 'B008',
    name: 'Perovskite check',
    heuristic: true,
    sources: ['S-002', 'S-003'],
    decision: 'D-067',
    learn: { module: 10, concept: 'tolerance-factor' },
  },
  B009: {
    code: 'B009',
    name: 'Hume-Rothery rules',
    heuristic: true,
    sources: ['S-045', 'S-021'],
    decision: 'D-066',
    learn: MB,
  },
  B010: {
    code: 'B010',
    name: 'Periodic images',
    heuristic: false,
    sources: [],
    decision: 'D-063',
    learn: { module: 6, concept: 'poscar-file' },
  },
  B011: {
    code: 'B011',
    name: 'Symmetry',
    heuristic: false,
    sources: [],
    decision: 'D-063',
    learn: { module: 6, concept: 'space-group-symmetry' },
  },
  B012: {
    code: 'B012',
    name: 'Valence (molecules)',
    heuristic: false,
    sources: [],
    decision: 'D-063',
    learn: MB,
  },
};
