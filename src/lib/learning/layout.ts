/**
 * Layered layout of the concept graph for the mastery map (computed at build time).
 * A concept's layer is the length of the longest prerequisite chain below it, so every edge
 * points to a later layer. Within a layer concepts are ordered by the mean position of their
 * prerequisites (one pass), then by module and id, so the result is deterministic.
 * Presentation only; not a science claim.
 */
import type { Concept } from './graph';

export const COL_W = 230;
export const ROW_H = 36;
export const NODE_W = 196;
export const PAD = 16;

export interface LayoutNode {
  id: string;
  layer: number;
  row: number;
  x: number;
  y: number;
}
export interface LayoutEdge {
  from: string;
  to: string;
}
export interface Layout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export function layeredLayout(all: readonly Concept[]): Layout {
  const concepts = all.filter((c) => c.status === 'published');
  const ids = new Set(concepts.map((c) => c.id));
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const pre = (c: Concept) => c.prerequisites.filter((p) => ids.has(p));

  const layer = new Map<string, number>();
  const depth = (id: string, trail: Set<string>): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    if (trail.has(id)) throw new Error(`cycle through ${id}`);
    trail.add(id);
    const ps = pre(byId.get(id) as Concept);
    const d = ps.length === 0 ? 0 : 1 + Math.max(...ps.map((p) => depth(p, trail)));
    trail.delete(id);
    layer.set(id, d);
    return d;
  };
  for (const c of concepts) depth(c.id, new Set());

  const maxLayer = Math.max(0, ...layer.values());
  const rows = new Map<string, number>();
  for (let l = 0; l <= maxLayer; l++) {
    const members = concepts.filter((c) => layer.get(c.id) === l);
    const score = (c: Concept) => {
      const ps = pre(c).map((p) => rows.get(p) as number);
      return ps.length === 0 ? Number.POSITIVE_INFINITY : ps.reduce((a, b) => a + b, 0) / ps.length;
    };
    members.sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      if (sa !== sb) return sa < sb ? -1 : 1; //
      return a.module - b.module || (a.id < b.id ? -1 : 1);
    });
    members.forEach((c, i) => rows.set(c.id, i));
  }

  const nodes: LayoutNode[] = [...concepts]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((c) => ({
      id: c.id,
      layer: layer.get(c.id) as number,
      row: rows.get(c.id) as number,
      x: PAD + (layer.get(c.id) as number) * COL_W,
      y: PAD + (rows.get(c.id) as number) * ROW_H,
    }));
  const edges = nodes
    .flatMap((n) => pre(byId.get(n.id) as Concept).map((p) => ({ from: p, to: n.id })))
    .sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
  const maxRow = Math.max(0, ...nodes.map((n) => n.row));
  return {
    nodes,
    edges,
    width: PAD * 2 + maxLayer * COL_W + NODE_W,
    height: PAD * 2 + maxRow * ROW_H + ROW_H,
  };
}
