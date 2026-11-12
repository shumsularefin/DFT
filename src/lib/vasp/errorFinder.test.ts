import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import errors from '../../data/errors.json';
import tags from '../../data/vasp-tags.json';
import {
  CATEGORY_LABELS,
  createFinder,
  entryAtLevel,
  incarLines,
  withinOneEdit,
  type ErrorEntry,
} from './errorFinder';

const entries = errors as ErrorEntry[];
const finder = createFinder(entries);
const field = JSON.parse(fs.readFileSync('scripts/__generated__/field-handbook.json', 'utf8'));
const workflow = JSON.parse(fs.readFileSync('scripts/__generated__/workflow-handbook.json', 'utf8'));
const fieldItems: { id: string; symptom: string }[] = field.TROUBLE.flatMap(
  (g: { items: unknown[] }) => g.items,
);
const rows: { message: string }[] = workflow.errors;
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

describe('errors.json reconciles with both handbooks (@source S-041 S-042)', () => {
  it('the handbooks have 22 troubleshooting entries and 20 error rows', () => {
    expect(fieldItems).toHaveLength(22);
    expect(rows).toHaveLength(20);
  });

  it('every Field Handbook entry and every Workflow Handbook row is used exactly once', () => {
    const used = entries.flatMap((e) => e.sources);
    expect(new Set(used).size).toBe(used.length);
    for (const it of fieldItems) expect(used, it.id).toContain(`field:${it.id}`);
    for (let i = 1; i <= rows.length; i++)
      expect(used, `row ${i}`).toContain(`workflow:row-${String(i).padStart(2, '0')}`);
    expect(used).toHaveLength(42);
    expect(entries).toHaveLength(32);
  });

  it("each workflow row's message text is findable in the entry it was merged into", () => {
    rows.forEach((row, i) => {
      const id = `workflow:row-${String(i + 1).padStart(2, '0')}`;
      const e = entries.find((x) => x.sources.includes(id))!;
      const hay = squash([e.title, ...e.messages, ...e.symptoms].join(' | '));
      const pieces = row.message.split(' / ');
      for (const p of pieces) expect(hay, `${id}: ${p}`).toContain(squash(p));
    });
  });

  it('ids are unique, categories are known, INCAR tags exist, every entry has a cause and a fix', () => {
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    const known = new Set((tags as unknown as { tags: { name: string }[] }).tags.map((t) => t.name));
    for (const e of entries) {
      expect(CATEGORY_LABELS[e.category], e.id).toBeTruthy();
      expect(e.causes.length, e.id).toBeGreaterThan(0);
      expect(e.fixes.length, e.id).toBeGreaterThan(0);
      expect(e.plain.length, e.id).toBeGreaterThan(20);
      for (const f of e.fixes)
        for (const k of Object.keys(f.incar ?? {})) expect(known.has(k), `${e.id}: ${k}`).toBe(true);
    }
  });

  it('no message string is claimed by two entries', () => {
    const seen = new Map<string, string>();
    for (const e of entries)
      for (const m of e.messages) {
        const k = squash(m);
        expect(seen.get(k), m).toBeUndefined();
        seen.set(k, e.id);
      }
  });

  it('contains no em dash', () => {
    expect(JSON.stringify(errors)).not.toContain(String.fromCharCode(0x2014));
  });
});

