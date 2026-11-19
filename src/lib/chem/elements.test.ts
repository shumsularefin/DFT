import { describe, expect, it } from 'vitest';
import ref from '../../../tests/reference/element_reference.json';
import { ELEMENTS, covalentRadius, elementData, elementsMeta, isMetal, paulingX } from './elements';

type RefEl = {
  Z: number;
  pauling_x: number | null;
  vdw_radius: number | null;
  covalent_radius_cordero: number;
  oxidation_share_icsd24: Record<string, number>;
};
const REF = ref.elements as unknown as Record<string, RefEl>;

describe('elements.json', () => {
  it('covers Z = 1 to 103 in order', () => {
    expect(ELEMENTS.length).toBe(103);
    ELEMENTS.forEach((e, i) => expect(e.Z).toBe(i + 1));
    expect(Object.values(elementsMeta.source_ids)).toEqual(expect.arrayContaining(['S-034', 'S-051']));
    expect(JSON.stringify(elementsMeta.source_ids)).toContain('S-021');
  });

  it('equals element_reference.json for its elements (covalent, Pauling, vdW, mass, oxidation shares)', () => {
    const symbols = Object.keys(REF);
    expect(symbols.length).toBe(30);
    for (const sym of symbols) {
      const r = REF[sym]!;
      const e = elementData(sym)!;
      expect(e.Z, sym).toBe(r.Z);
      expect(covalentRadius(sym), sym).toBe(r.covalent_radius_cordero);
      expect(paulingX(sym), sym).toBe(r.pauling_x);
      expect(e.vdw, sym).toBe(r.vdw_radius);
      for (const [ox, share] of Object.entries(r.oxidation_share_icsd24))
        expect(e.oxShares[ox], `${sym} ${ox}`).toBeCloseTo(share, 4);
    }
  });

  it('keeps gaps as null instead of placeholders', () => {
    for (const s of ['Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr']) expect(covalentRadius(s), s).toBeNull();
    expect(covalentRadius('Pa')).toBe(2.0); // a real Cordero value, not a placeholder
    for (const s of ['He', 'Ne', 'Ar']) expect(paulingX(s), s).toBeNull();
    expect(isMetal('Na')).toBe(true);
    expect(isMetal('Cl')).toBe(false);
    expect(elementData('Xx')).toBeUndefined();
  });
});
