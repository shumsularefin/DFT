// The validity engine (M10.1): judges whether a structure is chemically and geometrically plausible,
// explains every concern in plain language and offers pure fixes. Thresholds live in rules.ts (D-063 to D-066).
// @source S-021 S-022 S-023 S-045 S-051 S-034 (per rule in rules.ts)
import type { Structure } from '../crystal/types';
import type { SymmetryResult } from '../crystal/symmetry';
import { speciesCounts } from '../crystal/structure';
import { T_WINDOW_S003, evaluatePerovskite } from '../perovskite/checks';
import { getRadius } from '../perovskite/shannon';
import { searchCharges, formatAssignment, type Assignment } from './charge';
import { covalentRadius, isMetal, paulingX } from './elements';
import { deleteAtoms, mergeAtoms, mergeDuplicates, moveApart, scaleCell, wrapAll } from './fixes';
import { angles, contacts, volume, type Contact } from './geometry';
import { RULES, THRESHOLDS, radiusRatioLimit, type Learn, type RuleCode } from './rules';

export type Severity = 'error' | 'warning' | 'info';
export interface Fix {
  label: string;
  apply: (s: Structure) => Structure;
}
export interface Issue {
  code: RuleCode;
  severity: Severity;
  title: string;
  /** Plain-language explanation: what is wrong, why it matters. */
  why: string;
  atoms?: number[];
  fix?: Fix;
  alternatives?: Fix[];
  learn: Learn;
  heuristic: boolean;
  sources: string[];
  /** Numbers behind the message, for tests and the UI. */
  data?: Record<string, number | string>;
}
export type Mode = 'crystal' | 'molecule';
export interface CheckOptions {
  /** Result of the M5.1 symmetry analysis, when the caller has run it (B011). */
  symmetry?: SymmetryResult;
}

const issue = (
  code: RuleCode,
  severity: Severity,
  title: string,
  why: string,
  extra: Partial<Issue> = {},
): Issue => ({
  code,
  severity,
  title,
  why,
  learn: RULES[code].learn,
  heuristic: RULES[code].heuristic,
  sources: RULES[code].sources,
  ...extra,
});
const f3 = (x: number) => x.toFixed(3);
const f2 = (x: number) => x.toFixed(2);
const atomName = (s: Structure, i: number) => `${s.species[i]}${i + 1}`;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const ion = (el: string, ox: number) => `${el}${Math.abs(ox) === 1 ? '' : Math.abs(ox)}${ox > 0 ? '+' : '-'}`;

/** Reduced composition, e.g. Na4Cl4 -> Na1 Cl1. */
export function composition(s: Structure): { el: string; count: number }[] {
  const c = speciesCounts(s).map((x) => ({ el: x.symbol, count: x.count }));
  const g = c.reduce((a, x) => gcd(a, x.count), 0) || 1;
  return c.map((x) => ({ el: x.el, count: x.count / g }));
}