describe('matching', () => {
  for (const e of entries.filter((x) => x.messages.length))
    for (const m of e.messages)
      it(`"${m}" finds ${e.id} first`, () => {
        const r = finder.find(`some earlier output\n ${m} \nlater output`);
        expect(r[0]!.entry.id).toBe(e.id);
        expect(r[0]!.kind).toBe('exact');
      });

  it('ignores case and spacing', () => {
    expect(finder.find('zbrent:   FATAL error   in bracketing')[0]!.entry.id).toBe('zbrent');
  });

  it('a log with two errors returns both, ahead of everything else', () => {
    const log = [
      ' running on 24 total cores',
      ' ZBRENT: fatal error in bracketing',
      ' please rerun with smaller EDIFF, or copy CONTCAR to POSCAR',
      ' BRMIX: very serious problems the old and the new charge density differ',
    ].join('\n');
    const r = finder.find(log);
    expect(
      r
        .slice(0, 2)
        .map((x) => x.entry.id)
        .sort(),
    ).toEqual(['brmix', 'zbrent']);
    expect(r[0]!.score).toBeGreaterThanOrEqual(100);
    expect(r[1]!.score).toBeGreaterThanOrEqual(100);
    expect(r[0]!.line).toMatch(/ZBRENT|BRMIX/);
  });

  it('a routine name alone is a token match below an exact match', () => {
    const r = finder.find('forrtl: error in ZBRENT');
    expect(r[0]!.entry.id).toBe('zbrent');
    expect(r[0]!.kind).toBe('token');
    expect(r[0]!.score).toBeLessThan(100);
  });

  it('a shared routine name (ZHEGV) does not decide between entries', () => {
    const r = finder.find('EDDRMM: call to ZHEGV failed');
    expect(r[0]!.entry.id).toBe('eddrmm-zhegv');
    const r2 = finder.find('Error EDDDAV: Call to ZHEGV failed');
    expect(r2[0]!.entry.id).toBe('davidson-zhegv');
  });

  it('typed symptoms find the symptom-only entries', () => {
    const cases: [string, string][] = [
      ['electronic loop does not converge', 'scf-no-converge'],
      ['my magnetic moment goes to zero', 'moment-collapse'],
      ['slab vacuum disappeared', 'slab-vacuum-collapse'],
      ['relaxation never reaches required accuracy', 'relax-no-converge'],
      ['jagged band structure', 'bands-look-wrong'],
      ['imaginary phonon modes', 'imaginary-phonons'],
      ['my calculation is very slow or out of memory', 'slow-or-out-of-memory'],
      ['bader charges do not add up', 'bader-charges'],
    ];
    for (const [q, id] of cases) expect(finder.find(q)[0]?.entry.id, q).toBe(id);
  });

  it('tolerates one typo in a long word', () => {
    expect(finder.find('electronic convergance problem with the loop')[0]?.entry.id).toBe('scf-no-converge');
  });

  it('returns nothing for empty or unrelated text', () => {
    expect(finder.find('')).toEqual([]);
    expect(finder.find('   \n ')).toEqual([]);
    expect(finder.find('the quick brown fox')).toEqual([]);
  });

  it('a long log with no error does not produce fuzzy noise', () => {
    const log = Array.from(
      { length: 200 },
      (_, i) => `DAV: ${i + 1} -0.2345E+02 -0.1E-03 -0.9E-04 960 0.1E-02`,
    ).join('\n');
    expect(finder.find(log)).toEqual([]);
  });

  it('supports regex messages with the re: prefix', () => {
    const f = createFinder([
      { ...entries[0]!, id: 'x', messages: ['re:rank \\d+ failed'], keywords: [], symptoms: [], title: 'x' },
    ]);
    expect(f.find('MPI: rank 12 failed')[0]!.entry.id).toBe('x');
    expect(f.find('rank x failed')).toEqual([]);
  });

  it('withinOneEdit', () => {
    expect(withinOneEdit('convergence', 'convergance')).toBe(true);
    expect(withinOneEdit('convergence', 'convergences')).toBe(true);
    expect(withinOneEdit('abcdef', 'abdcef')).toBe(true);
    expect(withinOneEdit('abcdef', 'abxyef')).toBe(false);
  });
});

describe('levels', () => {
  const e = entries.find((x) => x.id === 'scf-no-converge')!;
  it('Beginner sees the plain sentence, one cause and two fixes', () => {
    const v = entryAtLevel(e, 'beginner');
    expect(v.causes).toHaveLength(1);
    expect(v.fixes).toHaveLength(2);
    expect(v.hiddenFixes).toBe(e.fixes.length - 2);
  });
  it('Intermediate and Pro see everything; only Pro sees handbook ids', () => {
    expect(entryAtLevel(e, 'intermediate').fixes).toHaveLength(e.fixes.length);
    expect(entryAtLevel(e, 'intermediate').showSources).toBe(false);
    expect(entryAtLevel(e, 'pro').showSources).toBe(true);
  });
  it('formats INCAR changes', () => {
    expect(incarLines({ text: 'x', incar: { ALGO: 'All', NELM: '200' } })).toEqual([
      'ALGO = All',
      'NELM = 200',
    ]);
  });
});
