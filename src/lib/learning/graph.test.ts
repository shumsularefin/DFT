import { describe, expect, it } from 'vitest';
import conceptsJson from '../../data/concepts.json';
import { ancestors, buildGraph, descendants, GraphError, readyToLearn, roots, type Concept } from './graph';

const mk = (id: string, prerequisites: string[] = []): Concept => ({
  id,
  label: id,
  module: 1,
  level: 'beginner',
  summary: 'x',
  prerequisites,
  status: 'published',
});

describe('concept graph', () => {
  it('rejects a cycle and names the cycle path', () => {
    expect(() => buildGraph([mk('a', ['c']), mk('b', ['a']), mk('c', ['b'])])).toThrow(
      /cycle.*a -> c -> b -> a/,
    );
  });
  it('rejects unknown prerequisites and duplicates', () => {
    expect(() => buildGraph([mk('a', ['zz'])])).toThrow(GraphError);
    expect(() => buildGraph([mk('a'), mk('a')])).toThrow(/duplicate/);
  });
  it('orders every prerequisite before its dependants', () => {
    const g = buildGraph(conceptsJson as Concept[]);
    const pos = new Map(g.order.map((id, i) => [id, i]));
    for (const c of g.concepts)
      for (const p of c.prerequisites) expect(pos.get(p)!).toBeLessThan(pos.get(c.id)!);
    expect(g.order).toHaveLength(g.concepts.length);
  });
  it('the real graph is acyclic, has at least 70 concepts and covers modules 1 to 11', () => {
    const g = buildGraph(conceptsJson as Concept[]);
    expect(g.concepts.length).toBeGreaterThanOrEqual(70);
    expect(new Set(g.concepts.map((c) => c.module))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    const rs = new Set(roots(g));
    for (const c of g.concepts) {
      const reach = c.prerequisites.length === 0 || [...ancestors(g, c.id)].some((a) => rs.has(a));
      expect(reach, c.id).toBe(true);
    }
  });
  it('ancestors, descendants and ready-to-learn', () => {
    const g = buildGraph([mk('a'), mk('b', ['a']), mk('c', ['b']), mk('d', ['a'])]);
    expect(ancestors(g, 'c')).toEqual(new Set(['a', 'b']));
    expect(descendants(g, 'a')).toEqual(new Set(['b', 'c', 'd']));
    expect(readyToLearn(g, {})).toEqual(['a']);
    expect(readyToLearn(g, { a: 0.96 }).sort()).toEqual(['b', 'd']);
  });
});
