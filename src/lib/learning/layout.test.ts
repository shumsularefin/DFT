import { describe, expect, it } from 'vitest';
import conceptsRaw from '../../data/concepts.json';
import { loadConcepts, type Concept } from './graph';
import {
  FLOW_GAP_X,
  FLOW_NODE_H,
  FLOW_NODE_W,
  FLOW_PAD,
  flowEdgePath,
  flowLayout,
  layeredLayout,
  wrapLabel,
} from './layout';

const c = (
  id: string,
  prerequisites: string[] = [],
  module = 1,
  status: 'published' | 'planned' = 'published',
): Concept => ({
  id,
  label: id,
  module,
  summary: 's',
  prerequisites,
  level: 'beginner',
  status,
});

describe('layeredLayout', () => {
  it('puts a concept one layer after its deepest prerequisite (diamond)', () => {
    const l = layeredLayout([c('a'), c('b', ['a']), c('c', ['a']), c('d', ['b', 'c'])]);
    const layer = Object.fromEntries(l.nodes.map((n) => [n.id, n.layer]));
    expect(layer).toEqual({ a: 0, b: 1, c: 1, d: 2 });
    expect(l.edges).toHaveLength(4);
  });
  it('skips planned concepts and edges into them', () => {
    const l = layeredLayout([c('a'), c('p', ['a'], 1, 'planned'), c('b', ['p'])]);
    expect(l.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(l.edges).toEqual([]);
  });
  it('is deterministic and gives every node its own cell', () => {
    const all = loadConcepts(conceptsRaw);
    const a = layeredLayout(all);
    expect(layeredLayout([...all].reverse())).toEqual(a);
    expect(new Set(a.nodes.map((n) => `${n.layer}/${n.row}`)).size).toBe(a.nodes.length);
    const layer = new Map(a.nodes.map((n) => [n.id, n.layer]));
    for (const e of a.edges) expect(layer.get(e.to)!).toBeGreaterThan(layer.get(e.from)!);
    expect(a.nodes.length).toBe(all.filter((x) => x.status === 'published').length);
  });
  it('throws on a cycle', () => {
    expect(() => layeredLayout([c('a', ['b']), c('b', ['a'])])).toThrow(/cycle/);
  });
});

describe('flowLayout', () => {
  const base = layeredLayout([c('a'), c('b'), c('c'), c('d', ['a']), c('e', ['b', 'c'])]).nodes;

  it('fits the width it is given, layer by layer from the top', () => {
    const width = 2 * FLOW_PAD + 2 * FLOW_NODE_W + FLOW_GAP_X; // room for two nodes per row
    const f = flowLayout(base, width);
    expect(f.width).toBe(width);
    for (const n of f.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x + FLOW_NODE_W).toBeLessThanOrEqual(width);
    }
    const y = Object.fromEntries(f.nodes.map((n) => [n.id, n.y]));
    // layer 0 (a, b, c) wraps into two rows; layer 1 (d, e) starts below both
    expect(y.a).toBe(y.b);
    expect(y.c).toBeGreaterThan(y.a!);
    expect(y.d).toBeGreaterThan(y.c!);
    expect(y.d).toBe(y.e);
  });

  it('is one tall column when only one node fits, and never narrower than a node', () => {
    const f = flowLayout(base, 10);
    expect(f.width).toBe(2 * FLOW_PAD + FLOW_NODE_W);
    expect(new Set(f.nodes.map((n) => n.y)).size).toBe(base.length);
  });

  it('places only the visible ids and closes the gap of empty layers', () => {
    const all = flowLayout(base, 2000);
    const some = flowLayout(base, 2000, new Set(['d', 'e']));
    expect(some.nodes.map((n) => n.id)).toEqual(['d', 'e']);
    expect(some.height).toBeLessThan(all.height);
    expect(some.nodes[0]!.y).toBe(all.nodes.find((n) => n.id === 'a')!.y);
  });

  it('draws edges from the bottom of the prerequisite to the top of the next idea', () => {
    const p = flowEdgePath({ id: 'a', x: 0, y: 0 }, { id: 'd', x: 300, y: 100 });
    expect(p.startsWith(`M${FLOW_NODE_W / 2} ${FLOW_NODE_H} C`)).toBe(true);
    expect(p.endsWith(`${300 + FLOW_NODE_W / 2} 100`)).toBe(true);
  });
});

describe('wrapLabel', () => {
  it('keeps short labels on one line', () => {
    expect(wrapLabel('Cost scaling')).toEqual(['Cost scaling']);
  });
  it('breaks long labels at a word into two lines', () => {
    expect(wrapLabel('Quantum mechanics for everyday materials')).toEqual([
      'Quantum mechanics for',
      'everyday materials',
    ]);
  });
  it('cuts a rest that does not fit on the second line', () => {
    const lines = wrapLabel('aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj', 10);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.length).toBe(10);
    expect(lines[1]!.endsWith('…')).toBe(true);
  });
  it('every published concept label fits in two lines', () => {
    for (const k of loadConcepts(conceptsRaw).filter((x) => x.status === 'published')) {
      const lines = wrapLabel(k.label);
      expect(lines.join(' ')).toBe(k.label);
    }
  });
});