// ---------- B001, B002: overlaps and short contacts ----------
function pairRules(s: Structure, list: Contact[], periodic: boolean): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    const ri = covalentRadius(s.species[c.i]!);
    const rj = covalentRadius(s.species[c.j]!);
    if (ri === null || rj === null) continue;
    const key = `${c.i}-${c.j}`;
    if (seen.has(key)) continue; // the closest image of each pair only
    const sum = ri + rj;
    const same = s.species[c.i] === s.species[c.j];
    if (same && c.i !== c.j && c.distance < THRESHOLDS.mergeDistance && periodic) {
      seen.add(key);
      continue; // a duplicate site: B010 reports it with "merge duplicates"
    }
    const data = { distance: c.distance, radiusSum: sum, ratio: c.distance / sum };
    const pairText = `${atomName(s, c.i)} and ${atomName(s, c.j)} are ${f3(c.distance)} Angstrom apart`;
    if (c.i === c.j) {
      if (c.distance < THRESHOLDS.overlapFactor * sum) {
        seen.add(key);
        out.push(
          issue(
            'B001',
            'error',
            'An atom overlaps its own periodic image',
            `${atomName(s, c.i)} is ${f3(c.distance)} Angstrom from its copy in the next cell, less than half of twice its covalent radius (${f3(sum)} Angstrom). The cell is too small along that direction; enlarge it.`,
            {
              atoms: [c.i],
              data,
            },
          ),
        );
      }
      continue;
    }
    const target = sum;
    const apart: Fix = {
      label: `Move apart to ${f2(target)} Angstrom`,
      apply: (x) => moveApart(x, c.i, c.j, c.image, target),
    };
    const del: Fix = { label: `Delete ${atomName(s, c.j)}`, apply: (x) => deleteAtoms(x, [c.j]) };
    if (c.distance < THRESHOLDS.overlapFactor * sum) {
      seen.add(key);
      const merge: Fix = { label: 'Merge into one atom', apply: (x) => mergeAtoms(x, c.i, c.j, c.image) };
      out.push(
        issue(
          'B001',
          'error',
          'Atoms overlap',
          `${pairText}, less than half the sum of their covalent radii (${f3(sum)} Angstrom). Real atoms are never this close; this is usually a duplicated or misplaced atom, and DFT would start from enormous forces or fail.`,
          {
            atoms: [c.i, c.j],
            fix: same ? merge : apart,
            alternatives: same ? [del, apart] : [del],
            data,
          },
        ),
      );
    } else if (c.distance < THRESHOLDS.shortContactFactor * sum) {
      seen.add(key);
      out.push(
        issue(
          'B002',
          'warning',
          'Short contact',
          `${pairText}, below 0.75 of the sum of their covalent radii (${f3(sum)} Angstrom). Bonds this short are rare; check the position, or expect large forces in the first relaxation steps.`,
          {
            atoms: [c.i, c.j],
            fix: apart,
            data,
          },
        ),
      );
    }
  }
  return out;
}

// ---------- B003: impossible packing ----------
function densityRule(s: Structure, list: Contact[]): Issue[] {
  const V = volume(s);
  let sphere = 0;
  for (const el of s.species) {
    const r = covalentRadius(el);
    if (r !== null) sphere += (4 / 3) * Math.PI * (THRESHOLDS.denseSphereFactor * r) ** 3;
  }
  if (sphere <= V) return [];
  // Scale so the closest pair reaches the short-contact threshold; impossible if two atoms coincide.
  let factor = 1;
  let coincident = false;
  for (const c of list) {
    const ri = covalentRadius(s.species[c.i]!);
    const rj = covalentRadius(s.species[c.j]!);
    if (ri === null || rj === null) continue;
    if (c.distance < THRESHOLDS.mergeDistance) coincident = true;
    else factor = Math.max(factor, (THRESHOLDS.shortContactFactor * (ri + rj)) / c.distance);
  }
  const extra: Partial<Issue> = { data: { sphereVolume: sphere, cellVolume: V } };
  if (!coincident)
    extra.fix = { label: `Scale the cell by ${f3(factor)} (lengths)`, apply: (x) => scaleCell(x, factor) };
  return [
    issue(
      'B003',
      'error',
      'Cell too dense',
      `Even spheres of half the covalent radius of every atom fill ${f2(sphere)} Angstrom^3, more than the whole cell (${f2(V)} Angstrom^3). No real arrangement packs this tightly; the lattice is probably in the wrong units or far too small.${coincident ? ' Merge the coincident atoms first, then scale.' : ''}`,
      extra,
    ),
  ];
}

