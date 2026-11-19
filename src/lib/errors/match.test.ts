import { describe, expect, it } from 'vitest';
import fieldHb from '../../../scripts/__generated__/field-handbook.json';
import workHb from '../../../scripts/__generated__/workflow-handbook.json';
import { ERRORS, ERROR_CATEGORIES } from './data';
import { byCategory, findErrors, norm } from './match';

// @source S-041 S-042

describe('errors.json reconciles with both handbooks', () => {
  const field = fieldHb.TROUBLE.flatMap((p) => p.items.map((i) => i.id));
  const rows = workHb.errors.map((_, i) => `w-${String(i + 1).padStart(2, '0')}`);
  const mapped = new Set(ERRORS.flatMap((e) => e.sources));

  it('has 22 Field Handbook entries and 20 Workflow Handbook rows', () => {
    expect(field).toHaveLength(22);
    expect(rows).toHaveLength(20);
  });
  it('maps every handbook entry and row to a unique entry', () => {
    for (const id of [...field, ...rows]) expect(mapped.has(id), id).toBe(true);
    for (const id of mapped) expect([...field, ...rows], id).toContain(id);
  });
  it('merges 42 source items into 33 unique entries', () => {
    expect(ERRORS).toHaveLength(33);
    const total = ERRORS.reduce((n, e) => n + e.sources.length, 0);
    expect(total).toBe(42);
  });
  it('has unique ids, known categories and non-empty causes and fixes', () => {
    expect(new Set(ERRORS.map((e) => e.id)).size).toBe(ERRORS.length);
    for (const e of ERRORS) {
      expect(Object.keys(ERROR_CATEGORIES), e.id).toContain(e.category);
      expect(e.causes.length, e.id).toBeGreaterThan(0);
      expect(e.fixes.length, e.id).toBeGreaterThan(0);
      expect(e.plain.length, e.id).toBeGreaterThan(20);
    }
  });
  it('keeps the Workflow Handbook message text for rows that print a message', () => {
    const all = ERRORS.flatMap((e) => [...e.messages, ...e.symptoms]).map(norm);
    for (const r of workHb.errors.slice(0, 16)) {
      const first = norm(r.message.split('(')[0]!.split('/')[0]!);
      expect(
        all.some((a) => a.includes(first) || first.includes(a)),
        r.message,
      ).toBe(true);
    }
  });
});

describe('exact matching', () => {
  const withMessages = ERRORS.filter((e) => e.messages.length > 0);
  it('puts the owning entry first for each of its own message strings', () => {
    expect(withMessages.length).toBeGreaterThanOrEqual(16);
    for (const e of withMessages)
      for (const m of e.messages) {
        const r = findErrors(m, ERRORS);
        expect(r[0]?.entry.id, `${e.id}: ${m}`).toBe(e.id);
        expect(r[0]?.kind).toBe('exact');
      }
  });
  it('finds a message inside a noisy log line', () => {
    const r = findErrors(' ZBRENT: fatal error in bracketing\n please rerun with smaller POTIM\n', ERRORS);
    expect(r[0]?.entry.id).toBe('zbrent');
  });
  it('is case and punctuation tolerant', () => {
    expect(findErrors('error: zbrent -- FATAL error in bracketing!!', ERRORS)[0]?.entry.id).toBe('zbrent');
  });
  it('returns both entries for a log with two errors', () => {
    const log = [
      'running on 16 total cores',
      'LAPACK: Routine ZPOTRF failed',
      '... later ...',
      'BRMIX: very serious problems',
      'the old and the new charge density differ',
    ].join('\n');
    const ids = findErrors(log, ERRORS).map((m) => m.entry.id);
    expect(ids).toContain('zpotrf');
    expect(ids).toContain('brmix');
    expect(ids).toHaveLength(2);
  });
  it('does not confuse the two ZHEGV messages', () => {
    expect(findErrors('EDDRMM: call to ZHEGV failed', ERRORS)[0]?.entry.id).toBe('eddrmm-zhegv');
    expect(findErrors('Error EDDDAV: Call to ZHEGV failed', ERRORS)[0]?.entry.id).toBe('davidson-zhegv');
  });
});

describe('fuzzy matching', () => {
  const top = (q: string) => findErrors(q, ERRORS)[0]?.entry.id;
  it('finds entries from symptoms typed in words', () => {
    expect(top('my relaxation never finishes')).toBe('relax-not-finishing');
    expect(top('magnetic moment goes to zero')).toBe('moment-collapse');
    expect(top('slab vacuum disappeared')).toBe('slab-vacuum-collapse');
    expect(top('job ran out of memory')).toBe('slow-or-oom');
  });
  it('tolerates a one-letter typo in a long word', () => {
    expect(top('zbrnt bracketing')).toBe('zbrent');
    expect(top('tetrahedrom method too few kpoints')).toBe('tetrahedron-few-kpoints');
  });
  it('returns nothing for empty or unrelated text', () => {
    expect(findErrors('', ERRORS)).toEqual([]);
    expect(findErrors('   \n', ERRORS)).toEqual([]);
    expect(findErrors('banana smoothie recipe', ERRORS)).toEqual([]);
  });
  it('ranks results best first', () => {
    const r = findErrors('scf does not converge nelm', ERRORS);
    expect(r[0]?.entry.id).toBe('scf-not-converging');
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.score).toBeGreaterThanOrEqual(r[i]!.score);
  });
});

describe('open questions', () => {
  it.todo('Q-048: check each message string against a real vasp.out from the author');
});

describe('browse by category', () => {
  it('lists every entry once', () => {
    const groups = byCategory(ERRORS, ERROR_CATEGORIES);
    expect(groups.reduce((n, g) => n + g.entries.length, 0)).toBe(ERRORS.length);
  });
});
