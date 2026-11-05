import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import kp from '../../../tests/reference/kpaths.json';
import { symbolOf } from '../crystal/elements';
import { hpkotPath, setyawanPath, type KPathAny } from '../crystal/kpath';
import { loadMoyoNode } from '../crystal/moyo-node';
import { analyzeWith, type MoyoApi } from '../crystal/symmetry';
import type { Mat3, Structure, Vec3 } from '../crystal/types';
import {
  buildPathTable,
  type PathTable,
  fileLabel,
  pathPoints,
  ROUTE_NOTES,
  writeKpathIn,
  writeKpoints,
  writeKpointsOpt,
  writePathCsv,
  writePathJson,
} from './kpathExport';

interface Golden {
  input: { lattice_rows: Mat3; frac_coords: Vec3[]; atomic_numbers: number[] };
  hpkot: {
    path: [string, string][];
    point_coords: Record<string, Vec3>;
    reciprocal_primitive_lattice_rows_with_2pi: Mat3;
  };
  setyawan_curtarolo: {
    path: string[][];
    point_coords: Record<string, Vec3>;
    reciprocal_primitive_lattice_rows_with_2pi: Mat3;
  };
}
const S = kp.structures as unknown as Record<string, Golden>;

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

const structureOf = (g: Golden): Structure => ({
  lattice: g.input.lattice_rows,
  species: g.input.atomic_numbers.map((z) => symbolOf(z)!),
  frac: g.input.frac_coords,
});

/** A result-shaped object made only from golden numbers, so the table is checked without our k-path code. */
const fromGolden = (
  convention: 'HPKOT' | 'Setyawan-Curtarolo',
  pairs: [string, string][],
  coords: Record<string, Vec3>,
  b: Mat3,
): KPathAny =>
  ({ convention, path: pairs, pointCoords: coords, reciprocalPrimitive: b }) as unknown as KPathAny;

const goldenPairs = (chains: string[][]): [string, string][] =>
  chains.flatMap((c) => c.slice(1).map((l, i) => [c[i]!, l] as [string, string]));

/** |(k2 - k1) B| written out with plain arithmetic. */
const lengthBy = (k1: Vec3, k2: Vec3, b: Mat3): number => {
  const d = [k2[0] - k1[0], k2[1] - k1[1], k2[2] - k1[2]];
  const x = [0, 1, 2].map((j) => d[0]! * b[0]![j]! + d[1]! * b[1]![j]! + d[2]! * b[2]![j]!);
  return Math.sqrt(x[0]! ** 2 + x[1]! ** 2 + x[2]! ** 2);
};

describe('segment lengths equal |(k_end - k_start) B| (golden reciprocal lattices, 1e-9)', () => {
  for (const name of Object.keys(S)) {
    it(`${name}, HPKOT and Setyawan-Curtarolo`, () => {
      const h = S[name]!.hpkot;
      const th = buildPathTable(
        fromGolden('HPKOT', h.path, h.point_coords, h.reciprocal_primitive_lattice_rows_with_2pi),
        { mode: 'count', n: 10 },
      );
      expect(th.segments.length).toBe(h.path.length);
      th.segments.forEach((s, i) => {
        const [a, c] = h.path[i]!;
        expect(
          Math.abs(
            s.length -
              lengthBy(h.point_coords[a]!, h.point_coords[c]!, h.reciprocal_primitive_lattice_rows_with_2pi),
          ),
        ).toBeLessThan(1e-9);
      });
      const sc = S[name]!.setyawan_curtarolo;
      const pairs = goldenPairs(sc.path);
      const ts = buildPathTable(
        fromGolden(
          'Setyawan-Curtarolo',
          pairs,
          sc.point_coords,
          sc.reciprocal_primitive_lattice_rows_with_2pi,
        ),
        { mode: 'count', n: 10 },
      );
      ts.segments.forEach((s, i) => {
        const [a, c] = pairs[i]!;
        expect(
          Math.abs(
            s.length -
              lengthBy(
                sc.point_coords[a]!,
                sc.point_coords[c]!,
                sc.reciprocal_primitive_lattice_rows_with_2pi,
              ),
          ),
        ).toBeLessThan(1e-9);
      });
    });
  }
});

