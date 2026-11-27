// Every scene of every module, checked against the five rules of M16 section 1 that can be tested in Node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frameBounds, triangleEstimate, validateFrame } from '../kit';
import { withDefaults, type ParamDef, type Params, type SceneDef } from '../types';
import { SCENES } from './eager';

const registered = new Set(readFileSync('docs/SCIENCE_SOURCES.md', 'utf8').match(/S-\d{3}/g) ?? []);

/** A different value for a parameter: the far end of a slider, the next option, the other side of a toggle. */
function another(p: ParamDef): Params[string] {
  switch (p.kind) {
    case 'slider':
    case 'step':
      return p.value === p.max ? p.min : p.max;
    case 'time':
      return (p.value + p.period / 4) % p.period;
    case 'select':
      return p.options.find((o) => o.value !== p.value)?.value ?? p.value;
    case 'toggle':
      return !p.value;
  }
}

function sweep(def: SceneDef): Params[] {
  const base = withDefaults(def);
  const out = [base];
  for (const p of def.params) {
    out.push({ ...base, [p.id]: another(p) });
    if (p.kind === 'select') {
      // every option of a short list; at most eight spread over a long one
      const k = Math.max(1, Math.ceil(p.options.length / 8));
      p.options.forEach((o, i) => i % k === 0 && out.push({ ...base, [p.id]: o.value }));
    }
    if (p.kind === 'slider' || p.kind === 'step') out.push({ ...base, [p.id]: p.min });
  }
  return out;
}

const defs = [...SCENES.values()];

describe('scene registry', () => {
  it('has scenes', () => expect(defs.length).toBeGreaterThan(0));
});

describe.each(defs.map((d) => [d.id, d] as const))('scene %s', (_id, def) => {
  it('declares an honest badge, sources and a physics control', () => {
    expect(['computed', 'toy-model', 'illustrative', 'sample']).toContain(def.badge);
    for (const s of def.sources)
      expect(registered.has(s), `${s} is not in docs/SCIENCE_SOURCES.md`).toBe(true);
    if (def.badge !== 'illustrative') expect(def.sources.length).toBeGreaterThan(0);
    if (def.badge === 'sample' || def.badge === 'toy-model') expect(def.banner ?? '').not.toBe('');
    expect(def.params.some((p) => p.physics)).toBe(true);
    const ids = def.params.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of def.params) {
      if (p.kind === 'slider' || p.kind === 'step') {
        expect(p.min).toBeLessThan(p.max);
        expect(p.value).toBeGreaterThanOrEqual(p.min);
        expect(p.value).toBeLessThanOrEqual(p.max);
      }
      if (p.kind === 'select') expect(p.options.map((o) => o.value)).toContain(p.value);
    }
    expect(def.title).not.toMatch(/\u2014/);
  });

  it('builds a valid, bounded frame for every parameter setting tried', { timeout: 60_000 }, () => {
    for (const params of sweep(def)) {
      const f = def.build(params);
      expect(validateFrame(f), JSON.stringify(params)).toEqual([]);
      expect(f.layers.length).toBeGreaterThan(0);
      expect(triangleEstimate(f)).toBeLessThanOrEqual(300_000);
      expect(Number.isFinite(frameBounds(f.layers).radius)).toBe(true);
    }
  });

  it('a physics control changes what is drawn and what is said', () => {
    const base = withDefaults(def);
    const f0 = def.build(base);
    const changed = def.params
      .filter((p) => p.physics)
      .some((p) => {
        const f1 = def.build({ ...base, [p.id]: another(p) });
        return JSON.stringify(f1.layers) !== JSON.stringify(f0.layers) && f1.describe !== f0.describe;
      });
    expect(changed).toBe(true);
  });
});
