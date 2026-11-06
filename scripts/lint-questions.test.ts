import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { coverageTable, lintQuestions } from './lint-questions.mjs';

const opt = (correct: boolean, why = 'because') => ({ text: 'x', correct, why });
const good = (id: string) => ({
  id,
  concepts: ['alpha'],
  type: 'single',
  prompt: 'p',
  options: [opt(true), opt(false)],
  hints: ['h1', 'h2'],
  difficulty: 0,
  level: 'beginner',
  sources: ['S-001'],
});

/** Builds a throwaway repo root with one published concept and the given questions and topic text. */
function fixture(questions: unknown[], topic = "<Check ids={['q-1']} />") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lq-'));
  const w = (p: string, t: string) => {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), t);
  };
  w('docs/SCIENCE_SOURCES.md', '| S-001 | cite | use | open | ok | note |\n');
  w(
    'src/data/concepts.json',
    JSON.stringify([
      {
        id: 'alpha',
        label: 'A',
        module: 1,
        summary: 's',
        prerequisites: [],
        level: 'beginner',
        status: 'published',
      },
      {
        id: 'beta',
        label: 'B',
        module: 4,
        summary: 's',
        prerequisites: ['alpha'],
        level: 'beginner',
        status: 'planned',
      },
    ]),
  );
  w('src/data/questions/module-01.json', JSON.stringify(questions));
  w('src/content/handbook/01-x/t.mdx', `---\nconcepts: [alpha]\n---\n${topic}\n`);
  return root;
}
const four = () => [1, 2, 3, 4].map((n) => good(`q-${n}`));
const run = (qs: unknown[], topic?: string) => lintQuestions(fixture(qs, topic)).problems.join('\n');

describe('lintQuestions', () => {
  it('accepts the shipped repo', () => {
    expect(lintQuestions('.').problems).toEqual([]);
  });
  it('accepts a minimal valid fixture', () => {
    expect(run(four())).toBe('');
  });
  it('reports each rule', () => {
    const noWhy = { ...good('q-1'), options: [opt(true, ''), opt(false)] };
    expect(run([noWhy, ...four().slice(1)])).toMatch(/q-1: option 1 has no "why"/);
    expect(run([{ ...good('q-1'), hints: ['only one'] }, ...four().slice(1)])).toMatch(
      /needs at least 2 hints/,
    );
    expect(run([{ ...good('q-1'), sources: [['S', '999'].join('-')] }, ...four().slice(1)])).toMatch(
      /source S-\d+ is not in/,
    );
    expect(run([{ ...good('q-1'), concepts: ['nope'] }, ...four().slice(1)])).toMatch(
      /concept "nope" is not in/,
    );
    expect(run([{ ...good('q-1'), type: 'numeric', answer: 1 }, ...four().slice(1)])).toMatch(
      /needs a tolerance/,
    );
    expect(run([good('q-1'), good('q-1'), ...four().slice(2)])).toMatch(/duplicate question id/);
    expect(run(four(), "<Check ids={['q-1', 'q-zzz']} />")).toMatch(/id "q-zzz" has no question/);
    expect(run([{ ...good('q-1'), timeLimitSec: 30 }, ...four().slice(1)])).toMatch(/no timers/);
  });
  it('requires four questions per published concept but not per planned one', () => {
    const r = lintQuestions(fixture(four().slice(0, 3)));
    expect(r.problems.join('\n')).toMatch(/concept "alpha" \(module 1\) has 3 question\(s\), needs 4/);
    expect(r.problems.join('\n')).not.toMatch(/beta/);
  });
  it('renders a coverage table', () => {
    const t = coverageTable(lintQuestions(fixture(four())).coverage);
    expect(t).toContain('| 1 | alpha | 4 |');
  });
});
