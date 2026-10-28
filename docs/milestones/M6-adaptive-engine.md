# M6 Adaptive learning engine

An on-device adaptive tutor (D-013): Bayesian knowledge tracing (BKT) and an Elo/IRT difficulty estimate per concept, SM-2 spaced repetition, and Thompson sampling to choose what comes next. It is a set of transparent heuristics, not trained reinforcement learning, and the UI says so. All randomness goes through a seeded PRNG so every test is deterministic. Every worked number below was recomputed in planning; do not obtain test expectations by running your own code.

## M6.1 Concept graph and question bank

**Goal**: A validated concept dependency graph covering modules 1 to 11 and a schema-checked question bank that every "Check your understanding" section uses.
**Depends on**: M2.4
**Size**: M
**Sources**: S-037
**Deliverables**:
- `src/data/concepts.json`: at least 70 concepts (`id`, `label`, `module`, `summary`, `prerequisites: id[]`, `level`), covering every topic id used in modules 1 to 3 front matter and the planned topics of modules 4 to 11 (from SPEC section 5.1). Concepts introduced later get `status: 'planned'` and are hidden in the UI until a topic uses them.
- `src/lib/learning/graph.ts`: load, validate (no unknown ids, no cycles, every concept reachable from a root), topological order, ancestors/descendants, "ready to learn" given mastery.
- `src/lib/learning/questions.ts`: Zod schema (via `astro/zod`) accepting exactly the shape in `docs/CONTENT_GUIDE.md` section 7 (`single`, `multi`, `numeric` with `answer` and `tolerance`, `order`) plus optional fields this stage adds (`a` discrimination default 1, `timeLimitSec` must stay undefined: no timers), loader, and grading functions (`grade(question, response) -> { correct, partial? }`).
- `scripts/lint-questions.mjs` (added to `npm run lint:content`): unique ids; every option has `why`; at least two hints; `sources` exist in the register; concepts exist; `numeric` questions have a tolerance; every `<Check ids>` in MDX points to existing question ids; per published concept at least four questions (report coverage per module).
- Migration of the module 1 to 3 question files written in M2 (they must already satisfy the shape; fix any that do not, and list changes in the report).
**Tasks**: schema and graph first with tests; lint script; migration; coverage table in the report.
**Tests and reference values**:
- Graph: a fixture with a cycle is rejected with the cycle path in the message; topological order respects every edge; the real graph is acyclic.
- Grading: single, multi (exact set), numeric within tolerance (inclusive), order (exact sequence); malformed responses are rejected, not graded as wrong.
**Done when**:
- [ ] Concept graph and question bank validate in `npm run verify`; modules 1 to 3 have at least four questions per concept.
- [ ] The report contains the concept graph rendered as a list by module and the coverage table.
**Not in this stage**: models, bandit, UI.

## M6.2 Mastery and spacing models

**Goal**: Pure, tested implementations of BKT, the Elo/IRT difficulty update and SM-2 scheduling.
**Depends on**: M6.1
**Size**: M
**Sources**: S-037, S-038
**Deliverables**:
- `src/lib/learning/bkt.ts`: parameters per concept `{ pL0, pT, pS, pG }` with defaults `pL0 = 0.3, pT = 0.1, pS = 0.1, pG = 0.2` (configurable; record them as a convention in D-nnn); `update(pL, correct)`: posterior `pL*(1-pS) / (pL*(1-pS) + (1-pL)*pG)` if correct, `pL*pS / (pL*pS + (1-pL)*(1-pG))` if wrong, then learning transition `post + (1 - post)*pT`; `isMastered(pL)` with threshold 0.95 (the conventional BKT mastery criterion; label it a convention).
- `src/lib/learning/irt.ts`: Rasch/Elo: `pCorrect(theta, b) = 1 / (1 + exp(-(theta - b)))`; after a response `theta += K (y - p)`, `b -= K (y - p)` with `K = 0.4` for the learner and `K_b = 0.05` for item difficulty (items move slowly; record as convention).
- `src/lib/learning/sm2.ts`: SM-2 exactly as specified by Wozniak (S-038), with this project's precise conventions: quality `q` in 0..5; if `q >= 3`: repetition `n` increases by 1 and the interval is `1` day for `n = 1`, `6` for `n = 2`, otherwise `round(I_prev * EF)` using the **EF before this review's update**; then `EF = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))`, floored at 1.3. If `q < 3`: `n = 0`, interval `1` day, **EF unchanged**. Mapping from quiz outcomes to `q`: correct without hints 5, correct with one hint 4, correct with more hints 3, wrong 2, wrong and gave up 1 (record as convention).
- `src/lib/learning/state.ts`: the learner state (per concept: `pL`, `theta`, attempts, last seen; per question: `b`, SM-2 `n`, `I`, `EF`, `due`), versioned, serializable, size-capped (prune history beyond 200 events per concept), merge function for sync (M6.5).
**Tasks**: 1. `bkt.ts` with the worked example as the first test. 2. `irt.ts`. 3. `sm2.ts` with the seven-step sequence. 4. `state.ts` (serialization, size cap, merge) with property tests. 5. Record the conventions (BKT defaults, mastery threshold, K values, quality mapping) as D entries.
**Tests and reference values** (hand-computed in planning):
- BKT with `pL0 = 0.3, pT = 0.1, pS = 0.1, pG = 0.2`: correct gives posterior 0.658537 and after transition 0.692683; wrong gives posterior 0.050847 and after transition 0.145763; two corrects in a row end at 0.919231 (first update 0.692683, then posterior 0.910256, then 0.919231). Tolerance 1e-6.
- IRT/Elo: `theta = 0, b = 0`, correct, `K = 0.4`: p = 0.5, new theta 0.2; with `K_b = 0.05`, new b -0.025.
- SM-2 starting at `EF = 2.5`, qualities `[5, 5, 5, 4, 3, 2, 5]` give `(n, interval days, EF)` after each review: `(1, 1, 2.6)`, `(2, 6, 2.7)`, `(3, 16, 2.8)`, `(4, 45, 2.8)`, `(5, 126, 2.66)`, `(0, 1, 2.66)`, `(1, 1, 2.76)`.
- EF never falls below 1.3 (long run of `q = 3`).
- State round trip through JSON; merge is commutative and idempotent.
**Done when**:
- [ ] All worked examples pass exactly as listed; conventions recorded in `docs/DECISIONS.md`.
**Not in this stage**: choosing what to show next, UI.