// ---------- B004: degenerate cell ----------
function cellRule(s: Structure): { issues: Issue[]; unusable: boolean } {
  const V = volume(s);
  const [al, be, ga] = angles(s);
  const bad = [al, be, ga].filter((a) => !(a >= THRESHOLDS.minAngle && a <= THRESHOLDS.maxAngle));
  const out: Issue[] = [];
  const unusable = !Number.isFinite(V) || V < 1e-6 || bad.length > 0;
  if (bad.length)
    out.push(
      issue(
        'B004',
        'error',
        'Cell nearly degenerate',
        `The cell angles are ${f2(al)}, ${f2(be)} and ${f2(ga)} degrees; an angle below 20 or above 160 degrees squashes the cell almost flat. Choose a less skewed set of lattice vectors (a different but equivalent cell) before running.`,
        {
          data: { alpha: al, beta: be, gamma: ga },
        },
      ),
    );
  const perAtom = V / Math.max(1, s.species.length);
  if (perAtom < THRESHOLDS.minVolumePerAtom)
    out.push(
      issue(
        'B004',
        'error',
        'Cell volume too small',
        `The cell has ${f3(perAtom)} Angstrom^3 per atom; real solids have several to tens. Check the lattice scale factor and units.`,
        {
          data: { volumePerAtom: perAtom },
        },
      ),
    );
  return { issues: out, unusable };
}

// ---------- B005: charge neutrality ----------
function chargeRule(s: Structure): { issues: Issue[]; best?: Assignment } {
  const comp = composition(s);
  if (comp.length === 1)
    return {
      issues: [
        issue(
          'B005',
          'info',
          'Charge neutrality: one element',
          `Only ${comp[0]!.el} is present, so every atom is neutral (oxidation state 0); no assignment is needed.`,
        ),
      ],
    };
  if (comp.every((c) => isMetal(c.el)))
    return {
      issues: [
        issue(
          'B005',
          'info',
          'Charge neutrality: skipped for metals',
          'Every element here is a metal, so the structure is treated as an alloy or intermetallic and oxidation states do not apply. See the Hume-Rothery check instead.',
        ),
      ],
    };
  const common = searchCharges(comp, true);
  if (common.kind === 'no-electronegativity')
    return {
      issues: [
        issue(
          'B005',
          'info',
          'Charge neutrality: not checked',
          `${common.elements.join(', ')} has no Pauling electronegativity in the data, so anions and cations cannot be ordered.`,
        ),
      ],
    };
  if (common.kind === 'assigned')
    return {
      best: common.best,
      issues: [
        issue(
          'B005',
          'info',
          'Charge neutral',
          `A neutral assignment using common oxidation states exists: ${formatAssignment(common.best)}. Each state is common for its element in the ICSD (share at least 0.10).`,
          { data: { assignment: formatAssignment(common.best) } },
        ),
      ],
    };
  const any = searchCharges(comp, false);
  if (any.kind === 'assigned') {
    const rare = any.best.elements.flatMap((e) =>
      e.parts.filter((p) => p.rare).map((p) => ({ el: e.el, ...p })),
    );
    const names = rare
      .map((r) => `${ion(r.el, r.ox)} (${(r.share * 100).toFixed(1)} % of ${r.el} entries)`)
      .join(', ');
    return {
      best: any.best,
      issues: [
        issue(
          'B005',
          'warning',
          'Charge neutral only with rare oxidation states',
          `The only neutral assignments need uncommon states. Best: ${formatAssignment(any.best)}, which uses ${names}. Such compounds exist but are unusual; check the composition.`,
          {
            data: {
              assignment: formatAssignment(any.best),
              rare: rare.map((r) => ion(r.el, r.ox)).join(' '),
              share: rare[0]?.share ?? 0,
            },
          },
        ),
      ],
    };
  }
  const formula = comp.map((c) => `${c.el}${c.count === 1 ? '' : c.count}`).join('');
  return {
    issues: [
      issue(
        'B005',
        'error',
        'No charge-neutral assignment',
        `No combination of observed oxidation states makes ${formula} neutral with every anion more electronegative than every cation. As an ionic compound this composition cannot balance; check the number of each atom.`,
        { data: { formula } },
      ),
    ],
  };
}

