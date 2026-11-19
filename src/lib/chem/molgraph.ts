// Molecule graphs for molecule mode (M10.3). RDKit (S-035, `@rdkit/rdkit` MinimalLib) does the chemistry that needs a
// toolkit: parsing SMILES and MOL blocks, sanitization (valence, kekulization), canonical SMILES, MOL output, 2D
// layout (CoordGen, with RDKit's default depiction as the fallback) and SVG. RDKit is passed in as `rd`, so the same
// code runs in the browser worker and in Node tests. Graph to RDKit goes through SMILES written here with every atom
// in brackets, so element, formal charge and hydrogen count are exactly what the graph says (no implicit hydrogens
// are added), and RDKit's atom order equals the order written, which maps its error messages back to graph atoms.
// @source S-035
import { atomicNumber, symbolOf } from '../crystal/elements';
import { RULES } from './rules';
import type { Issue } from './validity';

export type BondOrder = 1 | 2 | 3 | 'aromatic';

export interface MolAtom {
  el: string;
  /** Formal charge. */
  charge: number;
  /** Hydrogens attached to this atom that are not separate atoms of the graph. */
  hCount: number;
}
export interface MolBond {
  a: number;
  b: number;
  order: BondOrder;
}
export interface MolGraph {
  atoms: MolAtom[];
  bonds: MolBond[];
  /** 2D coordinates per atom, RDKit depiction units (about 1.5 per bond), when a layout exists. */
  coords2d?: [number, number][];
}

/** The part of RDKit MinimalLib used here (structural, so a test double or the real module fits). */
export interface RdkitMol {
  is_valid(): boolean;
  get_json(): string;
  get_molblock(): string;
  get_smiles(): string;
  set_new_coords(useCoordGen?: boolean): boolean;
  get_svg(width: number, height: number): string;
  delete(): void;
}
export interface RdkitLog {
  get_buffer(): string;
  clear_buffer(): void;
  delete(): void;
}
export interface RdkitApi {
  get_mol(input: string, details?: string): RdkitMol | null;
  set_log_capture(name: string): RdkitLog | null;
  version(): string;
}

// ---------- SMILES writer (graph to RDKit) ----------

/** Graph atoms stay atoms: explicit [H] atoms are not folded into their neighbours, so the atom order holds. */
const KEEP_H = JSON.stringify({ removeHs: false });

const AROMATIC_OK = new Set(['B', 'C', 'N', 'O', 'P', 'S', 'Se', 'As', 'Te']);

function atomToken(a: MolAtom, aromatic: boolean): string {
  if (atomicNumber(a.el) === undefined) throw new RangeError(`Unknown element symbol "${a.el}".`);
  if (!Number.isInteger(a.hCount) || a.hCount < 0)
    throw new RangeError('Hydrogen counts must be whole numbers >= 0.');
  if (!Number.isInteger(a.charge)) throw new RangeError('Formal charges must be whole numbers.');
  const sym = aromatic && AROMATIC_OK.has(a.el) ? a.el.toLowerCase() : a.el;
  const h = a.hCount === 0 ? '' : a.hCount === 1 ? 'H' : `H${a.hCount}`;
  const q =
    a.charge === 0 ? '' : `${a.charge > 0 ? '+' : '-'}${Math.abs(a.charge) === 1 ? '' : Math.abs(a.charge)}`;
  return `[${sym}${h}${q}]`;
}
const bondToken = (o: BondOrder): string => (o === 1 ? '' : o === 2 ? '=' : o === 3 ? '#' : ':');

/**
 * Write the graph as SMILES (every atom in brackets). `order[k]` is the graph index of the k-th atom written, which
 * is also RDKit's atom index after parsing. Disconnected fragments are joined with '.'.
 */
