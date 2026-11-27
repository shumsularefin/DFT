// Physics of the module 11 scenes against the tools' own libraries, the Builder's validity engine and closed forms.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CRYSTAL_TEMPLATES } from '../../../components/tools/builder/crystalTemplates';
import { covalentRadius } from '../../chem/elements';
import { check } from '../../chem/validity';
import { shortestLatticeVector, suggestSupercell } from '../../crystal/defects';
import { netMoment, namedOrdering } from '../../magnetism/orderings';
import { estimateRelativeCost } from '../../mp/feasibility';
import { filterRowIndices } from '../../mp/query';
import { goldschmidt } from '../../perovskite/factors';
import { brillouinZone } from '../../crystal/brillouin';
import { reciprocalLattice } from '../../crystal/lattice';
import type { Mat3, Structure } from '../../crystal/types';
import { withDefaults, type AtomsLayer } from '../types';
import {
  A0,
  CUBIC_POINTS,
  DEFECT_MATRIX,
  LACUO3,
  MODULE_DIRS,
  R_CU3,
  R_O2,
  RCUO3_SWEEP,
  SAMPLE_ROWS,
  SUBJECTS,
  SUPERCELL,
  TEMPLATE,
  VACANCY_CELL,
  eosFit,
  ferroMagmom,
  fullFormula,
  kspacingMesh,
  overlapTest,
  pathPoint,
  routeOf,
  scaledStructure,
  scenes,
  studioQuery,
} from './m11';
import { STUDIO_SAMPLE } from './studioSample';

const build = (id: string, over: Record<string, number | string | boolean> = {}) => {
  const def = scenes[id]!;
  return def.build(withDefaults(def, over));
};
const readout = (f: ReturnType<typeof build>, label: string) =>
  f.readouts!.find((r) => r.label === label)!.value;

/** B001 and B002 pair messages of the Builder's validity engine, as "code:i-j" keys. */
const pairKeys = (s: Structure) =>
  check(s, 'crystal')
    .filter((i) => (i.code === 'B001' || i.code === 'B002') && i.atoms?.length === 2)
    .map((i) => `${i.code}:${i.atoms![0]}-${i.atoms![1]}`)
    .sort();
const ourKeys = (s: Structure) =>
  overlapTest(s)
    .flagged.filter((q) => q.i !== q.j)
    .map((q) => `${q.rule}:${q.i}-${q.j}`)
    .sort();

describe('m11-builder-tour: the walkthrough uses the Builder and its libraries', () => {
  it('starts from the Builder template and substitutes La and Cu as the page does', () => {
    expect(TEMPLATE).toEqual(CRYSTAL_TEMPLATES.find((t) => t.id === 'perovskite')!.structure);
    expect(A0).toBe(3.905);
    expect(LACUO3.species).toEqual(['La', 'Cu', 'O', 'O', 'O']);
    expect(LACUO3.frac).toEqual(TEMPLATE.frac);
  });

  it('the defect supercell is the one suggestSupercell picks: det 16, 80 atoms, 2 sqrt 2 a', () => {
    const sug = suggestSupercell(LACUO3, 10);
    expect(sug.matrix).toEqual(DEFECT_MATRIX);
    expect(sug.atoms).toBe(80);
    expect(SUPERCELL.species.length).toBe(80);
    expect(sug.imageDistance).toBeCloseTo(2 * Math.SQRT2 * A0, 9);
    expect(shortestLatticeVector(SUPERCELL.lattice)).toBeCloseTo(2 * Math.SQRT2 * A0, 9);
    expect(27 * LACUO3.species.length).toBe(135); // the 3x3x3 cell the page compares with
  });

  it('the vacancy gives La16Cu16O47 and a 79-entry MAGMOM', () => {
    expect(VACANCY_CELL.species.length).toBe(79);
    expect(fullFormula(VACANCY_CELL)).toBe('La16Cu16O47');
    expect(ferroMagmom(VACANCY_CELL)).toBe('16*0 16*3 47*0');
  });

  it('step 2 reads the four validity messages of the page for LaCuO3', () => {
    const f = build('m11-builder-tour', { step: 1 });
    expect(readout(f, 'Validity panel')).toBe('B005, B006, B008, B011');
    expect(f.describe).toContain('no error, so export is allowed');
  });

  it('the overlap test matches the validity engine pair by pair at every scale', () => {
    for (const k of [1, 0.8, 0.74, 0.6, 0.5, 0.45]) {
      const s = scaledStructure(LACUO3, k);
      expect(ourKeys(s), `scale ${k}`).toEqual(pairKeys(s));
    }
    const v = scaledStructure(VACANCY_CELL, 0.72);
    const ours = ourKeys(v);
    expect(ours.length).toBeGreaterThan(0);
    expect(ours).toEqual(pairKeys(v));
  });

  it('the closest pair at scale 1 is Cu-O at a/2, ratio a / 2 over the Cordero radius sum', () => {
    const { closest, flagged } = overlapTest(VACANCY_CELL);
    expect(flagged).toEqual([]);
    expect(closest!.distance).toBeCloseTo(A0 / 2, 9);
    const sum = covalentRadius('Cu')! + covalentRadius('O')!;
    expect(closest!.ratio).toBeCloseTo(A0 / 2 / sum, 9);
  });

  it('a squeezed cell turns the test red: B001 blocks export at scale 0.48', () => {
    const f = build('m11-builder-tour', { step: 4, scale: 0.48 });
    expect(f.describe).toContain('export is blocked');
    expect(f.layers.some((l) => l.group === 'b001')).toBe(true);
    const ok = build('m11-builder-tour', { step: 4, scale: 1 });
    expect(ok.layers.some((l) => l.group === 'b001' || l.group === 'b002')).toBe(false);
  });

  it('draws 0.5 r cores and 0.75 r shells from the covalent radii', () => {
    const f = build('m11-builder-tour', { step: 4 });
    const cores = f.layers.find((l) => l.group === 'cores') as AtomsLayer;
    const shells = f.layers.find((l) => l.group === 'shells') as AtomsLayer;
    const i = VACANCY_CELL.species.indexOf('La');
    expect((cores.radius as number[])[i]).toBeCloseTo(0.5 * covalentRadius('La')!, 12);
    expect((shells.radius as number[])[i]).toBeCloseTo(0.75 * covalentRadius('La')!, 12);
  });

  it('a build after the first stays fast (memoised)', () => {
    build('m11-builder-tour', { step: 4, scale: 0.9 });
    const t0 = performance.now();
    build('m11-builder-tour', { step: 4, scale: 0.9 });
    build('m11-builder-tour', { step: 2, scale: 0.9 });
    expect(performance.now() - t0).toBeLessThan(150);
  });
});