// ---------- B006, B007: Pauling's rules ----------
interface Shell {
  cn: number;
  bonds: Contact[];
}
/** Coordination shells of every cation: anions within 1.2 x the shortest cation-anion distance. */
function shells(
  s: Structure,
  isCation: (i: number) => boolean,
  isAnion: (i: number) => boolean,
): Map<number, Shell> {
  let cutoff = 4;
  for (let round = 0; round < 4; round++) {
    const list = contacts(s, cutoff);
    const out = new Map<number, Shell>();
    let need = 0;
    let missing = false;
    for (let i = 0; i < s.species.length; i++) {
      if (!isCation(i)) continue;
      const bonds = list.filter(
        (c) => c.i !== c.j && ((c.i === i && isAnion(c.j)) || (c.j === i && isAnion(c.i))),
      );
      if (!bonds.length) {
        missing = true;
        continue;
      }
      const dmin = bonds[0]!.distance;
      need = Math.max(need, THRESHOLDS.shellFactor * dmin);
      const shell = bonds.filter((b) => b.distance <= THRESHOLDS.shellFactor * dmin + 1e-9);
      out.set(i, { cn: shell.length, bonds: shell });
    }
    if (need < cutoff && !missing) return out;
    if (need < cutoff && cutoff >= 12) return out;
    cutoff = Math.max(need + 0.01, cutoff * 2);
  }
  return new Map();
}

function paulingRules(
  s: Structure,
  best: Assignment,
): { issues: Issue[]; shells: Map<number, Shell>; ox: Map<string, number> } {
  const ox = new Map<string, number>();
  for (const e of best.elements) if (e.parts.length === 1) ox.set(e.el, e.parts[0]!.ox);
  const oxOf = (i: number) => ox.get(s.species[i]!);
  const isCation = (i: number) => (oxOf(i) ?? 0) > 0;
  const isAnion = (i: number) => (oxOf(i) ?? 0) < 0;
  const sh = shells(s, isCation, isAnion);
  const other = (b: Contact, i: number) => (b.i === i ? b.j : b.i);
  const ionic = (i: number) => {
    const shell = sh.get(i);
    if (!shell) return false;
    const a = s.species[other(shell.bonds[0]!, i)]!;
    return paulingX(a)! - paulingX(s.species[i]!)! >= THRESHOLDS.ionicDeltaX;
  };
  const out: Issue[] = [];
  // B006: radius ratio against the observed coordination
  const groups = new Map<
    string,
    { atoms: number[]; cn: number; ratio: number; el: string; anion: string; limit: number; poly: string }
  >();
  const noRadius = new Set<string>();
  for (const [i, shell] of sh) {
    if (!ionic(i)) continue;
    const el = s.species[i]!;
    const an = s.species[other(shell.bonds[0]!, i)]!;
    const rc = getRadius({ el, ox: oxOf(i)!, cn: 6, kind: 'ionic' });
    const ra = getRadius({ el: an, ox: ox.get(an)!, cn: 6, kind: 'ionic' });
    if (!rc.ok || !ra.ok) {
      noRadius.add(!rc.ok ? ion(el, oxOf(i)!) : ion(an, ox.get(an)!));
      continue;
    }
    const lim = radiusRatioLimit(shell.cn);
    const ratio = rc.value / ra.value;
    if (lim && ratio < lim.limit - 1e-9) {
      const key = `${el}-${shell.cn}`;
      const g = groups.get(key) ?? {
        atoms: [],
        cn: shell.cn,
        ratio,
        el,
        anion: an,
        limit: lim.limit,
        poly: lim.polyhedron,
      };
      g.atoms.push(i);
      groups.set(key, g);
    }
  }
  for (const g of groups.values())
    out.push(
      issue(
        'B006',
        'warning',
        "Cation too small for its coordination (Pauling's first rule)",
        `${g.el} has ${g.cn} ${g.anion} neighbours, but its radius ratio r(${g.el})/r(${g.anion}) = ${f3(g.ratio)} is below ${f3(g.limit)}, the smallest ratio at which a cation still touches all the anions of a ${g.poly}. A cation that rattles in its cage usually takes a lower coordination. Shannon radii at CN VI are used for both ions (a standard comparison).`,
        {
          atoms: g.atoms,
          data: { cn: g.cn, ratio: g.ratio, limit: g.limit },
        },
      ),
    );
  if (noRadius.size)
    out.push(
      issue(
        'B006',
        'info',
        "Pauling's first rule: not checked for some ions",
        `No Shannon radius at CN VI (or a spin state is needed) for ${[...noRadius].join(', ')}, so their radius ratio was not tested.`,
      ),
    );
  // B007: electrostatic bond-strength sums at the anions
  const sums = new Map<number, number>();
  let allIonic = sh.size > 0;
  for (const [i, shell] of sh) {
    if (!ionic(i)) allIonic = false;
    for (const b of shell.bonds) {
      const a = other(b, i);
      sums.set(a, (sums.get(a) ?? 0) + oxOf(i)! / shell.cn);
    }
  }
  if (allIonic) {
    const bad = new Map<string, { atoms: number[]; sum: number; v: number }>();
    for (let a = 0; a < s.species.length; a++) {
      if (!isAnion(a)) continue;
      const v = Math.abs(oxOf(a)!);
      const sum = sums.get(a) ?? 0;
      if (Math.abs(sum - v) / v > THRESHOLDS.bondSumTolerance) {
        const key = `${s.species[a]}-${sum.toFixed(4)}`;
        const g = bad.get(key) ?? { atoms: [], sum, v };
        g.atoms.push(a);
        bad.set(key, g);
      }
    }
    for (const g of bad.values()) {
      const el = s.species[g.atoms[0]!]!;
      out.push(
        issue(
          'B007',
          'warning',
          "Unbalanced anion (Pauling's second rule)",
          `The bonds reaching ${el} carry a total electrostatic strength of ${f3(g.sum)} (each cation gives its charge divided by its coordination number), but ${el} needs ${g.v}. A deviation of more than 25 % means the charge is not shared out locally, so the arrangement is unlikely to be stable.`,
          {
            atoms: g.atoms,
            data: { sum: g.sum, valence: g.v },
          },
        ),
      );
    }
  }
  return { issues: out, shells: sh, ox };
}

