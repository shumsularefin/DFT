/**
 * Concept graph: load, validate, order and query.
 *
 * Concepts are nodes; `prerequisites` are edges pointing at the concepts that
 * should be understood first. Pure functions, no I/O. Not a science claim: the
 * prerequisite edges are the author's teaching order (see D-051).
 */
import { z } from 'astro/zod';

const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'concept id must be kebab-case');

export const conceptSchema = z.object({
  id: kebab,
  label: z.string().min(1),
  module: z.number().int().min(0).max(11),
  summary: z.string().min(1),
  prerequisites: z.array(kebab),
  level: z.enum(['beginner', 'intermediate', 'pro']),
  /** 'planned' concepts are hidden in the UI until a topic page uses them. */
  status: z.enum(['published', 'planned']).default('published'),
});

export type Concept = z.infer<typeof conceptSchema>;

export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphError';
  }
}

export function parseConcepts(raw: unknown): Concept[] {
  if (!Array.isArray(raw)) throw new GraphError('concepts: expected an array');
  return raw.map((item, i) => {
    const r = conceptSchema.safeParse(item);
    if (!r.success) {
      const id = (item as { id?: unknown } | null)?.id;
      const issue = r.error.issues[0];
      throw new GraphError(
        `concept ${typeof id === 'string' ? id : `#${i}`}: ${issue?.path.join('.')} ${issue?.message}`,
      );
    }
    return r.data;
  });
}

/**
 * Validate the graph: unique ids, no unknown prerequisites, no self loops or
 * cycles (the error names the cycle path), and every concept reachable from a
 * root (a concept with no prerequisites).
 */
export function validateGraph(concepts: readonly Concept[]): void {
  const byId = new Map<string, Concept>();
  for (const c of concepts) {
    if (byId.has(c.id)) throw new GraphError(`duplicate concept id ${c.id}`);
    byId.set(c.id, c);
  }
  for (const c of concepts) {
    for (const p of c.prerequisites) {
      if (!byId.has(p)) throw new GraphError(`concept ${c.id} has unknown prerequisite ${p}`);
    }
    if (new Set(c.prerequisites).size !== c.prerequisites.length) {
      throw new GraphError(`concept ${c.id} lists a prerequisite twice`);
    }
  }

  // Cycle detection by depth-first search with an explicit path.
  const state = new Map<string, 1 | 2>(); // 1 = on path, 2 = done
  const path: string[] = [];
  const visit = (id: string): void => {
    state.set(id, 1);
    path.push(id);
    for (const p of byId.get(id)?.prerequisites ?? []) {
      const s = state.get(p);
      if (s === 1) {
        const cycle = [...path.slice(path.indexOf(p)), p];
        throw new GraphError(`concept graph has a cycle: ${cycle.join(' -> ')}`);
      }
      if (s === undefined) visit(p);
    }
    path.pop();
    state.set(id, 2);
  };
  for (const c of concepts) if (state.get(c.id) === undefined) visit(c.id);

  // Reachability from the roots, following dependents.
  const roots = concepts.filter((c) => c.prerequisites.length === 0);
  if (concepts.length > 0 && roots.length === 0) throw new GraphError('concept graph has no root');
  const dependents = dependentsMap(concepts);
  const reached = new Set<string>(roots.map((r) => r.id));
  const queue = roots.map((r) => r.id);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const d of dependents.get(id) ?? []) {
      if (!reached.has(d)) {
        reached.add(d);
        queue.push(d);
      }
    }
  }
  const lost = concepts.filter((c) => !reached.has(c.id)).map((c) => c.id);
  if (lost.length > 0) throw new GraphError(`concepts not reachable from a root: ${lost.join(', ')}`);
}

function dependentsMap(concepts: readonly Concept[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const c of concepts) {
    for (const p of c.prerequisites) {
      const list = m.get(p) ?? [];
      list.push(c.id);
      m.set(p, list);
    }
  }
  return m;
}

/** Parse and validate in one step. */
export function loadConcepts(raw: unknown): Concept[] {
  const concepts = parseConcepts(raw);
  validateGraph(concepts);
  return concepts;
}

/** Topological order: prerequisites first, ties broken by module then id (stable). */
export function topologicalOrder(concepts: readonly Concept[]): string[] {
  const indeg = new Map<string, number>(concepts.map((c) => [c.id, c.prerequisites.length]));
  const dependents = dependentsMap(concepts);
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const cmp = (a: string, b: string) =>
    (byId.get(a)?.module ?? 0) - (byId.get(b)?.module ?? 0) || (a < b ? -1 : a > b ? 1 : 0);
  const ready = concepts
    .filter((c) => c.prerequisites.length === 0)
    .map((c) => c.id)
    .sort(cmp);
  const out: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    out.push(id);
    for (const d of dependents.get(id) ?? []) {
      const n = (indeg.get(d) ?? 0) - 1;
      indeg.set(d, n);
      if (n === 0) {
        ready.push(d);
        ready.sort(cmp);
      }
    }
  }
  if (out.length !== concepts.length) throw new GraphError('concept graph has a cycle');
  return out;
}

function closure(start: string, next: (id: string) => readonly string[]): string[] {
  const seen = new Set<string>();
  const stack = [...next(start)];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...next(id));
  }
  return [...seen].sort();
}

/** Every concept that must come before `id`, directly or not (sorted). */
export function ancestors(concepts: readonly Concept[], id: string): string[] {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  if (!byId.has(id)) throw new GraphError(`unknown concept ${id}`);
  return closure(id, (x) => byId.get(x)?.prerequisites ?? []);
}

/** Every concept that depends on `id`, directly or not (sorted). */
export function descendants(concepts: readonly Concept[], id: string): string[] {
  if (!concepts.some((c) => c.id === id)) throw new GraphError(`unknown concept ${id}`);
  const dependents = dependentsMap(concepts);
  return closure(id, (x) => dependents.get(x) ?? []);
}

/** Default mastery level that counts as "understood" (a UI convention, see D-051). */
export const MASTERY_THRESHOLD = 0.8;

/**
 * Concepts ready to learn: not yet mastered, with every prerequisite mastered.
 * `mastery` maps concept id to a value in [0, 1]; a missing id counts as 0.
 * Planned concepts are excluded unless `includePlanned` is set.
 */
export function readyToLearn(
  concepts: readonly Concept[],
  mastery: Readonly<Record<string, number>>,
  options: { threshold?: number; includePlanned?: boolean } = {},
): string[] {
  const t = options.threshold ?? MASTERY_THRESHOLD;
  const m = (id: string) => mastery[id] ?? 0;
  return topologicalOrder(concepts).filter((id) => {
    const c = concepts.find((x) => x.id === id) as Concept;
    if (c.status === 'planned' && !options.includePlanned) return false;
    return m(id) < t && c.prerequisites.every((p) => m(p) >= t);
  });
}
