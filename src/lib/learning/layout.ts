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

/*
 * Flow layout for the mastery map: the same layers, read top to bottom, each layer wrapped into as many
 * rows as the available width needs and centred. The map then fits the width it is given (no sideways
 * scroll) and its height follows the content. Edges run from the bottom of a prerequisite to the top of
 * the idea that builds on it. Presentation only.
 */
export const FLOW_NODE_W = 200;
export const FLOW_NODE_H = 38;
export const FLOW_GAP_X = 14;
export const FLOW_ROW_GAP = 6;
export const FLOW_LAYER_GAP = 22;
export const FLOW_PAD = 16;
/** Characters per label line at 12 px monospace in a flow node (text area about 164 px). */
export const FLOW_LABEL_CHARS = 22;

export interface FlowNode {
  id: string;
  x: number;
  y: number;
}
export interface FlowLayout {
  nodes: FlowNode[];
  width: number;
  height: number;
}

/**
 * Places `nodes` (from layeredLayout, layer and row order kept) in a box `width` px wide. Only the ids in
 * `visible` are placed when it is given; layers with nothing visible take no space.
 */
export function flowLayout(
  nodes: readonly Pick<LayoutNode, 'id' | 'layer' | 'row'>[],
  width: number,
  visible?: ReadonlySet<string>,
): FlowLayout {
  const w = Math.max(Math.floor(width), FLOW_PAD * 2 + FLOW_NODE_W);
  const perRow = Math.max(1, Math.floor((w - 2 * FLOW_PAD + FLOW_GAP_X) / (FLOW_NODE_W + FLOW_GAP_X)));
  const shown = nodes.filter((n) => !visible || visible.has(n.id));
  const layers = [...new Set(shown.map((n) => n.layer))].sort((a, b) => a - b);
  const out: FlowNode[] = [];
  let y = FLOW_PAD;
  for (const l of layers) {
    const members = shown.filter((n) => n.layer === l).sort((a, b) => a.row - b.row);
    for (let i = 0; i < members.length; i += perRow) {
      const chunk = members.slice(i, i + perRow);
      const rowW = chunk.length * FLOW_NODE_W + (chunk.length - 1) * FLOW_GAP_X;
      const x0 = Math.round((w - rowW) / 2);
      chunk.forEach((n, k) => out.push({ id: n.id, x: x0 + k * (FLOW_NODE_W + FLOW_GAP_X), y }));
      y += FLOW_NODE_H + FLOW_ROW_GAP;
    }
    y += FLOW_LAYER_GAP - FLOW_ROW_GAP;
  }
  const height = out.length ? y - FLOW_LAYER_GAP + FLOW_PAD : FLOW_PAD * 2;
  return { nodes: out.sort((a, b) => (a.id < b.id ? -1 : 1)), width: w, height };
}

/** SVG path for an edge from the bottom centre of `a` to the top centre of `b` in a flow layout. */
export function flowEdgePath(a: FlowNode, b: FlowNode): string {
  const x1 = a.x + FLOW_NODE_W / 2;
  const y1 = a.y + FLOW_NODE_H;
  const x2 = b.x + FLOW_NODE_W / 2;
  const y2 = b.y;
  const dy = Math.max(12, Math.min(60, (y2 - y1) / 2));
  return `M${x1} ${y1} C${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`;
}

/** Splits a label into at most two lines of `max` characters at word breaks; a longer rest ends in "…". */
export function wrapLabel(label: string, max = FLOW_LABEL_CHARS): string[] {
  if (label.length <= max) return [label];
  const words = label.split(' ');
  let first = '';
  while (words.length && (first ? `${first} ${words[0]}` : words[0]!).length <= max) {
    first = first ? `${first} ${words.shift()}` : words.shift()!;
  }
  if (!first) first = words.shift()!; // one word longer than a line: it gets the line and is cut below
  const rest = words.join(' ');
  const cut = (s: string) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);
  return rest ? [cut(first), cut(rest)] : [cut(first)];
}