// ---------- B008: perovskite ----------
function perovskiteRule(
  s: Structure,
  best: Assignment,
  sh: Map<number, Shell>,
  ox: Map<string, number>,
): Issue[] {
  const comp = composition(s);
  if (comp.length !== 3) return [];
  const x = comp.find((c) => c.count === 3 && (ox.get(c.el) ?? 0) < 0);
  const cats = comp.filter((c) => c.count === 1 && (ox.get(c.el) ?? 0) > 0);
  if (!x || cats.length !== 2 || best.mixedCount) return [];
  const cnOf = (el: string) => sh.get(s.species.indexOf(el))?.cn ?? 0;
  const [A, B] = cnOf(cats[0]!.el) >= cnOf(cats[1]!.el) ? [cats[0]!, cats[1]!] : [cats[1]!, cats[0]!];
  const occ = (el: string, cn: number) => [{ el, ox: ox.get(el)!, cn, fraction: 1 }];
  const ev = evaluatePerovskite({ A: occ(A.el, 12), B: occ(B.el, 6), X: occ(x.el, 6) });
  const formula = `${A.el}${B.el}${x.el}3`;
  if (!ev.ok || !ev.factors)
    return [
      issue(
        'B008',
        'info',
        'Perovskite check: no factors',
        `${formula} looks like a perovskite, but ${ev.checks.find((c) => c.level === 'error')?.message ?? 'a radius is missing'}. No tolerance factor is shown rather than a guess.`,
      ),
    ];
  const { t, mu } = ev.factors;
  // Severity (D-067): a warning from M8 except t-range, or t outside S-003's measured window, makes B008 a warning.
  const outside = t <= T_WINDOW_S003[0] || t >= T_WINDOW_S003[1];
  const warn = ev.checks.filter((c) => c.level === 'warning' && (c.id !== 't-range' || outside));
  const notes = ev.checks.filter((c) => c.id === 't-range' && c.level === 'warning' && !outside);
  return [
    issue(
      'B008',
      warn.length ? 'warning' : 'info',
      `Perovskite check: t = ${t.toFixed(4)}, mu = ${mu.toFixed(4)}`,
      `${formula} has the ABX3 composition, with ${A.el} (higher coordination here) on the A site. Using Shannon radii with A at CN XII and B and X at CN VI (S-003 convention), the Goldschmidt tolerance factor is ${t.toFixed(4)} and the octahedral factor ${mu.toFixed(4)}.${[...warn, ...notes].map((c) => ' ' + c.message).join('')}`,
      {
        data: { t, mu, A: A.el, B: B.el, X: x.el },
      },
    ),
  ];
}

