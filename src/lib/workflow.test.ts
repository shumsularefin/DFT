// D-110: the workflow pages show the Input Builder presets as their INCARs. These tests check that each
// preset the workflow uses is, tag for tag, the INCAR printed in the author's Workflow Handbook (S-042,
// docs/source-material/VASP_Workflow_Handbook.html), so the pages cannot drift from the source.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIncar } from './vasp/incar';
import {
  checklistRow,
  exampleIncar,
  inputBuilderHref,
  orderSteps,
  presetVariant,
  stepNeighbors,
  valuesToReplace,
} from './workflow';

const html = readFileSync('docs/source-material/VASP_Workflow_Handbook.html', 'utf8');
const unescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
/** The INCAR figures of S-042, by caption. */
const figures = new Map(
  [
    ...html.matchAll(
      /<figure class="file"><figcaption><strong>(?:INCAR|MAGMOM)<\/strong> · (.*?)<span class="sp">[\s\S]*?<pre class="incar">([\s\S]*?)<\/pre>/g,
    ),
  ].map((m) => [unescape(m[1]!).trim(), unescape(m[2]!)]),
);
const pairs = (text: string) =>
  parseIncar(text)
    .entries.map((e) => `${e.name} = ${e.value}`)
    .sort();

// Caption in S-042 -> preset and variant used on the workflow page.
const SHOWN: [string, string, string][] = [
  ['relaxation', 'relax', 'default'],
  ['SCF (101 → ST, edited)', 'dos', 'default'],
  ['route B run on KPATH.in', 'band', 'route-b'],
  ['optics (101 → OP, edited)', 'optics', 'default'],
  ['elastic (101 → DC, edited)', 'elastic', 'default'],
  ['each displacement', 'phonon-finite-displacement', 'default'],
  ['DFPT dielectric (101 → EC, edited)', 'dielectric', 'default'],
  ['Bader (101 → BD, edited)', 'bader', 'default'],
  ['+U block (101 → PU)  ·  POSCAR species: Fe O', 'dftu', 'default'],
  ['r2SCAN (add to a 101 → ST template)', 'r2scan', 'default'],
  ['mBJ band gap', 'mbj', 'default'],
  ['HSE06 SCF (101 → H6)', 'hybrid', 'default'],
];

describe('workflow INCARs match the Workflow Handbook (S-042)', () => {
  it('finds the 13 INCAR figures of S-042', () => {
    expect(figures.size).toBe(13);
  });
  it.each(SHOWN)('%s is preset %s/%s, tag for tag', (caption, preset, variant) => {
    const source = figures.get(caption);
    expect(source, caption).toBeDefined();
    expect(pairs(exampleIncar(preset, variant))).toEqual(pairs(source!));
  });
  it('the magnetic configurations: each MAGMOM line of S-042 is a spin preset variant', () => {
    const source = figures.get('4 TM + 8 O supercell')!;
    const magmoms = [...source.matchAll(/^MAGMOM\s*=\s*(.+)$/gm)].map((m) => m[1]!.trim());
    const variants = ['fm', 'afm-1', 'afm-2'].map(
      (v) => parseIncar(exampleIncar('spin', v)).entries.find((e) => e.name === 'MAGMOM')?.value,
    );
    expect(variants).toEqual(magmoms);
  });
});

describe('workflow helpers', () => {
  it('keeps the preset comments in the example INCAR', () => {
    expect(exampleIncar('relax')).toMatch(/^ENCUT\s+= 520\s+# 1\.3 × largest ENMAX/m);
  });
  it('lists the values a reader must replace', () => {
    expect(valuesToReplace('relax')).toEqual(['ENCUT', 'MAGMOM']);
  });
  it('builds an Input Builder link the builder can read', () => {
    expect(inputBuilderHref('band', 'route-b')).toBe('/tools/input-builder/?preset=band&variant=route-b');
    expect(inputBuilderHref('relax')).toBe('/tools/input-builder/?preset=relax&variant=default');
  });
  it('fails loudly on a typo', () => {
    expect(() => presetVariant('relaxx')).toThrow(/no Input Builder preset/);
    expect(() => presetVariant('relax', 'nope')).toThrow(/no variant/);
    expect(() => checklistRow('Relaxation')).toThrow(/no checklist row/);
  });
  it('returns the checklist row by name', () => {
    expect(
      checklistRow('Elastic')
        .mustNot.map((i) => i.text)
        .join(' '),
    ).toMatch(/NCORE/);
  });
  it('orders steps by group, then order', () => {
    const steps = orderSteps([
      { id: 'b', title: 'B', group: 'Electronic' as const, order: 2 },
      { id: 'a', title: 'A', group: 'Geometry' as const, order: 9 },
      { id: 'c', title: 'C', group: 'Electronic' as const, order: 1 },
    ]);
    expect(steps.map((s) => s.id)).toEqual(['a', 'c', 'b']);
    expect(stepNeighbors(steps, 'c')).toEqual({ prev: steps[0], next: steps[2] });
    expect(stepNeighbors(steps, 'zz')).toEqual({ prev: null, next: null });
  });
});

describe('workflow data files', () => {
  it('workflow.json: the version and revised date are the newest history entry', async () => {
    const edition = (await import('../data/workflow.json')).default;
    expect(edition.history.length).toBeGreaterThan(0);
    expect(edition.history[0]!.version).toBe(edition.version);
    expect(edition.history[0]!.date).toBe(edition.revised);
    expect(edition.revised).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('workflow-protocol.json: five steps, each quote printed in S-042', async () => {
    const file = (await import('../data/workflow-protocol.json')).default;
    const text = unescape(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ');
    expect(file.protocol.map((p) => p.step)).toEqual([1, 2, 3, 4, 5]);
    for (const p of file.protocol) {
      expect(text, `step ${p.step}`).toContain(p.quote.slice(0, 40));
      for (const n of p.notes) expect(['verified', 'note', 'wiki rule']).toContain(n.kind);
    }
  });
  it('the fixed-volume relaxation (E-V scan) keeps the Workflow Handbook values', () => {
    const tags = Object.fromEntries(
      parseIncar(exampleIncar('relax', 'fixed-volume')).entries.map((e) => [e.name, e.value]),
    );
    expect(tags).toMatchObject({ ISIF: '4', IBRION: '2', NSW: '100', EDIFF: '1E-6', EDIFFG: '-0.005' });
  });
});
