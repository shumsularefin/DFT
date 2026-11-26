# M15 Handbook coverage and repair

Added 2026-11-26 (D-086) after two checks by the author's request:

1. **Process audit of main at 33414fb.** CI's end-to-end job has failed on every recent merge, but `deploy.yml` deploys anyway. The 19 stages built on 2026-11-24 and 2026-11-25 skipped parts of `docs/WORKFLOW.md`: no DECISIONS entries, thin reports, no new golden files, no tests for M10.4 and M10.5, builder-owned questions left open, and an unsourced runtime model in M9.3.
2. **Coverage check of the author's two handbooks** (S-041 Field Handbook, S-042 Workflow Handbook; the copies in `docs/source-material/` are byte-identical to the files the author sent on 2026-11-26).
   - **S-041 is fully on the site.** That covers all 24 tags, all 22 troubleshooting entries (in `errors.json`), the 16 output and 4 input files, and 6 of its 7 recipes. Only the **ab initio MD (NVT)** recipe is missing, and its tags `MDALGO`, `TEBEG`, `SMASS` are not in `vasp-tags.json`.
   - **S-042's core sequence is on the site:** the protocol, files, ISTART and ICHARG, convergence, relaxation, SCF, DOS, bands, the presets and the error index.
   - **S-042's later chapters exist only as presets or two-step recipes, with no teaching page.** These are elastic constants (Born criteria, Voigt-Reuss-Hill, derived indicators, energy-strain route), phonons (the phonopy pipeline, `band.conf`, `mesh.conf`, DFPT, LO-TO and NAC, Γ-only modes, interpretation), the dielectric tensor and Born charges, the Bader workflow, the optical quantities derived from ε, magnetocrystalline anisotropy, the "Other calculations" table (17 properties), the electronic and ionic troubleshooting ladders, the units and "where to read it" tables, the pre-submit checklist, the project layout, and about 20 VASPKIT task codes (911, 252, 253, 261, 262, 312, 313, 314, 426, 427, 501, 502, 503, 511, 711, 712, 713, 721, 722, 926 and the 200 to 205 group).

**Tier rule (ROADMAP_V3):**
- **Tier A (strongest model)** builds anything that computes a number a researcher will read: parsers, formulas, golden files, and the science re-audit.
- **Tier B (fast model)** builds content, UI, wiring, tests of existing behaviour, and process fixes on top of Tier A libraries.

The author designs the UI later, so new UI in these stages stays minimal: reuse existing components and do no visual redesign.

**Order:** M15.1 first (a red main blocks everything). M15.2 and M15.3 can run in parallel with M15.4 to M15.6.

---

## M15.1 Make main green and gate deploy on CI (Tier B)

**Goal**: No version reaches Firebase unless CI passed, and CI passes on main.
**Depends on**: none
**Size**: S
**Deliverables**:
- `deploy.yml` runs only after the CI workflow succeeds on main (a `workflow_run` trigger with `conclusion == 'success'`, or one workflow with `needs:`).
- Fix every failing e2e spec; start with `tests/e2e/input-builder.spec.ts:102`, where the page overflows by 2 px at 360 px. Fix the layout, never the assertion.
- Report the CI run ids before and after.
**Tasks**: 1. Change the deploy trigger. 2. Reproduce each failing spec locally (desktop and mobile-360). 3. Fix the layout or code. 4. Push and watch CI.
**Tests and reference values**: The existing e2e suite, unchanged; no assertion is loosened.
**Done when**:
- [ ] Full Playwright run (desktop and mobile-360) green locally and in CI on main.
- [ ] A deliberately failing CI run does not deploy (show the run).
**Not in this stage**: new features.

## M15.2 Science re-audit of the 2026-11-24 batch (Tier A)

