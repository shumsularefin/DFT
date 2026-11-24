import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filterRowIndices, looksLikePerovskite, materializeRow, materialsToCsv, type MpIndex } from './query';

const sample = JSON.parse(readFileSync('public/data/mp/sample/index.json', 'utf8')) as MpIndex;

describe('Screening Studio query engine (M9.2)', () => {
  it('filters sample dataset accurately by element, stability, band gap, sites, and text', () => {
    expect(filterRowIndices(sample, {}).length).toBe(sample.count);

    const oxides = filterRowIndices(sample, { includeElements: ['O'] });
    expect(oxides.length).toBeGreaterThan(0);
    for (const idx of oxides) {
      expect(materializeRow(sample, idx).elements).toContain('O');
    }

    const srtio3 = filterRowIndices(sample, { text: 'SrTiO3' });
    expect(srtio3.length).toBe(1);
    const row = materializeRow(sample, srtio3[0]!);
    expect(row.formula_pretty).toBe('SrTiO3');
    expect(looksLikePerovskite(row.formula_pretty, row.nsites)).toBe(true);

    const stableSmall = filterRowIndices(sample, { onlyStable: true, maxSites: 10 });
    for (const idx of stableSmall) {
      const r = materializeRow(sample, idx);
      expect(r.is_stable).toBe(true);
      expect(r.nsites).toBeLessThanOrEqual(10);
    }

    const csv = materialsToCsv([row], 'Synthetic sample');
    expect(csv).toContain('# Attribution: Synthetic sample');
    expect(csv).toContain('SrTiO3');
  });

  it('filters 50,000 synthetic rows in under 100 ms', () => {
    const N = 50_000;
    const big: MpIndex = {
      schemaVersion: 1,
      dbVersion: 'bench',
      count: N,
      symbols: sample.symbols,
      spaceGroups: sample.spaceGroups,
      columns: {
        material_id: Array.from({ length: N }, (_, i) => `mp-${i}`),
        formula_pretty: Array.from({ length: N }, (_, i) => sample.columns.formula_pretty[i % sample.count]!),
        elements: Array.from({ length: N }, (_, i) => sample.columns.elements[i % sample.count]!),
        nsites: Array.from({ length: N }, (_, i) => sample.columns.nsites[i % sample.count]!),
        volume: Array.from({ length: N }, (_, i) => sample.columns.volume[i % sample.count]!),
        density: Array.from({ length: N }, (_, i) => sample.columns.density[i % sample.count]!),
        energy_above_hull: Array.from({ length: N }, (_, i) => (i % 100) * 0.002),
        formation_energy_per_atom: Array.from({ length: N }, () => -1.0),
        band_gap: Array.from({ length: N }, (_, i) => (i % 40) * 0.1),
        is_gap_direct: Array.from({ length: N }, () => false),
        is_metal: Array.from({ length: N }, (_, i) => i % 5 === 0),
        is_magnetic: Array.from({ length: N }, (_, i) => i % 3 === 0),
        ordering: Array.from({ length: N }, () => 'NM'),
        total_magnetization: Array.from({ length: N }, () => 0),
        num_magnetic_sites: Array.from({ length: N }, () => 0),
        spacegroup: Array.from({ length: N }, (_, i) => i % sample.spaceGroups.length),
        is_stable: Array.from({ length: N }, (_, i) => i % 4 === 0),
        theoretical: Array.from({ length: N }, () => false),
        shard: Array.from({ length: N }, () => null),
      },
    };
    const t0 = performance.now();
    const hits = filterRowIndices(big, {
      includeElements: ['O'],
      maxEhull: 0.05,
      minGap: 0.5,
      maxGap: 3.0,
      maxSites: 20,
    });
    const elapsed = performance.now() - t0;
    expect(hits.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });
});
