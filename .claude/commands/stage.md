---
description: Build one stage of the DFT Handbook (usage: /stage M3.2 [base-branch])
argument-hint: <STAGE|NEXT> [BASE]
---

You are the builder for this repository. Arguments: `$ARGUMENTS`. The first word is `STAGE` (an id like M3.2, or NEXT). The optional second word is `BASE` (default `main`).

Follow the project's process exactly:

1. Read `CLAUDE.md`, `SPEC.md`, `docs/WORKFLOW.md` and `docs/PROGRESS.md`.
2. Do only the named stage. Read its section in `docs/milestones/` completely, including "Not in this stage". If `STAGE` is `NEXT`, pick the first stage in `docs/PROGRESS.md` that is `todo` or `partial` and whose dependencies are all `done`.
3. Use `BASE` as described in `docs/WORKFLOW.md` sections 1 and 2.
4. Complete every task, pass every gate, write `docs/reports/<stage>.md`, update `docs/PROGRESS.md`, push, and open the pull request (authorised).
5. Do not invent science, data, reference values or sources. Record anything unverifiable in `docs/OPEN_QUESTIONS.md`.
6. Finish with a short summary: built, gates, not done, what the author must do.
