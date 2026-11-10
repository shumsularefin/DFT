/**
 * Simulated learners for testing the policy only. Never used in the UI.
 * Hidden knowledge follows BKT with hidden parameters (S-037). The world (a six concept
 * diamond graph, eight questions each) and the "practising without the basics learns at a
 * quarter of the rate" rule are simulator assumptions chosen for this test (D-053), not
 * findings about real learners.
 * @source S-037, S-039
 */
import { DEFAULT_BKT, update as bktUpdate } from './bkt';
import { updateElo } from './irt';
import {
  ARMS,
  choose,
  newBandit,
  pickQuestion,
  reward,
  updateBandit,
  delayedRetentionUpdate,
  type Arm,
  type BanditState,
  type PolicyContext,
  type PolicyQuestion,
} from './policy';
import { mulberry32, type Rng } from './random';
import { INITIAL_SM2, qualityFromOutcome, review, type Sm2State } from './sm2';

export const WORLD_PREREQS: Record<string, string[]> = {
  c1: [],
  c2: ['c1'],
  c3: ['c1'],
  c4: ['c2', 'c3'],
  c5: ['c4'],
  c6: ['c4'],
};
const CONCEPTS = Object.keys(WORLD_PREREQS);
export const WORLD_QUESTIONS: PolicyQuestion[] = CONCEPTS.flatMap((c) =>
  Array.from({ length: 8 }, (_, i) => ({ id: `${c}-${i}`, concept: c, b: -1.75 + i * 0.5 })),
);

export type PolicyKind = 'bandit' | 'random';
export const STEPS_PER_DAY = 5;
const MAX_HINTS = 2;

interface Hidden {
  pT: number;
  pS: number;
  pG: number;
  known: boolean;
}

function makeLearner(rng: Rng): Record<string, Hidden> {
  const u = (lo: number, hi: number) => lo + (hi - lo) * rng();
  const out: Record<string, Hidden> = {};
  for (const c of CONCEPTS) {
    out[c] = { pT: u(0.08, 0.2), pS: u(0.05, 0.15), pG: u(0.1, 0.25), known: rng() < u(0.05, 0.25) };
  }
  return out;
}

/** Returns the fraction of concepts the simulated learner truly knows at the end. */
export function simulateLearner(kind: PolicyKind, seed: number, steps = 200): number {
  const hidden = makeLearner(mulberry32(seed * 7919 + 13));
  const rng = mulberry32(seed * 104729 + (kind === 'bandit' ? 1 : 2));
  let bandit: BanditState = newBandit();
  const pL: Record<string, number> = {};
  const sm2: Record<string, Sm2State & { due: number }> = {};
  const origin: Record<string, Arm> = {};
  const seen = new Set<string>();
  let theta = 0;
  let wrongStreak = 0;
  let last: { q: PolicyQuestion; wrong: boolean; hints: number } | null = null;

  for (let step = 0; step < steps; step++) {
    const day = Math.floor(step / STEPS_PER_DAY);
    let q: PolicyQuestion | undefined;
    let arm: Arm | null = null;
    let hinted = 0;

    if (kind === 'random') {
      q = WORLD_QUESTIONS[Math.floor(rng() * WORLD_QUESTIONS.length)];
    } else {
      const unseen = WORLD_QUESTIONS.filter((x) => !seen.has(x.id));
      const ctx: PolicyContext = {
        theta,
        mastery: pL,
        prerequisites: WORLD_PREREQS,
        candidates: unseen.length > 0 ? unseen : WORLD_QUESTIONS,
        dueReviews: Object.entries(sm2)
          .filter(([, s]) => s.due <= day)
          .map(([id, s]) => ({ id, overdueDays: day - s.due })),
        consecutiveWrong: wrongStreak,
        hintAvailable: !!last && last.wrong && last.hints < MAX_HINTS,
        readyConcepts: CONCEPTS.filter(
          (c) => (pL[c] ?? 0.3) < 0.95 && WORLD_PREREQS[c]!.every((p) => (pL[p] ?? 0.3) >= 0.8),
        ),
      };
      const d = choose(bandit, ctx, rng);
      arm = d.arm;
      if (arm === 'hint' && last) {
        q = last.q;
        hinted = last.hints + 1;
      } else if (arm === 'suggest-topic') {
        q = pickQuestion({ ...ctx, candidates: ctx.candidates.filter((x) => x.concept === d.topic) }, 0.7);
      } else if (d.questionId) {
        q = WORLD_QUESTIONS.find((x) => x.id === d.questionId);
      }
    }
    if (!q) continue;

    const h = hidden[q.concept]!;
    const pAnswer = h.known ? 1 - h.pS : Math.min(0.95, h.pG + (hinted > 0 ? 0.2 : 0));
    const correct = rng() < pAnswer;
    const basics = WORLD_PREREQS[q.concept]!.every((p) => hidden[p]!.known);
    if (!h.known && rng() < (basics ? h.pT : h.pT * 0.25)) h.known = true;

    if (kind === 'bandit' && arm) {
      pL[q.concept] = bktUpdate(pL[q.concept] ?? DEFAULT_BKT.pL0, correct, DEFAULT_BKT);
      theta = updateElo(theta, q.b, correct).theta;
      wrongStreak = correct ? 0 : wrongStreak + 1;
      const prev = sm2[q.id];
      const wasDue = !!prev && prev.due <= day;
      const next = review(prev ?? INITIAL_SM2, qualityFromOutcome(correct, hinted));
      sm2[q.id] = { ...next, due: day + next.interval };
      seen.add(q.id);
      if (!origin[q.id]) origin[q.id] = arm;
      bandit = updateBandit(
        bandit,
        arm,
        reward({ correct, hintsUsed: hinted, maxHints: MAX_HINTS, speedScore: 0.5, retentionBonus: 0 }),
      );
      if (wasDue && arm === 'review-due') bandit = delayedRetentionUpdate(bandit, origin[q.id]!, correct);
      last = { q, wrong: !correct, hints: hinted };
    }
  }
  return CONCEPTS.filter((c) => hidden[c]!.known).length / CONCEPTS.length;
}

export interface SeedResult {
  seed: number;
  policy: number;
  random: number;
}

/** Mean final true mastery over `learners` simulated learners, for both policies. */
export function compare(seed: number, learners = 50, steps = 200): SeedResult {
  let p = 0;
  let r = 0;
  for (let i = 0; i < learners; i++) {
    const s = seed * 1000 + i;
    p += simulateLearner('bandit', s, steps);
    r += simulateLearner('random', s, steps);
  }
  return { seed, policy: p / learners, random: r / learners };
}

export { ARMS };
