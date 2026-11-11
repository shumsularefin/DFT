// Simulated learners for testing the policy only (M6.3). Never used in the UI.
// Model (a design choice, D-053): each concept is truly known or not. A known concept is answered right
// with probability 1 - slip, an unknown one with probability guess. After practising a concept, or reading
// its topic, an unknown concept becomes known with probability pLearn (pRead), but only when all its
// prerequisites are known. Hidden parameters are drawn per learner.
import type { Graph } from './graph';
import { choose, creditRetention, reward, updateArm, type ArmId, type BankItem } from './policy';
import { mulberry32 } from './random';
import { applyAnswer, emptyState, newConcept, type LearnerState } from './state';

const DAY = 86_400_000;

export interface SimLearner {
  known: Set<string>;
  slip: number;
  guess: number;
  pLearn: number;
  pRead: number;
}

export function makeLearner(rng: () => number): SimLearner {
  return {
    known: new Set(),
    slip: 0.05 + 0.15 * rng(),
    guess: 0.1 + 0.25 * rng(),
    pLearn: 0.05 + 0.2 * rng(),
    pRead: 0.2 + 0.3 * rng(),
  };
}

function practise(l: SimLearner, g: Graph, concepts: string[], p: number, rng: () => number) {
  for (const c of concepts) {
    if (l.known.has(c)) continue;
    const ready = (g.byId.get(c)?.prerequisites ?? []).every((x) => l.known.has(x) || !g.byId.has(x));
    if (ready && rng() < p) l.known.add(c);
  }
}

const answerRight = (l: SimLearner, q: BankItem, rng: () => number) =>
  q.concepts.every((c) => rng() < (l.known.has(c) ? 1 - l.slip : l.guess));

export type PolicyName = 'thompson' | 'random';

/**
 * Runs one learner for `steps` actions (one action per hour of simulated time) and returns the fraction of
 * the bank's concepts the learner truly knows at the end.
 */
export function runLearner(
  policy: PolicyName,
  g: Graph,
  bank: BankItem[],
  steps: number,
  seed: number,
): number {
  const rng = mulberry32(seed);
  const pick = mulberry32(seed ^ 0x9e3779b9);
  const l = makeLearner(rng);
  let s: LearnerState = emptyState();
  let now = Date.UTC(2026, 0, 1);
  let wrongInARow = 0;
  for (let i = 0; i < steps; i++) {
    now += DAY / 24;
    if (policy === 'random') {
      const q = bank[Math.floor(pick() * bank.length)]!;
      const ok = answerRight(l, q, rng);
      s = applyAnswer(s, {
        questionId: q.id,
        concepts: q.concepts,
        difficulty: q.difficulty,
        correct: ok,
        hints: 0,
        now,
      });
      practise(l, g, q.concepts, l.pLearn, rng);
      continue;
    }
    const c = choose(s, { now, bank, graph: g, wrongInARow }, pick);
    if (!c) break;
    if (c.arm === 'suggest-topic') {
      practise(l, g, [c.conceptId], l.pRead, rng);
      // Reading has no graded answer: a neutral reward, and the concept is marked visited so the same
      // topic is not suggested again.
      s = updateArm(s, 'suggest-topic', 0.5);
      s = { ...s, concepts: { ...s.concepts, [c.conceptId]: { ...newConcept(), lastSeen: now } } };
      continue;
    }
    const q = bank.find((x) => x.id === c.questionId)!;
    const before = s.questions[q.id];
    const ok = answerRight(l, q, rng);
    s = applyAnswer(s, {
      questionId: q.id,
      concepts: q.concepts,
      difficulty: q.difficulty,
      correct: ok,
      hints: 0,
      now,
      arm: c.arm,
    });
    s = updateArm(s, c.arm as ArmId, reward({ correct: ok, hintsUsed: 0, maxHints: 2 }));
    if (c.arm === 'review-due' && ok && before && now >= before.due)
      s = creditRetention(s, before.introducedBy as ArmId);
    wrongInARow = ok ? 0 : wrongInARow + 1;
    practise(l, g, q.concepts, l.pLearn, rng);
  }
  const all = [...new Set(bank.flatMap((q) => q.concepts))];
  return all.filter((c) => l.known.has(c)).length / all.length;
}

export function simulate(
  policy: PolicyName,
  g: Graph,
  bank: BankItem[],
  learners: number,
  steps: number,
  seed: number,
): number {
  let sum = 0;
  for (let i = 0; i < learners; i++) sum += runLearner(policy, g, bank, steps, seed * 100_003 + i);
  return sum / learners;
}
