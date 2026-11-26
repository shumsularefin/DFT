# Stage workflow

This is the protocol every build session follows. The human gives two inputs, `STAGE` and `BASE` (see `docs/KICKOFF_PROMPT.md`). Everything else is here.

Roles: **author** (the human), **builder** (the model doing a stage), **auditor** (a later, separate review of the merged result, see `docs/VERIFICATION.md`).

## 1. Inputs

- `STAGE`: an id such as `M3.2`, or `NEXT`. `NEXT` means the first stage in `docs/PROGRESS.md` with status `todo` or `partial` whose dependencies are all `done`.
- `TIER` (optional, `A` or `B`, only with `STAGE: NEXT`): take the first eligible stage of that tier. Use it when you have a session open on one model and want it to do the next stage that suits it.
- `BASE`: the branch to build on. `main` when the previous stage has been merged. Otherwise the previous stage's branch name, taken from `docs/PROGRESS.md` ("Branch" column). This is how stages stack when the author merges later.

## 2. Start-up checklist

Run these in order and do not skip any.

0. **Tier check.** Look up your stage's **Tier** column in `docs/PROGRESS.md` and say it in your first reply. Tier A stages are built by the strongest model (Opus class), Tier B stages by the fast model (Sonnet class). If you are the fast model and the stage is Tier A, do not build: reply "Stage <id> is Tier A, please restart this session with the strongest model" and stop. If you are the strongest model on a Tier B stage, say so in one line and continue (it is safe, only slower and more costly). If `STAGE` is `NEXT` and a `TIER` was given, take the first eligible stage of that tier and name any earlier eligible stage of the other tier that you skipped.

1. `git status` must be clean. `git fetch origin`.
2. Branching. The harness may have given you a branch already. Use it. If you must create one, name it `claude/<stage-id>-<slug>` (for example `claude/m3-2-incar-engine`). Bring the base in:
   - Fresh branch with no commits of its own: `git reset --hard origin/<BASE>`.
   - Branch that already has commits: `git merge --no-ff origin/<BASE>`.
   After this, `docs/PROGRESS.md` on your branch must show every dependency of your stage as `done`. If not, stop and report which dependency is missing.
3. Read narrowly (section 2a): `CLAUDE.md`, your stage section completely (including "Not in this stage") and the files it names. Look up D-, Q- and S- ids with `grep -n`; do not read `DECISIONS.md`, `OPEN_QUESTIONS.md`, `SCIENCE_SOURCES.md` or `SPEC.md` whole.
4. `npm ci` (or `npm install` if there is no lockfile yet, only in M0.1). Learn the baseline cheaply: `npm run verify > $SCRATCH/verify0.log 2>&1; tail -n 15 $SCRATCH/verify0.log`. Do not run the full e2e suite as a baseline; CI on `main` already tells you which specs are red. If the baseline is red outside your stage, note it in the report and carry on unless the stage is the fix.
5. Create `docs/reports/<stage-id>.md` from the template in section 8 and fill in the plan (the Tasks list as a checklist). Commit it: `docs(<stage>): start report`.

## 2a. Budget and lean execution (binding for every stage)

Time and tokens are part of the gate. A stage that burns an hour re-running suites is a process failure even if it ends green.

- **Budget.** Each stage has a `Budget` line in its work order (default by size: S = 30 min, M = 60 min, L = 90 min of wall time, roughly). When you pass it, stop adding work, run the final gates once, and finish as `partial` (section 7) with an exact remaining list. Never extend a session to "just finish".
- **Read once, read ranges.** `grep -n` first, then `sed -n 'a,bp'`. Never `cat` a file over 200 lines, a golden file, a log or a built page. Do not re-read a file you just edited.
- **Inner loop is targeted.** `npx vitest run <file>`; one e2e spec on one project: `npx playwright test <spec> --project=mobile-360 --trace off --reporter=line` (add `-g "<title>"` for one test). Build once (`npm run build`), then reuse the server: Playwright's `reuseExistingServer` is on locally, so start `node scripts/build/serve.mjs dist 4321` in the background and keep it while you iterate. Rebuild only when `src/` changed.
- **Full runs exactly once at the end:** `npm run verify`, then the full e2e suite, each piped to a log in the scratchpad, quoting only `tail -n 20`. Run them in the background if your tools allow and do docs (report, PROGRESS) meanwhile. Re-run only the specs that failed, never the whole suite again.
- **Never wait on CI.** Push, open the pull request, record the run URL in the report, and stop. Do not poll, sleep or watch CI. A red CI found later is a new fix, not a reason to hold the session open.
- **Lighthouse** only when the stage says so or adds a new page class; one run, one page per class.
- **Screenshots** only when the work order asks; at most 2.
- **Subagents** (`science-verifier`, `stage-reviewer`) once, at the end, only on Tier A stages or when the work order names them.
- **Diagnose before fixing.** For a failing test, read its error line and the one component it names. Group failures by cause; several red specs usually share one cause. Fix the cause once, re-run that group only.
- **Short report.** Fill the template; quote summary lines, not logs. No narrative of the session.

## 3. Build loop