**Goal**: Bring the Tier A stages that skipped the process up to the rules in `CLAUDE.md`, using `/audit-stage` on each.
**Depends on**: M15.1
**Size**: L (may finish `partial`)
**Deliverables**:
- **M14.3:** a pymatgen golden file for planar averages (`get_average_along_axis`, work order tolerance 1e-9), made by a script in `scripts/reference/`. The hand-computed test stays as a second test.
- **M9.3:** `src/lib/mp/feasibility.ts` runtime model.
  - Either source its constants (`0.02 * nsites^2.5`, spin ×2, metal ×1.5) or replace them with a sourced or plainly relative estimate ("about N times the cost of X"). Make the O(N^3) text agree with the formula.
  - Record the choice as a D entry. Keep the "Heuristic" label.
- **M7.5, M14.1, M14.2:** run the science-verifier on every formula and constant they added. Add golden files where the work order asked for them.
- **Builder-owned questions:**
  - Close or update Q-002, Q-005, Q-010, Q-012, Q-014, Q-018 and Q-021 with evidence.
  - Add the missing DECISIONS entries for real choices made in those stages, for example the screening query engine and the planner schema.
- One report per audited stage, plus a summary in `docs/reports/M15.2.md`.
**Tasks**: 1. `/audit-stage` on M14.3, M9.3, M7.5, M14.1, M14.2 in that order. 2. Golden generators and tests. 3. Questions and decisions. 4. Reports.
**Tests and reference values**: New golden files in `tests/reference/` made by `scripts/reference/` scripts (pymatgen from PyPI); never hand-edited.
**Done when**:
- [ ] Every audited stage has a findings list with each item fixed or recorded as a question.
- [ ] No unsourced constant remains in `src/lib/` (`scripts/guard` passes, and a grep for bare numeric factors in `src/lib/mp/` has been reviewed).
**Not in this stage**: new features; changes to the UI beyond what a fix needs.

## M15.3 Process repair: missing tests and records (Tier B)

**Goal**: Close the non-science gaps from the audit.
**Depends on**: M15.1
**Size**: M
**Deliverables**:
- Tests for the crystal editor (M10.4) and the molecule builder (M10.5): unit tests for their models, plus e2e and axe at 360 px for the keyboard path. Test what the code does now. If it is wrong, record a question; do not change the behaviour without one.
- Write a DECISIONS entry for the macOS scientific theme (commit 055c3cd): what it replaces in D-054 and why. Link it to Q-043, which stays open for the author.
- Correct the M11.1 report: Lighthouse does run locally with `CHROME_PATH=/opt/pw-browsers/chromium`. Run it and put the numbers in the report.
- Add the missing session-log lines for 2026-11-24 and 2026-11-25 to `docs/PROGRESS.md`, and the missing rows Q-045 to Q-049 to the status table in `docs/OPEN_QUESTIONS.md`.
- List the stale remote branches and draft PR #61 for the author. Delete nothing.
**Tasks**: 1. Model tests for M10.4 and M10.5. 2. e2e and axe. 3. Records (D entry, report correction, PROGRESS log, question table). 4. Branch list for the author.
**Tests and reference values**: Unit tests on the editor and builder models; e2e keyboard path at 360 px; axe with no violations.
**Done when**:
- [ ] `npm run verify` and the e2e pass. The new tests fail when the component is broken (show one mutation).
**Not in this stage**: deleting branches or closing PR #61 (author's call); theme changes.

## M15.4 Elastic tensor: reader and mechanical analysis (Tier A)

**Goal**: The user drops an OUTCAR from an `IBRION = 6, ISIF = 3` run and gets Cij in GPa, the Born stability test and the averaged moduli, each traced to its line and its source.
**Depends on**: M4.1
**Size**: L
**Sources**: S-042 (elastic chapter). The primary papers must be added to `docs/SCIENCE_SOURCES.md` before use:
- Born and Huang, or Mouhat and Coudert 2014, for the stability criteria;
- Hill 1952 for the Voigt-Reuss-Hill averages;
- Ranganathan and Ostoja-Starzewski 2008 for A^U;
- Anderson 1963 for the Debye temperature from sound velocities;
- Pugh 1954 and Chen 2011 for the indicators.
**Deliverables**:
- `src/lib/vasp/outcar.ts`: a `TOTAL ELASTIC MODULI` reader, in kBar, converted to GPa with a constant from the register. It reorders OUTCAR's XX YY ZZ XY YZ ZX order to Voigt 11 22 33 23 13 12 (the "ordering trap" in S-042).
- `src/lib/mechanics/elastic.ts`:
  - compliance S = C^-1;
  - the six eigenvalues and the general stability test;
  - the cubic, hexagonal and tetragonal (I) Born conditions;
  - B and G (Voigt, Reuss, Hill), E, ν and A^U;
  - sound velocities v_l, v_t, v_m and θ_D (needs the density from POSCAR);
  - the Pugh ratio, Cauchy pressure, Zener ratio and Chen Vickers hardness, labelled **Heuristic**, with their thresholds from the cited papers.