describe('fcc Cu, HPKOT, 20 points per segment', () => {
  const g = S['fcc_Cu']!;
  let header: { spacegroup: string; lattice: string };
  let t: PathTable;
  beforeAll(() => {
    const r = hpkotPath(analyzeWith(api, structureOf(g), { symprec: 1e-3, setting: 'Spglib' }));
    header = { spacegroup: r.spacegroupInternational, lattice: r.bravaisLatticeExtended };
    t = buildPathTable(r, { mode: 'count', n: 20 });
  });

  it('KPOINTS equals the hand-written file', () => {
    const expected = fs.readFileSync(
      new URL('./__fixtures__/KPOINTS.fcc_Cu.hpkot.20', import.meta.url),
      'utf8',
    );
    expect(writeKpoints(t, header)).toBe(expected);
  });

  it('KPATH.in and KPOINTS_OPT hold the same path, only the first line differs', () => {
    const k = writeKpoints(t, header).split('\n');
    for (const text of [writeKpathIn(t, header), writeKpointsOpt(t, header)]) {
      const lines = text.split('\n');
      expect(lines.slice(1)).toEqual(k.slice(1));
      expect(lines[0]).toContain('HPKOT');
    }
    expect(writeKpathIn(t, header).split('\n')[0]).toContain('KPATH.in');
    expect(writeKpointsOpt(t, header).split('\n')[0]).toContain('KPOINTS_OPT');
  });

  it('table totals', () => {
    expect(t.segments.length).toBe(6);
    expect(t.totalPoints).toBe(120);
    expect(t.countsDiffer).toBe(false);
    expect(t.segments.map((s) => s.continuous)).toEqual([true, true, false, true, true, true]);
    // Gamma-X is |X B| with X = (1/2, 0, 1/2) in the basis of the golden reciprocal lattice
    expect(t.segments[0]!.length).toBeCloseTo(
      lengthBy([0, 0, 0], [0.5, 0, 0.5], g.hpkot.reciprocal_primitive_lattice_rows_with_2pi),
      9,
    );
  });
});

describe('points per segment', () => {
  const h = S['fcc_Cu']!.hpkot;
  const r = fromGolden('HPKOT', h.path, h.point_coords, h.reciprocal_primitive_lattice_rows_with_2pi);

  it('a count is kept and clamped to 2 to 1000', () => {
    expect(buildPathTable(r, { mode: 'count', n: 7 }).segments.every((s) => s.points === 7)).toBe(true);
    expect(buildPathTable(r, { mode: 'count', n: 0 }).segments[0]!.points).toBe(2);
    expect(buildPathTable(r, { mode: 'count', n: 5000 }).segments[0]!.points).toBe(1000);
  });

  it('density mode gives ceil(length * density) points, at least 2', () => {
    const t = buildPathTable(r, { mode: 'density', perInvA: 10 });
    t.segments.forEach((s) => expect(s.points).toBe(Math.max(2, Math.ceil(s.length * 10))));
    expect(t.countsDiffer).toBe(true);
    expect(t.lineModeCount).toBe(Math.max(...t.segments.map((s) => s.points)));
  });

  it('a hand-set count wins and is flagged', () => {
    const t = buildPathTable(r, { mode: 'count', n: 10 }, { 2: 30 });
    expect(t.segments[2]!.points).toBe(30);
    expect(t.segments[2]!.overridden).toBe(true);
    expect(t.segments[1]!.overridden).toBe(false);
    expect(t.lineModeCount).toBe(30);
    expect(t.totalPoints).toBe(5 * 10 + 30);
    expect(writeKpoints(t, { spacegroup: 'Fm-3m', lattice: 'cF2' }).split('\n')[1]).toBe('30');
  });
});

