// D-122 in every scene: an atom labelled with a real element symbol ("Na", "Cl 1", "Fe_up", "La3+ ...") is drawn in that
// element's colour, and bonds drawn by hand between real atoms are two-tone halves. The few layers that keep another
// colour on purpose are listed below, each with its reason; every one of them must still be met, so the list stays honest.
import { describe, expect, it } from 'vitest';
import { elementData } from '../../chem/elements';
import { elementColor, VESTA_SIZES } from '../../three/vestaStyle';
import { withDefaults, type AtomsLayer, type LinesLayer, type Params, type SceneDef } from '../types';
import { twoToneBonds } from './bondsTwoTone';
import { SCENES } from './eager';

/** The element symbol a label starts with, when it is followed by a space, digit, underscore, comma or the end. */
export function labelElement(label: string): string | undefined {
  const m = /^([A-Z][a-z]?)(?=$|[\s\d_,])/.exec(label);
  return m && elementData(m[1]!) ? m[1] : undefined;
}

interface Allowed {
  scene: string;
  group: string;
  /** Only atoms whose label matches; all atoms of the layer when absent. */
  label?: RegExp;
  reason: string;
}

const ALLOWED: Allowed[] = [
  {
    scene: 'm02-chain',
    group: 'atoms',
    label: /^[AB] \d/,
    reason:
      'tight-binding toy sites A and B (B is a label, not boron); A and B are also written in the labels',
  },
  {
    scene: 'm03-exponential-wall',
    group: 'marker',
    reason: 'a marker on a cost plot; "N = 10" is the number of electrons, not nitrogen',
  },
  {
    scene: 'm07-kpath',
    group: 'special',
    reason:
      'high-symmetry k-points (K, H, N, P, U, W are point names, not elements); colour marks the points on the path',
  },
  {
    scene: 'm09-wannier',
    group: 'atoms',
    reason: 'toy chain sites A and B (B is a label, not boron), also told apart by size and label',
  },
  {
    scene: 'm11-studio-space',
    group: 'entries',
    reason:
      'database entries in a property space, not atoms; orange metal and blue gap is also the band-gap axis (metals at gap 0)',
  },
  {
    scene: 'm11-studio-space',
    group: 'filtered',
    reason: 'entries that fail the filter: small, faint and labelled',
  },
  {
    scene: 'm11-next-map',
    group: 'subjects',
    reason: 'page titles on a map of next topics ("U from linear response" is the Hubbard U, not uranium)',
  },
  {
    scene: 'm11-tools-overview',
    group: 'filtered',
    reason: 'entries that fail the filter: small, faint and labelled',
  },
  {
    scene: 'm11-tools-overview',
    group: 'data',
    reason: 'equation-of-state data points; "V = ..." is a volume, not vanadium',
  },
  {
    scene: 'm12-eos',
    group: 'points',
    reason: 'equation-of-state data points; "V = ..." is a volume, not vanadium',
  },
  {
    scene: 'm12b-hull',
    group: 'phases',
    reason:
      'phases of a model A-B-C system (B and C are labels); on or above the hull is also size, label and height',
  },
  {
    scene: 'm12b-neb',
    group: 'exact',
    reason: 'minima and saddles of a model potential named A, B, C, not elements',
  },
  {
    scene: 'm12b-defect',
    group: 'defect',
    reason:
      'the defect atom stands out from the host on purpose; it also has an outline and the label "interstitial"',
  },
  {
    scene: 'm12b-md',
    group: 'atoms',
    label: /\(tracked\)$/,
    reason:
      'the four tracked atoms are orange as the stage caption says; they also have an outline, a label and a trail',
  },
];

/** Defaults, every option of every select, every toggle flipped and every slider or step at its other end. */
function settings(def: SceneDef): Params[] {
  const base = withDefaults(def);
  const out = [base];
  for (const p of def.params) {
    if (p.kind === 'select')
      for (const o of p.options) if (o.value !== p.value) out.push({ ...base, [p.id]: o.value });
    if (p.kind === 'toggle') out.push({ ...base, [p.id]: !p.value });
    if (p.kind === 'slider' || p.kind === 'step')
      out.push({ ...base, [p.id]: p.value === p.max ? p.min : p.max });
  }
  return out;
}

const colourAt = (l: AtomsLayer, i: number) => (Array.isArray(l.color) ? l.color[i] : l.color);

describe('element colours in every scene (D-122)', () => {
  const used = new Set<Allowed>();

  it.each([...SCENES.values()].map((d) => [d.id, d] as const))('%s', { timeout: 60_000 }, (id, def) => {
    const wrong: string[] = [];
    for (const params of settings(def)) {
      const f = def.build(params);
      for (const l of f.layers) {
        if (l.kind !== 'atoms' || !l.labels) continue;
        l.labels.forEach((lab, i) => {
          const el = labelElement(lab);
          if (!el) return;
          if (colourAt(l, i) === elementColor(el)) return;
          const allow = ALLOWED.find(
            (a) => a.scene === id && a.group === l.group && (!a.label || a.label.test(lab)),
          );
          if (allow) used.add(allow);
          else
            wrong.push(
              `${l.group} "${lab}" is ${colourAt(l, i)}, not ${elementColor(el)} (${JSON.stringify(params)})`,
            );
        });
      }
    }
    expect([...new Set(wrong)].slice(0, 5)).toEqual([]);
  });

  it('every allowed exception is still needed', () => {
    expect(ALLOWED.filter((a) => !used.has(a)).map((a) => `${a.scene} ${a.group}`)).toEqual([]);
  });
});

describe('two-tone bonds drawn by hand', () => {
  it('splits each bond at its midpoint into halves in the colours of its two atoms', () => {
    const ls = twoToneBonds([{ a: [0, 0, 0], b: [2, 0, 0], ea: 'Na', eb: 'Cl' }], 'bonds', 'Neighbours');
    expect(ls.map((l) => l.color)).toEqual([elementColor('Na'), elementColor('Cl')]);
    expect(ls.map((l) => l.segments)).toEqual([
      [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
      ],
      [
        [
          [1, 0, 0],
          [2, 0, 0],
        ],
      ],
    ]);
    expect(ls.every((l) => l.tube === VESTA_SIZES.bondRadius && l.group === 'bonds')).toBe(true);
    expect(ls.map((l) => l.name)).toEqual(['Neighbours', undefined]);
  });

  const bondsOf = (id: string, params: Params) =>
    SCENES.get(id)!
      .build({ ...withDefaults(SCENES.get(id)!), ...params })
      .layers.filter((l): l is LinesLayer => l.kind === 'lines' && l.group === 'bonds');

  it('m01-scales: the Cl-Na neighbour bonds are half Cl, half Na', () => {
    const b = bondsOf('m01-scales', { scale: 'atom', lens: 'experiment' });
    expect(new Set(b.map((l) => l.color))).toEqual(new Set([elementColor('Cl'), elementColor('Na')]));
    expect(b.every((l) => l.tube === VESTA_SIZES.bondRadius && l.segments.length === 6)).toBe(true);
  });

  it('m05-vdw: the C-C bonds of both graphene layers are in the carbon colour', () => {
    const b = bondsOf('m05-vdw', {});
    expect(b.map((l) => l.color)).toEqual([elementColor('C')]);
    expect(b[0]!.tube).toBe(VESTA_SIZES.bondRadius);
  });
});
