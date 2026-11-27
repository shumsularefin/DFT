// How a plane-wave run is split over MPI ranks (M16, performance and parallelisation topic). A toy bookkeeping model:
// the wavefunction array (plane waves x bands x k-points x spins) is cut into blocks, first by k-point groups (KPAR),
// then by band groups (NPAR = ranks per k group / NCORE), then the plane waves of each band over the NCORE ranks of a
// band group. It counts blocks and bytes; it does not model communication, so NCORE's real benefit (fewer messages
// across nodes) is not in it.
// @source S-041 (the three levels KPAR, bands, NCORE and NPAR = ranks / NCORE), S-019 (NBANDS is rounded up so the
// bands divide evenly among the band groups), S-165 (Amdahl's law for the toy speed-up)

/** Bytes of one complex number in double precision. */
export const BYTES_PER_COEFFICIENT = 16;

/** Wavefunction memory: 16 bytes x plane waves x bands x k-points x spins (the estimate of the performance topic). */
export function wavefunctionBytes(npw: number, nbands: number, nk: number, nspin: number): number {
  return BYTES_PER_COEFFICIENT * npw * nbands * nk * nspin;
}

/** NBANDS rounded up to a multiple of the number of band groups. */
export function roundBands(nbands: number, npar: number): number {
  return Math.ceil(nbands / npar) * npar;
}

/** Amdahl's law: speed-up on p workers when a fraction s of the work stays serial (S-165). */
export function amdahlSpeedup(s: number, p: number): number {
  return 1 / (s + (1 - s) / p);
}

export interface WorkInput {
  npw: number;
  nbands: number;
  nk: number;
  nspin: number;
  ranks: number;
  kpar: number;
  ncore: number;
}

export interface WorkLayout {
  valid: boolean;
  /** Why the layout is not valid, when it is not. */
  problem?: string;
  groupRanks: number;
  npar: number;
  nbandsUsed: number;
  bandsPerGroup: number;
  /** Plane waves held per rank for one band (the largest slice). */
  pwPerRank: number;
  /** The k-points (0-based) handed to each k group, round robin. */
  kOfGroup: number[][];
  idleGroups: number;
  /** Wavefunction bytes of the whole run with the rounded NBANDS. */
  totalBytes: number;
  /** Largest wavefunction bytes on one rank. */
  perRankBytes: number;
}

/** Split the wavefunction work over ranks. Integer checks follow the rules of the topic: ranks / KPAR and then / NCORE. */
export function splitWork(w: WorkInput): WorkLayout {
  const kOfGroup: number[][] = Array.from({ length: Math.max(1, w.kpar) }, () => []);
  const bad = (problem: string): WorkLayout => ({
    valid: false,
    problem,
    groupRanks: 0,
    npar: 0,
    nbandsUsed: w.nbands,
    bandsPerGroup: 0,
    pwPerRank: 0,
    kOfGroup,
    idleGroups: 0,
    totalBytes: wavefunctionBytes(w.npw, w.nbands, w.nk, w.nspin),
    perRankBytes: 0,
  });
  if (w.ranks % w.kpar !== 0) return bad(`${w.ranks} ranks cannot be split into ${w.kpar} k groups`);
  const groupRanks = w.ranks / w.kpar;
  if (groupRanks % w.ncore !== 0)
    return bad(`the ${groupRanks} ranks of a k group cannot be split into band groups of NCORE = ${w.ncore}`);
  const npar = groupRanks / w.ncore;
  for (let k = 0; k < w.nk; k++) kOfGroup[k % w.kpar]!.push(k);
  const nbandsUsed = roundBands(w.nbands, npar);
  const bandsPerGroup = nbandsUsed / npar;
  const pwPerRank = Math.ceil(w.npw / w.ncore);
  const maxK = Math.max(...kOfGroup.map((g) => g.length));
  return {
    valid: true,
    groupRanks,
    npar,
    nbandsUsed,
    bandsPerGroup,
    pwPerRank,
    kOfGroup,
    idleGroups: kOfGroup.filter((g) => g.length === 0).length,
    totalBytes: wavefunctionBytes(w.npw, nbandsUsed, w.nk, w.nspin),
    perRankBytes: BYTES_PER_COEFFICIENT * pwPerRank * bandsPerGroup * maxK * w.nspin,
  };
}

/**
 * Toy time on all ranks relative to one rank: the busiest k group sets the pace (k groups hardly talk, so that level
 * is ideal apart from uneven division), padded bands are extra work, and inside a k group Amdahl's law applies with a
 * serial fraction s. Returns the speed-up and the parallel efficiency (speed-up / ranks).
 */
export function toySpeedup(
  w: WorkInput,
  l: WorkLayout,
  s: number,
): { relTime: number; speedup: number; efficiency: number } {
  if (!l.valid) return { relTime: NaN, speedup: NaN, efficiency: NaN };
  const maxK = Math.max(...l.kOfGroup.map((g) => g.length));
  const relTime = (maxK / w.nk) * (l.nbandsUsed / w.nbands) * (1 / amdahlSpeedup(s, l.groupRanks));
  return { relTime, speedup: 1 / relTime, efficiency: 1 / relTime / w.ranks };
}
