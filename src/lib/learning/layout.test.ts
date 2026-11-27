import { describe, expect, it } from 'vitest';
import conceptsRaw from '../../data/concepts.json';
import { loadConcepts, type Concept } from './graph';
import { layeredLayout } from './layout';

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
