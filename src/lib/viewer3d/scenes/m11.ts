// Module 11 (the site's own tools) scenes: live walkthroughs of the Material Builder and the Screening Studio, one small
// scene per research tool, and the map of where to go next. Every structure comes from the Builder's own template and
// the tested crystal libraries; the Studio data are the synthetic demo table, shown as such.
// @source S-021, S-052 (covalent radii for the B001 and B002 overlap test), S-022, S-051 (validity rules B005, B006)
// @source S-001, S-002, S-003 (Shannon radii, Goldschmidt t, octahedral factor), S-058 (A-, C-, G-type orderings)
// @source S-005 (cubic k-path), S-019 (KSPACING mesh rule), S-061, S-068 (Birch-Murnaghan fit), S-024, S-044, S-102
// @source S-010 (N^3 cost scaling of the Project Card)
import { CRYSTAL_TEMPLATES } from '../../../components/tools/builder/crystalTemplates';
import { covalentRadius } from '../../chem/elements';
import { contacts } from '../../chem/geometry';
import { THRESHOLDS } from '../../chem/rules';
import { check, type Issue } from '../../chem/validity';
import { shortestLatticeVector, substitute, vacancy } from '../../crystal/defects';
import { fracToCart, reciprocalLattice } from '../../crystal/lattice';
import type { IntMat3 } from '../../crystal/reduction';
import { speciesCounts } from '../../crystal/structure';
import { buildSupercell } from '../../crystal/supercell';
import type { Mat3, Structure } from '../../crystal/types';
import { magmomFor } from '../../magnetism/magmom';
import { NAMED_LABEL, namedOrdering, netMoment, type MagneticConfiguration } from '../../magnetism/orderings';
import { estimateRelativeCost } from '../../mp/feasibility';
import { filterRowIndices, materializeRow, type MaterialRow, type StudioQuery } from '../../mp/query';
import { familySweep, type FamilySweepRow } from '../../perovskite/maps';
import { getRadius } from '../../perovskite/shannon';
import { EV_PER_A3_IN_GPA } from '../../physics/constants';
import { eosEnergy, fitEos, type EosFit } from '../../physics/eos';
import { MODULES } from '../../site';
import {
  arrows,
  atoms,
  axesLayers,
  brillouinLayers,
  cellEdges,
  crystalLayers,
  curve,
  fmt,
  hullLayer,
  labels,
  lines,
  points,
  quadLayer,
  speciesTones,
  surfaceLayer,
} from '../kit';
import { add, norm, scale, sub } from '../math';
import {
  withDefaults,
  type Color,
  type Layer,
  type Params,
  type SceneDef,
  type SceneFrame,
  type Vec3,
} from '../types';
import { STUDIO_SAMPLE } from './studioSample';

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const num = (p: Params, k: string, d = 0) => {
  const x = Number(p[k]);
  return Number.isFinite(x) ? x : d;
};
const str = (p: Params, k: string) => String(p[k] ?? '');
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Small bounded memo: heavy results keyed by the parameters that matter. */
function memo<T>(size = 32) {
  const m = new Map<string, T>();
  return (key: string, make: () => T): T => {
    const hit = m.get(key);
    if (hit !== undefined) return hit;
    const v = make();
    if (m.size >= size) m.delete(m.keys().next().value as string);
    m.set(key, v);
    return v;
  };
}

/** The structure with its lattice multiplied by f (the POSCAR scale line). */
export const scaledStructure = (s: Structure, f: number): Structure => ({
  ...s,
  lattice: s.lattice.map((r) => r.map((x) => x * f)) as unknown as Mat3,
});

/** Full formula in order of first appearance, for example La16Cu16O47. */
export const fullFormula = (s: Structure): string =>
  speciesCounts(s)
    .map((c) => `${c.symbol}${c.count === 1 ? '' : c.count}`)
    .join('');

const cartesian = (s: Structure): Vec3[] => s.frac.map((f) => v3(fracToCart(f, s.lattice)));

// ---------------------------------------------------------------------------------------------------------------------
// The Material Builder walkthrough of the topic page: template, substitutions, defect supercell, vacancy, overlap test.

/** The Builder's own "Cubic perovskite (SrTiO3)" template (crystalTemplates.ts), a = 3.905 Angstrom, five sites. */
export const TEMPLATE: Structure = CRYSTAL_TEMPLATES.find((t) => t.id === 'perovskite')!.structure;
export const A0 = TEMPLATE.lattice[0][0];
/** "Sub La" on the Sr row, then "Sub Cu" on the Ti row, through the same `substitute` the Builder calls. */
export const LACUO3: Structure = substitute(substitute(TEMPLATE, 0, 'La').structure, 1, 'Cu').structure;
/**
 * The matrix that the Builder's "Defect supercell (>= 10 A)" button picks for the template cell, from
 * `suggestSupercell(LACUO3, 10)` (m11.test.ts asserts the two agree; kept as a constant so a slider move stays fast).
 */
export const DEFECT_MATRIX: IntMat3 = [
  [4, 0, 0],
  [2, 2, 0],
  [2, 0, 2],
];
export const SUPERCELL: Structure = buildSupercell(LACUO3, DEFECT_MATRIX).structure;
/** The first O row of the supercell: the one "Vacancy" removes in this walkthrough. */
export const VACANCY_SITE = SUPERCELL.species.indexOf('O');
export const VACANCY_CELL: Structure = vacancy(SUPERCELL, VACANCY_SITE).structure;

export interface OverlapPair {
  i: number;
  j: number;
  /** Cartesian vector from atom i to the closest image of atom j, Angstrom. */
  vector: Vec3;
  distance: number;
  /** Sum of the two covalent radii (Cordero), Angstrom. */
  sum: number;
  ratio: number;
  rule: 'B001' | 'B002' | null;
}

/**
 * The Builder's distance rules B001 and B002 (chem/validity.ts, pairRules): every pair at its closest periodic image is
 * compared with the sum of covalent radii; below 0.5 of it is an overlap error, below 0.75 a short-contact warning.
 * Same-species pairs closer than 0.1 Angstrom are duplicates (B010), not overlaps. Also returns the pair with the
 * smallest ratio d / (r_i + r_j), flagged or not.
 */
export function overlapTest(s: Structure): { flagged: OverlapPair[]; closest: OverlapPair | null } {
  let maxR = 0;
  for (const el of new Set(s.species)) maxR = Math.max(maxR, covalentRadius(el) ?? 0);
  const cut = Math.max(THRESHOLDS.mergeDistance * 2, THRESHOLDS.shortContactFactor * 2 * maxR);
  const flagged: OverlapPair[] = [];
  const seen = new Set<string>();
  const first = new Set<string>();
  let closest: OverlapPair | null = null;
  for (const c of contacts(s, cut)) {
    const ri = covalentRadius(s.species[c.i]!);
    const rj = covalentRadius(s.species[c.j]!);
    if (ri === null || rj === null) continue;
    const key = `${c.i}-${c.j}`;
    if (seen.has(key)) continue;
    const sum = ri + rj;
    const pair: OverlapPair = {
      i: c.i,
      j: c.j,
      vector: v3(c.vector),
      distance: c.distance,
      sum,
      ratio: c.distance / sum,
      rule: null,
    };
    const duplicate =
      s.species[c.i] === s.species[c.j] && c.i !== c.j && c.distance < THRESHOLDS.mergeDistance;
    if (!first.has(key)) {
      first.add(key);
      if (!duplicate && (!closest || pair.ratio < closest.ratio)) closest = pair;
    }
    if (duplicate) {
      seen.add(key);
      continue;
    }
    if (c.i === c.j) {
      if (c.distance < THRESHOLDS.overlapFactor * sum) {
        seen.add(key);
        flagged.push({ ...pair, rule: 'B001' });
      }
      continue;
    }
    if (c.distance < THRESHOLDS.overlapFactor * sum) {
      seen.add(key);
      flagged.push({ ...pair, rule: 'B001' });
    } else if (c.distance < THRESHOLDS.shortContactFactor * sum) {
      seen.add(key);
      flagged.push({ ...pair, rule: 'B002' });
    }
  }
  if (closest) closest = flagged.find((f) => f.i === closest!.i && f.j === closest!.j) ?? closest;
  return { flagged, closest };
}

