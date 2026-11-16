# M14 Research guidance

Added in plan v3 (D-055, `docs/ROADMAP_V3.md`). The research tools must be the most trustworthy part of the site. Three rules on top of `CLAUDE.md`: (1) every recipe step, check and formula carries a source ID, and a guard fails the build if one does not; (2) every check says whether it is a **rule** (from the VASP wiki or the author's handbooks), a **heuristic** (a rule of thumb, badge "Heuristic") or a **computed** result (from the user's own files); (3) the tools never claim a calculation is correct, only that it passed or failed named checks.

## M14.1 Calculation review: pre-flight and post-flight checks

**Goal**: Drop a calculation folder (or a zip) and get a single, honest review: before the run, are the inputs consistent; after the run, did it converge and does the result mean what the user thinks it means.
**Depends on**: M7.4, M13.3
**Size**: L
**Sources**: S-041, S-042, S-019, S-065
**Deliverables**:
- `/tools/review/`: drop several files, a folder (directory input) or a zip (fflate); all parsing local; recognises INCAR, POSCAR or CONTCAR, KPOINTS, OSZICAR, OUTCAR, and the POTCAR **header lines only** if present (TITEL, ENMAX, ZVAL; never stored, never displayed beyond those values, guard unchanged).
- `src/lib/review/preflight.ts`: runs the M3.4 validator with a context built from the files (species order from POSCAR, ENMAX and ZVAL from the POTCAR header if given), MAGMOM count and pattern against POSCAR, k-mesh centring advice (Q-017), ENCUT versus 1.3 x ENMAX (author's protocol), NBANDS rule V032, cost bucket from M9.3 when available.
- `src/lib/review/postflight.ts`: "reached required accuracy" present, final max force versus EDIFFG, electronic steps hitting NELM in any ionic step, entropy term per atom versus 1 meV (S-042), final magnetization and per-site moments versus the intended MAGMOM pattern (M13.3 `patternKept`), symmetry of POSCAR versus CONTCAR (moyo; a change is reported, not judged), Pulay-stress heuristic (Q-014), volume change during relaxation.
- Output as a transcript-style report: each check one line with status (pass, warn, fail, not checked), the reason in plain language at the current level, the source, and a fix when one exists (link to the error finder entry or an INCAR change); export as Markdown so it can go into a lab notebook.
**Tasks**: 1. File intake and recognition with tests (misnamed files detected by content). 2. Pre-flight checks with tests. 3. Post-flight checks against `tests/reference/vasp-outputs/`. 4. Report UI and Markdown export. 5. e2e, axe, Lighthouse.
**Tests and reference values**:
- Each check has a passing and a failing fixture; post-flight on `OSZICAR_relax_spin` and the synthetic OUTCAR reads the values in `expected.json`.
- A POTCAR-like header fixture yields ENMAX and ZVAL; the full text is never kept in state (unit test on the state object) and never rendered.
**Done when**:
- [ ] Every line in the report names its source or carries "Heuristic"; nothing is called "correct".
**Not in this stage**: running VASP, remote files.

## M14.2 Research planner: goal to a sourced, step-by-step workflow

**Goal**: A researcher (or a student starting a project) picks a goal and a structure and receives the full sequence of calculations, each with inputs from the Input Builder, what must be converged first, what files carry over, what to report, and the pitfalls, with every step traced to a source.
**Depends on**: M14.1, M13.5, M13.6, M9.3
**Size**: L
**Sources**: S-041, S-042, S-019, S-065, S-061, S-063, S-067, S-058
**Deliverables**:
- `src/data/recipes.json` (schema-validated; build-time): goals `lattice-constant` (EOS, M13.6), `relaxed-structure`, `band-structure` (both routes from the author's protocol), `dos-pdos`, `magnetic-ground-state` (M13.2, M13.3), `surface-energy` (M13.5; `gamma = (E_slab - N E_bulk) / (2 A)` for symmetric slabs, sourced), `vacancy-formation` (neutral, M13.5), `formation-energy` (user-supplied reference energies), `elastic-constants`, `phonons-at-gamma`, `optics`. Each recipe: ordered steps `{ id, title, preset, prerequisites, carries: ['CHGCAR', 'WAVECAR', 'CONTCAR'], checks, report: [what to write in the methods section], pitfalls: [errors.json ids], sources }`.
- Guard `scripts/guard/check-recipes.mjs`: every step has at least one source, every preset exists in `incar-presets.json`, every pitfall id exists in `errors.json`.
- `/tools/planner/`: goal picker, structure input or hand-off, generated plan as a numbered step list (design language v3), each step expandable with "why this step", "why these values", "what happens if you skip it"; one zip with a folder per step (inputs from the Input Builder, a run script that copies the carried files), and a `PLAN.md` with the methods checklist.
- Small calculators used by recipes, each in `src/lib/physics/` with a test and a source: surface energy, neutral formation energy, energy per formula unit.
- Clear limits on the page: the plan is a starting protocol, not a guarantee; it does not choose U values or functionals for the user (it explains the choice and links to module 5).
**Tasks**: 1. Recipe schema and the guard. 2. Write the recipes from the handbooks (rewrite in the site's voice, keep facts and wiki page names). 3. Calculators with tests. 4. Planner UI and zip. 5. e2e, axe, Lighthouse; science-verifier review.
**Tests and reference values**:
- Guard catches a step without a source, an unknown preset and an unknown pitfall id.
- Every INCAR the planner produces passes the M3.4 validator with no errors.
- Surface energy calculator: a hand-checked example with integer energies and area in the test, plus the unit conversion to J/m^2 (constant from the register).
**Done when**:
- [ ] Every goal produces a complete plan whose every step is sourced; the zip unpacks to valid folders.
- [ ] The science-verifier agent finds no unsourced number or rule.
**Not in this stage**: automated job submission, HPC connections, machine-learning predictions.

## M14.3 Charge-density difference, spin density and planar averages

**Goal**: Two analyses researchers do by hand with scripts: the charge-density difference (bonding and charge transfer) and the planar-averaged electrostatic potential (vacuum level and work function of a slab), plus a spin-density view.
**Depends on**: M7.5, M13.5
**Size**: M
**Sources**: S-019, S-030, S-043, S-065, S-066
**Deliverables**:
- `src/lib/vasp/locpot.ts` (same volumetric format as CHGCAR; LOCPOT values are not multiplied by the volume, which the parser states and tests).
- `src/lib/physics/volumetric.ts`: grid and cell compatibility check (same lattice within tolerance and same grid, else a clear refusal), difference `rho_AB - rho_A - rho_B`, planar average along a lattice axis, macroscopic average with a user window, spin density from the second CHGCAR block.
- Density viewer (M7.5) gains: difference mode (positive and negative isosurfaces distinguished by shape cue and label as well as colour), spin-density mode, planar-average plot. A small `/tools/work-function/` page: LOCPOT plus the Fermi energy from OUTCAR gives `Phi = V_vacuum - E_F`, with the vacuum plateau detected and shown, and a warning when no flat plateau exists (thin vacuum, or a polar slab without a dipole correction, S-066).
**Tasks**: 1. Fixture generator extension (pymatgen `Locpot` and `Chgcar` on synthetic grids). 2. `locpot.ts` and `volumetric.ts` against it. 3. Viewer modes. 4. Work-function page. 5. e2e, axe, size (large files in a worker with progress).
**Tests and reference values**:
- Planar averages equal pymatgen's `get_average_along_axis` on the synthetic fixtures within 1e-9 relative.
- Difference of a density with itself is zero everywhere; incompatible grids are refused.
- Work function on a synthetic LOCPOT with a known plateau and a known E_F equals the constructed value.
**Done when**:
- [ ] All fixture comparisons pass; large files never freeze the page; no synthetic data is ever displayed as a result.
**Not in this stage**: Bader analysis (external program), charged-slab corrections.
