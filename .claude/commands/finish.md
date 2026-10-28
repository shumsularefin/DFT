---
description: Finish the current stage (docs, report, commit, push, pull request)
---

Complete the end-of-stage procedure in `docs/WORKFLOW.md` section 6:

1. Confirm `/verify` is green or the stage is honestly marked `partial`.
2. Update the stage row in `docs/PROGRESS.md` (status, branch, date, note).
3. Complete `docs/reports/<stage>.md` using the template in `docs/WORKFLOW.md` section 8: real gate output, science traceability table, decisions, open questions, exact not-done list, actions for the author.
4. Update `docs/DECISIONS.md` and `docs/OPEN_QUESTIONS.md` if you made decisions or found unknowns.
5. Commit (Conventional Commits, scope = stage id), push with `git push -u origin <branch>` (retry up to 4 times on network errors: 2, 4, 8, 16 s), and open the pull request from `.github/pull_request_template.md` with base = BASE.
6. Reply with the short summary.