- A golden fixture made by `scripts/reference/`: a pymatgen `ElasticTensor` for 3 tensors (cubic, hexagonal, a triclinic one with mixed signs) giving the VRH moduli, A^U, the eigenvalues and θ_D. A synthetic OUTCAR block checks the reorder.
- A cross-check helper: B_H against B0 from the M13.6 EOS fit, warning when they differ by more than a few percent (S-042, Heuristic).
**Tasks**: 1. Sources into the register. 2. Golden generator. 3. Reader and reorder. 4. Analysis library. 5. EOS cross-check. 6. science-verifier review.
**Tests and reference values**: pymatgen `ElasticTensor` golden file (3 tensors); synthetic `TOTAL ELASTIC MODULI` fixtures generated by script; an asymmetric tensor that fails under a wrong Voigt mapping.
**Done when**:
- [ ] Golden agreement 1e-6 relative. The reorder is tested with an asymmetric tensor where a wrong mapping fails.
- [ ] Every threshold carries a source ID or is recorded in `docs/OPEN_QUESTIONS.md` (see Q-050).
**Not in this stage**: the energy-strain route (VASPKIT 201) as code. It is explained in M15.7.

## M15.5 Optics and dielectric response: readers and derived quantities (Tier A)

**Goal**: From ε1(ω) and ε2(ω) in `vasprun.xml`, compute n, k, α, R, L and σ. From the OUTCAR of an `LEPSILON` or `LCALCEPS` run, read ε∞, the ionic ε and the Born charges, and check the acoustic sum rule.
**Depends on**: M4.1
**Size**: M
**Sources**: S-042 (optics and dielectric chapters), plus a textbook source for the relations (for example Fox, *Optical Properties of Solids*), to be added to the register.
**Deliverables**:
- `src/lib/optics/derived.ts`:
  - |ε|, n, k, α (in cm^-1, with the unit conversion from the register), R, L and σ;
  - per component (xx, yy, zz) and a stated average.
- `src/lib/vasp/vasprunDielectric.ts`: a streaming-safe reader for the `<dielectricfunction>` block, run in a worker if large.
- `src/lib/vasp/outcar.ts`: blocks `MACROSCOPIC STATIC DIELECTRIC TENSOR (including local field effects in DFT)`, `... IONIC CONTRIBUTION` and `BORN EFFECTIVE CHARGES`. The sum-rule check (Σκ Z* about 0, threshold 0.1 from S-042) is labelled **Heuristic**.
- Golden values from a numpy script in `scripts/reference/` over a synthetic ε grid. Formats come from pymatgen's `Vasprun.dielectric` and `Outcar.read_lepsilon` on generated fixtures.
**Tasks**: 1. Source into the register. 2. Golden generator. 3. Derived quantities. 4. vasprun and OUTCAR readers. 5. Tests.
**Tests and reference values**: numpy golden values on a synthetic ε grid; generated `vasprun.xml` and OUTCAR fixtures read back by pymatgen first.
**Done when**:
- [ ] Golden agreement 1e-9 (the formulas are closed-form). The readers are tested on the fixtures.
- [ ] Metals are flagged: no intraband Drude term (S-042), stated next to the result.
**Not in this stage**: Kramers-Kronig transforms and scissor shifts as code; a plotting tool (UI comes later).