export function graphToSmiles(g: MolGraph): { smiles: string; order: number[] } {
  const n = g.atoms.length;
  if (n === 0) throw new RangeError('The molecule has no atoms.');
  const adj: { to: number; bond: number }[][] = g.atoms.map(() => []);
  g.bonds.forEach((b, k) => {
    if (b.a === b.b || b.a < 0 || b.b < 0 || b.a >= n || b.b >= n)
      throw new RangeError(`Bond ${k + 1} is not between two atoms.`);
    adj[b.a]!.push({ to: b.b, bond: k });
    adj[b.b]!.push({ to: b.a, bond: k });
  });
  const aromaticAtom = g.atoms.map((_, i) => adj[i]!.some((e) => g.bonds[e.bond]!.order === 'aromatic'));
  const seen = new Array<boolean>(n).fill(false);
  const treeBond = new Set<number>();
  // First pass: DFS tree, so every non-tree bond becomes a ring closure.
  const visitOrder: number[] = [];
  const dfs1 = (i: number): void => {
    seen[i] = true;
    visitOrder.push(i);
    for (const e of adj[i]!) {
      if (!seen[e.to]) {
        treeBond.add(e.bond);
        dfs1(e.to);
      }
    }
  };
  const roots: number[] = [];
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    roots.push(i);
    dfs1(i);
  }
  // Ring-closure digits per atom.
  const closures: { atom: number; digit: number; bond: number }[][] = g.atoms.map(() => []);
  const rank = new Map(visitOrder.map((a, k) => [a, k]));
  let digit = 0;
  g.bonds.forEach((b, k) => {
    if (treeBond.has(k)) return;
    digit++;
    if (digit > 99) throw new RangeError('Too many rings for this writer (more than 99 ring closures).');
    const [first, second] = rank.get(b.a)! < rank.get(b.b)! ? [b.a, b.b] : [b.b, b.a];
    closures[first]!.push({ atom: second, digit, bond: k });
    closures[second]!.push({ atom: first, digit, bond: k });
  });
  const ringDigit = (d: number): string => (d < 10 ? String(d) : `%${d}`);
  const order: number[] = [];
  const done = new Array<boolean>(n).fill(false);
  const write = (i: number): string => {
    done[i] = true;
    order.push(i);
    let out = atomToken(g.atoms[i]!, aromaticAtom[i]!);
    for (const c of closures[i]!) out += bondToken(g.bonds[c.bond]!.order) + ringDigit(c.digit);
    const kids = adj[i]!.filter((e) => treeBond.has(e.bond) && !done[e.to]);
    kids.forEach((e, k) => {
      const part = bondToken(g.bonds[e.bond]!.order) + write(e.to);
      out += k < kids.length - 1 ? `(${part})` : part;
    });
    return out;
  };
  const smiles = roots.map((r) => write(r)).join('.');
  return { smiles, order };
}

// ---------- RDKit JSON reader (RDKit to graph) ----------

interface RdJson {
  defaults: { atom: { z: number; impHs: number; chg: number }; bond: { bo: number } };
  molecules: {
    atoms: { z?: number; impHs?: number; chg?: number }[];
    bonds?: { bo?: number; atoms: [number, number] }[];
    conformers?: { dim: number; coords: number[][] }[];
    extensions?: { name: string; aromaticBonds?: number[] }[];
  }[];
}

/** Read RDKit's JSON (rdkitjson) into a graph. Aromatic bonds come back as 'aromatic'. */
export function graphFromRdkitJson(text: string): MolGraph {
  const j = JSON.parse(text) as RdJson;
  const m = j.molecules[0];
  if (!m) throw new RangeError('RDKit returned no molecule.');
  const d = j.defaults;
  const ext = m.extensions?.find((e) => e.name === 'rdkitRepresentation');
  const arom = new Set(ext?.aromaticBonds ?? []);
  const atoms: MolAtom[] = m.atoms.map((a) => {
    const z = a.z ?? d.atom.z;
    const el = symbolOf(z);
    if (!el) throw new RangeError(`RDKit returned an atom with Z = ${z}, which has no symbol here.`);
    return { el, charge: a.chg ?? d.atom.chg, hCount: a.impHs ?? d.atom.impHs };
  });
  const bonds: MolBond[] = (m.bonds ?? []).map((b, k) => {
    const bo = b.bo ?? d.bond.bo;
    const order: BondOrder = arom.has(k) ? 'aromatic' : bo === 2 ? 2 : bo === 3 ? 3 : 1;
    return { a: b.atoms[0], b: b.atoms[1], order };
  });
  const conf = m.conformers?.find((c) => c.dim === 2);
  return {
    atoms,
    bonds,
    ...(conf ? { coords2d: conf.coords.map((c) => [c[0]!, c[1]!] as [number, number]) } : {}),
  };
}

// ---------- Sanitization as B012 issues ----------

