---
description: Build one stage of the DFT Handbook (usage: /stage M3.2 [base-branch])
argument-hint: <STAGE|NEXT> [BASE]
---

You are the builder for this repository. Arguments: `$ARGUMENTS`. The first word is `STAGE` (an id like M3.2, or NEXT). The optional second word is `BASE` (default `main`).

Follow the project's process exactly:

1. Read `CLAUDE.md` and `docs/WORKFLOW.md` sections 2, 2a and 7. From `docs/PROGRESS.md` read only line 9 and your stage's row (`grep -n`). Read `SPEC.md` only in the sections your stage cites. Follow section 2a (budget, targeted tests, full runs once, never wait on CI) throughout.
2. Tier check first (`docs/WORKFLOW.md` section 2, step 0): state the stage's Tier from `docs/PROGRESS.md`; if you are the fast model and it is Tier A, tell the author to switch models and stop.
3. Do only the named stage. Read its section in `docs/milestones/` completely, including "Not in this stage". If `STAGE` is `NEXT`, pick the first stage in `docs/PROGRESS.md` that is `todo` or `partial` and whose dependencies are all `done`.
4. Use `BASE` as described in `docs/WORKFLOW.md` sections 1 and 2.
5. Complete every task within the stage's Budget (or finish `partial`), pass every gate, write `docs/reports/<stage>.md`, update `docs/PROGRESS.md`, push, and open the pull request (authorised).
6. Do not invent science, data, reference values or sources. Record anything unverifiable in `docs/OPEN_QUESTIONS.md`.
7. Finish with a short summary: built, gates, not done, what the author must do.