## M15.6 Phonon output reader: Γ modes and units (Tier A)

**Goal**: Read the Γ-point modes from an OUTCAR (IBRION = 5 to 8), mark imaginary modes and the three acoustic modes, and give every frequency in THz, cm^-1 and meV with sourced conversions.
**Depends on**: M4.1
**Size**: S
**Sources**: S-042 (phonon chapter, units table) and CODATA (already registered) for the conversions.
**Deliverables**:
- Mode parser (`f` and `f/i` lines) in `src/lib/vasp/outcar.ts`.
- `src/lib/physics/units.ts`: kBar to GPa, eV/Å^3 to GPa, THz to cm^-1 and meV, cm^-1 to meV, Ry and Hartree to eV, eV/atom to kJ/mol, eV/Å to nN. Each derives from CODATA constants, never typed in, and has a test against the S-042 table values to 4 significant figures.
- A small "phonon check" in the existing review tool (M14.1): imaginary modes, plus the near-zero acoustic count as a **Heuristic**.
- A golden file from pymatgen `Outcar.read_lepsilon`/`read_igpar` where applicable, or from a generator-made fixture.
**Tasks**: 1. Units library from CODATA. 2. Mode parser. 3. Review-tool check. 4. Tests.
**Tests and reference values**: Units against the S-042 table to 4 significant figures; mode lines (real, imaginary, acoustic) from generated fixtures.
**Done when**:
- [ ] Every conversion derives from a registered constant (no typed factors).
- [ ] Imaginary modes are flagged in the review tool and tested both ways.
**Not in this stage**: phonopy files (`band.yaml`, `FORCE_SETS`); those stay with the external tool.

## M15.7 Handbook module 12: lattice response and properties (Tier B)

**Goal**: Teach the S-042 chapters that have no page yet, in the site's voice (`docs/CONTENT_GUIDE.md`): why, which values, what happens if you skip it.
**Depends on**: M15.4, M15.5, M15.6
**Size**: L (split into two sessions if needed)
**Deliverables**: new module `src/content/handbook/12-properties/` with these topics:
- **Elastic constants:**
  - the run, and the "before you run" checks;
  - the ordering trap;
  - the Born criteria and VRH, using the M15.4 library;
  - the energy-strain route (VASPKIT 201, `VPKIT.in`) and what VASPKIT 203 reports.
- **Equation of state:** the E-V scan script, the minimum inside the range, B′0 between 3.5 and 5, polymorphs and transition pressure. Link the existing `/tools/eos/`.
- **Phonons:**
  - Route A, phonopy: the `-d`, `-f`, `band.conf` and `mesh.conf` steps;
  - Route B, DFPT;
  - LO-TO splitting and NAC with `BORN`;
  - Γ-only modes;
  - reading imaginary modes, and the thermal properties.
- **Dielectric tensor and Born charges:** the INCAR, the grep lines, the sum rule, anomalous Z*, and ε0 = ε∞ + ε_ion.
- **Optical properties:**
  - the sequence;
  - the derived quantities, using the M15.5 library;
  - scissor shift versus CSHIFT, anisotropy, metals, and converging NBANDS.
- **Bader charges:** the `chgsum.pl` and `bader` steps, AECCAR, ACF.dat columns, sign, checks and grid convergence.
- **Magnetocrystalline anisotropy:** the vasp_ncl steps, LORBMOM, and the k-mesh. This one goes into the existing `noncollinear-and-spin-orbit` topic rather than a new page.
- 4 to 6 practice questions per topic in `src/data/questions/module-12.json`, plus glossary terms.
- Add the AIMD (NVT) recipe from S-041 as a preset. Add `MDALGO`, `TEBEG` and `SMASS` to the tag data through the generator (`scripts/build/build-vasp-data.mjs`), not by hand.
**Tasks**: 1. Topic outlines from S-042 sections. 2. Write each topic (levels as in the content guide). 3. Questions and glossary. 4. AIMD preset through the generator. 5. e2e, axe, guards.
**Tests and reference values**: Question schema tests; preset passes the M3.4 validator with no errors; generator output diff reviewed.
**Done when**:
- [ ] Every formula on a page comes from a Tier A library or carries its S-id. Nothing new is invented on a content page.
- [ ] e2e and axe on every new topic at 360 px. The doc-links guard passes.
**Not in this stage**: new interactive labs; UI design.

