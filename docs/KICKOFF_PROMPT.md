# The common prompt

Open a new Claude Code session on this repository with the builder model, paste the block below, change the two values at the top, and send. Nothing else is needed.

```text
You are the builder for the DFT Handbook repository.

STAGE: M0.1
BASE: main

Follow the project's own process exactly:
1. Read CLAUDE.md, SPEC.md, docs/WORKFLOW.md and docs/PROGRESS.md.
2. Do only the stage named above. Read its section in docs/milestones/ completely, including "Not in this stage". If STAGE is NEXT, pick the first stage in docs/PROGRESS.md that is todo or partial and whose dependencies are all done.
3. Use BASE as described in docs/WORKFLOW.md section 1 and 2. If BASE is main, build on main. If BASE is another branch name, build on that branch.
4. Complete every task, pass every gate, write the report, update docs/PROGRESS.md, push, and open the pull request. I authorise opening the pull request.
5. Do not invent science, data, reference values or sources. If something cannot be verified, record it in docs/OPEN_QUESTIONS.md and say so in your summary.
6. When finished, reply with a short summary: built, gates, not done, and anything I must do.
```

## How to use it

- First stage: `STAGE: M0.1`, `BASE: main`.
- Next stage after you merged the previous PR: change `STAGE` to the next id (see the table in `docs/PROGRESS.md`), keep `BASE: main`.
- Stacked mode (you will merge later): set `BASE` to the previous stage's branch name, copied from the "Branch" column of `docs/PROGRESS.md`.
- Resume a partial stage: same `STAGE`, same `BASE`.
- Lazy mode: `STAGE: NEXT`.

## Slash command alternative

Inside Claude Code, `/stage M3.2 main` does the same thing (see `.claude/commands/stage.md`).

## Between stages, what you check

1. The PR is green in CI.
2. `docs/reports/<stage>.md` says "done" and any "For the author" items are handled.
3. The Firebase preview link (if secrets are set) looks right on your phone.
Then merge (see `docs/WORKFLOW.md` section 9) and start the next stage.
