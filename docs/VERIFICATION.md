# Final verification plan

After the stages are built and merged, the whole result is audited by a separate reviewer (the auditor), ideally a different model session from the builder. This is what gets checked, so builders know the bar and the author knows what to bring back.

## 1. Bring the auditor

- The merged `main` (or all stage branches in order), `docs/PROGRESS.md`, every `docs/reports/*.md`, `docs/OPEN_QUESTIONS.md`.
- A Firebase live or preview URL, if deployed.
- Any author-run calibration results (Q-004, Q-013) and example data.
- Prompt for the auditor: "Audit the DFT Handbook against SPEC.md and docs/VERIFICATION.md. Run the checks, do not trust the reports."

## 2. Mechanical checks (run, do not read)

1. `node scripts/guard/run-all.mjs` and `node --test scripts/guard/guard.test.mjs` pass.
2. `npm ci && npm run verify` pass from a clean checkout.
3. `npm run test:e2e` passes; axe has zero violations on every route in light and dark.
4. `npx lhci autorun`: performance, accessibility, best practices and SEO each >= 95 on mobile emulation for each page class, or a documented, measured exception (D-023).
5. `npm run size`: every budget in `budgets.json` is met; initial JS per page class within `docs/ARCHITECTURE.md` section 8.
6. Offline: after one visit, airplane mode, the shell and visited pages load.
7. 360 px width: no horizontal scroll on any route (Playwright check).
8. `grep` the built site for U+2014: zero hits. `grep` the repository for secrets and POTCAR markers: zero.

## 3. Science checks (per area)

| Area | Audit |
|---|---|
| Physics toys (M2, M4.4, M7) | Re-derive analytic limits independently (particle in a box levels, hydrogen energies, harmonic oscillator) and compare with the tests' expected values. Confirm labels "Illustrative" or "Toy model" are present. |
| Structure and KPOINTS (M3) | Parse several real POSCARs the author provides; compare k-meshes with Q-004 results; confirm KPOINTS text byte-for-byte against VASP's format. |
| INCAR rules (M3.4) | Every rule has a source and a test; read each rule's explanation against the author's handbooks; try to produce false positives on the handbook's own example INCARs (none may fire an error). |
| Parsers and convergence (M4) | Run on the author's real OSZICAR and OUTCAR; confirm detected converged values match the author's manual judgment; confirm the 1 meV/atom band is per atom. |
| BZ and k-paths (M5) | Compare vertex sets, counts and volumes with `tests/reference/bz_geometry.json` for fresh random lattices (generate new ones with the script); compare paths with seekpath and pymatgen for structures not in the golden file; apply the Q-013 result. |
| Adaptive engine (M6) | Reproduce BKT and SM-2 numbers by hand for 3 sequences; run the bandit simulation with a new seed; confirm no data leaves the device unless sync is on; read Firestore rules. |
| Tolerance factor (M8) | Compare t, mu, tau with the paper's tables once Q-003 is closed; check the CN policy behaviour for each lanthanide; confirm warnings for Cu3+ and missing CN entries. |
| Screening Studio (M9) | Confirm the live data are real (not synthetic) and attributed; sanity-check ten random materials against the Materials Project website; verify feasibility colors on known easy and hard cases. |
| Material Builder (M10) | Throw absurd inputs at it (overlapping atoms, charge-imbalanced formulas, zero-volume cells); each must be rejected with an explanation and a working fix; compare symmetrized outputs with spglib/pymatgen. |
| Content (M1, M2, M7) | Read modules 1 to 8 as a beginner would; check the anatomy, level switch, definitions on first use, "why / what changes / what breaks" for every parameter; spot-check ten claims against the VASP wiki. |

## 4. Honesty checks

- Every item in `docs/OPEN_QUESTIONS.md` that affects a visible number is either closed or visibly caveated in the UI.
- No stage report claims a gate that the repository cannot reproduce.
- Source register statuses are truthful: nothing says `read` unless someone read it.

## 5. Output of the audit

A table of findings (severity, area, evidence, fix), the list of closed and still-open questions, and a go or no-go for removing `noindex` (M11.3).