// ---------- B009: Hume-Rothery ----------
function humeRotheryRule(s: Structure): Issue[] {
  const comp = speciesCounts(s);
  if (comp.length < 2 || !comp.every((c) => isMetal(c.symbol))) return [];
  const host = [...comp].sort((a, b) => b.count - a.count)[0]!.symbol;
  const rh = covalentRadius(host);
  const xh = paulingX(host);
  const out: Issue[] = [];
  for (const c of comp) {
    if (c.symbol === host) continue;
    const r = covalentRadius(c.symbol);
    const x = paulingX(c.symbol);
    if (r !== null && rh !== null && Math.abs(r - rh) / rh > THRESHOLDS.humeRotheryRadius)
      out.push(
        issue(
          'B009',
          'warning',
          'Size mismatch (Hume-Rothery)',
          `${c.symbol} and the host ${host} differ in size by ${((Math.abs(r - rh) / rh) * 100).toFixed(1)} %, more than 15 %, so extensive substitutional solid solution is unlikely. The classic rule uses metallic radii; covalent radii are used here as a stand-in.`,
          {
            data: { mismatch: Math.abs(r - rh) / rh },
          },
        ),
      );
    if (x !== null && xh !== null && Math.abs(x - xh) > THRESHOLDS.humeRotheryDeltaX)
      out.push(
        issue(
          'B009',
          'warning',
          'Electronegativity difference (Hume-Rothery)',
          `${c.symbol} and ${host} differ in Pauling electronegativity by ${f2(Math.abs(x - xh))}, more than 0.4, so they tend to form ordered compounds rather than a random alloy.`,
          {
            data: { deltaX: Math.abs(x - xh) },
          },
        ),
      );
  }
  out.push(
    issue(
      'B009',
      'info',
      'Hume-Rothery: crystal-structure rule not checked',
      `The rule that the pure elements should share a crystal structure is not checked. Size uses covalent radii as a stand-in for metallic radii; the host is ${host}, the most abundant element.`,
    ),
  );
  return out;
}

// ---------- B010: periodic images ----------
function imageRules(s: Structure, list: Contact[]): Issue[] {
  const out: Issue[] = [];
  const outside = s.frac.flatMap((f, i) => (f.some((x) => x < 0 || x >= 1) ? [i] : []));
  if (outside.length)
    out.push(
      issue(
        'B010',
        'info',
        'Atoms outside the cell',
        `${outside.length} atom(s) have fractional coordinates outside 0 to 1. That is allowed (each is the same as its image inside the cell), but wrapping makes the file easier to read.`,
        {
          atoms: outside,
          fix: { label: 'Wrap into the cell', apply: wrapAll },
        },
      ),
    );
  const dup = list.filter(
    (c) => c.i !== c.j && c.distance < THRESHOLDS.mergeDistance && s.species[c.i] === s.species[c.j],
  );
  if (dup.length)
    out.push(
      issue(
        'B010',
        'error',
        'Duplicate atoms',
        `${dup.length} pair(s) of identical atoms sit within 0.1 Angstrom of each other once periodic images are considered (for example ${atomName(s, dup[0]!.i)} and ${atomName(s, dup[0]!.j)}). An atom on a cell face is often listed twice, once on each side; keep one.`,
        {
          atoms: [...new Set(dup.flatMap((c) => [c.i, c.j]))],
          fix: { label: 'Merge duplicates', apply: mergeDuplicates },
        },
      ),
    );
  return out;
}

