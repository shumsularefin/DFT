// How VASP splits its MPI ranks with KPAR and NCORE (M16.9): a pure mapping, used by the job-script stage.
// @source S-019 (VASP wiki: KPAR, NCORE, NPAR), S-041 (Field Handbook: KPAR divides the ranks, NCORE ranks share a band)
// Rules: KPAR k-point groups of ranks / KPAR ranks each (KPAR must divide the ranks); inside a group, NCORE ranks work on
// one band, so there are NPAR = (ranks / KPAR) / NCORE band groups (S-019: NCORE = ranks per k-group / NPAR).
// The k-points are dealt to the groups in turn, k-point i (from 0) to group i mod KPAR, so the run needs
// ceil(NKPTS / KPAR) rounds and the last round leaves KPAR * rounds - NKPTS group slots idle.
// Which physical cores form a group is a drawing convention here (consecutive ranks); VASP's layout follows the launcher.

export interface ParallelSplit {
  ranks: number;
  kpar: number;
  ncore: number;
  /** False when KPAR does not divide the ranks or NCORE does not divide the ranks of one k-group. */
  valid: boolean;
  /** One plain sentence: why the split is invalid, or empty. */
  problem: string;
  /** Ranks in one k-point group (ranks / KPAR), or 0 when KPAR does not divide the ranks. */
  ranksPerKGroup: number;
  /** Band groups inside one k-point group (NPAR), or 0 when the split is not even. */
  npar: number;
  /** Irreducible k-points to share out. */
  nkpts: number;
  /** k-points computed by each group (length KPAR). */
  kpointsPerGroup: number[];
  /** Rounds of k-points: ceil(NKPTS / KPAR). */
  rounds: number;
  /** Group slots left idle in the last round. */
  idleSlots: number;
}

const posInt = (n: number) => Number.isInteger(n) && n >= 1;

/** The split of `ranks` MPI ranks for the given KPAR, NCORE and number of irreducible k-points. */
export function parallelSplit(ranks: number, kpar: number, ncore: number, nkpts: number): ParallelSplit {
  if (![ranks, kpar, ncore, nkpts].every(posInt))
    throw new RangeError('Ranks, KPAR, NCORE and the number of k-points must be positive integers.');
  let problem = '';
  let ranksPerKGroup = 0;
  let npar = 0;
  if (kpar > ranks) problem = `KPAR = ${kpar} is larger than the ${ranks} ranks.`;
  else if (ranks % kpar)
    problem = `KPAR = ${kpar} does not divide the ${ranks} ranks, so the k-point groups would differ in size.`;
  else {
    ranksPerKGroup = ranks / kpar;
    if (ncore > ranksPerKGroup)
      problem = `NCORE = ${ncore} is larger than the ${ranksPerKGroup} ranks of one k-point group.`;
    else if (ranksPerKGroup % ncore)
      problem = `NCORE = ${ncore} does not divide the ${ranksPerKGroup} ranks of one k-point group, so the band groups would differ in size.`;
    else npar = ranksPerKGroup / ncore;
  }
  const kpointsPerGroup = Array.from(
    { length: kpar },
    (_, g) => Math.floor(nkpts / kpar) + (g < nkpts % kpar ? 1 : 0),
  );
  const rounds = Math.ceil(nkpts / kpar);
  return {
    ranks,
    kpar,
    ncore,
    valid: problem === '',
    problem,
    ranksPerKGroup,
    npar,
    nkpts,
    kpointsPerGroup,
    rounds,
    idleSlots: rounds * kpar - nkpts,
  };
}

/** The k-point group and band group of a rank under the consecutive-rank drawing convention (valid splits only). */
export function groupsOfRank(s: ParallelSplit, rank: number): { kGroup: number; bandGroup: number } {
  if (!s.valid) throw new RangeError('The split is not valid.');
  const kGroup = Math.floor(rank / s.ranksPerKGroup);
  const bandGroup = Math.floor((rank % s.ranksPerKGroup) / s.ncore);
  return { kGroup, bandGroup };
}

/** The k-points (0-based, in file order) that one group computes, round by round. */
export const kpointsOfGroup = (s: ParallelSplit, g: number): number[] =>
  Array.from({ length: s.kpointsPerGroup[g] ?? 0 }, (_, r) => g + r * s.kpar);
