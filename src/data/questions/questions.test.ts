import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import q1 from './module-01.json';

interface Q {
  id: string;
  concepts: string[];
  type: string;
  prompt: string;
  options: { text: string; correct: boolean; why: string }[];
  hints: string[];
  difficulty: number;
  level: string;
  sources: string[];
}
const questions = q1 as Q[];
const sourceIds = new Set([...readFileSync('docs/SCIENCE_SOURCES.md', 'utf8').matchAll(/^\| (S-\d{3}) /gm)].map((m) => m[1]));

describe('module 1 questions', () => {
  it('have unique ids', () => {
    expect(new Set(questions.map((x) => x.id)).size).toBe(questions.length);
  });
  it('have exactly one correct option and a "why" on every option', () => {
    for (const x of questions) {
      expect(x.options.filter((o) => o.correct)).toHaveLength(1);
      for (const o of x.options) expect(o.why.length).toBeGreaterThan(10);
      expect(x.hints.length).toBeGreaterThan(0);
    }
  });
  it('cite sources that exist in the register', () => {
    for (const x of questions) {
      expect(x.sources.length).toBeGreaterThan(0);
      for (const s of x.sources) expect(sourceIds.has(s)).toBe(true);
    }
  });
  it('contain no em dash', () => {
    expect(JSON.stringify(questions)).not.toContain(String.fromCharCode(0x2014));
  });
  it('are referenced by the Check ids of the module 1 topics, 3 to 6 per topic', () => {
    const dir = 'src/content/handbook/01-why-dft';
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
    expect(used.size).toBe(ids.size);
  });
});