## M15.8 Handbook: beyond-PBE depth and the property catalogue (Tier B)

**Goal**: Fill the depth gaps in existing topics, and add the S-042 "Other calculations" table as a catalogue page.
**Depends on**: M15.7
**Size**: M
**Deliverables**:
- **`dft-plus-u`:**
  - choosing U (database values, linear response with LDAUTYPE = 3, empirical fit, U scan);
  - the pitfalls: energies with different U are not comparable, the MP2020-style correction, metastable states and U ramping, per-species order, LDAUPRINT.
  - The Materials Project Ueff table needs Q-051 closed first. Until then, show no numbers, only the link.
- **`functionals`:**
  - SCAN versus r2SCAN stability, and the rVV10 BPARAM values (S-042);
  - mBJ has no total energy;
  - the hybrid band route with zero-weight k-points (VASPKIT 251 and 252);
  - optics with HSE.
- **New topic `12-properties/other-calculations`:** one short section per row of S-042's table. Each has its formula with S-id and a link to the tool that exists (work function, planar averages, formation energy, surface energy, screening hull).
  - The rows are: formation enthalpy, hull, cohesive energy, work function, surface energy, effective mass, ELF, Δρ, spin density, band offsets, d-band centre, Fermi surface, wavefunction plots, free-energy corrections, SOC bands, vdW, COHP, defects and AIMD.
- **Troubleshooting:** add the S-042 electronic and ionic "ladders" and "Signs of a good calculation" to `scf-trouble` and `relaxation-trouble`, as an ordered list where each rung says why.
**Tasks**: 1. Edit `dft-plus-u` and `functionals` in place. 2. Catalogue topic. 3. Ladders in the trouble topics. 4. science-verifier review.
**Tests and reference values**: Doc-links guard; any number shown comes from a library with a test or carries an S-id.
**Done when**:
- [ ] The science-verifier finds no formula without a source.
**Not in this stage**: the MP U table numbers before Q-051 closes; new tools.

## M15.9 Reference pages: units, where to read it, checklist, layout, VASPKIT map (Tier B)

**Goal**: The quick-reference parts of both handbooks, as pages a researcher keeps open.
**Depends on**: M15.6 (units library)
**Size**: M
**Deliverables**:
- `/reference/units/`: the S-042 units table, rendered from `src/lib/physics/units.ts` (no typed numbers). It also shows the VASPKIT k-resolution to KSPACING relation.
- `/reference/where-to-read/`: the S-041 `QUICK` table (14 rows) merged with the S-042 "Where to read it" table. Each row has the file, the grep line and a link to the parser that reads it.
- `/reference/checklist/`: the S-042 pre-submit checklist (12 calculations, must have and must not have). Each line that a validator rule checks links to that rule id (`src/lib/vasp/rules/`).
- The project layout tree in `07-running/the-workflow`, with the "back up OUTCAR and CONTCAR before the SCF" note.
- `07-running/vaspkit-in-practice`: complete the task-code map with the missing codes listed at the top of this file. Each code gets one line: what it reads, what it writes, where on the site it is explained.
**Tasks**: 1. Pages from libraries and data. 2. Checklist to rule-id links. 3. Workflow and VASPKIT edits. 4. Coverage script. 5. e2e, axe.
**Tests and reference values**: Units page renders values from `units.ts` (unit test on the rendered table); each checklist rule id exists (test).
**Done when**:
- [ ] Each page is linked from the handbook index and search, and passes e2e and axe at 360 px.
- [ ] A script that diffs the S-041 and S-042 section lists against site content (`scripts/guard/check-handbook-coverage.mjs`, warn-only) reports zero uncovered sections.
**Not in this stage**: UI design; new VASPKIT features beyond a one-line description.
