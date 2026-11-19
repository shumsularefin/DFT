import { describe, expect, it } from 'vitest';
import tags from '../../data/vasp-tags.json';
import sources from '../../data/sources.json';
import { isPlotId, renderPlot } from '../visual/plots';
import { sceneIds } from '../scene/library';
import { parsePoscar } from '../crystal/poscar';
import { TAGS_WITH_VISUAL } from './tagVisualTags';
import { ENTRIES, coveredTags, visualFor } from './tagVisual';

const NaCl = parsePoscar(
  `NaCl
1.0
0 2.82 2.82
2.82 0 2.82
2.82 2.82 0
Na Cl
1 1
Direct
0 0 0
0.5 0.5 0.5
`,
).structure;

describe('tag-visuals.json', () => {
  const names = new Set((tags.tags as { name: string }[]).map((t) => t.name));
  const srcIds = new Set((sources as { id: string }[]).map((s) => s.id));
  it('covers the first set of tags once each', () => {
    expect(coveredTags().sort()).toEqual(
      'EDIFF EDIFFG IBRION ISIF ISMEAR ISPIN KSPACING LDAUJ LDAUU MAGMOM NELM NSW SIGMA ENCUT'
        .split(' ')
        .sort(),
    );
  });
  it('the small tag list equals the data file', () => {
    expect([...TAGS_WITH_VISUAL].sort()).toEqual(coveredTags().sort());
  });
  for (const e of ENTRIES) {
    it(`${e.tag}: tag, plot or scene, source ids and captions exist`, () => {
      expect(names.has(e.tag)).toBe(true);
      expect(Boolean(e.plot) !== Boolean(e.scene)).toBe(true);
      if (e.plot) expect(isPlotId(e.plot)).toBe(true);
      if (e.scene) expect(sceneIds()).toContain(e.scene);
      for (const s of e.sources) expect(srcIds.has(s), s).toBe(true);
      const texts = [...(e.alt ? [e.alt] : []), ...(e.captions ? Object.values(e.captions) : [])].concat(
        (e.cases ?? []).flatMap((c) => [c.alt, ...Object.values(c.captions)]),
      );
      expect(texts.length).toBeGreaterThan(0);
      for (const t of texts) {
        expect(t.length).toBeGreaterThan(10);
        expect(t).not.toContain(String.fromCharCode(0x2014));
      }
    });
  }
  it('the badge in the data equals the badge of the generator', () => {
    for (const e of ENTRIES) if (e.plot) expect(renderPlot(e.plot, {}, 'x').badge, e.tag).toBe(e.badge);
  });
});