## M6.3 Thompson-sampling policy

**Goal**: A transparent policy that picks the next action (a new question at a chosen difficulty, a due review, a hint, or a topic suggestion) and learns which kinds of action help this learner.
**Depends on**: M6.2
**Size**: M
**Sources**: S-039, S-037
**Deliverables**:
- `src/lib/learning/random.ts`: `mulberry32(seed)`, Gamma sampler (Marsaglia-Tsang) and Beta sampler built on it.
- `src/lib/learning/policy.ts`: arms = `{ review-due, new-easy, new-target, new-stretch, hint, suggest-topic }`; each arm has a Beta(alpha, beta) posterior starting at (1, 1); `choose(state, context, rng)` samples each eligible arm and takes the maximum; `reward` in [0, 1] from a documented formula (default: `0.5 * correct + 0.2 * (1 - hintsUsed / maxHints) + 0.1 * speedScore + 0.2 * retentionBonus`, where `retentionBonus` is credited later when a reviewed item is answered correctly after its interval; weights recorded as a convention, labelled heuristic in the UI's "How this works" panel); update `alpha += r, beta += 1 - r`.
- Guard rails (not learned): never show a question whose concept's prerequisites all have `pL < 0.6` unless nothing else is eligible; overdue reviews older than 3 days come first; at most 3 consecutive wrong answers before offering a hint or an easier item; difficulty targets `p(correct)` about 0.7 for `new-target`, 0.85 easy, 0.55 stretch (from the IRT model).
- `src/lib/learning/simulate.ts`: simulated learners whose true knowledge follows BKT with hidden parameters, for testing only.
**Tasks**: 1. PRNG and Gamma/Beta samplers with the statistical tests. 2. Arms, eligibility and guard rails, each with a unit test. 3. Reward bookkeeping, including the delayed retention bonus. 4. Simulator and the seeded comparison against a random policy. 5. Write the user-facing "How this works" text.
**Tests and reference values**:
- Beta sampler: with seed 42 and 200,000 samples of Beta(2, 5), the sample mean is within 0.003 of 2/7 = 0.285714 and the variance within 5% of `alpha beta / ((alpha + beta)^2 (alpha + beta + 1))` = 0.025510.
- Determinism: the same seed gives the same sequence of choices.
- Guard rails: each rule has a unit test.
- Simulation (fixed seeds, 50 simulated learners, 200 steps each): the policy's mean final mastery across concepts is higher than a uniformly random policy's by at least the margin you measure and record, and the result is stable across 5 seeds (report the numbers; the test asserts "policy >= random" for every seed, not a made-up margin).
**Done when**:
- [ ] Deterministic tests pass; the simulation report is in `docs/reports/M6.3.md` with the table per seed.
- [ ] The "How this works" text for users is written (beginner level, honest about being heuristic).
**Not in this stage**: UI.

## M6.4 Practice UI, quizzes, mastery map and gentle gamification

**Goal**: Learners answer questions inside topics, review due items on `/practice/`, and see their mastery map on `/progress/`, with motivation that respects them.
**Depends on**: M6.3, M1.3
**Size**: L
**Deliverables**:
- `Check` component (replaces the M1.2 placeholder): renders the listed questions one at a time, hints on request, explanation after answering (for every option), "I am not sure" path, updates the learner state through the store; works without JavaScript as a static list of questions with answers hidden in `<details>`.
- `src/stores/learner.ts` (zustand/vanilla) persisting the learner state with `storage.ts`; integrates with the M1.3 progress store (completing a topic's check with mastery >= 0.95 on its concepts marks the topic complete).
- `/practice/`: the policy's next item, a short session (5 to 10 items, user can stop any time), due-review count, explanation of why this item was chosen ("due for review", "next step after X").
- `/progress/`: mastery map as an SVG graph of concepts by module (layered layout computed at build time from the concept graph), states shown by color **and** shape/pattern and text, keyboard navigable list view of the same data, filters by module, links to topics.
- Gamification without dark patterns: daily streak that tolerates rest days (one free day per 7, never shown as "you lost"), milestones (first module complete, first 50 reviews), no timers, no leaderboards, no notifications, no guilt copy; a setting to hide streaks.
- Data controls: export learner state as JSON, import with validation, reset with confirmation.
- "How this works" page section explaining BKT, SM-2 and the bandit in beginner terms with links to the sources, and the statement that all of this stays on the device unless sync (M6.5) is switched on.
**Tasks**: 1. Learner store and its integration with the progress store. 2. `Check` component with hints and explanations, then its no-JS fallback. 3. `/practice/` session flow. 4. `/progress/` map (build-time layout) and its list view. 5. Streaks, milestones, data controls, e2e with the Playwright clock, accessibility pass.
**Tests and reference values**:
- e2e: answer questions in the sample topic, see mastery change, see the item scheduled for review (advance the clock with Playwright's clock API), export and import state, reset.
- Accessibility: axe on `/practice/` and `/progress/`, keyboard-only quiz, screen-reader text for map nodes.
**Done when**:
- [ ] Quiz, practice and map work without sign-in and with storage blocked (degrades to session-only with a notice).
- [ ] Budgets met (practice page is an island page; the map is static SVG plus a tiny script).
- [ ] No dark patterns: a checklist in the report confirms each item above.
**Not in this stage**: cloud sync.

## M6.5 Optional progress sync with Firebase (Spark)

**Goal**: A user may choose to sign in and sync progress across devices, staying within Spark quotas and loading Firebase only after that choice.
**Depends on**: M6.4, M0.2
**Size**: M
**Sources**: (Firebase documentation, add to the register when read; Q-006 for quotas)
**Deliverables**:
- Add `firebase@13.1.0` (planning check: `initializeApp`, `getAuth`, `GoogleAuthProvider`, `signInWithPopup`, `onAuthStateChanged`, `signOut` from `firebase/auth`, and `getFirestore`, `doc`, `getDoc`, `setDoc`, `serverTimestamp`, `runTransaction` from `firebase/firestore/lite` all exist; an app+auth+firestore-lite bundle measured 64 KB gzipped). Use **Firestore lite** (no realtime listeners, no offline cache needed: local storage is the source of truth). Load the SDK only after the user presses "Sign in to sync". Budget entry `lazy.firebase`.
- `src/lib/sync/` : config from `PUBLIC_FIREBASE_*` (feature hidden when missing, D-026); one document per user `users/{uid}/state/main` holding the learner state (well under the 1 MiB document limit thanks to M6.2's size cap); merge on sign-in using M6.2's merge function; debounced writes (at most one write per 60 s while active, plus one on `visibilitychange` to hidden), so a heavy user stays far below the daily write quota; exponential backoff on errors; clear UI states (off, signing in, synced at time, offline, error).
- `firestore.rules`: only the signed-in owner can read or write their document; validate shape and size (keys allowed, `updatedAt` is a timestamp, payload under a size bound); deny everything else.
- Rules tests with `@firebase/rules-unit-testing@6.0.0` and the Firestore emulator (needs Java; run in a separate CI job `firestore-rules` that installs Java, or document that it runs only locally if CI cannot host it).
- `firebase.json` gains a `firestore` section pointing to the rules (no other services).
- Privacy page updated: what is stored, where, how to delete (a "Delete my synced data" button that removes the document and signs out).
**Tasks**: 1. Sync library with fake-timer tests for debounce and merge. 2. `firestore.rules` and the emulator rules tests. 3. Lazy loader and the sign-in UI states. 4. Delete-my-data flow and the privacy page. 5. Quota arithmetic in the report.
**Tests and reference values**:
- Merge and debounce logic unit-tested with fake timers; rules tests: owner can read/write, other user cannot, unauthenticated cannot, oversized payload rejected, unknown field rejected.
- e2e with the Auth and Firestore emulators if feasible in the sandbox; otherwise mark not run with the reason.
**Done when**:
- [ ] With no `PUBLIC_FIREBASE_*` variables the site builds and the sync button is absent.
- [ ] With emulators, sign-in, sync and delete work; rules tests pass.
- [ ] The report computes the worst-case daily reads and writes per active user and compares them with the Spark quotas recorded in Q-006.
**Not in this stage**: any other Firebase product (no Functions, no Storage, no Analytics).
