import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseOutcar } from './outcar';

const gold = (n: string) => readFileSync(`tests/reference/vasp-outputs/${n}`, 'utf8');
type Gold = { magnetization: Record<string, number>[]; total_mag: number };
const expected = JSON.parse(gold('expected.json')) as Record<string, Gold>;

describe('OUTCAR per-site magnetization table (values from pymatgen Outcar via expected.json)', () => {
  for (const name of ['OUTCAR_mag_spd', 'OUTCAR_mag_spdf']) {
    it(`${name}: every site and column equals the pymatgen reading, last table wins`, () => {
      const r = parseOutcar(gold(name));
      const e = expected[name]!;
      const tab = r.siteMagnetization!;
      expect(tab.sites).toHaveLength(e.magnetization.length);
      tab.sites.forEach((s, i) => {
        const g = e.magnetization[i]!;
        expect(s.ion).toBe(i + 1);
        expect(Object.keys(s.values).sort()).toEqual(
          Object.keys(g)
            .filter((k) => k !== 'tot')
            .sort(),
        );
        for (const [k, v] of Object.entries(s.values)) expect(v).toBeCloseTo(g[k]!, 9);
        expect(s.tot).toBeCloseTo(g.tot!, 9);
      });
      expect(r.magnetization!.value).toBeCloseTo(e.total_mag, 9);
    });
  }

  it('reads the f column and the tot footer row', () => {
    const tab = parseOutcar(gold('OUTCAR_mag_spdf')).siteMagnetization!;
    expect(tab.columns).toEqual(['s', 'p', 'd', 'f']);
    expect(tab.total!.tot).toBeCloseTo(0.022, 9);
  });

  it('tolerates missing columns: no tot column means tot is the orbital sum; a short row keeps what it has', () => {
    const text = [
      ' magnetization (x)',
      ' ',
      '# of ion       s       p       d',
      '----------------------------',
      '    1    0.100   0.200   1.500',
      '    2    0.050   0.100',
      '',
    ].join('\n');
    const tab = parseOutcar(text).siteMagnetization!;
    expect(tab.sites[0]!.tot).toBeCloseTo(1.8, 12);
    expect(tab.sites[1]!.values).toEqual({ s: 0.05, p: 0.1 });
    expect(tab.total).toBeUndefined();
  });

  it('is absent when the file has no table, and a heading without a header row is ignored', () => {
    expect(parseOutcar(' free  energy   TOTEN  =       -10.0 eV').siteMagnetization).toBeUndefined();
    expect(parseOutcar(' magnetization (x)\n\n\n\n\n\n').siteMagnetization).toBeUndefined();
  });
});