describe('m11-studio-space: the Studio demo table and its filters', () => {
  it('the scene copy equals the public demo table', () => {
    const pub = JSON.parse(readFileSync('public/data/mp/sample/index.json', 'utf8')) as unknown;
    expect(JSON.parse(JSON.stringify(STUDIO_SAMPLE))).toEqual(pub);
    const man = JSON.parse(readFileSync('public/data/mp/sample/manifest.json', 'utf8')) as {
      synthetic: boolean;
    };
    expect(man.synthetic).toBe(true);
    expect(SAMPLE_ROWS.length).toBe(30);
  });

  it('Must contain Cu, O leaves the one NdCuO3 row, as the page says', () => {
    const q = studioQuery(withDefaults(scenes['m11-studio-space']!, { elements: 'Cu, O' }));
    const hit = filterRowIndices(STUDIO_SAMPLE, q);
    expect(hit.map((i) => SAMPLE_ROWS[i]!.formula_pretty)).toEqual(['NdCuO3']);
    expect(SAMPLE_ROWS[hit[0]!]!.nsites).toBe(20);
    const f = build('m11-studio-space', { elements: 'Cu, O' });
    expect(readout(f, 'Showing')).toBe('1 of 30 matching');
    expect((f.layers.find((l) => l.group === 'filtered') as AtomsLayer).positions.length).toBe(29);
  });

  it('the Beginner-friendly preset clears the element field, as the Studio button does', () => {
    const p = withDefaults(scenes['m11-studio-space']!, { elements: 'Cu, O', preset: 'beginner' });
    const q = studioQuery(p);
    expect(q.includeElements).toEqual([]);
    expect(filterRowIndices(STUDIO_SAMPLE, q)).toEqual(
      filterRowIndices(STUDIO_SAMPLE, { maxSites: 10, onlyStable: true }),
    );
  });

  it('the relative cost of the 20-site magnetic row is (20 / 4)^3 x 2 = 250', () => {
    const nd = SAMPLE_ROWS.find((r) => r.formula_pretty === 'NdCuO3')!;
    expect(estimateRelativeCost(nd).relativeCost).toBeCloseTo(250, 9);
    expect(readout(build('m11-studio-space'), 'Sites, relative cost')).toBe('20, about 250 x');
  });

  it('the hull filter keeps exactly the rows on the hull', () => {
    const f = build('m11-studio-space', { maxEhull: 0 });
    const n = SAMPLE_ROWS.filter((r) => r.energy_above_hull <= 0).length;
    expect(readout(f, 'Showing')).toBe(`${n} of 30 matching`);
  });
});

