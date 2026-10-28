import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintAll, lintTopic, parseFrontMatter } from './lint-content.mjs';

const dir = 'scripts/__fixtures__';
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');
const ctx = () => ({
  glossaryIds: new Set(['dft']),
  sourceIds: new Set(['S-031', 'S-019']),
  topicRoutes: new Set(['/handbook/00-start/how-to-use-this-site/']),
  seenIds: new Map<string, string>(),
});
const lint = (name: string, text = read(name)) => lintTopic(name, text, ctx());

describe('lintTopic', () => {
  it('accepts a valid topic', () => {
    expect(lint('valid.mdx')).toEqual([]);
  });

  const bad: [string, RegExp][] = [
    ['bad-term.mdx', /<Term id="no-such-term"> is not in src\/data\/glossary.json/],
    ['bad-cite.mdx', /<Cite id="S-9{3}"> is not in docs\/SCIENCE_SOURCES.md/],
    ['bad-todo.mdx', /unresolved TODO/],
    ['bad-level.mdx', /<Level> needs a min or a max/],
    ['empty-section.mdx', /section <Mistakes> is empty/],
    ['bad-math.mdx', /unbalanced \$ math delimiters/],
    ['bad-link.mdx', /link \/handbook\/00-start\/nope\/ does not match any topic/],
    ['missing-section.mdx', /missing section <Mistakes>/],
    ['wrong-order.mdx', /is out of order/],
    ['bad-status.mdx', /status is "review" but sources is empty/],
    ['bad-frontmatter.mdx', /front matter "id": must be kebab-case/],
  ];
  for (const [name, re] of bad) {
    it(`${name} is reported in one line`, () => {
      const msgs = lint(name);
      expect(msgs.some((m) => re.test(m))).toBe(true);
      for (const m of msgs) expect(m).not.toContain('\n');
    });
  }

  it('reports a front matter module out of range', () => {
    expect(lint('bad-frontmatter.mdx').some((m) => m.includes('"module"'))).toBe(true);
  });

  it('reports an em dash', () => {
    const text = read('valid.mdx').replace('Reason.', `Reason ${String.fromCharCode(0x2014)} here.`);
    expect(lint('x.mdx', text).some((m) => m.includes('em dash'))).toBe(true);
  });

  it('allows a topic without a Lab only when noLab is true', () => {
    const without = read('valid.mdx').replace('<Lab id="fixture-lab" />\n', '');
    expect(lint('x.mdx', without).some((m) => m.includes('missing section <Lab>'))).toBe(true);
    expect(lint('x.mdx', without.replace('status: draft', 'status: draft\nnoLab: true'))).toEqual([]);
  });

  it('reports a duplicate topic id', () => {
    const c = ctx();
    expect(lintTopic('a.mdx', read('valid.mdx'), c)).toEqual([]);
    expect(lintTopic('b.mdx', read('valid.mdx'), c).some((m) => m.includes('already used by a.mdx'))).toBe(
      true,
    );
  });

  it('ignores tags and dollar signs inside code', () => {
    const text = read('valid.mdx').replace('Reason.', () => 'Use `<Term id="nope">` and `$` literally.');
    expect(lint('x.mdx', text)).toEqual([]);
  });

  it('reports a missing front matter block', () => {
    expect(lint('x.mdx', '<Why>hi</Why>')[0]).toMatch(/missing front matter/);
  });
});

describe('parseFrontMatter', () => {
  it('reads scalars, arrays and strips comments', () => {
    const { data } = parseFrontMatter(
      '---\nid: a   # note\nmodule: 3\nsources: [S-001, S-002]\nnoLab: true\ntitle: "Quoted: yes"\n---\nbody',
    );
    expect(data).toEqual({
      id: 'a',
      module: 3,
      sources: ['S-001', 'S-002'],
      noLab: true,
      title: 'Quoted: yes',
    });
  });
});

describe('the repository content', () => {
  it('passes the linter', () => {
    const { problems, topics } = lintAll('.');
    expect(problems).toEqual([]);
    expect(topics).toBeGreaterThanOrEqual(1);
  });
});
