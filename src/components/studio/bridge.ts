// The bridge between DFT Studio (plain scripts in public/dft-studio/js) and the site's verified TypeScript code.
// Studio passes POSCAR text, the bridge parses it with the site's reader, so every check, operation and
// hand-off here runs on the same code (and the same golden tests) as the rest of the site.
// @source S-021, S-034, S-042 (structure checks), S-019, S-041 (INCAR rules)
import { parsePoscar, writePoscar } from '../../lib/crystal/poscar';
import { readStructure } from '../../lib/crystal/io';
import { check, composition, exportGate, withOverrideComment, type Issue } from '../../lib/chem/validity';
import { gentleRelax, mergeDuplicates, wrap, type OpResult } from '../../lib/crystal/ops';
import { parseIncar, expandRepeats } from '../../lib/vasp/incar';
import { validate } from '../../lib/vasp/validate';
import { stashHandoff, takeHandoff, type Handoff } from '../../lib/handoff';
import type { Structure } from '../../lib/crystal/types';
import { CRYSTAL_TEMPLATES } from '../tools/builder/crystalTemplates';
import { ALL_ELEMENTS } from '../ui/PeriodicTable';

/** Site tools Studio can hand a structure to, with what each one adds over Studio. */
export const SITE_TOOLS = [
  {
    id: 'input-builder',
    url: '/tools/input-builder/',
    label: 'Input Builder',
    why: 'INCAR checked by the 33 sourced validation rules, job scripts and a share link.',
  },
  {
    id: 'kpath',
    url: '/tools/kpath/',
    label: 'k-path tool',
    why: 'Verified HPKOT and Setyawan-Curtarolo paths with the exact Brillouin zone in 3D.',
  },
  {
    id: 'magnetic',
    url: '/tools/magnetic/',
    label: 'Magnetic configurations',
    why: 'Enumerated FM and AFM orderings, MAGMOM and the Heisenberg fit.',
  },
  {
    id: 'planner',
    url: '/tools/planner/',
    label: 'Calculation planner',
    why: 'Cost estimate and the order of calculations for this structure.',
  },
] as const;
export type SiteToolId = (typeof SITE_TOOLS)[number]['id'];

/** Analysis tools on the site that read VASP outputs with golden-tested parsers. */
export const SITE_ANALYZERS = [
  {
    url: '/tools/convergence/',
    label: 'Convergence plotter',
    why: 'ENCUT and k-mesh series with a threshold.',
  },
  {
    url: '/tools/eos/',
    label: 'Equation of state',
    why: 'Birch-Murnaghan and Vinet fits checked against pymatgen.',
  },
  {
    url: '/tools/work-function/',
    label: 'Work function',
    why: 'Planar average of LOCPOT, golden against pymatgen.',
  },
  { url: '/tools/review/', label: 'Output review', why: 'OUTCAR, OSZICAR, DOSCAR and band-gap checks.' },
] as const;

export interface BridgeIssue {
  code: string;
  severity: Issue['severity'];
  title: string;
  why: string;
  heuristic: boolean;
  sources: string[];
  atoms: number[];
  fixes: string[];
}

export interface Incoming {
  poscar: string;
  label: string;
  from: string;
  magmom?: string;
}

const toPoscar = (s: Structure, comment?: string) => writePoscar(s, comment ? { comment } : {}).text;

function readAny(text: string, name = 'POSCAR'): Structure {
  try {
    return parsePoscar(text).structure;
  } catch {
    return readStructure(name, text).structure;
  }
}

const issuesCache = new Map<string, Issue[]>();
function issuesFor(poscar: string): Issue[] {
  let out = issuesCache.get(poscar);
  if (!out) {
    out = check(readAny(poscar), 'crystal');
    issuesCache.clear();
    issuesCache.set(poscar, out);
  }
  return out;
}

function shape(op: OpResult) {
  return {
    poscar: toPoscar(op.structure, op.structure.comment),
    changed: op.changed,
    description: op.description,
    notes: op.notes,
  };
}

/** Composition hand-off (Tolerance Explorer): the cubic perovskite template with the chosen A, B and X. */
function perovskiteFrom(h: Extract<Handoff, { kind: 'composition' }>): Incoming {
  const a = h.a.occupants[0]?.symbol ?? 'Sr';
  const b = h.b.occupants[0]?.symbol ?? 'Ti';
  const x = h.x.occupants[0]?.symbol ?? 'O';
  const base = CRYSTAL_TEMPLATES.find((t) => t.id === 'perovskite')!.structure;
  const s: Structure = {
    ...base,
    species: [a, b, x, x, x],
    comment: `${a}${b}${x}3 from Tolerance Explorer`,
  };
  return { poscar: toPoscar(s, s.comment), label: `${a}${b}${x}3`, from: h.from };
}