// ---------- B011: symmetry ----------
function symmetryRule(s: Structure, sym?: SymmetryResult): Issue {
  if (!sym)
    return issue(
      'B011',
      'info',
      'Symmetry: not analysed',
      'Run the symmetry analysis to see the space group and Wyckoff positions.',
    );
  const sites = [...new Set(sym.orbits)].map((o) => {
    const i = sym.orbits.indexOf(o);
    return `${s.species[i]} ${sym.wyckoffs[i] ?? '?'}`;
  });
  return issue(
    'B011',
    'info',
    `Space group ${sym.hmSymbol} (${sym.number})`,
    `The structure has space group ${sym.hmSymbol}, number ${sym.number}. Wyckoff positions: ${sites.join(', ')}.`,
    {
      data: { number: sym.number, symbol: sym.hmSymbol },
    },
  );
}

/** Judge a structure. Crystal mode is periodic; molecule mode checks distances only (valence is RDKit's job, M10.3). */
export function check(s: Structure, mode: Mode = 'crystal', opts: CheckOptions = {}): Issue[] {
  const cut = (() => {
    let m = 0;
    for (const el of new Set(s.species)) m = Math.max(m, covalentRadius(el) ?? 0);
    return Math.max(THRESHOLDS.mergeDistance * 2, THRESHOLDS.shortContactFactor * 2 * m);
  })();
  const missing = [...new Set(s.species.filter((el) => covalentRadius(el) === null))];
  const missingInfo = missing.length
    ? [
        issue(
          'B001',
          'info',
          'Distance checks skipped for some elements',
          `No covalent radius is tabulated for ${missing.join(', ')} (Cordero 2008 stops at Cm), so their distances were not checked.`,
        ),
      ]
    : [];
  if (mode === 'molecule') {
    return [
      ...pairRules(s, contacts(s, cut, false), false),
      ...missingInfo,
      issue(
        'B012',
        'info',
        'Valence and charge: checked by RDKit',
        'In molecule mode, valence and formal-charge errors come from RDKit sanitization (molecule engine), not from these rules.',
      ),
    ];
  }
  const out: Issue[] = [];
  const cell = cellRule(s);
  out.push(...cell.issues);
  const charge = chargeRule(s);
  if (!cell.unusable) {
    const list = contacts(s, cut);
    out.push(...imageRules(s, list), ...pairRules(s, list, true), ...missingInfo, ...densityRule(s, list));
  } else out.push(...imageRules(s, []));
  out.push(...charge.issues);
  if (!cell.unusable && charge.best) {
    const p = paulingRules(s, charge.best);
    out.push(...p.issues, ...perovskiteRule(s, charge.best, p.shells, p.ox));
  }
  out.push(...humeRotheryRule(s), symmetryRule(s, opts.symmetry));
  return out;
}

// ---------- Export gate ----------
export interface ExportGate {
  allowed: boolean;
  blocking: Issue[];
  /** One line for the exported file's comment when an override was used. */
  commentLine?: string;
}

/** Errors block export unless the user gives a non-empty reason; the reason is recorded in the file. */
export function exportGate(issues: readonly Issue[], override?: { reason: string }): ExportGate {
  const blocking = issues.filter((i) => i.severity === 'error');
  if (!blocking.length) return { allowed: true, blocking };
  const reason = (override?.reason ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!reason) return { allowed: false, blocking };
  const codes = [...new Set(blocking.map((b) => b.code))].join(',');
  return { allowed: true, blocking, commentLine: `OVERRIDE ${codes}: ${reason}` };
}

/** The structure to export: its comment line gains the override record (POSCAR line 1, CIF comment). */
export function withOverrideComment(s: Structure, gate: ExportGate): Structure {
  if (!gate.commentLine) return s;
  return { ...s, comment: s.comment ? `${s.comment} | ${gate.commentLine}` : gate.commentLine };
}
