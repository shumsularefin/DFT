# DFT Handbook

An interactive site that takes a complete beginner to a first sensible VASP project, with research tools for working scientists: a Perovskite Tolerance Factor Explorer, a VASP Input Builder with convergence helper, a Brillouin zone and k-path viewer, a Screening Studio on Materials Project data, and a Material Builder. Everything runs in the browser on Firebase Hosting's free Spark plan.

**Status:** planning complete, no application code yet. This repository is a build environment: rules, a verified specification, 53 stage work orders, golden reference data and automated guards, so that a model can build the site one stage at a time and an independent reviewer can check it afterwards.

## How the work is organised

| What | Where |
|---|---|
| The contract (what to build, verified and corrected) | [`SPEC.md`](SPEC.md) |
| Rules every build session follows | [`CLAUDE.md`](CLAUDE.md) |
| The step-by-step session protocol | [`docs/WORKFLOW.md`](docs/WORKFLOW.md) |
| The one prompt you paste to start a stage | [`docs/KICKOFF_PROMPT.md`](docs/KICKOFF_PROMPT.md) |
| Status of every stage, in build order | [`docs/PROGRESS.md`](docs/PROGRESS.md) |
| Work orders (M0 to M11, 53 stages) | [`docs/milestones/`](docs/milestones/) |
| Decisions with evidence | [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| Everything not yet verified | [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) |
| Sources for every formula and table | [`docs/SCIENCE_SOURCES.md`](docs/SCIENCE_SOURCES.md) |
| Architecture, conventions, budgets | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| How to write content | [`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md) |
| Your one-time setup (Firebase, GitHub, network) | [`docs/SETUP_FIREBASE.md`](docs/SETUP_FIREBASE.md) |
| What the final review will check | [`docs/VERIFICATION.md`](docs/VERIFICATION.md) |
| Golden test data and how it was made | [`tests/reference/README.md`](tests/reference/README.md) |
| Verified starter configuration (exact package versions) | [`docs/verified-stack/`](docs/verified-stack/) |
| Your original VASP handbooks (content seed, never edited) | [`docs/source-material/`](docs/source-material/) |
| Optional: pre-approved commands and an em-dash hook for build sessions (inactive until you copy it to `.claude/settings.json`) | [`docs/claude-settings.suggested.json`](docs/claude-settings.suggested.json) |

## Your loop as the author

1. **Once:** merge this planning branch into `main`, then do the setup in [`docs/SETUP_FIREBASE.md`](docs/SETUP_FIREBASE.md) (two GitHub values for Firebase deploys, and ideally the network allow-list so builders can read the VASP wiki and papers).
2. **Per stage:** open a Claude Code session on this repository, paste the prompt from [`docs/KICKOFF_PROMPT.md`](docs/KICKOFF_PROMPT.md) with `STAGE: M0.1` (then `M0.2`, ...) and `BASE: main`. The session builds that stage only, runs every gate, writes `docs/reports/<stage>.md`, updates `docs/PROGRESS.md` and opens a pull request.
3. **Review and merge:** check that CI is green and read the report's "For the author" section, then merge (merge commits if you stack stages; see WORKFLOW section 9). Repeat with the next stage, or use `STAGE: NEXT`.
4. **At the end:** bring the merged result to an independent reviewer with [`docs/VERIFICATION.md`](docs/VERIFICATION.md).

Things only you can do are collected at the end of [`SPEC.md`](SPEC.md) (Appendix B) and as "author" rows in [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md): Firebase secrets, a few five-minute VASP calibration runs, your example calculation files, and the Materials Project data pull with your own API key.

## What planning verified, and what it found

Planning did not stop at writing a plan. It installed and ran the stack, generated reference data with independent scientific libraries, and checked claims numerically. Highlights (full list in SPEC Appendix A):

- The stack builds and tests together only with specific pins. Four version conflicts were found and resolved (Astro versus the Node version in cloud sessions, TypeScript 7 versus the lint tooling, an accessibility lint plugin versus ESLint 10, the PWA plugin versus Astro 7).
- RDKit's browser build has no 3D embedding or force field, so the SPEC's "RDKit 3D clean-up" was replaced by a small in-house optimizer.
- The default band-path convention now matches your own protocol (VASPKIT 303, HPKOT); the two common conventions give different paths even for fcc.
- Shannon CN 12 radii exist for only 4 of 15 lanthanides, so the RCuO3 family sweep needs an explicit coordination policy.
- Two possible slips in your Workflow Handbook: "odd" Monkhorst-Pack meshes on hexagonal cells should read "even" (checked numerically, Q-017), and the SCF and band INCARs omit LMAXMIX although the dictionary calls it vital for ICHARG = 11 on d/f systems (Q-019).
- A hosting cache rule that looked right would not have applied to clean URLs; the Firebase emulator showed it, and it is fixed.
- Not verifiable from the planning sandbox (sites blocked): current Firebase Spark limits, the VASP wiki, the Bartel tau paper, the KSPACING rounding rule. Each is an open question with a concrete way to close it.

## Repository checks you can run now

```bash
node scripts/guard/run-all.mjs          # no secrets, no POTCAR, no em dashes in site text, sources, links, stages, ids
node --test scripts/guard/guard.test.mjs
```

The application's `npm` scripts appear after stage M0.1 (a "Development" section is appended to this README then).

## Development

Node 22.12 or newer. Install with `npm ci`.

| Script                                    | What it does                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                             | Astro dev server                                                       |
| `npm run build`                           | `astro build`, then `scripts/build/postbuild.mjs`                      |
| `npm run preview`                         | Preview the build                                                      |
| `npm run format` / `npm run format:check` | Prettier write / check                                                 |
| `npm run lint`                            | ESLint                                                                 |
| `npm run typecheck`                       | `astro check`                                                          |
| `npm test`                                | Vitest unit tests                                                      |
| `npm run test:e2e`                        | Playwright (builds first; set `PW_CHROMIUM_PATH` in cloud sessions)    |
| `npm run guard`                           | Repository guards (secrets, POTCAR, em dashes, sources, links, stages) |
| `npm run verify`                          | format:check, lint, typecheck, test, guard, build                      |