export const SiteBridge = {
  tools: SITE_TOOLS,
  analyzers: SITE_ANALYZERS,
  /** The site's starter templates (Material Builder M10.4), as POSCAR text. */
  templates: CRYSTAL_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    poscar: toPoscar(t.structure, t.label),
  })),

  /** Elements Z = 1 to 103 with their periodic-table grid cell (same layout as the site's PeriodicTable). */
  elements: ALL_ELEMENTS.filter((e) => e.Z <= 103).map((e) => ({
    Z: e.Z,
    symbol: e.symbol,
    name: e.name,
    row: e.Z >= 57 && e.Z <= 71 ? 9 : e.Z >= 89 && e.Z <= 103 ? 10 : e.period,
    col: e.Z >= 57 && e.Z <= 71 ? 4 + e.Z - 57 : e.Z >= 89 && e.Z <= 103 ? 4 + e.Z - 89 : (e.group ?? 1),
  })),

  /** Structure checks B001 to B012 (src/lib/chem/validity.ts). */
  check(poscar: string): BridgeIssue[] {
    return issuesFor(poscar).map((i) => ({
      code: i.code,
      severity: i.severity,
      title: i.title,
      why: i.why,
      heuristic: i.heuristic,
      sources: i.sources,
      atoms: i.atoms ?? [],
      fixes: [i.fix, ...(i.alternatives ?? [])].filter(Boolean).map((f) => f!.label),
    }));
  },
  /** Apply fix `fixIndex` (0 = the main fix) of issue `issueIndex`; returns new POSCAR text or null. */
  applyFix(poscar: string, issueIndex: number, fixIndex = 0): string | null {
    const i = issuesFor(poscar)[issueIndex];
    const f = i && [i.fix, ...(i.alternatives ?? [])].filter(Boolean)[fixIndex];
    if (!f) return null;
    const s = f.apply(readAny(poscar));
    return toPoscar(s, s.comment);
  },
  composition(poscar: string) {
    return composition(readAny(poscar));
  },
  op(name: 'wrap' | 'merge' | 'relax', poscar: string) {
    const s = readAny(poscar);
    return shape(name === 'wrap' ? wrap(s) : name === 'merge' ? mergeDuplicates(s) : gentleRelax(s));
  },
  /** Errors block export unless a reason is given; the reason is written into the POSCAR comment line. */
  gate(poscar: string, reason = '') {
    const s = readAny(poscar);
    const g = exportGate(issuesFor(poscar), { reason });
    return {
      allowed: g.allowed,
      blocking: g.blocking.map((b) => `${b.code} ${b.title}`),
      poscar: g.commentLine ? toPoscar(withOverrideComment(s, g)) : poscar,
    };
  },
  /** The site's INCAR validation engine (33 sourced rules) on Studio's INCAR, POSCAR and optional ENMAX. */
  validateIncar(incar: string, poscar?: string, enmaxEv?: number) {
    const entries = parseIncar(incar).entries;
    let structure: Structure | undefined;
    try {
      structure = poscar ? readAny(poscar) : undefined;
    } catch {
      structure = undefined;
    }
    return validate({ incar: entries, structure, enmaxEv }).map((i) => ({
      rule: i.rule,
      severity: i.severity,
      title: i.title,
      why: i.why,
    }));
  },

  sendSeries: (csv: string, label: string) => sendSeries(csv, label),

  /** Read (and clear) a hand-off addressed to the builder or Studio. */
  takeIncoming(): Incoming | null {
    const h = takeHandoff(['structure', 'composition', 'molecule']);
    if (!h) return null;
    if (h.kind === 'composition') return perovskiteFrom(h);
    if (h.kind === 'molecule') {
      const s = readStructure('molecule.xyz', h.xyz).structure;
      return {
        poscar: toPoscar(s, h.smiles ?? 'molecule in a box'),
        label: h.smiles ?? 'molecule',
        from: h.from,
      };
    }
    if (h.kind !== 'structure') return null;
    return {
      poscar: toPoscar(h.structure, h.label ?? h.structure.comment),
      label: h.label ?? h.structure.comment ?? 'structure',
      from: h.from,
      magmom: h.magmom,
    };
  },
  /**
   * Hand the structure to a site tool and go there. In the builder page Studio runs in a frame,
   * so navigation goes to the top window. MAGMOM is passed only if it matches the atom count.
   */
  sendTo(tool: SiteToolId, poscar: string, label: string, magmom?: string): boolean {
    const t = SITE_TOOLS.find((x) => x.id === tool);
    if (!t) return false;
    const structure = readAny(poscar);
    const mm = magmom && expandRepeats(magmom).length === structure.species.length ? magmom : undefined;
    const ok = stashHandoff({ v: 1, kind: 'structure', from: 'dft-studio', structure, label, magmom: mm });
    if (ok) (window.top ?? window).location.assign(t.url);
    return ok;
  },
};

/** Hand a convergence table (plotter CSV columns) to /tools/convergence/. */
export function sendSeries(csv: string, label: string): boolean {
  const ok = stashHandoff({ v: 1, kind: 'series', from: 'dft-studio', csv, label });
  if (ok) (window.top ?? window).location.assign('/tools/convergence/');
  return ok;
}

export type SiteBridgeApi = typeof SiteBridge;
