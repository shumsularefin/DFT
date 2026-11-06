import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import q1 from './module-01.json';
import q2 from './module-02.json';
import q3 from './module-03.json';

interface Q {
  id: string;
  concepts: string[];
  type: string;
  prompt: string;
  answer?: number;
  tolerance?: number;
  options?: { text: string; correct: boolean; why: string }[];
  hints: string[];
  difficulty: number;
  level: string;
  sources: string[];
}
const MODULES = [
  { name: 'module 1', perConcept: true, dir: 'src/content/handbook/01-why-dft', questions: q1 as Q[] },
  { name: 'module 3', perConcept: true, dir: 'src/content/handbook/03-many-electrons', questions: q3 as Q[] },
  { name: 'module 2', perConcept: true, dir: 'src/content/handbook/02-quantum-basics', questions: q2 as Q[] },
];
const sourceIds = new Set([...readFileSync('docs/SCIENCE_SOURCES.md', 'utf8').matchAll(/^\| (S-\d{3}) /gm)].map((m) => m[1]));

describe.each(MODULES)('$name questions', ({ dir, questions, perConcept }) => {
  it('have unique ids', () => {
    expect(new Set(questions.map((x) => x.id)).size).toBe(questions.length);
  });
  it('have exactly one correct option and a "why" on every option (numeric ones have an answer)', () => {
    for (const x of questions) {
      expect(x.hints.length, x.id).toBeGreaterThanOrEqual(2);
      if (x.type === 'numeric') {
        expect(typeof x.answer, x.id).toBe('number');
        expect(x.tolerance, x.id).toBeGreaterThan(0);
        continue;
      }
      expect(x.options!.filter((o) => o.correct), x.id).toHaveLength(1);
      for (const o of x.options!) expect(o.why.length).toBeGreaterThan(10);
    }
  });
  it('have at least 4 questions per concept ', () => {
    if (!perConcept) return;
    const count = new Map<string, number>();
    for (const x of questions) for (const c of x.concepts) count.set(c, (count.get(c) ?? 0) + 1);
    for (const [c, n] of count) expect(n, c).toBeGreaterThanOrEqual(4);
  });
  it('cite sources that exist in the register', () => {
    for (const x of questions) {
      // Page-structure questions about the site itself carry no science, so no source.
      if (!x.concepts.includes('reading-a-topic-page')) expect(x.sources.length, x.id).toBeGreaterThan(0);
      for (const s of x.sources) expect(sourceIds.has(s)).toBe(true);
    }
  });
  it('contain no em dash', () => {
    expect(JSON.stringify(questions)).not.toContain(String.fromCharCode(0x2014));
  });
  it('are referenced by the Check ids of the topics, 3 to 6 per topic', () => {
    const ids = new Set(questions.map((x) => x.id));
    const used = new Set<string>();
    for (const f of readdirSync(dir)) {
      const m = /<Check ids=\{\[([^\]]*)\]\}/.exec(readFileSync(`${dir}/${f}`, 'utf8'));
      const list = [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]!);
      expect(list.length, f).toBeGreaterThanOrEqual(3);
      expect(list.length, f).toBeLessThanOrEqual(6);
      for (const id of list) {
        expect(ids.has(id), `${f}: ${id}`).toBe(true);
        used.add(id);
      }
    }
    // The bank may hold more questions than the page quizzes show (M6.1): every concept still has one on its page.
    const shown = new Set<string>();
    for (const x of questions) if (used.has(x.id)) for (const c of x.concepts) shown.add(c);
    const all = new Set(questions.flatMap((x) => x.concepts));
    for (const c of all) if (c !== 'reading-a-topic-page') expect(shown.has(c), c).toBe(true);
  });
});
