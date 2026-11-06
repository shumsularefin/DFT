// Build-time layout of the mastery map (M6.4): one column per module, concepts stacked in topological
// order inside each column, edges from prerequisite to dependant. Pure, so it is unit tested.
export interface MapNode {
  id: string;
  label: string;
  module: number;
  prerequisites: string[];
}

export interface PlacedNode extends MapNode {
  x: number;
  y: number;
}

export const NODE_W = 210;
export const NODE_H = 60;
const COL_GAP = 70;
const ROW_GAP = 18;
const PAD = 16;

export function layout(nodes: MapNode[]) {
  const modules = [...new Set(nodes.map((n) => n.module))].sort((a, b) => a - b);
  const col = new Map(modules.map((m, i) => [m, i]));
  const rows = new Map<number, number>();
  const placed: PlacedNode[] = nodes.map((n) => {
    const r = rows.get(n.module) ?? 0;
    rows.set(n.module, r + 1);
    return { ...n, x: PAD + col.get(n.module)! * (NODE_W + COL_GAP), y: PAD + 28 + r * (NODE_H + ROW_GAP) };
  });
  const at = new Map(placed.map((p) => [p.id, p]));
  const edges = placed.flatMap((n) =>
    n.prerequisites
      .filter((p) => at.has(p))
      .map((p) => {
        const a = at.get(p)!;
        const sameCol = a.module === n.module;
        const x1 = sameCol ? a.x + NODE_W / 2 : a.x + NODE_W;
        const y1 = sameCol ? a.y + NODE_H : a.y + NODE_H / 2;
        const x2 = sameCol ? n.x + NODE_W / 2 : n.x;
        const y2 = sameCol ? n.y : n.y + NODE_H / 2;
        const d = sameCol
          ? `M${x1} ${y1} L${x2} ${y2}`
          : `M${x1} ${y1} C${x1 + COL_GAP / 2} ${y1} ${x2 - COL_GAP / 2} ${y2} ${x2} ${y2}`;
        return { from: p, to: n.id, d };
      }),
  );
  const width = PAD * 2 + modules.length * NODE_W + (modules.length - 1) * COL_GAP;
  const height = PAD * 2 + 28 + Math.max(0, ...rows.values()) * (NODE_H + ROW_GAP);
  const headers = modules.map((m) => ({ module: m, x: PAD + col.get(m)! * (NODE_W + COL_GAP) }));
  return { nodes: placed, edges, width, height, headers };
}

/** Mastery band for a probability: the map shows it by colour, shape and text. */
export function band(pL: number | undefined): 'mastered' | 'learning' | 'new' {
  if (pL === undefined) return 'new';
  return pL >= 0.95 ? 'mastered' : 'learning';
}
