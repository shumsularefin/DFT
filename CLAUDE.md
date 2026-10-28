# DFT Handbook: project rules

Read this file at the start of every session. It is short on purpose.

**What this is.** An interactive DFT and VASP learning site plus research tools, running entirely in the browser on Firebase Hosting (Spark plan). The contract is `SPEC.md`. The process is `docs/WORKFLOW.md`. Status is `docs/PROGRESS.md`. Each stage's work order is in `docs/milestones/`.

## Start of session

1. Read this file, `SPEC.md`, `docs/WORKFLOW.md`, `docs/PROGRESS.md`, then **only your assigned stage** in `docs/milestones/` and the docs that stage cites.
2. Confirm the stage's dependencies are `done` in `docs/PROGRESS.md`. If not, stop and report. Do not build on missing foundations.
3. Do **only the stage you were named**. Never start the next one, even if time remains.

## Hard rules

- **No em dashes** (U+2014) in any text for the site (`src/`, `public/`, `content/`, `data/`). Use commas, colons, periods or parentheses. A hook and CI both enforce this.
- **Spark plan only.** No Cloud Functions, no Cloud Storage, no server. All computation runs in the browser. User files are parsed locally and never uploaded.
- **Never commit secrets, API keys, service accounts, `.env` files or POTCAR content.** Firebase web config comes from `PUBLIC_FIREBASE_*` build variables, never literals. Never generate or host POTCAR content.
- **Never invent science.** Every formula, constant and data table needs a source ID from `docs/SCIENCE_SOURCES.md` (`S-xxx`, in a `@source` comment or front matter) and a unit test with a known reference value. Reference values come only from `tests/reference/` (golden files made by `scripts/reference/`, never hand-edited) or from a cited source. If you cannot verify something, add it to `docs/OPEN_QUESTIONS.md`, write an `it.todo` that names the question ID, and move on. Never fill the gap with a guess.
- **Be honest in the UI.** Mark illustrative animations "Illustrative", rule-of-thumb checks "Heuristic". Never show an invented number as a real result. Sample or synthetic data must carry a visible banner.
- **Do not weaken a test to make it pass.** If a test contradicts the code, find out which is wrong. If a golden file seems wrong, record it in `docs/OPEN_QUESTIONS.md`; do not edit it.
- **Do not change the pinned stack** (`docs/DECISIONS.md` D-002). Add a dependency only if the stage needs it, at the exact version listed in `docs/verified-stack/package.json.reference`. Check its gzipped size first.
- **Keep context lean.** Reuse components, edit files in place, do not rewrite whole files, do not paste large files into the conversation.
- **Content you write teaches.** Follow `docs/CONTENT_GUIDE.md`: plain language first, then depth by level, always answer "why am I doing this, why this value, what happens if I skip it".
- **Accessibility and performance are not a later phase.** Every interactive component is keyboard operable, has labels, honours `prefers-reduced-motion`, and works at 360 px wide. 3D and WebAssembly load lazily.

## Environment notes (cloud sessions)

- Node is 22.x; the stack is pinned for it. Chromium is preinstalled: set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` for Playwright and `CHROME_PATH=/opt/pw-browsers/chromium` for Lighthouse CI.
- Outbound network may be limited to package registries. If a source site (vasp.at, arxiv.org, ...) is unreachable, say so in your report, add the check to `docs/OPEN_QUESTIONS.md`, and continue with what you can verify. PyPI and npm work, so reference implementations (pymatgen, seekpath, spglib) can be read from their packages.
- Python for `scripts/` runs in a virtualenv from `scripts/reference/requirements.txt`.

## End of session (all required)

1. `npm run verify` passes (format, lint, typecheck, unit tests, guards, build, size budget). Fix failures; do not skip steps.
2. Stage-specific gates in the work order pass (e2e, axe, Lighthouse numbers, golden tests).
3. Write `docs/reports/<stage>.md`, update the row in `docs/PROGRESS.md`, and update `docs/DECISIONS.md` and `docs/OPEN_QUESTIONS.md` where relevant.
4. Commit with Conventional Commits, push to the branch you were given, open a pull request using `.github/pull_request_template.md`.
5. If you ran out of room, finish as `partial` per `docs/WORKFLOW.md` section 7. A truthful partial stage is better than a faked complete one.