const checkMemo = memo<Issue[]>(48);
/** The Builder's validity panel for a small cell (check() is too slow to rerun on 80 sites at every slider move). */
const validity = (key: string, s: Structure) => checkMemo(key, () => check(s, 'crystal'));
const overlapMemo = memo<ReturnType<typeof overlapTest>>(48);
const vectorMemo = memo<number>(48);

const STEPS = [
  'Template',
  'Sub La and Sub Cu',
  'Defect supercell (>= 10 A)',
  'Vacancy on one O row',
  'Overlap test (B001, B002)',
] as const;

const atomName = (s: Structure, i: number) => `${s.species[i]}${i + 1}`;
const issueWords = (is: readonly Issue[]) =>
  is.length ? is.map((i) => `${i.code} (${i.severity}: ${i.title})`).join(', ') : 'no messages';
const codes = (is: readonly Issue[]) => [...new Set(is.map((i) => i.code))].join(', ') || 'none';

/** MAGMOM for a ferromagnetic start in POSCAR order (species grouped), Cu at 3 muB and the rest 0, as on the page. */
export const ferroMagmom = (s: Structure): string =>
  speciesCounts(s)
    .map((c) => `${c.count}*${c.symbol === 'Cu' ? 3 : 0}`)
    .join(' ');

function octahedronLayer(a: number): Layer {
  const o: Vec3[] = [
    [a / 2, a / 2, 0],
    [a / 2, a / 2, a],
    [a / 2, 0, a / 2],
    [a / 2, a, a / 2],
    [0, a / 2, a / 2],
    [a, a / 2, a / 2],
  ];
  return hullLayer(o, { group: 'octahedron', name: 'BO6 octahedron', color: 'accent', opacity: 0.25 });
}

