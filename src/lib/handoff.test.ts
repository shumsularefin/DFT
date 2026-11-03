import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HANDOFF_KEY, sendHandoff, takeHandoff, validateHandoff, type Handoff, type KV } from './handoff';

const mem = (): KV & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};
const struct: Handoff = {
  v: 1,
  kind: 'structure',
  from: 'builder',
  structure: {
    lattice: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    species: ['Cu'],
    frac: [[0, 0, 0]],
  },
};
const site = { occupants: [{ symbol: 'Ti', oxidation: 4, cn: 6, fraction: 1 }] };
const comp: Handoff = { v: 1, kind: 'composition', from: 'tolerance-factor', a: site, b: site, x: site };
const mol: Handoff = { v: 1, kind: 'molecule', from: 'studio', xyz: '1\n\nH 0 0 0\n' };

describe('handoff', () => {
  it.each([struct, comp, mol])('round trips %#', (h) => {
    const s = mem();
    let to = '';
    expect(sendHandoff(h, '/tools/x/', s, (u) => (to = u))).toBe(true);
    expect(to).toBe('/tools/x/');
    expect(takeHandoff([h.kind], s)).toEqual(h);
    expect(s.m.has(HANDOFF_KEY)).toBe(false); // read once
    expect(takeHandoff([h.kind], s)).toBeNull();
  });
  it('wrong kind is rejected and still cleared', () => {
    const s = mem();
    sendHandoff(struct, '/x/', s, () => {});
    expect(takeHandoff(['molecule'], s)).toBeNull();
    expect(s.m.size).toBe(0);
  });
  it('rejects malformed payloads', () => {
    const bad: unknown[] = [
      null,
      5,
      {},
      { v: 2, kind: 'molecule', from: 'studio', xyz: '' },
      { ...mol, from: 'nope' },
      { ...mol, xyz: 3 },
      { ...struct, structure: { lattice: [[1, 0, 0]], species: [], frac: [] } },
      { ...struct, structure: { ...(struct as { structure: object }).structure, frac: [] } },
      { ...comp, a: { occupants: [{ symbol: 'Ti', oxidation: 4, cn: 6, fraction: 2 }] } },
      { ...comp, b: { occupants: [{ symbol: 'Ti', oxidation: 4, cn: 6, fraction: 1, spin: 'XX' }] } },
    ];
    for (const b of bad) expect(validateHandoff(b)).toBeNull();
  });
  it('bad JSON and missing storage are safe', () => {
    const s = mem();
    s.setItem(HANDOFF_KEY, '{oops');
    expect(takeHandoff(['structure'], s)).toBeNull();
    expect(takeHandoff(['structure'], null)).toBeNull();
    expect(sendHandoff(struct, '/x/', null, () => {})).toBe(false);
  });
  it('a full store returns false and does not navigate', () => {
    const s: KV = {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error('quota');
      },
    };
    let went = false;
    expect(sendHandoff(struct, '/x/', s, () => (went = true))).toBe(false);
    expect(went).toBe(false);
  });
});

describe('src/lib/crystal has no DOM or React imports and no any', () => {
  const dir = new URL('./crystal/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  it.each(files)('%s', (f) => {
    const t = readFileSync(new URL(f, dir), 'utf8');
    expect(t).not.toMatch(/from ['"](react|react-dom)['"]/);
    expect(t).not.toMatch(/\b(document|window|localStorage)\./);
    expect(t).not.toMatch(/:\s*any\b|as any\b/);
  });
});
