# Open-question sweep and branch reconciliation (2026-11-11)

Status: done        Branch: claude/festive-heisenberg-wueip0        PR: see docs/PROGRESS.md

Not a build stage. The author asked for the open questions to be worked through and for the branch to be ready to merge and deploy.

## Branch reconciliation
- `main` held a parallel build of M6.1 to M6.3 (PRs 26 to 28), while M6.4 to M7.4 were built on another build of the same stages (branches `claude/great-dijkstra-oj0kbx`, `claude/zen-bardeen-qzm2f2`). The two conflicted in 28 files, so nothing after M6.3 could merge.
- This branch fast-forwards to M7.4 (`claude/zen-bardeen-qzm2f2`) and merges `main`, keeping the chain's version of every conflicting file. `main` changed no file the chain does not also change, so nothing is lost; main's D-051 to D-053 texts described its own build and are superseded by the chain's D-051 to D-055.
- This branch therefore supersedes open PR #29 (M7.4).

## Questions closed (10)
Q-003 (Bartel tau, read), Q-004 (KSPACING and VASPKIT 102: ceil), Q-006 (Spark limits), Q-007 (network), Q-013 (VASPKIT 303 uses SeeK-path), Q-015 (Firebase wiring), Q-017 (even MP meshes break hexagonal symmetry, per the VASP wiki), Q-018 (Auto mode formula), Q-038 (Setyawan-Curtarolo tables, all 23 variants), Q-041 (cold smearing sign). Narrowed with updates: Q-001, Q-014, Q-016, Q-027, Q-028, Q-029, Q-030, Q-037, Q-039. Details are in each question's "Update 2026-11-11" or "Closed 2026-11-11" paragraph.

## Code and content changes
- `kpathExport.ts`: `KPATH.in` uses the VASPKIT layout (S-058), with a character-for-character test against the documented row.
- `kpoints.ts`, `kmesh.ts`, Input Builder, k-mesh lab, two topics and two questions: cite the VASP wiki (S-019) instead of Q-004 and Q-017; the `it.todo` for Q-018 is replaced by tests of the documented formula.
- `smearing.test.ts`: cold smearing checked against Eq. (1) of S-016 in the paper's own variable.
- `vasp-tags.json`: 34 defaults from the VASP wiki, marked as such; `annotate.ts`: sourced ENMIN text.
- Register: S-003, S-005, S-006, S-016, S-019 upgraded to `read`; new S-058 (VASPKIT tutorial), S-059 (Firebase pricing). D-016 updated, D-056 added. Work order M3 volume corrected (Q-027 item 1).

## Verification
- `npm run verify` passes: format, lint, typecheck, 1352 unit tests (2 `it.todo`: the mclc4 table, which no real cell reaches, and the planned M7.5 link), guards, content and question lint, build, links, size budgets, contrast.
- Playwright: 406 passed, 10 skipped (each runs in only one viewport project by design), 0 failed.
- Flaky e2e fixed: input-builder and practice tests sometimes typed or clicked before the React island hydrated, so input was lost ("No structure yet" in the failure snapshot). They now wait for `astro-island[ssr]` to clear, the pattern the lab specs already use; 140 of 140 passed over 5 repeats.

## Still needs the author
Q-001 licence; Q-008 real output files; Q-019 LMAXMIX; Q-028 to Q-036 and Q-039 confirmations; Q-040 contact route for deleting a sync account; textbook wording checks (Q-020, Q-022 to Q-024, Q-026). Later stages own Q-002, Q-005, Q-009 to Q-012, Q-016, Q-021.
