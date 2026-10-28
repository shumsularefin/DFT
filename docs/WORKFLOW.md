# Stage workflow

This is the protocol every build session follows. The human gives two inputs, `STAGE` and `BASE` (see `docs/KICKOFF_PROMPT.md`). Everything else is here.

Roles: **author** (the human), **builder** (the model doing a stage), **auditor** (a later, separate review of the merged result, see `docs/VERIFICATION.md`).

## 1. Inputs

- `STAGE`: an id such as `M3.2`, or `NEXT`. `NEXT` means the first stage in `docs/PROGRESS.md` with status `todo` or `partial` whose dependencies are all `done`.
- `BASE`: the branch to build on. `main` when the previous stage has been merged. Otherwise the previous stage's branch name, taken from `docs/PROGRESS.md` ("Branch" column). This is how stages stack when the author merges later.

## 2. Start-up checklist

Run these in order and do not skip any.

1. `git status` must be clean. `git fetch origin`.
2. Branching. The harness may have given you a branch already. Use it. If you must create one, name it `claude/<stage-id>-<slug>` (for example `claude/m3-2-incar-engine`). Bring the base in:
   - Fresh branch with no commits of its own: `git reset --hard origin/<BASE>`.
   - Branch that already has commits: `git merge --no-ff origin/<BASE>`.
   After this, `docs/PROGRESS.md` on your branch must show every dependency of your stage as `done`. If not, stop and report which dependency is missing.
3. Read the documents named in `CLAUDE.md`. Read your stage section completely, including "Not in this stage".
4. `npm ci` (or `npm install` if there is no lockfile yet, only in M0.1). Run `npm run verify` once to learn the baseline. If the baseline is red, report it before changing anything.
5. Create `docs/reports/<stage-id>.md` from the template in section 8 and fill in the plan (the Tasks list as a checklist). Commit it: `docs(<stage>): start report`.

## 3. Build loop

- Work through the stage's **Tasks** in order. Commit after each coherent task. Conventional Commits: `feat(m3.2): ...`, `test(m3.2): ...`, `fix(...)`, `docs(...)`, `chore(...)`. Scope is the stage id.
- **Tests first for anything in `src/lib/`.** Pure logic goes in `src/lib/` (no DOM, no React) so it can be tested in Node. UI components stay thin.
- **Golden files.** Tests that compare against `tests/reference/*.json` load the file; they never copy numbers into the test. Never edit a golden file by hand. If you need new reference data, extend the generator in `scripts/reference/`, run it, and commit both. Generators need Python (`scripts/reference/requirements.txt`).
- **Sources.** Each formula, constant or table gets a `@source S-xxx` comment. If the source is not in `docs/SCIENCE_SOURCES.md` yet, add it there (mark "verified" honestly: "cited from memory" until you have actually read it).
- **Unknowns.** Add to `docs/OPEN_QUESTIONS.md` with the next free `Q-nnn`, point to it from an `it.todo`, and keep going. Do not guess.
- **Decisions.** A non-obvious choice goes into `docs/DECISIONS.md` with the next free `D-nnn`: context, decision, consequences, 5 lines at most.
- Run `npm test` often and `npm run verify` before each push.

## 4. Gates (all must pass before you finish)

| Gate | Command or check | Applies to |
|---|---|---|
| G1 Verify | `npm run verify` | every stage |
| G2 Guards | `node scripts/guard/run-all.mjs` (also part of verify) | every stage |
| G3 Science | every formula/constant/table has `@source`, a unit test with a reference value, and no unexplained skip | stages with `src/lib/` logic or data |
| G4 UI | `npm run test:e2e` incl. axe-core with zero violations, keyboard path tested, 360 px and desktop projects | stages with UI |
| G5 Performance | `npm run size` within `budgets.json`; Lighthouse run recorded in the report (`CHROME_PATH=/opt/pw-browsers/chromium npx lhci autorun`) | stages with UI |
| G6 Content | `npm run lint:content` clean (from M1.2 on) | stages that add or change content |
| G7 Stage-specific | the "Done when" checklist of the stage | every stage |

A gate you cannot run (missing tool, blocked network) is **not** a pass. Write it into the report as "not run, because ...".

## 5. Evidence

The report must contain real output, trimmed: the test summary line, bundle sizes, Lighthouse scores per page class, axe result, and 1 to 4 screenshots (taken with Playwright, each under 200 KB, saved in `docs/reports/img/<stage>/`). The auditor reads these first.

## 6. Finish

1. Update `docs/PROGRESS.md`: status, branch, PR link (fill after opening), date, one-line note.
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