- Work through the stage's **Tasks** in order. Commit after each coherent task. Conventional Commits: `feat(m3.2): ...`, `test(m3.2): ...`, `fix(...)`, `docs(...)`, `chore(...)`. Scope is the stage id.
- **Tests first for anything in `src/lib/`.** Pure logic goes in `src/lib/` (no DOM, no React) so it can be tested in Node. UI components stay thin.
- **Golden files.** Tests that compare against `tests/reference/*.json` load the file; they never copy numbers into the test. Never edit a golden file by hand. If you need new reference data, extend the generator in `scripts/reference/`, run it, and commit both. Generators need Python (`scripts/reference/requirements.txt`).
- **Sources.** Each formula, constant or table gets a `@source S-xxx` comment. If the source is not in `docs/SCIENCE_SOURCES.md` yet, add it there (mark "verified" honestly: "cited from memory" until you have actually read it).
- **Unknowns.** Add to `docs/OPEN_QUESTIONS.md` with the next free `Q-nnn`, point to it from an `it.todo`, and keep going. Do not guess.
- **Decisions.** A non-obvious choice goes into `docs/DECISIONS.md` with the next free `D-nnn`: context, decision, consequences, 5 lines at most.
- Run targeted tests often (section 2a) and the full `npm run verify` once before the push.

## 4. Gates (all must pass before you finish)

| Gate | Command or check | Applies to |
|---|---|---|
| G1 Verify | `npm run verify` | every stage |
| G2 Guards | `node scripts/guard/run-all.mjs` (also part of verify) | every stage |
| G3 Science | every formula/constant/table has `@source`, a unit test with a reference value, and no unexplained skip | stages with `src/lib/` logic or data |
| G4 UI | the specs the stage added or touched, on both projects, while working; the full `npm run test:e2e` once before the push (section 2a); axe-core zero violations, keyboard path tested | stages with UI |
| G5 Performance | `npm run size` within `budgets.json`; Lighthouse (`CHROME_PATH=/opt/pw-browsers/chromium npx lhci autorun`) only when the work order asks or a new page class is added | stages with UI |
| G6 Content | `npm run lint:content` clean (from M1.2 on) | stages that add or change content |
| G7 Stage-specific | the "Done when" checklist of the stage | every stage |

A gate you cannot run (missing tool, blocked network) is **not** a pass. Write it into the report as "not run, because ...".

## 5. Evidence

The report must contain real output, trimmed: the test summary line, bundle sizes, Lighthouse scores (when run), axe result, and screenshots only where the work order asks (at most 2, each under 200 KB, in `docs/reports/img/<stage>/`). The auditor reads these first.

## 6. Finish

1. Update `docs/PROGRESS.md`: status, branch, PR link (fill after opening), date, one-line note; rewrite the "Next stage to build" line at its top (stage, title, tier, size of the first `todo` or `partial` row whose dependencies are all `done`).
2. Complete `docs/reports/<stage>.md`.
3. If user-facing, add a line to `CHANGELOG.md` (created in M1.3).
4. Final commit, then `git push -u origin <branch>`. On network failure retry up to 4 times with waits of 2, 4, 8, 16 seconds.
5. Open a pull request. Base branch = `BASE`. Title: `<stage-id>: <stage title>`. Body from `.github/pull_request_template.md`. The kickoff prompt authorises this.
6. Reply with a short summary: what was built, gate results, anything not done, anything the author must do (secrets, data, decisions).

## 7. Partial and blocked stages

- **Partial.** If you cannot finish: stop starting new work, make sure everything committed passes `npm run verify`, set status `partial` in `docs/PROGRESS.md`, and list in the report, precisely, what remains (file names, test names). The next session with `STAGE: <same id>` resumes from that list.
- **Blocked on the author.** Examples: missing secrets, missing example data in `data/author/`, a decision only the author can make. Do all work that does not depend on it, mark the stage `partial` (or `blocked` if nothing could proceed), write the exact request into the report and `docs/OPEN_QUESTIONS.md`. Never substitute invented data. If a placeholder is unavoidable for a UI to render, it must carry a visible "Illustrative data" badge and the report must say so.
- **Blocked on the network.** See `CLAUDE.md`. Record the unreachable source, continue.

## 8. Report template (`docs/reports/<stage-id>.md`)

```markdown
# <stage-id> <title>

Status: in-progress | partial | done        Branch: <name>        PR: <link>

## Plan (checklist copied from the work order)
- [ ] ...

## What was built
...

## Gate results
| Gate | Result | Evidence |
|---|---|---|

## Science traceability
| Item | Source ID | Test | Reference value origin |
|---|---|---|---|

## Decisions made (D-nnn) and open questions raised (Q-nnn)

## Not done / deferred (be exact)

## For the author (actions needed)
```

## 9. Merging, for the author

Two ways of working. Both are fine; the stage prompts support both.

- **Mode A (recommended): merge each stage before starting the next.** `BASE: main` every time. You get a deployed preview per stage and conflicts never accumulate.
- **Mode B: stack the stages and merge at the end.** Give each new stage the previous stage's branch as `BASE`. When you merge, go **in stage order** and use **"Create a merge commit"** (not squash, not rebase), otherwise the next PR in the stack shows phantom conflicts. Delete each branch after merging so GitHub retargets the next PR to `main`.

## 10. Never

- Never push to a branch other than the one you were given. Never force-push. Never rewrite history.
- Never start another stage, refactor unrelated code, or "improve" the pinned stack.
- Never leave failing tests, commented-out tests, or `--no-verify` commits.
- Never put a model name in code, comments, content or commit message bodies. The only exception is the attribution trailer lines the harness tells you to append.
- Never edit `docs/source-material/` (the author's original handbooks) or `docs/verified-stack/` (verified starting configuration). Never hand-edit `tests/reference/*.json`; they change only by re-running a generator in `scripts/reference/` (section 3), and the report must say which generator was changed and why.
