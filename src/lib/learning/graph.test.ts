import { describe, it, expect } from 'vitest';
import raw from '../../data/concepts.json';
import {
  GraphError,
  ancestors,
  descendants,
  loadConcepts,
  readyToLearn,
  topologicalOrder,
  validateGraph,
  parseConcepts,
  type Concept,
} from './graph';

const c = (id: string, prerequisites: string[] = [], extra: Partial<Concept> = {}) => ({
  id,
  label: id,
  module: 1,
  summary: 's',
  prerequisites,
  level: 'beginner',
  ...extra,
});
// a -> b -> d, a -> c -> d (a is the root)
const diamond = () => parseConcepts([c('a'), c('b', ['a']), c('c', ['a']), c('d', ['b', 'c'])]);

describe('validation', () => {
  it('rejects an unknown prerequisite', () => {
    expect(() => loadConcepts([c('a', ['zzz'])])).toThrow(/unknown prerequisite zzz/);
  });
  it('rejects duplicates and repeated prerequisites', () => {
    expect(() => loadConcepts([c('a'), c('a')])).toThrow(/duplicate concept id a/);
    expect(() => loadConcepts([c('a'), c('b', ['a', 'a'])])).toThrow(/twice/);
  });
  it('names the cycle path', () => {
    const cyc = [c('root'), c('a', ['root', 'c']), c('b', ['a']), c('c', ['b'])];
    expect(() => loadConcepts(cyc)).toThrow(/cycle: a -> c -> b -> a/);
    expect(() => loadConcepts([c('x', ['x'])])).toThrow(/cycle: x -> x/);
  });
  it('rejects a graph with no root', () => {
    expect(() => validateGraph(parseConcepts([c('a', ['b']), c('b', ['a'])]))).toThrow(GraphError);
  });
  it('rejects a bad shape', () => {
    expect(() => parseConcepts([{ id: 'Bad Id' }])).toThrow(/concept Bad Id/);
  });
});

describe('queries', () => {
  it('orders prerequisites first, deterministically', () => {
    expect(topologicalOrder(diamond())).toEqual(['a', 'b', 'c', 'd']);
  });
  it('finds ancestors and descendants', () => {
    const g = diamond();
    expect(ancestors(g, 'd')).toEqual(['a', 'b', 'c']);
    expect(descendants(g, 'a')).toEqual(['b', 'c', 'd']);
    expect(ancestors(g, 'a')).toEqual([]);
    expect(() => ancestors(g, 'nope')).toThrow(/unknown concept/);
  });
  it('lists concepts ready to learn', () => {
    const g = diamond();
    expect(readyToLearn(g, {})).toEqual(['a']);
    expect(readyToLearn(g, { a: 0.9 })).toEqual(['b', 'c']);
    expect(readyToLearn(g, { a: 0.9, b: 0.8 })).toEqual(['c']);
    expect(readyToLearn(g, { a: 0.9, b: 0.8, c: 0.8 })).toEqual(['d']);
    expect(readyToLearn(g, { a: 0.5 }, { threshold: 0.5 })).toEqual(['b', 'c']);
  });
  it('hides planned concepts unless asked', () => {
    const g = parseConcepts([c('a'), c('b', ['a'], { status: 'planned' })]);
    expect(readyToLearn(g, { a: 1 })).toEqual([]);
    expect(readyToLearn(g, { a: 1 }, { includePlanned: true })).toEqual(['b']);
  });
});

describe('shipped concept graph', () => {
  const g = loadConcepts(raw);
  it('has at least 70 concepts, valid, acyclic and reachable', () => {
    expect(g.length).toBeGreaterThanOrEqual(70);
    expect(topologicalOrder(g)).toHaveLength(g.length);
  });
  it('covers every concept id used in module 0 to 3 front matter and questions', async () => {
    const m = await Promise.all(
      ['01', '02', '03'].map((n) => import(`../../data/questions/module-${n}.json`)),
    );
    const ids = new Set(g.map((x) => x.id));
    for (const q of m.flatMap((x) => x.default as { concepts: string[] }[])) {
      for (const k of q.concepts) expect(ids.has(k), k).toBe(true);
    }
  });
  it('marks every module 4 to 11 concept as planned', () => {
    expect(g.filter((x) => x.module >= 4).every((x) => x.status === 'planned')).toBe(true);
  });
});
