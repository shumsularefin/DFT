import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChgcar, gridIndex } from './chgcar';
import { parseDoscar, smoothDos } from './doscar';
import { computeBandGap, parseEigenval } from './eigenval';
import { parseXdatcar } from './xdatcar';
import { enclosedVolume, extractIsosurface, isClosedManifold } from '../physics/marchingCubes';

const expected = JSON.parse(readFileSync('tests/reference/vasp-outputs/expected.json', 'utf8'));

describe('M7.5 analysis parsers against golden fixtures', () => {
  it('parses CHGCAR and CHGCAR_spin matching grid, sample values, electrons, max density, and magnetization', () => {
    for (const name of ['CHGCAR', 'CHGCAR_spin'] as const) {
      const text = readFileSync(`tests/reference/vasp-outputs/${name}`, 'utf8');
      const res = parseChgcar(text);
      const exp = expected[name];
      expect(res.grid).toEqual(exp.grid);
      expect(res.volumeA3).toBeCloseTo(exp.cell_volume_A3, 6);
      expect(res.electrons).toBeCloseTo(exp.electrons_from_grid_sum_over_N, 6);
      expect(res.maxDensityPerA3).toBeCloseTo(exp.max_density_e_per_A3, 5);
      for (const [ijk, val] of Object.entries(exp.samples_raw_rho_times_V as Record<string, number>)) {
        const [ix, iy, iz] = ijk.split(',').map(Number);
        const got = res.totalRaw[gridIndex(res.grid, ix!, iy!, iz!)]!;
        expect(Math.abs(got - val) / Math.max(1e-15, Math.abs(val))).toBeLessThan(1e-7);
      }
      if (name === 'CHGCAR_spin') {
        expect(res.diffRaw).toBeDefined();
        expect(res.magnetization).toBeCloseTo(exp.magnetization_from_grid_sum_over_N, 5);
      } else {
        expect(res.diffRaw).toBeUndefined();
      }
    }
  });

  it('parses EIGENVAL_ispin1 and EIGENVAL_ispin2 matching pymatgen expected values', () => {
    for (const name of ['EIGENVAL_ispin1', 'EIGENVAL_ispin2'] as const) {
      const text = readFileSync(`tests/reference/vasp-outputs/${name}`, 'utf8');
      const res = parseEigenval(text);
      const exp = expected[name];
      expect(res.ispin).toBe(exp.ispin);
      expect(res.nkpt).toBe(exp.nkpt);
      expect(res.nbands).toBe(exp.nbands);
      expect(res.kpoints).toEqual(exp.kpoints);
      expect(res.weights).toEqual(exp.kpoint_weights);
      for (let k = 0; k < exp.nkpt; k++) {
        for (let b = 0; b < exp.nbands; b++) {
          const [e1, o1] = exp.eigenvalues_and_occupations_by_spin['1'][k][b];
          expect(res.eigenvalues[0]![k]![b]).toBeCloseTo(e1, 5);
          expect(res.occupations[0]![k]![b]).toBeCloseTo(o1, 5);
          if (exp.ispin === 2) {
            const [e2, o2] = exp.eigenvalues_and_occupations_by_spin['-1'][k][b];
            expect(res.eigenvalues[1]![k]![b]).toBeCloseTo(e2, 5);
            expect(res.occupations[1]![k]![b]).toBeCloseTo(o2, 5);
          }
        }
      }
    }
  });

  it('classifies an indirect band gap with VBM at Gamma and CBM at X', () => {
    const gap = computeBandGap({
      ispin: 1,
      nelect: 2,
      nkpt: 2,
      nbands: 2,
      kpoints: [
        [0, 0, 0],
        [0.5, 0, 0],
      ],
      weights: [0.5, 0.5],
      eigenvalues: [
        [
          [-1.0, 2.5],
          [-1.5, 1.2],
        ],
      ],
      occupations: [
        [
          [1, 0],
          [1, 0],
        ],
      ],
    });
    expect(gap.kind).toBe('indirect');
    expect(gap.gapEv).toBeCloseTo(2.2, 12);
    expect(gap.vbm?.kIndex).toBe(0);
    expect(gap.cbm?.kIndex).toBe(1);
  });

  it('parses XDATCAR matching expected 3 frames and fractional coordinates', () => {
    const text = readFileSync('tests/reference/vasp-outputs/XDATCAR', 'utf8');
    const res = parseXdatcar(text);
    const exp = expected.XDATCAR;
    expect(res.frames.length).toBe(exp.n_frames);
    expect(res.species).toEqual(exp.species);
    for (let f = 0; f < exp.n_frames; f++) {
      expect(res.frames[f]!.structure.frac).toEqual(exp.frac_coords[f]);
    }
  });

  it('parses DOSCAR_ispin2_lorbit11 matching expected energies, total DOS, and projected orbitals', () => {
    const text = readFileSync('tests/reference/vasp-outputs/DOSCAR_ispin2_lorbit11', 'utf8');
    const res = parseDoscar(text);
    const exp = expected.DOSCAR_ispin2_lorbit11;
    expect(res.nions).toBe(exp.nions);
    expect(res.nedos).toBe(exp.nedos);
    expect(res.efermi).toBeCloseTo(exp.efermi, 6);
    expect(res.ispin).toBe(exp.ispin);
    expect(res.energies).toEqual(exp.energies);
    for (let i = 0; i < exp.nedos; i++) {
      expect(res.totalUp[i]).toBeCloseTo(exp.total_up[i], 5);
      expect(res.totalDown![i]).toBeCloseTo(exp.total_down[i], 5);
    }
    expect(res.sites.length).toBe(exp.nions);
    expect(res.sites[0]!.orbitals).toEqual(exp.orbital_order);
    expect(smoothDos(res.energies, res.totalUp, 0)).toEqual(res.totalUp);
  });

  it('extracts a closed watertight sphere on a 64^3 grid with volume within 1 % of 4/3 pi R^3', () => {
    const N = 64;
    const R = 16;
    const c = 31.5;
    const field = new Float32Array(N * N * N);
    for (let iz = 0; iz < N; iz++) {
      for (let iy = 0; iy < N; iy++) {
        for (let ix = 0; ix < N; ix++) {
          const dx = ix - c;
          const dy = iy - c;
          const dz = iz - c;
          field[ix + N * (iy + N * iz)] = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
      }
    }
    const mesh = extractIsosurface(field, [N, N, N], R);
    expect(mesh.triangleCount).toBeGreaterThan(1000);
    expect(isClosedManifold(mesh)).toBe(true);
    const exactVol = (4 / 3) * Math.PI * R * R * R;
    const gotVol = enclosedVolume(mesh);
    expect(Math.abs(gotVol - exactVol) / exactVol).toBeLessThan(0.01);
  });
});
