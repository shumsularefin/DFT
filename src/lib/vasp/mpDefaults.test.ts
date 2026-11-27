import { describe, expect, it } from 'vitest';
import ref from '../../../tests/reference/mp_defaults_reference.json';
import { MP_MAGMOM, MP_MAGMOM_DEFAULT, MP_U, MP_U_ANIONS, mpLdau, mpMagmom } from './mpDefaults';

describe('Materials Project defaults (D-110)', () => {
  it('match pymatgen-core MPRelaxSet.yaml and VASPIncarBase.yaml', () => {
    expect(MP_U).toEqual(ref.u);
    expect([...MP_U_ANIONS].sort()).toEqual(ref.u_anions);
    expect(ref.ldautype).toBe(2);
    expect(new Set(Object.values(ref.ldaul))).toEqual(new Set([2]));
    expect(new Set(Object.values(ref.ldauj))).toEqual(new Set([0]));
    expect(MP_MAGMOM).toEqual(ref.magmom_element);
    expect(MP_MAGMOM_DEFAULT).toBe(ref.magmom_default);
  });

  it('gives Fe 5.3 in FeO, nothing for O, and U only with O or F', () => {
    const r = mpLdau(['Fe', 'O']);
    expect(r.applies).toBe(true);
    expect(r.withU).toEqual(['Fe']);
    expect(r.rows.Fe).toEqual({ l: '2', u: '5.3', j: '0' });
    expect(r.rows.O).toEqual({ l: '-1', u: '0', j: '0' });
    expect(mpLdau(['Ni', 'F']).withU).toEqual(['Ni']);
    const s = mpLdau(['Fe', 'S']);
    expect(s.applies).toBe(false);
    expect(s.withU).toEqual([]);
    expect(s.rows.Fe!.u).toBe('0');
  });

  it('starting moments: table value, 0.6 for anything else', () => {
    expect(mpMagmom(['Fe', 'Co', 'O', 'Cu'])).toEqual({ Fe: 5, Co: 0.6, O: 0.6, Cu: 0.6 });
  });
});
