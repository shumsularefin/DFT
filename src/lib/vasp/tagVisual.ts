// M12.5: a picture for an INCAR tag. `visualFor(tag, value, ctx)` turns the value of a tag into a figure (a flat SVG made
// from an existing plot or a scene), or null when the value is not one the tag data documents. Never a wrong picture.
// Captions come from src/data/tag-visuals.json and say no more than src/data/vasp-tags.json. Pure; loaded on demand.
// @source S-019 and S-042 (tag meanings), S-014 (Dudarev U - J), S-041
import data from '../../data/tag-visuals.json';
import type { Level } from '../levels';
import type { Structure } from '../crystal/types';
import { numberOfAtoms } from '../crystal/structure';
import { getScene, lookupStructure } from '../scene/library';
import { projectScene } from '../scene/project';
import { resolveScene, structureOf } from '../scene/resolve';
import { assertSpec, type SceneSpec } from '../scene/spec';
import { projectionToSvg } from '../scene/svg';
import { HBAR2_OVER_2M_EV_A2 } from '../physics/constants';
import { renderPlot, type PlotBadge } from '../visual/plots';
import type { Figure } from '../visual/resolve';
import { expandRepeats } from './incar';
import { meshFromKspacing, reciprocalLengths } from './kpoints';

export interface TagVisualCase {
  value: string;
  params: Record<string, unknown>;
  captions: Record<Level, string>;
  alt: string;
}
export interface TagVisualEntry {
  tag: string;
  plot?: string;
  scene?: string;
  badge: PlotBadge;
  sources: string[];
  example: string;
  captions?: Record<Level, string>;
  alt?: string;
  cases?: TagVisualCase[];
}
export const ENTRIES = data.tags as unknown as TagVisualEntry[];
export const coveredTags = (): string[] => ENTRIES.map((e) => e.tag);
export const entryFor = (tag: string): TagVisualEntry | undefined => ENTRIES.find((e) => e.tag === tag);

/** What else is known about the run: the other INCAR values (upper-case tag names) and the loaded structure. */
export interface TagContext {
  structure?: Structure | null | undefined;
  incar?: Readonly<Record<string, string>> | undefined;
}
export type TagFigure = Figure & { tag: string; value: string; captions: Record<Level, string> };

const fill = (s: string, vars: Record<string, string>): string =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
const fillAll = (c: Record<Level, string>, vars: Record<string, string>): Record<Level, string> => ({
  beginner: fill(c.beginner, vars),
  intermediate: fill(c.intermediate, vars),
  pro: fill(c.pro, vars),
});
const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const x = Number(s.trim().replace(/[dD]/, 'E'));
  return s.trim() !== '' && Number.isFinite(x) ? x : null;
};
const nums = (s: string): number[] | null => {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  const out = parts.map((p) => num(p));
  return out.length && out.every((x): x is number => x !== null) ? (out as number[]) : null;
};
const pretty = (x: number): string =>
  Math.abs(x) >= 1e-3 && Math.abs(x) < 1e4 ? String(x) : x.toExponential(0);

function plotFigure(
  e: TagVisualEntry,
  value: string,
  params: Record<string, unknown>,
  captions: Record<Level, string>,
  alt: string,
): TagFigure {
  const out = renderPlot(e.plot!, params, alt);
  return {
    kind: 'plot',
    svg: out.svg,
    badge: out.badge,
    caption: captions.intermediate,
    alt,
    captions,
    tag: e.tag,
    value,
  };
}

function sceneFigure(
  e: TagVisualEntry,
  value: string,
  spec: SceneSpec,
  captions: Record<Level, string>,
): TagFigure {
  assertSpec(spec);
  const structure = structureOf(spec, lookupStructure);
  const full: SceneSpec = { ...spec, structure, caption: captions.intermediate };
  const svg = projectionToSvg(
    projectScene(
      resolveScene(full, () => undefined),
      structure.lattice,
    ),
    full.alt,
    `tag-${e.tag}`,
  );
  return {
    kind: 'scene',
    svg,
    badge: full.badge,
    caption: captions.intermediate,
    alt: full.alt,
    spec: full,
    captions,
    tag: e.tag,
    value,
  };
}

