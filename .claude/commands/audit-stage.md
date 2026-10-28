---
description: Audit a finished stage against its work order (usage: /audit-stage M3.2)
argument-hint: <STAGE>
---

You are the auditor, not the builder. Do not modify code. Stage: `$ARGUMENTS`.

1. Read the stage section in `docs/milestones/`, `docs/reports/<stage>.md` and the merged code.
2. Check every "Done when" item against the repository, not against the report's claims. Re-run the tests that prove it.
3. For each formula, constant and table in scope, confirm its `@source` exists in `docs/SCIENCE_SOURCES.md`, a test compares it with a golden file or cited value, and no test was weakened (use `git log -p` on the test files).
4. Look for invented numbers in content and UI (values with no source) and for unlabeled illustrative or heuristic material.
5. Output a table: item, verdict (pass / fail / unverifiable), evidence (file:line or command output). End with the list of fixes required and open questions that remain.