describe('visualFor: documented values give the documented picture', () => {
  it('ISPIN = 1 gives one ladder and ISPIN = 2 gives two', () => {
    const one = visualFor('ISPIN', '1')!;
    const two = visualFor('ISPIN', '2')!;
    expect(one.svg).toContain('one set of orbitals');
    expect(two.svg).toContain('spin up');
    expect(two.svg).toContain('spin down');
    expect(one.alt).not.toBe(two.alt);
  });
  it('ISPIN = 2 on a loaded structure draws arrows, default 1.0 per atom', () => {
    const f = visualFor('ISPIN', '2', { structure: NaCl })!;
    expect(f.kind).toBe('scene');
    expect(f.spec?.spins).toEqual([1, 1]);
  });
  it('MAGMOM: arrows follow the value, and a wrong count draws none and says so', () => {
    const ok = visualFor('MAGMOM', '5.0 -5.0', { structure: NaCl })!;
    expect(ok.spec?.spins).toEqual([5, -5]);
    expect(ok.captions.beginner).toContain('count matches');
    const bad = visualFor('MAGMOM', '4*3.0', { structure: NaCl })!;
    expect(bad.spec?.spins).toBeUndefined();
    expect(bad.captions.beginner).toContain('does NOT match');
    expect(visualFor('MAGMOM', '5.0 -5.0')).toBeNull(); // a value but no structure: no guess
    expect(visualFor('MAGMOM', '')!.badge).toBe('toy-model'); // no value: the example cell
  });
  it('ISIF: 2 moves ions, 3 ions + shape + volume, 4 ions + shape at fixed volume', () => {
    expect(visualFor('ISIF', '2')!.svg).toContain('may change: ions<');
    expect(visualFor('ISIF', '3')!.svg).toContain('ions, cell shape, cell volume');
    expect(visualFor('ISIF', '4')!.svg).toContain('ions, cell shape<');
  });
  it('IBRION -1 moves nothing; 2 moves the ions', () => {
    expect(visualFor('IBRION', '-1')!.svg).toContain('nothing changes');
    expect(visualFor('IBRION', '2')!.svg).toContain('may change: ions');
  });
  it('NSW: 0 is one calculation, N is at most N steps', () => {
    expect(visualFor('NSW', '0')!.svg).toContain('one calculation, no ionic movement');
    expect(visualFor('NSW', '120')!.svg).toContain('at most 120 ionic steps');
  });
  it('ISMEAR names its scheme in the text, SIGMA is read from the INCAR', () => {
    const f = visualFor('ISMEAR', '0', { incar: { SIGMA: '0.05' } })!;
    expect(f.svg).toContain('SIGMA = 0.05 eV');
    expect(f.alt).toContain('Gaussian');
    expect(visualFor('SIGMA', '0.2', { incar: { ISMEAR: '1' } })!.svg).toContain('SIGMA = 0.2 eV');
  });
  it('ENCUT puts the cutoff line at the value', () => {
    const f = visualFor('ENCUT', '400')!;
    expect(f.svg).toContain('cutoff');
    expect(f.caption).toContain('400');
  });
  it('KSPACING gives the mesh that meshFromKspacing gives, for the loaded cell', () => {
    const f = visualFor('KSPACING', '0.5', { structure: NaCl })!;
    expect(f.captions.beginner).toMatch(/\d+ x \d+ x \d+ mesh for your cell/);
  });
  it('LDAUU uses U - J; LDAUJ alone gives no figure', () => {
    expect(visualFor('LDAUU', '5.3 0', { incar: { LDAUJ: '0.8 0' } })!.captions.beginner).toContain('4.5');
    expect(visualFor('LDAUU', '4 0')!.captions.beginner).toContain('4 eV');
    expect(visualFor('LDAUJ', '0.8 0')).toBeNull();
  });
  it('EDIFFG: negative is a force threshold, positive has no figure', () => {
    expect(visualFor('EDIFFG', '-0.01')!.caption).toContain('0.01');
    expect(visualFor('EDIFFG', '0.001')).toBeNull();
  });
  it('EDIFF and NELM render', () => {
    expect(visualFor('EDIFF', '1e-5')!.svg).toContain('EDIFF');
    expect(visualFor('NELM', '5')!.svg).toContain('<svg');
  });
  it('unknown values and unknown tags give no figure, not a wrong one', () => {
    for (const [t, v] of [
      ['ISPIN', '3'],
      ['ISMEAR', '-5'],
      ['ISIF', '7'],
      ['IBRION', '6'],
      ['ENCUT', 'abc'],
      ['ENCUT', '-1'],
      ['NSW', '2.5'],
      ['NELM', '0'],
      ['SIGMA', '0'],
      ['PREC', 'Accurate'],
    ] as const)
      expect(visualFor(t, v), `${t} = ${v}`).toBeNull();
  });
  it('every example value renders without NaN', () => {
    for (const e of ENTRIES) {
      const f = visualFor(e.tag, e.example, e.tag === 'LDAUJ' ? { incar: { LDAUU: '5 0' } } : {});
      expect(f, e.tag).not.toBeNull();
      expect(f!.svg).not.toContain('NaN');
      expect(f!.alt.length).toBeGreaterThan(10);
    }
  });
});