const builder: SceneDef = {
  id: 'm11-builder-tour',
  title: 'A guided build in the Material Builder',
  badge: 'computed',
  sources: ['S-021', 'S-052', 'S-022', 'S-051', 'S-002', 'S-001'],
  params: [
    {
      kind: 'step',
      id: 'step',
      label: 'Builder step',
      min: 0,
      max: 4,
      value: 0,
      interval: 1.6,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'scale',
      label: 'POSCAR scale factor',
      min: 0.45,
      max: 1.1,
      step: 0.01,
      value: 1,
      digits: 2,
      physics: true,
    },
    { kind: 'toggle', id: 'shells', label: 'Overlap shells (0.5 and 0.75 of the radii)', value: true },
    { kind: 'toggle', id: 'compare', label: 'Compare the 3x3x3 cell', value: false, physics: true },
  ],
  build(p) {
    const step = Math.round(clamp(num(p, 'step'), 0, 4));
    const f = clamp(num(p, 'scale', 1), 0.3, 2);
    const a = A0 * f;
    const fk = f.toFixed(3);
    const layers: Layer[] = [];
    const readouts: SceneFrame['readouts'] = [{ label: 'Step', value: `${step + 1} of 5: ${STEPS[step]}` }];
    let describe: string;
    const tones = speciesTones(['La', 'Cu', 'O']);
    const parent: [Vec3, Vec3, Vec3] = [
      [a, 0, 0],
      [0, a, 0],
      [0, 0, a],
    ];

    if (step <= 1) {
      const s = scaledStructure(step === 0 ? TEMPLATE : LACUO3, f);
      const cr = crystalLayers(s, { boundary: true, radiusScale: 0.45 });
      const at = cr.layers[0]!;
      if (step === 1 && at.kind === 'atoms')
        at.highlight = cr.species.flatMap((e, i) => (e === 'La' || e === 'Cu' ? [i] : []));
      layers.push(...cr.layers, octahedronLayer(a));
      const [A, B] = [s.species[0]!, s.species[1]!];
      layers.push(
        labels(
          [
            { text: step === 1 ? `${A} (Sub La on the Sr row)` : `${A} (A site)`, at: [-0.4, -0.4, a + 0.5] },
            {
              text: step === 1 ? `${B} (Sub Cu on the Ti row)` : `${B} (B site)`,
              at: [a / 2, a / 2, a / 2 + 0.9],
            },
            { text: 'O', at: [a / 2, -0.4, a / 2] },
          ],
          'labels',
        ),
      );
      const is = validity(`${step}|${fk}`, s);
      const errors = is.filter((i) => i.severity === 'error').length;
      const b008 = is.find((i) => i.code === 'B008');
      describe =
        `${step === 0 ? "The Builder's template Cubic perovskite (SrTiO3)" : 'The template after Sub La on the Sr row and Sub Cu on the Ti row'}: ` +
        `${fullFormula(s)}, five sites in a cubic cell of ${fmt(a, 3)} Å with the ${B}O6 octahedron drawn at the centre. ` +
        `The validity panel shows ${issueWords(is)}; ${errors ? `${errors} error${errors === 1 ? '' : 's'}, so export needs a written reason` : 'no error, so export is allowed'}.` +
        (b008?.data && typeof b008.data.t === 'number'
          ? ` From B008, t = ${fmt(b008.data.t, 3)} and mu = ${fmt(Number(b008.data.mu), 3)}.`
          : '');
      readouts.push(
        { label: 'Formula', value: `${fullFormula(s)} (5 sites)` },
        { label: 'Lattice parameter', value: `${fmt(a, 3)} Å` },
        { label: 'Validity panel', value: codes(is) },
      );
    } else {
      const base = step === 2 ? SUPERCELL : VACANCY_CELL;
      const s = scaledStructure(base, f);
      const dmin = vectorMemo(fk, () => shortestLatticeVector(s.lattice));
      layers.push(lines(cellEdges(parent), 'muted', 'parent-cell', { name: 'Template cell', dashed: true }));
      if (step === 2 || step === 3) {
        const cr = crystalLayers(s, { radiusScale: 0.42, groups: { cell: 'supercell' } });
        layers.push(...cr.layers);
        if (step === 2) {
          const L = s.lattice.map(v3) as Vec3[];
          layers.push(
            arrows([...L.map((): Vec3 => [0, 0, 0])], L, 'accent', 'vectors', {
              name: 'Supercell vectors',
              thickness: 0.012,
            }),
            labels(
              L.map((v, k) => ({
                text: `${['4a1', '2a1 + 2a2', '2a1 + 2a3'][k]}: ${fmt(norm(v), 2)} Å`,
                at: add(scale(v, 1.04), [0, 0, 0.5]),
              })),
              'labels',
            ),
          );
          if (p.compare)
            layers.push(
              lines(cellEdges(parent.map((r) => scale(r, 3)) as Vec3[]), 'neg', 'cube333', {
                name: '3x3x3 cell (135 atoms)',
                dashed: true,
              }),
            );
          describe =
            `Defect supercell (>= 10 A): the Builder searched the Hermite normal forms up to 64 copies and picked M = [[4, 0, 0], [2, 2, 0], [2, 0, 2]], ` +
            `det M = 16 copies, 80 atoms. Its vectors 4a1, 2a1 + 2a2 and 2a1 + 2a3 are ${L.map((v) => fmt(norm(v), 2)).join(', ')} Å long, ` +
            `so the shortest lattice vector, the distance from a defect to its image, is ${fmt(dmin, 2)} Å. The dashed cube is the template cell.` +
            (p.compare
              ? ` The red dashed cube is the 3x3x3 cell: 135 atoms for a shortest vector of ${fmt(3 * a, 2)} Å.`
              : '');
          readouts.push(
            { label: 'Copies (det M)', value: '16' },
            { label: 'Atoms', value: `${s.species.length} (3x3x3 would hold 135)` },
            { label: 'Shortest vector', value: `${fmt(dmin, 2)} Å` },
          );
        } else {
          const ghost = v3(fracToCart(SUPERCELL.frac[VACANCY_SITE]!, s.lattice));
          layers.push(
            atoms([ghost], 0.55, 'muted', 'vacancy', {
              name: 'Vacancy',
              opacity: 0.3,
              highlight: [0],
              labels: [`vacancy: O${VACANCY_SITE + 1} removed`],
            }),
            labels([{ text: 'vacancy', at: add(ghost, [0, 0, 0.9]) }], 'labels'),
          );
          describe =
            `Vacancy on the O row ${VACANCY_SITE + 1}: one oxygen of the 80-site cell is removed (the faint grey sphere with an outline marks the empty site), ` +
            `so the cell is ${fullFormula(s)} with 79 atoms, and a ferromagnetic start needs MAGMOM = ${ferroMagmom(s)}, 79 entries. ` +
            `The defect sits ${fmt(dmin, 2)} Å from its nearest image.`;
          readouts.push(
            { label: 'Formula', value: fullFormula(s) },
            { label: 'Atoms', value: String(s.species.length) },
            { label: 'MAGMOM (FM start)', value: ferroMagmom(s) },
          );
        }
      } else {
        // step 4: the overlap test on the vacancy cell at this scale
        const pos = cartesian(s);
        const r = s.species.map((e) => covalentRadius(e) ?? 1.4);
        const col = s.species.map((e) => tones.get(e) ?? 'c3');
        const ov = overlapMemo(fk, () => overlapTest(s));
        const flaggedAtoms = [...new Set(ov.flagged.flatMap((q) => [q.i, q.j]))];
        layers.push(
          lines(cellEdges(s.lattice.map(v3)), 'muted', 'supercell', { name: 'Supercell' }),
          atoms(
            pos,
            r.map((x) => THRESHOLDS.overlapFactor * x),
            col,
            'cores',
            {
              name: 'Spheres of 0.5 r: touching means B001',
              labels: s.species.map((e, i) => `${e}${i + 1}`),
              highlight: flaggedAtoms,
            },
          ),
        );
        if (p.shells)
          layers.push(
            atoms(
              pos,
              r.map((x) => THRESHOLDS.shortContactFactor * x),
              col,
              'shells',
              { name: 'Shells of 0.75 r: touching means B002', opacity: 0.16 },
            ),
          );
        const seg = (q: OverlapPair): [Vec3, Vec3] => [pos[q.i]!, add(pos[q.i]!, q.vector)];
        const b1 = ov.flagged.filter((q) => q.rule === 'B001');
        const b2 = ov.flagged.filter((q) => q.rule === 'B002');
        if (b1.length)
          layers.push(lines(b1.map(seg), 'neg', 'b001', { name: 'B001 overlaps (solid)', tube: 0.06 }));
        if (b2.length)
          layers.push(
            lines(b2.map(seg), 'pos', 'b002', {
              name: 'B002 short contacts (dashed)',
              tube: 0.04,
              dashed: true,
            }),
          );
        const c = ov.closest;
        if (c) {
          const [x, y] = seg(c);
          layers.push(
            lines([[x, y]], 'accent', 'closest', { name: 'Closest pair', tube: 0.03 }),
            labels(
              [{ text: `closest pair: ${fmt(c.ratio, 3)} of the radius sum`, at: add(y, [0, 0, 1]) }],
              'labels',
            ),
          );
        }
        const verdict = b1.length ? 'blocked until you type a reason' : 'allowed';
        describe =
          `The overlap test on the 79-atom vacancy cell at scale ${fmt(f, 2)}: each atom carries a solid sphere of half its covalent radius ` +
          `and a faint shell of 0.75 of it, so two solid spheres touching is the B001 overlap error and two shells touching the B002 short-contact warning. ` +
          (c
            ? `The closest pair is ${atomName(s, c.i)} and ${atomName(s, c.j)}, ${fmt(c.distance, 3)} Å apart, ${fmt(c.ratio, 3)} of their radius sum of ${fmt(c.sum, 3)} Å. `
            : '') +
          `${b1.length} pair${b1.length === 1 ? '' : 's'} give B001 and ${b2.length} give B002, so export is ${verdict}.` +
          (b1.length || b2.length ? '' : ' Shrink the scale factor to watch the first warnings appear.');
        readouts.push(
          {
            label: 'Closest pair',
            value: c ? `${atomName(s, c.i)}-${atomName(s, c.j)}: ${fmt(c.distance, 3)} Å` : 'none',
          },
          { label: 'd / (r_i + r_j)', value: c ? fmt(c.ratio, 3) : '-' },
          { label: 'B001, B002', value: `${b1.length} errors, ${b2.length} warnings` },
        );
      }
    }
    return {
      layers,
      describe,
      readouts,
      lattice: parent,
      camera: 'iso',
      ortho: true,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// The Screening Studio: the demo table as points in (energy above hull, band gap, cell size); filters fade points out.

export const SAMPLE_ROWS: MaterialRow[] = Array.from({ length: STUDIO_SAMPLE.count }, (_, i) =>
  materializeRow(STUDIO_SAMPLE, i),
);
const X_PER_EV = 100; // scene units per eV/atom of energy above hull
const Y_PER_EV = 2.5; // scene units per eV of band gap
const Z_PER_LOG2 = 1.6; // scene units per doubling of the number of sites
/** Position of an entry in property space: x = E_hull, y = band gap, z = log2(sites). */
export const studioPoint = (r: Pick<MaterialRow, 'energy_above_hull' | 'band_gap' | 'nsites'>): Vec3 => [
  r.energy_above_hull * X_PER_EV,
  r.band_gap * Y_PER_EV,
  Math.log2(Math.max(1, r.nsites)) * Z_PER_LOG2,
];

const ELEMENT_FILTERS = ['', 'Cu, O', 'O', 'Ti, O', 'Si', 'Ge', 'Mo, S'];

/** The query the Studio runs for these controls; a preset sets its fields as the Studio's preset buttons do. */
export function studioQuery(p: Params): StudioQuery {
  let include = str(p, 'elements');
  const maxEhull = num(p, 'maxEhull', 0.1);
  let maxSites: number | null = num(p, 'maxSites', 52);
  let onlyStable = Boolean(p.onlyStable);
  let onlyMagnetic = Boolean(p.onlyMagnetic);
  const preset = str(p, 'preset');
  if (preset === 'beginner') [maxSites, onlyStable, include] = [10, true, ''];
  else if (preset === 'stable-oxides') [include, onlyStable, maxSites] = ['O', true, null];
  else if (preset === 'magnetic') [onlyMagnetic, include, onlyStable] = [true, '', false];
  return {
    includeElements: include
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean),
    maxEhull,
    maxSites,
    onlyStable,
    onlyMagnetic,
  };
}

const PRESET_WORDS: Record<string, string> = {
  none: '',
  beginner:
    'The Beginner-friendly preset sets at most 10 sites and on the hull, and clears the element field. ',
  'stable-oxides': 'The Stable oxides preset sets contains O and on the hull, and clears the site limit. ',
  magnetic: 'The Magnetic candidates preset sets magnetic only and clears the element and hull boxes. ',
};

const studio: SceneDef = {
  id: 'm11-studio-space',
  title: 'The Screening Studio as a property space',
  badge: 'sample',
  banner:
    'Synthetic demo values: the Studio table holds 30 made-up entries (formulas and cell sizes from test structures; every energy, band gap and magnetic flag is invented). The filtering is the Studio code itself.',
  sources: ['S-044', 'S-024', 'S-102', 'S-010'],
  params: [
    {
      kind: 'select',
      id: 'elements',
      label: 'Must contain elements',
      physics: true,
      value: '',
      options: ELEMENT_FILTERS.map((e) => ({ value: e, label: e || 'any' })),
    },
    {
      kind: 'slider',
      id: 'maxEhull',
      label: 'Max E_hull',
      min: 0,
      max: 0.1,
      step: 0.005,
      value: 0.1,
      unit: 'eV/atom',
      digits: 3,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'maxSites',
      label: 'Max sites',
      min: 1,
      max: 52,
      step: 1,
      value: 52,
      digits: 0,
      physics: true,
    },
    { kind: 'toggle', id: 'onlyStable', label: 'On hull (stable)', value: false, physics: true },
    { kind: 'toggle', id: 'onlyMagnetic', label: 'Magnetic only', value: false, physics: true },
    {
      kind: 'select',
      id: 'preset',
      label: 'Preset',
      physics: true,
      value: 'none',
      options: [
        { value: 'none', label: 'none' },
        { value: 'beginner', label: 'Beginner-friendly' },
        { value: 'stable-oxides', label: 'Stable oxides' },
        { value: 'magnetic', label: 'Magnetic candidates' },
      ],
    },
    {
      kind: 'select',
      id: 'pick',
      label: 'Inspect entry',
      value: 'sample-0009',
      options: SAMPLE_ROWS.map((r) => ({
        value: r.material_id,
        label: `${r.formula_pretty} (${r.material_id})`,
      })),
    },
  ],
  build(p) {
    const q = studioQuery(p);
    const match = new Set(filterRowIndices(STUDIO_SAMPLE, q));
    const pass = SAMPLE_ROWS.filter((r) => match.has(r.rowIndex));
    const fail = SAMPLE_ROWS.filter((r) => !match.has(r.rowIndex));
    const pick = SAMPLE_ROWS.find((r) => r.material_id === str(p, 'pick')) ?? SAMPLE_ROWS[8]!;
    const X = 0.1 * X_PER_EV + 1;
    const Y = 3.5 * Y_PER_EV + 0.8;
    const Z = Math.log2(52) * Z_PER_LOG2 + 0.8;
    const layers: Layer[] = [
      ...axesLayers([X, Y, Z], ['E_hull (eV/atom)', 'band gap (eV)', 'sites (log scale)']),
      quadLayer([0, 0, 0], [0, Y - 0.6, 0], [0, 0, Z - 0.6], {
        group: 'hull',
        name: 'On the hull: E_hull = 0',
        color: 'accent',
        opacity: 0.1,
      }),
    ];
    // tick marks on the three axes (a few, to stay under the label budget)
    const ticks: [Vec3, Vec3][] = [];
    const tickText: { text: string; at: Vec3 }[] = [];
    for (const e of [0.05, 0.1]) {
      ticks.push([
        [e * X_PER_EV, 0, 0],
        [e * X_PER_EV, -0.3, 0],
      ]);
      tickText.push({ text: fmt(e, 2), at: [e * X_PER_EV, -0.8, 0] });
    }
    for (const g of [1, 3]) {
      ticks.push([
        [0, g * Y_PER_EV, 0],
        [-0.3, g * Y_PER_EV, 0],
      ]);
      tickText.push({ text: `${g} eV`, at: [-1, g * Y_PER_EV, 0] });
    }
    for (const n of [4, 32]) {
      const z = Math.log2(n) * Z_PER_LOG2;
      ticks.push([
        [0, 0, z],
        [-0.3, 0, z],
      ]);
      tickText.push({ text: `${n} sites`, at: [-1.2, 0, z] });
    }
    layers.push(lines(ticks, 'muted', 'axes'), labels(tickText, 'axes'));
    // the filter as a box: E_hull up to the maximum, sites up to the maximum
    const bx = (q.maxEhull ?? 0.1) * X_PER_EV;
    const bz = Math.log2(Math.max(1, q.maxSites ?? 52)) * Z_PER_LOG2;
    layers.push(
      lines(
        cellEdges([
          [Math.max(bx, 0.05), 0, 0],
          [0, 3.5 * Y_PER_EV, 0],
          [0, 0, Math.max(bz, 0.05)],
        ]),
        'accent',
        'filter',
        { name: 'Filter box (max E_hull, max sites)', dashed: true },
      ),
    );
    if (pass.length)
      layers.push(
        atoms(
          pass.map(studioPoint),
          0.3,
          pass.map((r): Color => (r.is_metal ? 'c1' : 'c0')),
          'entries',
          {
            name: 'Matching entries (orange metal, blue gap)',
            labels: pass.map((r) => `${r.formula_pretty} (${r.material_id})`),
          },
        ),
      );
    if (fail.length)
      layers.push(
        atoms(fail.map(studioPoint), 0.12, 'muted', 'filtered', {
          name: 'Filtered out',
          opacity: 0.35,
          labels: fail.map((r) => `${r.formula_pretty} (${r.material_id}), filtered out`),
        }),
      );
    const mag = pass.filter((r) => r.is_magnetic);
    if (mag.length)
      layers.push(
        arrows(
          mag.map((r) => add(studioPoint(r), [0, 0, 0.3])),
          mag.map((): Vec3 => [0, 0, 0.9]),
          'pos',
          'magnetic',
          { name: 'Magnetic flag (arrow)', thickness: 0.06 },
        ),
      );
    const at = studioPoint(pick);
    const on = match.has(pick.rowIndex);
    layers.push(
      atoms([at], 0.42, 'accent', 'selected', { name: 'Inspected entry', opacity: 0.5, highlight: [0] }),
      lines(
        [
          [at, [at[0], at[1], 0]],
          [
            [at[0], at[1], 0],
            [at[0], 0, 0],
          ],
          [
            [at[0], at[1], 0],
            [0, at[1], 0],
          ],
        ],
        'muted',
        'selected',
        { dashed: true },
      ),
      labels(
        [{ text: `${pick.formula_pretty}${on ? '' : ' (filtered out)'}`, at: add(at, [0, 0, 1]) }],
        'labels',
      ),
    );
    const cost = estimateRelativeCost(pick);
    const names = pass.slice(0, 5).map((r) => r.formula_pretty);
    const preset = str(p, 'preset');
    const filterWords = [
      q.includeElements?.length ? `contains ${q.includeElements.join(' and ')}` : '',
      q.maxEhull !== null && q.maxEhull !== undefined && q.maxEhull < 0.1
        ? `E_hull at most ${fmt(q.maxEhull, 3)} eV/atom`
        : '',
      q.maxSites !== null && q.maxSites !== undefined && q.maxSites < 52 ? `at most ${q.maxSites} sites` : '',
      q.onlyStable ? 'on the hull' : '',
      q.onlyMagnetic ? 'magnetic only' : '',
    ].filter(Boolean);
    const describe =
      `The Studio's synthetic demo table as 30 points: energy above hull across, band gap back, number of sites (log scale) up. ` +
      (PRESET_WORDS[preset] ?? '') +
      `Filters ${filterWords.length ? filterWords.join(', ') : 'none'}: ${pass.length} of 30 entries match` +
      (pass.length ? ` (${names.join(', ')}${pass.length > 5 ? ', ...' : ''})` : '') +
      `, the rest fade and shrink. Inspected: ${pick.formula_pretty}, E_hull ${fmt(pick.energy_above_hull, 3)} eV/atom, gap ${fmt(pick.band_gap, 2)} eV, ` +
      `${pick.nsites} sites, ${pick.is_magnetic ? 'magnetic' : 'not magnetic'}${on ? '' : ', filtered out'}; relative cost about ${cost.relativeCost >= 10 ? Math.round(cost.relativeCost) : fmt(cost.relativeCost, 2)}.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Showing', value: `${pass.length} of 30 matching` },
        {
          label: 'Inspected',
          value: `${pick.formula_pretty} (${pick.material_id}), ${pick.spacegroup.symbol}`,
        },
        {
          label: 'E_hull, gap',
          value: `${fmt(pick.energy_above_hull, 3)} eV/atom, ${fmt(pick.band_gap, 2)} eV (synthetic)`,
        },
        {
          label: 'Sites, relative cost',
          value: `${pick.nsites}, about ${cost.relativeCost >= 10 ? Math.round(cost.relativeCost) : fmt(cost.relativeCost, 2)} x`,
        },
      ],
      axes: ['E_hull (eV/atom)', 'band gap (eV)', 'sites (log2)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Research tools overview: one small scene per tool, chosen with a select.

/** The tolerance explorer's lanthanide sweep for RCuO3 (Cu3+ CN VI, O2- CN VI, A at the highest listed CN up to XII). */
export const RCUO3_SWEEP: FamilySweepRow[] = familySweep(
  [{ el: 'Cu', ox: 3, cn: 6, fraction: 1 }],
  [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
  'highest',
).filter((r) => r.ok);

const ROMAN: Record<number, string> = { 8: 'VIII', 9: 'IX', 10: 'X', 12: 'XII' };

/** Shannon ionic radii of the B and X sites of the sweep: Cu3+ and O2- at CN VI. */
const shannon = (el: string, ox: number, cn: number): number => {
  const r = getRadius({ el, ox, cn, kind: 'ionic' });
  if (!r.ok) throw new Error(`no Shannon radius for ${el} ${ox} CN ${cn}`);
  return r.value;
};
export const R_CU3 = shannon('Cu', 3, 6);
export const R_O2 = shannon('O', -2, 6);

function toleranceFrame(el: string): SceneFrame {
  const row = RCUO3_SWEEP.find((r) => r.el === el) ?? RCUO3_SWEEP[0]!;
  const rA = row.rA!;
  const t = row.t!;
  const mu = row.mu!;
  const rX = R_O2;
  const rB = R_CU3;
  const a = 2 * (rB + rX); // the B-X-B contact sets the edge of the ideal cube
  const s: Structure = {
    ...LACUO3,
    species: [row.el, 'Cu', 'O', 'O', 'O'],
    lattice: [
      [a, 0, 0],
      [0, a, 0],
      [0, 0, a],
    ],
  };
  const cr = crystalLayers(s, { boundary: true, bonds: false });
  const at = cr.layers[0]!;
  if (at.kind === 'atoms') {
    at.radius = cr.species.map((e) => (e === row.el ? rA : e === 'Cu' ? rB : rX));
    at.opacity = 0.75;
    at.name = 'Ions at their Shannon radii';
  }
  const ax: Vec3 = [0, 0, 0];
  const xx: Vec3 = [a / 2, 0, a / 2];
  const dir = scale(sub(xx, ax), 1 / norm(sub(xx, ax)));
  const gap = a / Math.SQRT2 - (rA + rX);
  const layers: Layer[] = [
    ...cr.layers,
    lines([[add(ax, scale(dir, rA)), sub(xx, scale(dir, rX))]], gap >= 0 ? 'neg' : 'pos', 'gap', {
      name: gap >= 0 ? 'Gap between A and O' : 'Overlap of A and O',
      tube: 0.05,
      dashed: gap >= 0,
    }),
    labels(
      [
        { text: `${row.el}3+ (CN ${ROMAN[row.cn] ?? row.cn})`, at: [-0.5, -0.5, a + 0.6] },
        { text: 'Cu3+', at: [a / 2, a / 2, a / 2 + rB + 0.3] },
        { text: `t = ${fmt(t, 3)}`, at: [a / 4, -0.8, a / 4] },
      ],
      'labels',
    ),
  ];
  const describe =
    `Tolerance-factor explorer: ${row.el}CuO3 with every ion drawn at its Shannon radius (${row.el}3+ at CN ${ROMAN[row.cn] ?? row.cn}, ${fmt(rA, 3)} Å; Cu3+ ${fmt(rB, 3)} Å; O2- ${fmt(rX, 2)} Å) ` +
    `in the ideal cube whose edge 2(rB + rX) = ${fmt(a, 3)} Å makes Cu and O touch. Goldschmidt's t = ${fmt(t, 3)} and mu = ${fmt(mu, 3)}: ` +
    (gap >= 0
      ? `the A ion is ${fmt(gap, 3)} Å short of touching its oxygens, the room that lets the octahedra tilt.`
      : `the A ion is ${fmt(-gap, 3)} Å too big for its cage.`);
  return {
    layers,
    describe,
    readouts: [
      { label: 'Tolerance factor t', value: fmt(t, 3) },
      { label: 'Octahedral factor mu', value: fmt(mu, 3) },
      { label: 'A-O gap', value: `${fmt(gap, 3)} Å` },
      { label: `r(${row.el}3+), CN ${ROMAN[row.cn] ?? row.cn}`, value: `${fmt(rA, 3)} Å` },
    ],
    lattice: s.lattice.map(v3) as [Vec3, Vec3, Vec3],
    ortho: true,
  };
}

const magMemo = memo<MagneticConfiguration>(48);
function magneticFrame(kind: 'FM' | 'A' | 'C' | 'G', a: number): SceneFrame {
  const f = a / A0;
  const c = magMemo(`${kind}|${f.toFixed(4)}`, () =>
    namedOrdering(scaledStructure(LACUO3, f), kind === 'A' || kind === 'C' ? { kind, axis: 2 } : { kind }, {
      elements: ['Cu'],
    }),
  );
  const s = c.structure;
  const cr = crystalLayers(s, { bonds: false, radiusScale: 0.32 });
  const pos = cartesian(s);
  const ids = c.magneticSites;
  const m = 3;
  const per = 0.4;
  const layers: Layer[] = [
    ...cr.layers,
    arrows(
      ids.map((j) => add(pos[j]!, [0, 0, (-c.signs[j]! * m * per) / 2])),
      ids.map((j): Vec3 => [0, 0, c.signs[j]! * m * per]),
      ids.map((j): Color => (c.signs[j]! > 0 ? 'pos' : 'neg')),
      'spins',
      {
        name: 'Cu moments (up solid, down open)',
        head: ids.map((j) => (c.signs[j]! > 0 ? 'solid' : 'open')),
        thickness: 0.07,
      },
    ),
  ];
  const det = Math.round(s.species.length / LACUO3.species.length);
  const net = netMoment(c, { Cu: m });
  const mm = magmomFor(c, { magnitudes: { Cu: m } }).magmom;
  const ups = ids.filter((j) => c.signs[j]! > 0).length;
  const describe =
    `Magnetic configuration tool: ${NAMED_LABEL[kind]} order of the Cu moments in LaCuO3 at a = ${fmt(a, 3)} Å, built in the smallest supercell that holds it, ` +
    `${det} cell${det === 1 ? '' : 's'} and ${s.species.length} atoms. ${ups} of ${ids.length} Cu sites point up (solid heads) and ${ids.length - ups} down (open heads); ` +
    `with 3 muB per Cu the net moment is ${fmt(net, 1)} muB per cell, and the tool writes MAGMOM = ${mm}.`;
  return {
    layers,
    describe,
    readouts: [
      { label: 'Ordering', value: NAMED_LABEL[kind] },
      { label: 'Cells, atoms', value: `${det}, ${s.species.length}` },
      { label: 'Net moment', value: `${fmt(net, 1)} muB per cell` },
      { label: 'MAGMOM', value: mm },
    ],
    lattice: [
      [a, 0, 0],
      [0, a, 0],
      [0, 0, a],
    ],
    ortho: true,
  };
}

/** Special points of the simple cubic zone in reduced coordinates of b1, b2, b3 (Setyawan and Curtarolo, CUB). */
export const CUBIC_POINTS: Record<string, Vec3> = {
  Gamma: [0, 0, 0],
  X: [0, 0.5, 0],
  M: [0.5, 0.5, 0],
  R: [0.5, 0.5, 0.5],
};
export const CUBIC_PATH = [
  ['Gamma', 'X', 'M', 'Gamma', 'R', 'X'],
  ['M', 'R'],
];
/** The Input Builder's mesh: N_i = max(1, ceil(|b_i| / KSPACING)), |b_i| with the 2 pi (S-019). */
export const kspacingMesh = (bLength: number, kspacing: number): number =>
  Math.max(1, Math.ceil(bLength / kspacing - 1e-9));

function kpathFrame(a: number): SceneFrame {
  const L: Mat3 = [
    [a, 0, 0],
    [0, a, 0],
    [0, 0, a],
  ];
  const rec = reciprocalLattice(L).map(v3) as Vec3[];
  const bz = brillouinLayers(L);
  const toK = (f: Vec3): Vec3 => add(add(scale(rec[0]!, f[0]), scale(rec[1]!, f[1])), scale(rec[2]!, f[2]));
  const b = norm(rec[0]!);
  const N = kspacingMesh(b, 0.2);
  const mesh: Vec3[] = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      for (let k = 0; k < N; k++) {
        const fr = [i, j, k].map((n) => n / N - (n / N >= 0.5 + 1e-9 ? 1 : 0)) as Vec3;
        mesh.push(toK(fr));
      }
  const layers: Layer[] = [
    ...bz.layers,
    points(mesh, 'muted', 0.012, 'mesh', { name: `Gamma-centred ${N}x${N}x${N} mesh at KSPACING = 0.2` }),
    ...CUBIC_PATH.map((seg) =>
      curve(
        seg.map((n) => toK(CUBIC_POINTS[n]!)),
        'accent',
        'path',
        { name: 'k-path', tube: 0.012 },
      ),
    ),
    atoms(Object.values(CUBIC_POINTS).map(toK), 0.035, 'pos', 'points', {
      name: 'Special points',
      labels: Object.keys(CUBIC_POINTS),
    }),
    labels(
      Object.entries(CUBIC_POINTS).map(([n, f]) => ({ text: n, at: add(toK(f), [0.06, 0.06, 0.06]) })),
      'labels',
    ),
  ];
  const describe =
    `k-path tool: the first Brillouin zone of the cubic LaCuO3 cell with a = ${fmt(a, 3)} Å is a cube of edge 2 pi / a = ${fmt(b, 3)} 1/Å. ` +
    `The line-mode path Gamma-X-M-Gamma-R-X | M-R of the Setyawan-Curtarolo cubic convention runs along its edges and diagonals; ` +
    `the grey dots are the Input Builder's ${N}x${N}x${N} mesh for KSPACING = 0.2 (N = ceil(|b| / 0.2)).`;
  return {
    layers,
    describe,
    readouts: [
      { label: '|b| = 2 pi / a', value: `${fmt(b, 3)} 1/Å` },
      { label: 'Mesh at KSPACING 0.2', value: `${N} x ${N} x ${N}` },
      { label: 'Path', value: 'Gamma-X-M-Gamma-R-X | M-R' },
    ],
    lattice: rec as [Vec3, Vec3, Vec3],
    ortho: true,
  };
}

/** The example E(V) points: golden set A of tests/reference/eos_reference.json (synthetic, an fcc metal per atom). */
export const EOS_SET_A = { e0: -3.72, v0: 11.95, b0: 0.87, b1: 4.8 };
export const eosPoints = () =>
  [-3, -2, -1, 0, 1, 2, 3].map((k) => {
    const volume = EOS_SET_A.v0 * (1 + 0.02 * k);
    return { volume, energy: eosEnergy('birch_murnaghan', volume, EOS_SET_A) };
  });
let eosFitCache: EosFit | null = null;
export const eosFit = (): EosFit => (eosFitCache ??= fitEos(eosPoints(), 'birch_murnaghan'));

function eosFrame(ratio: number): SceneFrame {
  const f = eosFit();
  const { v0, e0 } = f.params;
  const E = (v: number) => eosEnergy('birch_murnaghan', v, f.params);
  const P = (v: number) => -(E(v * (1 + 1e-5)) - E(v * (1 - 1e-5))) / (2e-5 * v);
  const xOf = (v: number) => (v / v0 - 1) * 50; // 0.9 to 1.1 V0 spans 10 units
  const zOf = (de: number) => de * 1000 * 0.06; // scene units per meV
  const pHi = P(0.9 * v0);
  const pLo = P(1.1 * v0);
  const yOf = (pp: number) => (pp * 7) / (pHi - pLo);
  const fine = Array.from({ length: 161 }, (_, i) => v0 * (0.88 + (0.24 * i) / 160));
  const rowMin = new Map<number, number>();
  const hMin = (pp: number) => {
    let h = rowMin.get(pp);
    if (h === undefined) rowMin.set(pp, (h = Math.min(...fine.map((v) => E(v) + pp * v))));
    return h;
  };
  const v = ratio * v0;
  const pv = P(v);
  const surf = surfaceLayer(
    (x, y) => {
      const vv = v0 * (1 + x / 50);
      const pp = (y * (pHi - pLo)) / 7;
      return zOf(E(vv) + pp * vv - hMin(pp));
    },
    [xOf(0.9 * v0), xOf(1.1 * v0)],
    [yOf(pLo), yOf(pHi)],
    36,
    24,
    { group: 'enthalpy', name: 'Enthalpy H(V, P) - H_min(P)', opacity: 0.65 },
  );
  const vs = Array.from({ length: 121 }, (_, i) => v0 * (0.9 + (0.2 * i) / 120));
  const pts = eosPoints();
  const aFcc = Math.cbrt(4 * v);
  const off: Vec3 = [-12, -aFcc / 2, 0];
  const cell = cellEdges(
    [
      [aFcc, 0, 0],
      [0, aFcc, 0],
      [0, 0, aFcc],
    ],
    off,
  );
  const fccFrac: Vec3[] = [
    [0, 0, 0],
    [0.5, 0.5, 0],
    [0.5, 0, 0.5],
    [0, 0.5, 0.5],
  ];
  const layers: Layer[] = [
    surf,
    curve(
      vs.map((vv) => [xOf(vv), 0, zOf(E(vv) - e0)] as Vec3),
      'ink',
      'ev',
      { name: 'E(V) at P = 0', tube: 0.05 },
    ),
    curve(
      vs.map((vv) => [xOf(vv), yOf(P(vv)), 0.03] as Vec3),
      'accent',
      'valley',
      { name: 'V(P): the valley floor', tube: 0.04 },
    ),
    atoms(
      pts.map((d) => [xOf(d.volume), 0, zOf(d.energy - e0)] as Vec3),
      0.15,
      'c2',
      'data',
      { name: 'Example data points', labels: pts.map((d) => `V = ${fmt(d.volume, 3)} Å³`) },
    ),
    atoms([[xOf(v), yOf(pv), 0.03]], 0.2, 'pos', 'marker', { name: 'This volume', highlight: [0] }),
    lines(cell, 'muted', 'fcc-cell', { name: 'fcc cell at this volume' }),
    atoms(
      fccFrac.map((q) => add(off, scale(q, aFcc))),
      0.5,
      'c1',
      'fcc-cell',
      { labels: fccFrac.map((_, i) => `atom ${i + 1}`) },
    ),
    ...axesLayers(
      [6, yOf(pHi) + 0.8, 4],
      ['V/V0 - 1', 'P (GPa)', 'H - H_min (meV/atom)'],
      [xOf(0.9 * v0) - 0.3, 0, 0],
    ),
  ];
  const describe =
    `Equation-of-state fit: the Birch-Murnaghan form fitted to 7 example points (synthetic set A, an fcc metal) gives V0 = ${fmt(v0, 3)} Å³ per atom, ` +
    `B0 = ${fmt(f.b0GPa, 1)} GPa and B0' = ${fmt(f.params.b1, 2)}. The surface is the enthalpy E + PV over volume and pressure, whose valley floor is V(P); ` +
    `at V/V0 = ${fmt(ratio, 3)} the pressure is ${fmt(pv * EV_PER_A3_IN_GPA, 2)} GPa and the fcc cell beside it has a = ${fmt(aFcc, 3)} Å.`;
  return {
    layers,
    describe,
    readouts: [
      { label: 'V/V0', value: fmt(ratio, 3) },
      { label: 'Pressure', value: `${fmt(pv * EV_PER_A3_IN_GPA, 2)} GPa` },
      { label: "Fit B0, B0'", value: `${fmt(f.b0GPa, 1)} GPa, ${fmt(f.params.b1, 2)}` },
    ],
    axes: ['V/V0 - 1 (x 50)', 'P (GPa)', 'H - H_min (meV/atom)'],
  };
}

const TOOLS = [
  { value: 'builder', label: 'Material Builder' },
  { value: 'tolerance', label: 'Tolerance-factor explorer' },
  { value: 'magnetic', label: 'Magnetic configuration tool' },
  { value: 'kpath', label: 'k-path tool' },
  { value: 'eos', label: 'Equation-of-state fit' },
  { value: 'studio', label: 'Screening Studio' },
];

const overview: SceneDef = {
  id: 'm11-tools-overview',
  title: 'The research tools, one scene each',
  badge: 'sample',
  banner:
    'The Screening Studio and equation-of-state views use synthetic demo values (the Studio demo table and an example E(V) set). The Builder, tolerance, magnetic and k-path views are computed from the tested libraries the tools use.',
  sources: ['S-021', 'S-001', 'S-002', 'S-003', 'S-058', 'S-005', 'S-019', 'S-061', 'S-068', 'S-044'],
  params: [
    { kind: 'select', id: 'tool', label: 'Tool', physics: true, value: 'builder', options: TOOLS },
    {
      kind: 'slider',
      id: 'a',
      label: 'Lattice parameter a',
      min: 3.8,
      max: 4.01,
      step: 0.005,
      value: 3.905,
      unit: 'Å',
      digits: 3,
      physics: true,
    },
    {
      kind: 'select',
      id: 'ordering',
      label: 'Magnetic order',
      physics: true,
      value: 'G',
      options: (['FM', 'A', 'C', 'G'] as const).map((k) => ({ value: k, label: NAMED_LABEL[k] })),
    },
    {
      kind: 'select',
      id: 'rsite',
      label: 'Rare earth R in RCuO3',
      physics: true,
      value: 'La',
      options: RCUO3_SWEEP.map((r) => ({ value: r.el, label: r.el })),
    },
  ],
  build(p) {
    const tool = str(p, 'tool');
    const a = clamp(num(p, 'a', A0), 3.5, 4.5);
    let fr: SceneFrame;
    let name = TOOLS.find((t) => t.value === tool)?.label ?? 'Material Builder';
    switch (tool) {
      case 'tolerance':
        fr = toleranceFrame(str(p, 'rsite'));
        break;
      case 'magnetic': {
        const k = str(p, 'ordering');
        fr = magneticFrame(k === 'FM' || k === 'A' || k === 'C' ? k : 'G', a);
        break;
      }
      case 'kpath':
        fr = kpathFrame(a);
        break;
      case 'eos':
        fr = eosFrame((a / A0) ** 3);
        break;
      case 'studio':
        fr = studio.build(withDefaults(studio, { elements: 'Cu, O' }));
        fr = {
          ...fr,
          describe: `Screening Studio with Must contain elements set to Cu, O. ${fr.describe}`,
        };
        break;
      default: {
        name = 'Material Builder';
        fr = builder.build(withDefaults(builder, { step: 1, scale: a / A0 }));
        fr = { ...fr, describe: `Material Builder: ${fr.describe}` };
      }
    }
    return { ...fr, readouts: [{ label: 'Tool', value: name }, ...(fr.readouts ?? []).slice(0, 3)] };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Where to go next: the handbook modules as stations on a rising path, the next topics as side stations.

export const MODULE_DIRS = [
  '00-start',
  '01-why-dft',
  '02-quantum-basics',
  '03-many-electrons',
  '04-kohn-sham',
  '05-practical-choices',
  '06-vasp-files',
  '07-running',
  '08-convergence-and-errors',
  '09-analysis',
  '10-worked-example',
  '11-tools',
  '12-properties',
] as const;
const moduleTitle = (m: number) => (m === 0 ? 'Start here' : (MODULES[m - 1] ?? `Module ${m}`));

export interface Subject {
  id: string;
  title: string;
  module: number;
  /** The topic file under src/content/handbook (folder/slug), or null when the subject has no page on the site. */
  path: string | null;
  direction: 'deeper' | 'example' | 'automate';
}

/** The subjects the what-next page lists, in its order (direction 1, 2, 3). */
export const SUBJECTS: Subject[] = [
  {
    id: 'symmetry',
    title: 'Crystal structure and symmetry',
    module: 5,
    path: '05-practical-choices/crystal-structure-and-symmetry',
    direction: 'deeper',
  },
  {
    id: 'relaxation',
    title: 'Relaxation',
    module: 5,
    path: '05-practical-choices/relaxation',
    direction: 'deeper',
  },
  {
    id: 'beyond-dft',
    title: 'Beyond DFT',
    module: 5,
    path: '05-practical-choices/beyond-dft',
    direction: 'deeper',
  },
  {
    id: 'performance',
    title: 'Performance and parallelisation',
    module: 7,
    path: '07-running/performance-and-parallelisation',
    direction: 'deeper',
  },
  {
    id: 'cohp',
    title: 'Bonding analysis with COHP',
    module: 9,
    path: '09-analysis/bonding-analysis-cohp',
    direction: 'deeper',
  },
  {
    id: 'wannier',
    title: 'Wannier functions and topology',
    module: 9,
    path: '09-analysis/wannier-functions-and-topology',
    direction: 'deeper',
  },
  {
    id: 'slabs',
    title: 'Surfaces and slabs',
    module: 12,
    path: '12-properties/surfaces-and-slabs',
    direction: 'deeper',
  },
  {
    id: 'defects',
    title: 'Point and charged defects',
    module: 12,
    path: '12-properties/point-and-charged-defects',
    direction: 'deeper',
  },
  {
    id: 'hull',
    title: 'Formation energy and the convex hull',
    module: 12,
    path: '12-properties/formation-energy-and-convex-hull',
    direction: 'deeper',
  },
  {
    id: 'neb',
    title: 'Transition states and NEB',
    module: 12,
    path: '12-properties/transition-states-and-neb',
    direction: 'deeper',
  },
  {
    id: 'md',
    title: 'Molecular dynamics and MLFF',
    module: 12,
    path: '12-properties/molecular-dynamics-and-mlff',
    direction: 'deeper',
  },
  {
    id: 'next-rare-earth',
    title: 'The next rare earth: NdCuO3',
    module: 10,
    path: '10-worked-example/choosing-the-system',
    direction: 'example',
  },
  {
    id: 'linear-response-u',
    title: 'U from linear response',
    module: 5,
    path: '05-practical-choices/dft-plus-u',
    direction: 'example',
  },
  {
    id: 'oxygen-vacancy',
    title: 'An oxygen vacancy in the 80-site cell',
    module: 11,
    path: '11-tools/material-builder',
    direction: 'example',
  },
  {
    id: 'automate',
    title: 'Automate with pymatgen, ASE, phonopy',
    module: 12,
    path: null,
    direction: 'automate',
  },
];

const DIRECTION_WORDS: Record<Subject['direction'], string> = {
  deeper: 'go deeper into the method',
  example: 'take the worked example one step further',
  automate: 'automate',
};

/** The route of a subject as plain text: its handbook path, or a note that it lives outside the site. */
export const routeOf = (s: Subject): string =>
  s.path ? `/handbook/${s.path}/` : 'no page on this site (Python libraries: pymatgen, ASE, phonopy, mp-api)';

const HERE = 11;
const STATION_R = 5;
const STATION_DZ = 0.7;
const STATION_DTH = 0.5;
/** Point on the module path at a (fractional) module index. */
export const pathPoint = (m: number): Vec3 => [
  STATION_R * Math.cos(m * STATION_DTH),
  STATION_R * Math.sin(m * STATION_DTH),
  m * STATION_DZ,
];

/** Where a subject's station sits: outward from its module for direction 1, inward for 2, above the path end for 3. */
export function subjectPoint(s: Subject): Vec3 {
  if (s.direction === 'automate') return [0, 0, 12 * STATION_DZ + 1.6];
  const sibs = SUBJECTS.filter((x) => x.module === s.module && x.direction === s.direction);
  const k = sibs.indexOf(s);
  const c = pathPoint(s.module);
  const th = s.module * STATION_DTH;
  const out: Vec3 = [Math.cos(th), Math.sin(th), 0];
  const tan: Vec3 = [-Math.sin(th), Math.cos(th), 0];
  const side = s.direction === 'deeper' ? 1.9 : -1.9;
  return add(
    add(c, scale(out, side)),
    add(scale(tan, (k - (sibs.length - 1) / 2) * 1.1), [0, 0, 0.35 * (k % 2)]),
  );
}

function routePoints(target: Subject): Vec3[] {
  const pts: Vec3[] = [];
  const from = HERE;
  const to = target.module;
  const n = Math.max(2, Math.round(Math.abs(to - from) * 20));
  for (let i = 0; i <= n; i++) pts.push(pathPoint(from + ((to - from) * i) / n));
  pts.push(subjectPoint(target));
  return pts;
}

const nextMap: SceneDef = {
  id: 'm11-next-map',
  title: 'The map of where to go next',
  badge: 'illustrative',
  sources: [],
  params: [
    {
      kind: 'select',
      id: 'subject',
      label: 'Subject',
      physics: true,
      value: 'defects',
      options: SUBJECTS.map((s) => ({ value: s.id, label: s.title })),
    },
    { kind: 'toggle', id: 'all', label: 'Show every subject station', value: true },
  ],
  build(p) {
    const sel = SUBJECTS.find((s) => s.id === str(p, 'subject')) ?? SUBJECTS[7]!;
    const showAll = p.all !== false;
    const stations = MODULE_DIRS.map((_, m) => pathPoint(m));
    const track: Vec3[] = Array.from({ length: 12 * 20 + 1 }, (_, i) => pathPoint(i / 20));
    const layers: Layer[] = [
      curve(track, 'muted', 'path', { name: 'The handbook, module by module', tube: 0.04 }),
      atoms(
        stations,
        stations.map((_, m) => (m === HERE ? 0.5 : 0.36)),
        'ink',
        'modules',
        {
          name: 'Module stations',
          labels: MODULE_DIRS.map((_, m) => `Module ${m}: ${moduleTitle(m)}`),
          highlight: [HERE, sel.module],
        },
      ),
    ];
    const shown = showAll ? SUBJECTS : SUBJECTS.filter((s) => s.id === sel.id);
    const tone: Record<Subject['direction'], Color> = { deeper: 'c0', example: 'c1', automate: 'c2' };
    const spurs: [Vec3, Vec3][] = shown
      .filter((s) => s.direction !== 'automate')
      .map((s) => [pathPoint(s.module), subjectPoint(s)]);
    if (shown.some((s) => s.direction === 'automate'))
      spurs.push([pathPoint(12), subjectPoint(SUBJECTS[14]!)]);
    layers.push(lines(spurs, 'muted', 'spurs', { name: 'Links to the subjects', dashed: true }));
    for (const dir of ['deeper', 'example', 'automate'] as const) {
      const list = shown.filter((s) => s.direction === dir);
      if (!list.length) continue;
      layers.push(
        atoms(list.map(subjectPoint), dir === 'deeper' ? 0.26 : 0.3, tone[dir], 'subjects', {
          name: `Direction ${dir === 'deeper' ? 1 : dir === 'example' ? 2 : 3}: ${DIRECTION_WORDS[dir]}`,
          labels: list.map((s) => `${s.title}: ${routeOf(s)}`),
          highlight: list.flatMap((s, i) => (s.id === sel.id ? [i] : [])),
        }),
      );
    }
    const route = routePoints(sel);
    layers.push(curve(route, 'accent', 'route', { name: 'Route from module 11', tube: 0.09 }));
    const items: { text: string; at: Vec3 }[] = [0, 2, 4, 6, 8, 10, 12]
      .filter((m) => m !== sel.module)
      .map((m) => ({ text: `Module ${m}`, at: add(stations[m]!, [0, 0, 0.7]) }));
    items.push({ text: 'you are here: module 11', at: add(stations[HERE]!, [0, 0, -0.9]) });
    if (sel.module !== HERE)
      items.push({
        text: `Module ${sel.module}: ${moduleTitle(sel.module)}`,
        at: add(stations[sel.module]!, [0, 0, 0.8]),
      });
    items.push({ text: sel.title, at: add(subjectPoint(sel), [0, 0, 0.7]) });
    layers.push(labels(items, 'labels'));
    const hops = Math.abs(sel.module - HERE);
    const describe =
      `The handbook as a rising path of 13 module stations, from module 0 at the bottom to module 12 at the top, with the subjects of the where-next page beside them: ` +
      `direction 1 (go deeper) outside the path, direction 2 (the worked example) inside, direction 3 (automate) above the end. ` +
      `The highlighted route runs from module 11, where you are, ${hops ? `${hops} module${hops === 1 ? '' : 's'} ${sel.module < HERE ? 'back' : 'on'} to module ${sel.module}` : 'within module 11'} ` +
      `and out to ${sel.title} (${DIRECTION_WORDS[sel.direction]}); its route is ${routeOf(sel)}.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Subject', value: sel.title },
        { label: 'Direction', value: DIRECTION_WORDS[sel.direction] },
        { label: 'Module', value: `${sel.module}: ${moduleTitle(sel.module)}` },
        { label: 'Route', value: routeOf(sel) },
      ],
      camera: 'iso',
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [builder.id]: builder,
  [studio.id]: studio,
  [overview.id]: overview,
  [nextMap.id]: nextMap,
};