/** Collinear moments (one per atom) from a MAGMOM value, or null when it cannot be read. */
function readMagmom(value: string): number[] | null {
  try {
    const v = expandRepeats(value);
    return v.length && v.every(Number.isFinite) ? v : null;
  } catch {
    return null;
  }
}

function magmomFigure(
  e: TagVisualEntry,
  tag: string,
  value: string,
  ctx: TagContext,
  spinsIfAbsent: number | null,
): TagFigure | null {
  const s = ctx.structure;
  const caps = e.captions!;
  if (!s) {
    // no structure: the example cell of the preset, only when no value was given
    if (value.trim() !== '' && tag === 'MAGMOM') return null;
    const base = getScene(e.scene!);
    const n = Array.isArray(base.spins) ? base.spins.length : 0;
    const vars = { n: String(n), atoms: String(n), match: 'an example cell with antiferromagnetic arrows' };
    const alt = `An example cell of ${n} atoms with arrows that alternate up and down. It stands for a MAGMOM with one value per atom. Toy model.`;
    return sceneFigure(e, value, { ...base, badge: 'toy-model', alt }, fillAll(caps, vars));
  }
  const atoms = numberOfAtoms(s);
  const given = readMagmom(value);
  const spins = given ?? (spinsIfAbsent !== null ? Array.from({ length: atoms }, () => spinsIfAbsent) : null);
  if (!spins) return null;
  const ok = spins.length === atoms;
  const vars = {
    n: String(spins.length),
    atoms: String(atoms),
    match: ok ? 'the count matches' : 'the count does NOT match, so the arrows are not drawn',
  };
  const alt = `The structure with ${atoms} atoms. ${
    ok
      ? 'One arrow per atom shows the starting moment: up for positive, down for negative, none for zero.'
      : `MAGMOM gives ${spins.length} value${spins.length === 1 ? '' : 's'}, so no arrows are drawn: the count must equal the number of atoms (rule V001).`
  }`;
  const spec: SceneSpec = {
    id: `tag-${tag.toLowerCase()}`,
    badge: 'computed',
    alt,
    structure: s,
    show: { atoms: true, bonds: true, cell: true, labels: false },
    ...(ok && spins.some((x) => x !== 0) ? { spins } : {}),
    camera: 'iso',
  };
  return sceneFigure(e, value, spec, fillAll(caps, vars));
}