describe('m11-tools-overview: each tool view from its library', () => {
  it('tolerance factors are Goldschmidt t from the Shannon radii, La equal to the Builder B008 value', () => {
    for (const r of RCUO3_SWEEP) expect(r.t!).toBeCloseTo(goldschmidt(r.rA!, R_CU3, R_O2), 12);
    const la = RCUO3_SWEEP.find((r) => r.el === 'La')!;
    const b008 = check(LACUO3, 'crystal').find((i) => i.code === 'B008')!;
    expect(la.t!).toBeCloseTo(Number(b008.data!.t), 12);
    const f = build('m11-tools-overview', { tool: 'tolerance', rsite: 'Nd' });
    const nd = RCUO3_SWEEP.find((r) => r.el === 'Nd')!;
    const gap = Math.SQRT2 * (R_CU3 + R_O2) * (1 - nd.t!);
    expect(readout(f, 'A-O gap')).toBe(`${gap.toFixed(3)} Å`);
  });

  it('G-type has zero net moment and FM has 3 muB per Cu', () => {
    const g = namedOrdering(LACUO3, { kind: 'G' }, { elements: ['Cu'] });
    expect(netMoment(g, { Cu: 3 })).toBe(0);
    expect(readout(build('m11-tools-overview', { tool: 'magnetic', ordering: 'G' }), 'Net moment')).toBe(
      '0.0 muB per cell',
    );
    const fm = namedOrdering(LACUO3, { kind: 'FM' }, { elements: ['Cu'] });
    expect(netMoment(fm, { Cu: 3 })).toBe(3 * fm.magneticSites.length);
  });

  it('the k-mesh follows N = ceil(|b| / KSPACING) and R is a corner of the cubic zone', () => {
    expect(kspacingMesh((2 * Math.PI) / A0, 0.2)).toBe(9);
    expect(kspacingMesh((2 * Math.PI) / A0, 0.25)).toBe(7);
    const L: Mat3 = [
      [A0, 0, 0],
      [0, A0, 0],
      [0, 0, A0],
    ];
    const rec = reciprocalLattice(L);
    const bz = brillouinZone(rec);
    const R = CUBIC_POINTS.R!.map((f, i) => f * rec[i]![i]!);
    const hit = bz.vertices.some((v) => Math.hypot(v[0]! - R[0]!, v[1]! - R[1]!, v[2]! - R[2]!) < 1e-9);
    expect(hit).toBe(true);
  });

  it('the EOS fit recovers the parameters of golden set A', () => {
    const gold = JSON.parse(readFileSync('tests/reference/eos_reference.json', 'utf8')) as {
      cases: { name: string; generating: { v0: number; b0: number; b1: number } }[];
    };
    const a = gold.cases.find((c) => c.name === 'set_a_birch_murnaghan_clean')!.generating;
    const f = eosFit();
    expect(f.params.v0).toBeCloseTo(a.v0, 6);
    expect(f.params.b0).toBeCloseTo(a.b0, 6);
    expect(f.params.b1).toBeCloseTo(a.b1, 4);
  });

  it('every tool option builds and names itself in the description', () => {
    for (const tool of ['builder', 'tolerance', 'magnetic', 'kpath', 'eos', 'studio']) {
      const f = build('m11-tools-overview', { tool });
      expect(f.readouts![0]!.label).toBe('Tool');
      expect(f.describe.length).toBeGreaterThan(80);
    }
  });
});

describe('m11-next-map: the stations are the real handbook', () => {
  it('the module stations are the handbook folders, rising along the path', () => {
    const dirs = readdirSync('src/content/handbook', { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect([...MODULE_DIRS]).toEqual(dirs);
    for (let m = 1; m < MODULE_DIRS.length; m++) expect(pathPoint(m)[2]).toBeGreaterThan(pathPoint(m - 1)[2]);
  });

  it('every subject route is a topic file in its module, and the what-next page links each new topic', () => {
    const page = readFileSync('src/content/handbook/11-tools/what-next.mdx', 'utf8');
    for (const s of SUBJECTS) {
      if (!s.path) continue;
      expect(existsSync(`src/content/handbook/${s.path}.mdx`), s.path).toBe(true);
      expect(s.path.startsWith(MODULE_DIRS[s.module]!), s.id).toBe(true);
      expect(routeOf(s)).toBe(`/handbook/${s.path}/`);
      if (s.direction === 'deeper') expect(page).toContain(`(/handbook/${s.path}/)`);
    }
  });

  it('the readout gives the route as plain text', () => {
    const f = build('m11-next-map', { subject: 'hull' });
    expect(readout(f, 'Route')).toBe('/handbook/12-properties/formation-energy-and-convex-hull/');
  });
});