/** Turn RDKit's error log into B012 issues; `order` maps RDKit atom indices back to graph indices. */
export function sanitizationIssues(
  log: string,
  order?: readonly number[],
  atoms?: readonly MolAtom[],
): Issue[] {
  const lines = log
    .split('\n')
    .map((l) => l.replace(/^\[[0-9:]+\]\s*/, '').trim())
    .filter((l) => l && !/^\*+$/.test(l));
  const map = (k: number): number => order?.[k] ?? k;
  const base = RULES.B012;
  // `fix` in the crystal engine applies to a Structure, so for graphs the suggested edit is text in data.suggestion.
  const make = (title: string, why: string, idx: number[], suggestion?: string): Issue => ({
    code: 'B012',
    severity: 'error',
    title,
    why,
    atoms: idx,
    learn: base.learn,
    heuristic: base.heuristic,
    sources: ['S-035'],
    data: { rdkit: lines.join(' | '), ...(suggestion ? { suggestion } : {}) },
  });
  const out: Issue[] = [];
  for (const l of lines) {
    let m = /valence for atom # ?(\d+) (\w+)(?:, (\d+))?/i.exec(l);
    if (m) {
      const i = map(Number(m[1]));
      const el = m[2]!;
      const v = m[3] ? ` (${m[3]} bonds' worth)` : '';
      const q = atoms?.[i]?.charge ?? 0;
      out.push(
        make(
          `Too many bonds on ${el}${i + 1}`,
          `Atom ${el}${i + 1} has more bonding${v} than RDKit permits for ${el} with formal charge ${q}. ` +
            'Each bond, and each hydrogen, uses one unit of valence; a neutral carbon has four. ' +
            `RDKit says: "${l}".`,
          [i],
          'Remove a bond or a hydrogen, lower a bond order, or set a formal charge',
        ),
      );
      continue;
    }
    m = /Can't kekulize mol\.\s*Unkekulized atoms:\s*([\d\s]+)/i.exec(l);
    if (m) {
      const idx = m[1]!
        .trim()
        .split(/\s+/)
        .map((x) => map(Number(x)));
      out.push(
        make(
          'Aromatic ring cannot be written with alternating bonds',
          'RDKit could not assign alternating single and double bonds to the atoms marked aromatic, usually because ' +
            'a ring nitrogen needs its hydrogen ([nH]) or the ring is not really aromatic. ' +
            `RDKit says: "${l}".`,
          idx,
          'Add the missing hydrogen or draw the ring with explicit single and double bonds',
        ),
      );
      continue;
    }
    if (/SMILES Parse Error|Error parsing|syntax error/i.test(l)) {
      out.push(
        make('The text could not be read', `RDKit could not parse the input. RDKit says: "${l}".`, []),
      );
      continue;
    }
    if (/^Explicit|^Unkekulized|^Can't|^Problem|error/i.test(l)) {
      out.push(make('RDKit rejected the molecule', `RDKit says: "${l}".`, []));
    }
  }
  if (!out.length) {
    out.push(
      make(
        'RDKit rejected the molecule',
        lines.length
          ? `RDKit says: "${lines.join(' ')}".`
          : 'RDKit could not read or sanitize the input and gave no reason.',
        [],
      ),
    );
  }
  // one issue per distinct message
  return out.filter((x, k) => out.findIndex((y) => y.why === x.why) === k);
}

// ---------- High-level operations ----------

export type MolOutcome =
  | { ok: true; graph: MolGraph; smiles: string; molblock: string }
  | { ok: false; issues: Issue[]; graph?: MolGraph };

function withLog<T>(rd: RdkitApi, f: (log: RdkitLog | null) => T): T {
  const log = rd.set_log_capture('rdApp.error');
  try {
    log?.clear_buffer();
    return f(log);
  } finally {
    log?.delete();
  }
}

function fromMol(mol: RdkitMol): { graph: MolGraph; smiles: string; molblock: string } {
  return {
    graph: graphFromRdkitJson(mol.get_json()),
    smiles: mol.get_smiles(),
    molblock: mol.get_molblock(),
  };
}

/** Parse SMILES or a MOL block with sanitization. On failure, the issues say why and the unsanitized graph is kept. */
export function parseMolecule(rd: RdkitApi, text: string): MolOutcome {
  const input = text.includes('\n') ? text : text.trim();
  if (!input.trim()) return { ok: false, issues: sanitizationIssues('SMILES Parse Error: empty input') };
  return withLog(rd, (log) => {
    const mol = rd.get_mol(input);
    if (mol && mol.is_valid()) {
      try {
        return { ok: true as const, ...fromMol(mol) };
      } finally {
        mol.delete();
      }
    }
    mol?.delete();
    const issues = sanitizationIssues(log?.get_buffer() ?? '');
    const raw = rd.get_mol(input, JSON.stringify({ sanitize: false }));
    let graph: MolGraph | undefined;
    if (raw && raw.is_valid()) graph = graphFromRdkitJson(raw.get_json());
    raw?.delete();
    return graph ? { ok: false as const, issues, graph } : { ok: false as const, issues };
  });
}