/** The picture for `tag = value`, or null (no entry, or a value the tag data does not document). */
export function visualFor(tag: string, rawValue: string, ctx: TagContext = {}): TagFigure | null {
  const e = entryFor(tag.toUpperCase());
  if (!e) return null;
  const value = (rawValue ?? '').trim() || e.example;
  const given = (rawValue ?? '').trim() !== '';
  const incar = ctx.incar ?? {};
  const norm = (v: string): string => String(num(v) ?? v.toUpperCase());

  if (e.cases) {
    const c = e.cases.find((k) => k.value === norm(value));
    if (!c) return null;
    const vars: Record<string, string> = { value };
    let params = c.params;
    if (e.tag === 'ISPIN' && c.value === '2' && ctx.structure) {
      // on the user's own structure: arrows from MAGMOM, or 1.0 per atom when MAGMOM is not set (the tag default)
      const mm = magmomFigure(
        entryFor('MAGMOM')!,
        'ISPIN',
        incar.MAGMOM ?? '',
        { structure: ctx.structure },
        1,
      );
      if (mm)
        return {
          ...mm,
          tag: e.tag,
          value,
          captions: fillAll(c.captions, vars),
          caption: c.captions.intermediate,
        };
    }
    if (e.tag === 'ISMEAR') {
      const sigma = num(incar.SIGMA) ?? 0.2;
      if (!(sigma > 0)) return null;
      params = { ...params, sigma };
      vars.sigma = String(sigma);
    }
    return plotFigure(e, value, params, fillAll(c.captions, vars), fill(c.alt, vars));
  }

  const x = num(value);
  switch (e.tag) {
    case 'MAGMOM':
      return magmomFigure(e, 'MAGMOM', given ? value : '', ctx, null);
    case 'ENCUT': {
      if (x === null || !(x > 0)) return null;
      const kc = Math.sqrt(x / HBAR2_OVER_2M_EV_A2);
      const vars = { value: pretty(x) };
      return plotFigure(
        e,
        value,
        { cutoff: x, kmax: kc * 1.25 },
        fillAll(e.captions!, vars),
        fill(e.alt!, vars),
      );
    }
    case 'KSPACING': {
      if (x === null || !(x > 0)) return null;
      const cell = ctx.structure
        ? ctx.structure.lattice
        : ([
            [4, 0, 0],
            [0, 4, 0],
            [0, 0, 4],
          ] as const);
      const mesh = meshFromKspacing(cell, x).mesh;
      const b = reciprocalLengths(cell);
      const vars = {
        value: pretty(x),
        mesh: `${mesh[0]} x ${mesh[1]} x ${mesh[2]}`,
        cell: ctx.structure ? 'your cell' : 'an example cubic cell with a = 4 angstrom',
      };
      return plotFigure(
        e,
        value,
        { n: mesh[0], m: mesh[1], ratio: Math.min(1.6, Math.max(0.6, b[1] / b[0])), gamma: true },
        fillAll(e.captions!, vars),
        fill(e.alt!, vars),
      );
    }
    case 'SIGMA': {
      if (x === null || !(x > 0)) return null;
      const ism = num(incar.ISMEAR) ?? 1;
      const scheme = ({ '-1': 'fermi', '0': 'gaussian', '1': 'mp1', '2': 'mp2' } as Record<string, string>)[
        String(ism)
      ];
      if (!scheme) return null;
      const vars = { value: pretty(x) };
      return plotFigure(e, value, { scheme, sigma: x }, fillAll(e.captions!, vars), fill(e.alt!, vars));
    }
    case 'LDAUU':
    case 'LDAUJ': {
      const list = nums(value);
      const other = nums(e.tag === 'LDAUU' ? (incar.LDAUJ ?? '') : (incar.LDAUU ?? ''));
      if (!list || list.some((v) => v < 0)) return null;
      const u = e.tag === 'LDAUU' ? list : (other ?? list.map(() => 0));
      const j = e.tag === 'LDAUJ' ? list : (other ?? list.map(() => 0));
      if (e.tag === 'LDAUJ' && !other) return null; // J alone does not fix U - J
      const diffs = u.map((v, i) => v - (j[i] ?? 0));
      const best = Math.max(...diffs);
      if (!(best > 0)) return null;
      const vars = {
        ueff: pretty(Math.round(best * 1000) / 1000),
        source:
          e.tag === 'LDAUU'
            ? 'the largest U in the list, with J from LDAUJ when it is set'
            : 'LDAUU and LDAUJ',
      };
      return plotFigure(e, value, { U: best }, fillAll(e.captions!, vars), fill(e.alt!, vars));
    }
    case 'NSW': {
      if (x === null || !Number.isInteger(x) || x < 0) return null;
      const vars = { value: String(x) };
      return plotFigure(e, value, { nsw: x }, fillAll(e.captions!, vars), fill(e.alt!, vars));
    }
    case 'EDIFF': {
      if (x === null || !(x > 0)) return null;
      const vars = { value: pretty(x) };
      return plotFigure(e, value, { ediff: x }, fillAll(e.captions!, vars), fill(e.alt!, vars));
    }
    case 'EDIFFG': {
      if (x === null || !(x < 0)) return null; // a positive value is an energy criterion: no figure
      const vars = { value: pretty(x), abs: pretty(-x) };
      return plotFigure(e, value, { tol: -x }, fillAll(e.captions!, vars), fill(e.alt!, vars));
    }
    case 'NELM': {
      if (x === null || !Number.isInteger(x) || x < 1 || x > 300) return null;
      const vars = { value: String(x) };
      return plotFigure(
        e,
        value,
        { Z: 2, alpha: 0.3, tol: 1e-8, maxIterations: x, show: 40 },
        fillAll(e.captions!, vars),
        fill(e.alt!, vars),
      );
    }
    default:
      return null;
  }
}
