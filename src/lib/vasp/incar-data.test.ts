import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'astro/zod';
import tagsFile from '../../data/vasp-tags.json';
import presetsFile from '../../data/incar-presets.json';
import field from '../../../scripts/__generated__/field-handbook.json';
import wf from '../../../scripts/__generated__/workflow-handbook.json';
import { parseIncar } from './incar';

const nonEmpty = z.string().trim().min(1);
const TagInfo = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  group: nonEmpty,
  type: z.enum(['int', 'real', 'bool', 'string', 'int-array', 'real-array']),
  default: nonEmpty,
  typical: nonEmpty,
  vaspVersion: nonEmpty,
  summary: z.object({ beginner: nonEmpty, intermediate: nonEmpty, pro: z.string().optional() }),
  why: nonEmpty,
  breaks: nonEmpty,
  tasks: z.array(z.string()),
  related: z.array(z.string()),
  handbook: z.null(),
  sources: z.array(z.string().regex(/^S-\d{3}$/)).min(1),
  fromHandbook: z.array(z.enum(['field', 'workflow'])).min(1),
  corrections: z.array(z.object({ was: nonEmpty, now: nonEmpty })).optional(),
  notes: nonEmpty,
});
const Entry = z.object({
  name: z.string(),
  value: z.string(),
  comment: z.string().optional(),
  placeholder: z.string().optional(),
});
const Preset = z.object({
  id: nonEmpty,
  title: nonEmpty,
  summary: nonEmpty,
  protocolStage: z.number().int().nullable(),
  fragment: z.boolean(),
  sources: z.array(z.string().regex(/^S-\d{3}$/)).min(1),
  notes: z.array(z.string()),
  variants: z
    .array(
      z.object({
        id: nonEmpty,
        title: nonEmpty,
        requires: z.array(z.string()),
        vaspMin: z.string().optional(),
        note: z.string().optional(),
        entries: z.array(Entry).min(1),
      }),
    )
    .min(1),
});

const tags = z.array(TagInfo).parse(tagsFile.tags);
const presets = z.array(Preset).parse(presetsFile.presets);
const register = readFileSync(new URL('../../../docs/SCIENCE_SOURCES.md', import.meta.url), 'utf8');
const names = new Set(tags.map((t) => t.name));

describe('vasp-tags.json', () => {
  it('has at least 60 unique tags', () => {
    expect(tags.length).toBeGreaterThanOrEqual(60);
    expect(names.size).toBe(tags.length);
  });
  it('has no empty beginner text and no em dashes', () => {
    for (const t of tags) expect(t.summary.beginner.length).toBeGreaterThan(20);
    expect(JSON.stringify(tagsFile)).not.toContain(String.fromCharCode(0x2014));
  });
  it('related tags and sources exist', () => {
    for (const t of tags) {
      for (const r of t.related) expect(names.has(r), `${t.name} -> ${r}`).toBe(true);
      for (const s of t.sources) expect(register.includes(`| ${s} |`), `${t.name} ${s}`).toBe(true);
    }
  });
  it('carries every Field Handbook correction record', () => {
    const expected = field.TAGS.reduce(
      (n: number, t: { fixed?: unknown[] }) => n + (t.fixed?.length ?? 0),
      0,
    );
    const got = tags.reduce((n, t) => n + (t.corrections?.length ?? 0), 0);
    expect(expected).toBeGreaterThan(0);
    expect(got).toBeGreaterThan(0);
    expect(got).toBeLessThanOrEqual(expected);
  });
  it('covers every tag of the Workflow Handbook dictionary', () => {
    for (const d of wf.dictionary) for (const n of d.tags) expect(names.has(n), n).toBe(true);
  });
});

describe('incar-presets.json', () => {
  it('has 16 presets with unique ids', () => {
    expect(presets).toHaveLength(16);
    expect(new Set(presets.map((p) => p.id)).size).toBe(16);
  });
  it('uses only known tags, and each variant parses', () => {
    for (const p of presets)
      for (const v of p.variants) {
        for (const e of v.entries) expect(names.has(e.name), `${p.id}: ${e.name}`).toBe(true);
        const text = v.entries.map((e) => `${e.name} = ${e.value}`).join('\n');
        const r = parseIncar(text);
        expect(r.entries.length).toBe(v.entries.length);
      }
  });
  it('sources exist in the register', () => {
    for (const p of presets) for (const s of p.sources) expect(register.includes(`| ${s} |`)).toBe(true);
  });
  it('tag tasks match preset usage', () => {
    for (const t of tags) for (const id of t.tasks) expect(presets.some((p) => p.id === id)).toBe(true);
  });
});

describe('handbook extraction', () => {
  it('has the expected counts', () => {
    expect(wf.dictionary).toHaveLength(53);
    expect(wf.errors).toHaveLength(20);
    expect(wf.incarBlocks).toHaveLength(15);
    expect(field.OUT).toHaveLength(16);
    expect(field.INP).toHaveLength(4);
    expect(field.TAGS).toHaveLength(24);
    expect(field.counts.TROUBLE).toBe(22);
    expect(field.RECIPES).toHaveLength(7);
  });
});
