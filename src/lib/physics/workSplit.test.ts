// Golden tests of the work-split bookkeeping: the memory estimate of the performance topic, the NBANDS rounding (S-019)
// and Amdahl's law (S-165).
import { describe, expect, it } from 'vitest';
import { amdahlSpeedup, roundBands, splitWork, toySpeedup, wavefunctionBytes } from './workSplit';

const page = { npw: 20000, nbands: 500, nk: 10, nspin: 2 };

describe('work split', () => {
  it('reproduces the worked memory example of the topic: 3.2e9 bytes', () => {
    expect(wavefunctionBytes(20000, 500, 10, 2)).toBe(3.2e9);
  });

  it('rounds NBANDS up to a multiple of the band groups', () => {
    expect(roundBands(500, 4)).toBe(500);
    expect(roundBands(500, 48)).toBe(528);
    expect(roundBands(32, 128)).toBe(128);
  });

  it("Amdahl's law: P with no serial part, 1 when all is serial, the closed form between", () => {
    expect(amdahlSpeedup(0, 16)).toBe(16);
    expect(amdahlSpeedup(1, 16)).toBe(1);
    expect(amdahlSpeedup(0.05, 16)).toBeCloseTo(1 / (0.05 + 0.95 / 16), 14);
  });

  it('splits ranks into k groups, band groups and NCORE, and hands out every k-point once', () => {
    const l = splitWork({ ...page, ranks: 32, kpar: 4, ncore: 4 });
    expect(l.valid).toBe(true);
    expect(l.groupRanks).toBe(8);
    expect(l.npar).toBe(2);
    expect(l.kOfGroup.flat().sort((a, b) => a - b)).toEqual([...Array(10).keys()]);
    expect(l.kOfGroup.map((g) => g.length)).toEqual([3, 3, 2, 2]);
  });

  it('memory per rank times ranks is the total when everything divides evenly', () => {
    const l = splitWork({ ...page, ranks: 16, kpar: 1, ncore: 4 });
    expect(l.perRankBytes).toBe(2e8);
    expect(l.perRankBytes * 16).toBe(l.totalBytes);
  });

  it('flags layouts that do not divide', () => {
    expect(splitWork({ ...page, ranks: 16, kpar: 8, ncore: 4 }).valid).toBe(false);
    expect(splitWork({ ...page, ranks: 24, kpar: 1, ncore: 16 }).valid).toBe(false);
  });

  it('counts idle k groups when there are fewer k-points than groups', () => {
    const l = splitWork({ npw: 1000, nbands: 16, nk: 2, nspin: 1, ranks: 16, kpar: 4, ncore: 1 });
    expect(l.idleGroups).toBe(2);
  });

  it('the toy speed-up is 1 on one rank and ideal with no serial part and even division', () => {
    const w1 = { ...page, ranks: 1, kpar: 1, ncore: 1 };
    const t1 = toySpeedup(w1, splitWork(w1), 0.1);
    expect(t1.speedup).toBeCloseTo(1, 14);
    expect(t1.efficiency).toBeCloseTo(1, 14);
    const w = { ...page, ranks: 20, kpar: 10, ncore: 2 };
    expect(toySpeedup(w, splitWork(w), 0).speedup).toBeCloseTo(20, 12);
  });
});