/** Sanitize a graph through RDKit. On success the graph comes back as RDKit perceives it (atom order kept). */
export function checkGraph(rd: RdkitApi, g: MolGraph): MolOutcome {
  const { smiles, order } = graphToSmiles(g);
  return withLog(rd, (log) => {
    const mol = rd.get_mol(smiles, KEEP_H);
    if (mol && mol.is_valid()) {
      try {
        const r = fromMol(mol);
        return { ok: true as const, ...r, graph: reorder(r.graph, order) };
      } finally {
        mol.delete();
      }
    }
    mol?.delete();
    return {
      ok: false as const,
      issues: sanitizationIssues(log?.get_buffer() ?? '', order, g.atoms),
      graph: g,
    };
  });
}

/** RDKit atom k is graph atom order[k]: put RDKit's atoms back into graph order. */
function reorder(r: MolGraph, order: readonly number[]): MolGraph {
  const inv = new Array<number>(order.length);
  order.forEach((gIdx, k) => (inv[gIdx] = k));
  return {
    atoms: inv.map((k) => r.atoms[k]!),
    bonds: r.bonds.map((b) => ({ a: order[b.a]!, b: order[b.b]!, order: b.order })),
    ...(r.coords2d ? { coords2d: inv.map((k) => r.coords2d![k]!) } : {}),
  };
}

function withMol<T>(rd: RdkitApi, g: MolGraph, f: (mol: RdkitMol, order: number[]) => T): T {
  const { smiles, order } = graphToSmiles(g);
  const mol = rd.get_mol(smiles, KEEP_H);
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    throw new RangeError('The molecule does not pass sanitization; run checkGraph to see why.');
  }
  try {
    return f(mol, order);
  } finally {
    mol.delete();
  }
}

/** Canonical SMILES (RDKit). */
export const toSmiles = (rd: RdkitApi, g: MolGraph): string => withMol(rd, g, (m) => m.get_smiles());

/** MOL block (RDKit V2000) with a 2D layout; atoms are in RDKit order, `order[k]` is the graph index of atom k. */
export function toMolblock(rd: RdkitApi, g: MolGraph): { molblock: string; order: number[] } {
  return withMol(rd, g, (m, order) => {
    m.set_new_coords(true);
    return { molblock: m.get_molblock(), order };
  });
}

/** 2D coordinates: CoordGen first, RDKit's default depiction if CoordGen fails. */
export function layout2d(
  rd: RdkitApi,
  g: MolGraph,
): { graph: MolGraph; method: 'CoordGen' | 'RDKit default' } {
  return withMol(rd, g, (m, order) => {
    let method: 'CoordGen' | 'RDKit default' = 'CoordGen';
    if (!m.set_new_coords(true)) {
      method = 'RDKit default';
      if (!m.set_new_coords()) throw new Error('RDKit could not lay the molecule out in 2D.');
    }
    const r = graphFromRdkitJson(m.get_json());
    if (!r.coords2d) throw new Error('RDKit returned no 2D coordinates.');
    return { graph: { ...g, coords2d: reorder(r, order).coords2d! }, method };
  });
}

/** SVG depiction (RDKit). */
export const depictSvg = (rd: RdkitApi, g: MolGraph, width = 300, height = 200): string =>
  withMol(rd, g, (m) => {
    m.set_new_coords(true);
    return m.get_svg(width, height);
  });

/** Make every hydrogen a separate atom (bonded to its parent with a single bond), for 3D coordinates and export. */
export function expandHydrogens(g: MolGraph): MolGraph {
  const atoms: MolAtom[] = g.atoms.map((a) => ({ ...a, hCount: 0 }));
  const bonds: MolBond[] = g.bonds.map((b) => ({ ...b }));
  const coords = g.coords2d ? g.coords2d.map((c) => [...c] as [number, number]) : undefined;
  g.atoms.forEach((a, i) => {
    for (let k = 0; k < a.hCount; k++) {
      atoms.push({ el: 'H', charge: 0, hCount: 0 });
      bonds.push({ a: i, b: atoms.length - 1, order: 1 });
      if (coords) {
        const [x, y] = g.coords2d![i]!;
        const t = (2 * Math.PI * (k + 0.5)) / a.hCount;
        coords.push([x + Math.cos(t), y + Math.sin(t)]);
      }
    }
  });
  return { atoms, bonds, ...(coords ? { coords2d: coords } : {}) };
}
