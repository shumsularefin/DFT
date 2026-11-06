// Concept dependency graph (M6.1). Pure functions over src/data/concepts.json; S-037 for the idea of
// concept-level mastery that the graph feeds.
export type Level = 'beginner' | 'intermediate' | 'pro';

export interface Concept {
  id: string;
  label: string;
  module: number;
  level: Level;
  summary: string;
  prerequisites: string[];
  /** `planned` concepts belong to modules not yet written and are hidden in the UI. */
  status: 'published' | 'planned';
}

export interface Graph {
  concepts: Concept[];
  byId: Map<string, Concept>;
  /** Concepts in an order where every prerequisite comes before the concepts that need it. */
  order: string[];
}

export class GraphError extends Error {}

/** Validates the concept list and builds the graph. Throws a GraphError with a readable message. */
export function buildGraph(concepts: Concept[]): Graph {
  const byId = new Map<string, Concept>();
  for (const c of concepts) {
    if (byId.has(c.id)) throw new GraphError(`duplicate concept id "${c.id}"`);
    byId.set(c.id, c);
  }
  for (const c of concepts)
    for (const p of c.prerequisites)
      if (!byId.has(p)) throw new GraphError(`concept "${c.id}" lists unknown prerequisite "${p}"`);

  // Depth-first search with colours; a grey node seen again closes a cycle.
  const colour = new Map<string, 0 | 1 | 2>();
  const order: string[] = [];
  const stack: string[] = [];
  const visit = (id: string): void => {
    const state = colour.get(id) ?? 0;
    if (state === 2) return;
    if (state === 1) {
      const cycle = [...stack.slice(stack.indexOf(id)), id];
      throw new GraphError(`cycle in concept prerequisites: ${cycle.join(' -> ')}`);
    }
    colour.set(id, 1);
    stack.push(id);
    for (const p of byId.get(id)!.prerequisites) visit(p);
    stack.pop();
    colour.set(id, 2);
    order.push(id);
  };
  for (const c of concepts) visit(c.id);
  return { concepts, byId, order };
}

/** Every concept reachable by following prerequisites backwards (not including `id`). */
export function ancestors(g: Graph, id: string): Set<string> {
  const out = new Set<string>();
  const todo = [...(g.byId.get(id)?.prerequisites ?? [])];
  while (todo.length) {
    const p = todo.pop()!;
    if (out.has(p)) continue;
    out.add(p);
    todo.push(...g.byId.get(p)!.prerequisites);
  }
  return out;
}

/** Every concept that needs `id`, directly or indirectly. */
export function descendants(g: Graph, id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of g.concepts)
    for (const p of c.prerequisites) children.set(p, [...(children.get(p) ?? []), c.id]);
  const out = new Set<string>();
  const todo = [...(children.get(id) ?? [])];
  while (todo.length) {
    const c = todo.pop()!;
    if (out.has(c)) continue;
    out.add(c);
    todo.push(...(children.get(c) ?? []));
  }
  return out;
}

export const roots = (g: Graph): string[] =>
  g.concepts.filter((c) => c.prerequisites.length === 0).map((c) => c.id);

/**
 * Concepts not yet mastered whose direct prerequisites are all at or above `threshold`
 * (mastery is a probability per concept; missing means 0).
 */
export function readyToLearn(
  g: Graph,
  mastery: Record<string, number>,
  { threshold = 0.95, includePlanned = false } = {},
): string[] {
  return g.order.filter((id) => {
    const c = g.byId.get(id)!;
    if (!includePlanned && c.status === 'planned') return false;
    if ((mastery[id] ?? 0) >= threshold) return false;
    return c.prerequisites.every((p) => (mastery[p] ?? 0) >= threshold);
  });
}
