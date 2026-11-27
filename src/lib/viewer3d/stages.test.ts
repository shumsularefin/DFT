// Every topic's `stage:` block against the scene registry (M16.3): the scene exists, each state's parameters are real
// parameters with allowed values, each state's layer groups are drawn by that state's frame, and each section exists.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFrontMatter } from '../../../scripts/lint-content.mjs';
import { stageSchema, workflowStageSchema } from '../content-schema.mjs';
import { validateFrame } from './kit';
import { SCENES } from './scenes/eager';
import { withDefaults, type ParamDef } from './types';

const files = Object.keys(import.meta.glob('../../content/handbook/**/*.mdx')).map((f) =>
  f.replace('../../content/', 'src/content/'),
);
const staged = files
  .map((f) => ({ f, text: readFileSync(f, 'utf8') }))
  .map(({ f, text }) => ({
    f,
    text,
    stage: (parseFrontMatter(text).data as { stage?: unknown } | null)?.stage,
  }))
  .filter((x) => x.stage !== undefined);

const SECTION_TAGS: Record<string, string> = {
  why: 'Why',
  intuition: 'Intuition',
  lab: 'Lab',
  math: 'TheMath',
  'in-vasp': 'InVasp',
  'what-changes': 'WhatChanges',
  mistakes: 'Mistakes',
  check: 'Check',
  'go-deeper': 'GoDeeper',
};

function allowed(p: ParamDef, v: unknown): boolean {
  switch (p.kind) {
    case 'slider':
    case 'step':
      return typeof v === 'number' && v >= p.min && v <= p.max;
    case 'time':
      return typeof v === 'number' && v >= 0 && v <= p.period;
    case 'select':
      return typeof v === 'string' && p.options.some((o) => o.value === v);
    case 'toggle':
      return typeof v === 'boolean';
  }
}

describe('topic stages', () => {
  it('found the topic files', () => expect(files.length).toBeGreaterThan(50));

  it.each(staged.map((s) => [s.f, s] as const))('%s', (_f, { text, stage }) => {
    const parsed = stageSchema.safeParse(stage);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
    if (!parsed.success) return;
    const def = SCENES.get(parsed.data.scene);
    expect(def, `scene ${parsed.data.scene} is not registered`).toBeDefined();
    if (!def) return;
    const ids = new Set(parsed.data.states.map((s) => s.id));
    expect(ids.size).toBe(parsed.data.states.length);
    for (const st of parsed.data.states) {
      for (const [k, v] of Object.entries(st.params)) {
        const p = def.params.find((x) => x.id === k);
        expect(p, `state ${st.id}: unknown parameter "${k}"`).toBeDefined();
        if (p) expect(allowed(p, v), `state ${st.id}: ${k} = ${JSON.stringify(v)} is not allowed`).toBe(true);
      }
      if (st.section)
        expect(
          text.includes(`<${SECTION_TAGS[st.section]}`),
          `state ${st.id}: no ${st.section} section`,
        ).toBe(true);
      const frame = def.build(withDefaults(def, st.params));
      expect(validateFrame(frame)).toEqual([]);
      const groups = new Set(frame.layers.map((l) => l.group));
      for (const g of st.layers ?? [])
        expect(groups.has(g), `state ${st.id}: layer group "${g}" is not drawn`).toBe(true);
      expect(st.caption).not.toMatch(/\u2014/);
    }
  });
});

// Workflow steps (D-125): every step has a stage on the same engine; its states follow the step's own <Section id>s.
const workflowFiles = Object.keys(import.meta.glob('../../content/workflow/*.mdx')).map((f) =>
  f.replace('../../content/', 'src/content/'),
);

describe('workflow stages', () => {
  it('found the step files', () => expect(workflowFiles.length).toBe(16));

  it.each(workflowFiles)('%s', (f) => {
    const text = readFileSync(f, 'utf8');
    const stage = (parseFrontMatter(text).data as { stage?: unknown } | null)?.stage;
    expect(stage, 'every Workflow step has a stage').toBeDefined();
    const parsed = workflowStageSchema.safeParse(stage);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
    if (!parsed.success) return;
    const def = SCENES.get(parsed.data.scene);
    expect(def, `scene ${parsed.data.scene} is not registered`).toBeDefined();
    if (!def) return;
    const sections = [...text.matchAll(/<Section\s+id="([^"]+)"/g)].map((m) => m[1]);
    let last = -1;
    for (const st of parsed.data.states) {
      for (const [k, v] of Object.entries(st.params)) {
        const p = def.params.find((x) => x.id === k);
        expect(p, `state ${st.id}: unknown parameter "${k}"`).toBeDefined();
        if (p) expect(allowed(p, v), `state ${st.id}: ${k} = ${JSON.stringify(v)} is not allowed`).toBe(true);
      }
      const at = sections.indexOf(st.section!);
      expect(at, `state ${st.id}: no section "${st.section}" on the page`).toBeGreaterThanOrEqual(0);
      expect(at, `state ${st.id}: states follow the page order`).toBeGreaterThan(last);
      last = at;
      const frame = def.build(withDefaults(def, st.params));
      expect(validateFrame(frame)).toEqual([]);
      const groups = new Set(frame.layers.map((l) => l.group));
      for (const g of st.layers ?? [])
        expect(groups.has(g), `state ${st.id}: layer group "${g}" is not drawn`).toBe(true);
      expect(st.caption).not.toMatch(/\u2014/);
    }
  });
});