describe('coordinate list', () => {
  const h = S['fcc_Cu']!.hpkot;
  const b = h.reciprocal_primitive_lattice_rows_with_2pi;
  const r = fromGolden('HPKOT', h.path, h.point_coords, b);
  const t = buildPathTable(r, { mode: 'count', n: 5 });
  const pts = pathPoints(t);

  it('has every point, labelled only at segment ends', () => {
    expect(pts.length).toBe(30);
    expect(pts[0]!.label).toBe('GAMMA');
    expect(pts[1]!.label).toBeUndefined();
    expect(pts[4]!.label).toBe('X');
  });

  it('distance grows along a segment and does not grow across a jump', () => {
    const lx = t.segments[0]!.length;
    expect(pts[0]!.distance).toBe(0);
    expect(pts[4]!.distance).toBeCloseTo(lx, 12);
    // segment 1 (X-U) starts where segment 0 ended
    expect(pts[5]!.distance).toBeCloseTo(lx, 12);
    // segment 2 (K-Gamma) starts at a jump: it continues from the end of X-U
    const end1 = lx + t.segments[1]!.length;
    expect(pts[9]!.distance).toBeCloseTo(end1, 12);
    expect(pts[10]!.distance).toBeCloseTo(end1, 12);
  });

  it('Cartesian coordinates are frac times B', () => {
    const p = pts[4]!; // X = (1/2, 0, 1/2)
    for (let j = 0; j < 3; j++) expect(p.cart[j]!).toBeCloseTo(0.5 * b[0]![j]! + 0.5 * b[2]![j]!, 12);
  });

  it('CSV and JSON carry the same points', () => {
    const lines = writePathCsv(t).trim().split('\n');
    expect(lines[0]).toBe('index,segment,label,k1,k2,k3,kx,ky,kz,distance');
    expect(lines.length).toBe(31);
    expect(lines[1]!.startsWith('0,0,GAMMA,0.0000000000,0.0000000000,0.0000000000,')).toBe(true);
    const j = JSON.parse(writePathJson(t, { spacegroup: 'Fm-3m', lattice: 'cF2' })) as {
      points: { label: string | null }[];
      segments: unknown[];
      convention: string;
    };
    expect(j.points.length).toBe(30);
    expect(j.segments.length).toBe(6);
    expect(j.convention).toBe('HPKOT');
    expect(j.points[1]!.label).toBeNull();
  });
});

describe('labels in files', () => {
  it('are ASCII and without backslashes', () => {
    expect(fileLabel('GAMMA')).toBe('GAMMA');
    expect(fileLabel('\\Gamma')).toBe('GAMMA');
    expect(fileLabel('\\Sigma_1')).toBe('SIGMA_1');
    expect(fileLabel('A_1')).toBe('A_1');
    expect(fileLabel("H_2'")).toBe("H_2'");
  });
});

describe('hcp Mg in both conventions', () => {
  it('the convention name is the first thing in the KPOINTS comment line', () => {
    const sym = analyzeWith(api, structureOf(S['hcp_Mg']!), { symprec: 1e-3, setting: 'Spglib' });
    const rh = hpkotPath(sym);
    const rs = setyawanPath(sym);
    const th = buildPathTable(rh, { mode: 'count', n: 40 });
    const ts = buildPathTable(rs, { mode: 'count', n: 40 });
    const first = (t: typeof th, hd: { spacegroup: string; lattice: string }) =>
      writeKpoints(t, hd).split('\n')[0]!;
    expect(first(th, { spacegroup: rh.spacegroupInternational, lattice: rh.bravaisLatticeExtended })).toMatch(
      /^HPKOT k-path for P6_3\/mmc \(hP2\), 40 points per segment$/,
    );
    expect(first(ts, { spacegroup: rs.spacegroupInternational, lattice: rs.variant })).toMatch(
      /^Setyawan-Curtarolo k-path for .* \(HEX\), 40 points per segment$/,
    );
    expect(writeKpoints(ts, { spacegroup: 'x', lattice: 'HEX' })).not.toMatch(/\\/);
  });
});

describe('route notes', () => {
  it('say which file goes where', () => {
    expect(ROUTE_NOTES.routeA).toContain('KPOINTS_OPT');
    expect(ROUTE_NOTES.routeB).toContain('ICHARG = 11');
  });
  it.todo(
    'Q-039: the exact layout of the KPATH.in that VASPKIT writes is unverified; compare once the author supplies one',
  );
});
