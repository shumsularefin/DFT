# M7 Remaining handbook modules (4 to 11)

All content follows `docs/CONTENT_GUIDE.md` (nine-part anatomy, levels, sources, questions in `src/data/questions/module-NN.json`, concepts from `src/data/concepts.json`). The author's handbooks (S-041, S-042) are the seed for modules 5 to 9: rewrite in the site's voice, keep their facts and VASP-wiki page references, honour their `Corrected` entries, and surface the open errata (Q-017, Q-019) where relevant. Every lab is labelled `computed`, `toy-model` or `illustrative`.

Golden data used here: `tests/reference/scf1d_reference.json` (M7.1), `tests/reference/vasp-outputs/` (M7.5; synthetic files whose expected values come from pymatgen).

## M7.1 Module 4: Hohenberg-Kohn, Kohn-Sham and the SCF loop (with SCF lab)

**Goal**: The learner understands the two Hohenberg-Kohn statements, the Kohn-Sham trick (non-interacting electrons in an effective potential), the exchange-correlation functional as the one approximation, and the self-consistency loop, through a real computed lab.
**Depends on**: M6.1, M2.4
**Size**: L
**Sources**: S-011, S-012, S-047, S-048, S-031
**Deliverables**:
- Topics in `src/content/handbook/04-kohn-sham/`: `hohenberg-kohn-theorems`, `the-kohn-sham-idea`, `exchange-and-correlation`, `the-scf-loop` (lab), `when-scf-goes-wrong` (mixing, charge sloshing, links to module 8).
- `src/lib/physics/scf1d.ts`: the exact model of `scripts/reference/gen_scf1d_reference.py` (read that file; same grid, same operators, same mixing): two electrons in one spatial orbital (restricted Hartree-Fock) in a soft-Coulomb potential `-Z / sqrt(x^2 + 1)` with interaction `1 / sqrt((x - x')^2 + 1)`, atomic units; Fock operator `h0 + v_H / 2`; linear density mixing with a user-set alpha; returns every iteration (density, potential, orbital energy, total energy, residual) so the lab can animate it. Reuses the M2.4 tridiagonal eigen-solver.
- Lab `scf-loop`: steps shown as a cycle (guess density, build potential, solve, new density, mix, check), live plots of density and potential per iteration, residual on a log axis, mixing slider (0.05 to 1.0) showing that too much mixing oscillates or diverges and too little is slow, Z selector (1 or 2), a "non-interacting" toggle (no v_H). Badge `toy-model`: state plainly that this is a 1D two-electron Hartree-Fock model used to show the loop, not Kohn-Sham DFT with an XC functional, and that real VASP runs use Pulay/Broyden mixing (AMIX, BMIX; links to module 8).
- Questions and glossary (Hohenberg-Kohn, Kohn-Sham orbital, effective potential, Hartree potential, exchange-correlation, functional, self-consistency, mixing, residual).
**Tasks**: 1. Read `scripts/reference/gen_scf1d_reference.py` and port `scf1d.ts` operator by operator. 2. Match the golden energies before building any UI. 3. Lab with iteration playback and mixing slider. 4. Write the five topics, questions and glossary. 5. Lint, axe, Lighthouse record.
**Tests and reference values** (`tests/reference/scf1d_reference.json`, hartree units; tolerances from the generator's own convergence, 1e-10 residual):
- Z = 2: `E_HF = -2.22449966`, orbital energy `-0.750322`; Z = 1: `E_HF = -0.69209053`, orbital energy `-0.053859` (read them from the file, match within 1e-6).
- Density integrates to 2 within 1e-10; converged density is a fixed point (residual below 1e-10).
- Variational check: `E_exact_two_electron_same_grid` from the file (Z = 2: -2.23854988, an independent sparse diagonalization) lies below the computed `E_HF`; the lab may show the correlation energy (-0.01405 hartree for Z = 2) with that provenance.
- Mixing: alpha = 0.3 converges; alpha = 1.0 must either converge or be reported as oscillating by the residual history; the test records the behaviour you observe rather than asserting a guess.
**Done when**:
- [ ] Five topics, lab, questions; lint clean; labels honest.
- [ ] Golden values reproduced; the lab never claims to be Kohn-Sham DFT.
**Not in this stage**: real functionals, plane waves (module 5).

## M7.2 Module 5: Practical choices

**Goal**: The heart of the course: every practical choice in a DFT calculation, what it does, why the usual value, what breaks.
**Depends on**: M7.1, M4.4, M4.5, M5.5
**Size**: L (plan for two sessions: topics 1 to 4, then 5 to 8; mark `partial` in between)
**Sources**: S-008, S-009, S-013, S-014, S-015, S-016, S-017, S-025, S-026, S-027, S-028, S-040, S-042, S-046, S-049
**Deliverables**:
- Topics in `src/content/handbook/05-practical-choices/`: `plane-waves-and-encut` (embeds the ENCUT lab, M4.4; Pulay stress and the 1.3 x ENMAX rule from the author's protocol), `kpoints-and-the-brillouin-zone` (k-mesh lab M4.5, BZ lab M5.5; Gamma versus Monkhorst-Pack with Q-017), `pseudopotentials-and-paw` (lab 1), `functionals` (lab 2), `smearing` (lab 3), `spin-and-magnetism` (lab 4), `dft-plus-u` (lab 5), `vdw-corrections` (short, no lab).
- Lab 1 `paw-picture` (badge `illustrative`): an all-electron-like radial function with nodes near the nucleus versus a smooth pseudo function that matches outside a cutoff radius r_c, with the augmentation idea in words; slider for r_c; clearly schematic (no claim that the curves are real atomic data).
- Lab 2 `functional-ladder` (badge `illustrative`): Jacob's ladder diagram (LDA, GGA/PBE, meta-GGA/SCAN and r2SCAN, hybrids/HSE06 and PBE0, and the fifth rung), with cost and what each rung adds; the only numbers shown are those with a source (the author's handbook: PBE lattice constants typically about 1 to 2 % too large, LDA about 1 to 2 % too small, S-042).
- Lab 3 `smearing` (badge `computed`): occupation functions and broadened delta functions for Fermi-Dirac, Gaussian (`f = erfc(x)/2`), Methfessel-Paxton order 1 and 2, and Marzari-Vanderbilt cold smearing, with x = (epsilon - mu)/sigma; a SIGMA slider; a toy metallic DOS showing how the computed band energy and the entropy term change with SIGMA; links to VASP tags ISMEAR, SIGMA and to the `EENTRO` check (T*S per atom below about 1 meV, S-042).
- Lab 4 `spin-cartoon` (badge `illustrative`): ferromagnetic versus antiferromagnetic arrangements on a small lattice with MAGMOM shown per atom in POSCAR order, connected to the MAGMOM count rule (V001).
- Lab 5 `dft-plus-u` (badge `computed`, toy): the Dudarev penalty for one orbital `E_U = (U_eff / 2) n (1 - n)` and its potential `V = U_eff (1/2 - n)`; slider for U_eff and occupation n.
- `src/lib/physics/smearing.ts` and `src/lib/physics/dftu.ts` with tests.
**Tasks**: 1. Session one: `smearing.ts` and `dftu.ts` with the invariant tests, labs 3 and 5, topics 1 to 4. 2. Mark `partial` with the exact remaining list. 3. Session two: labs 1, 2 and 4, topics 5 to 8. 4. Link every parameter mention to its tag card. 5. Questions, lint, accessibility.
**Tests and reference values**:
- Smearing (invariants, not memorised numbers): each broadened delta `delta(x) = -df/dx` integrates to 1 (1e-10 by quadrature on [-10, 10]); Gaussian second moment `integral x^2 delta = 1/2`; Methfessel-Paxton order N with `delta_N = sum_{n=0..N} A_n H_{2n}(x) exp(-x^2)`, `A_n = (-1)^n / (n! 4^n sqrt(pi))`, has vanishing moments `integral x^m delta_N = 0` for 1 <= m <= 2N+1 (so MP1's second moment is 0, worked by hand in planning: `delta_1 = (3/2 - x^2) exp(-x^2)/sqrt(pi)`); MP occupations go slightly outside [0, 1] (test that they do, it is a known feature); cold smearing written in the form `delta(x) = exp(-(x - 1/sqrt 2)^2) (2 - sqrt2 x) / sqrt(pi)` (check the sign convention for x against S-016 and state it) integrates to 1 and has zero first moment (both shown by hand in planning). Fermi-Dirac `f(0) = 1/2` and `integral delta = 1`.
- DFT+U: `E_U(n = 0.5, U_eff = 4 eV) = 0.5 eV`, `E_U(0) = E_U(1) = 0`, `V(n = 1) = -U_eff/2` (S-014).
**Done when**:
- [ ] Eight topics, five labs, questions; every "why this value" for ENCUT, KPOINTS, ISMEAR, SIGMA, ISPIN, MAGMOM, LDAU tags links to the tag cards from M3.3.
- [ ] Lint clean; numbers sourced; the vdW topic cites S-028 and names the tag values from the dictionary (IVDW 11, 12, 20).
**Not in this stage**: files and running (module 6, 7).

## M7.3 Modules 6 and 7: VASP files and running a calculation

**Goal**: The learner can read and write the four input files, knows what every output file is for, and can run, monitor and restart a calculation with the author's protocol.
**Depends on**: M3.6, M4.1
**Size**: L
**Sources**: S-019, S-020, S-041, S-042
**Deliverables**:
- Module 6 topics (`06-vasp-files/`): `poscar`, `kpoints`, `incar`, `potcar` (structure and meaning only; how to obtain it under your licence; `grep TITEL/ENMAX/ZVAL POTCAR`; never contents), `output-files` (all 16 entries of the Field Handbook's file reference, compact), each embedding the clickable file explorer (M3.6) with real example files from the handbooks or `data/author/`.
- Module 7 topics (`07-running/`): `the-workflow` (the author's five-step protocol, reproduced faithfully, plus the project folder layout from the Workflow Handbook), `job-scripts` (SLURM and PBS templates from M3.5; parallel tags NCORE, KPAR), `restarts-istart-icharg` (the ISTART and ICHARG tables and the rule about what must match), `reading-oszicar-and-outcar` (lab), `vaspkit-in-practice` (the command map, with the caveat that menu numbers change between releases).
- Lab `output-reader` (badge `computed`): drop or pick an OSZICAR or OUTCAR; it annotates every recognised line using the M4.1 parsers (what the number means, whether it looks healthy), shows the ionic and electronic convergence, flags "reached required accuracy" present or missing, max force against EDIFFG, entropy term per atom, magnetization.
- Questions, glossary.
**Tasks**: 1. Collect example files (handbooks, `data/author/`) and check them with the guard. 2. Output-reader lab on top of the M4.1 parsers. 3. Module 6 topics with the file explorer. 4. Module 7 topics with the faithful protocol. 5. Validator run on every INCAR shown; questions; lint.
**Tests and reference values**:
- The output reader on `tests/reference/vasp-outputs/OSZICAR_relax_spin` reports two ionic steps with F, E0, dE and mag equal to `expected.json` (from pymatgen's reader).
- Every protocol INCAR shown passes the M3.4 validator with no errors (warnings listed, Q-019 noted).
**Done when**:
- [ ] Ten topics complete; the protocol is word-for-word faithful where quoted and clearly marked as the author's protocol.
- [ ] No POTCAR content anywhere (guard).
**Not in this stage**: convergence and errors (module 8).

## M7.4 Module 8: Convergence testing and common errors (with error finder)

**Goal**: The learner can run a defensible convergence study and diagnose the common VASP failures; an error finder turns a pasted error message into causes and fixes.
**Depends on**: M7.3, M4.3
**Size**: M
**Sources**: S-041, S-042, S-019
**Deliverables**:
- Topics (`08-convergence-and-errors/`): `why-converge` (what converges and what does not, 1 meV/atom, report both settings), `encut-convergence` (series generator and plotter from M4.2/M4.3, worked through), `kpoint-convergence` (metals versus insulators, smearing tests), `scf-trouble` (mixing, ALGO, NELM), `relaxation-trouble` (ZBRENT, POTIM, IBRION switch), `common-errors` (overview linking to the finder).
- `src/data/errors.json`: merged and de-duplicated from the Field Handbook's 22 troubleshooting entries and the Workflow Handbook's 20 error-index rows (extracted in M3.3): `id`, `messages` (exact strings or regexes as printed by VASP, e.g. `ZBRENT: fatal error in bracketing`, `BRMIX: very serious problems`, `Sub-Space-Matrix is not hermitian`, `VERY BAD NEWS! internal error in subroutine IBZKPT`, `Tetrahedron method fails`, `The distance between some ions is very small`, `Error reading WAVECAR`), `symptoms`, ordered `causes`, ordered `fixes` (each fix with the INCAR change if any), `related` tags, `sources` (the handbook entry ids).
- `/errors/` page and an MDX component: paste a log excerpt or type a symptom; matching is done locally with exact and fuzzy keyword matching; results ranked; each result shows causes and fixes at the current level; "nothing matched" offers browsing by category.
**Tasks**: 1. Merge the 22 troubleshooting entries and 20 error rows into `errors.json` with a merge table in the report. 2. Matching engine with tests. 3. `/errors/` page and MDX component. 4. Six topics. 5. Questions, lint, accessibility.
**Tests and reference values**:
- Every error id from both handbooks appears (counts reconciled in the report: 22 + 20 rows mapped to N unique entries with the merge table).
- Matching: each entry's own message strings match it as the top result; a log with two errors returns both.
**Done when**:
- [ ] Six topics and the finder; questions; lint clean.
**Not in this stage**: analysis (module 9).

## M7.5 Module 9: Analysis (with relaxation, DOS/band and charge-density tools)

**Goal**: The learner can judge a relaxation, read a DOS and a band structure, and look at a charge density, using in-browser tools that parse real VASP files.
**Depends on**: M7.4, M5.6, M2.1
**Size**: L (plan for two sessions: parsers first, then tools and topics)
**Sources**: S-019, S-030, S-042, S-043
**Deliverables**:
- Parsers in `src/lib/vasp/`: `doscar.ts` (total and projected DOS; ISPIN 1 and 2; LORBIT 10 and 11 column layouts with the orbital order `s, py, pz, px, dxy, dyz, dz2, dxz, dx2`), `eigenval.ts` (ISPIN 1 and 2, occupations), `chgcar.ts` (CHG, CHGCAR, PARCHG: structure header, grid, values in x-fastest order, second grid for magnetization when ISPIN = 2, augmentation block skipped; values divided by the cell volume give e/Angstrom^3 as the Field Handbook explains), `xdatcar.ts` (VASP 5 trajectories). Large files parsed in a worker with progress.
- `src/lib/physics/marchingCubes.ts` (S-030): isosurface extraction with the standard 256-case table, interpolation on edges, periodic wrap option; runs in a worker.
- Tools/labs: `relaxation-viewer` (trajectory in 3D using `CellScene`, energy and max force per step from OSZICAR/OUTCAR, final CONTCAR download), `dos-viewer` (total and projected DOS with element/orbital selection, spin up/down mirrored, E - E_F axis, smoothing off by default and labelled when on), `band-viewer` (EIGENVAL plus the KPOINTS line-mode file or the k-path tool's labels; distance along the path; band gap and its direct/indirect character computed and labelled as such), `density-viewer` (CHGCAR isosurface with level slider, cross-section plane, total versus magnetization).
- Example data: if `data/author/` has real files, trimmed copies go to `public/examples/` with a README of their provenance (Q-008); otherwise the tools ship with **no** example data and a clear "drop your own file" state (the synthetic fixtures in `tests/reference/vasp-outputs/` are for tests only and must never be shown as results).
- Topics (`09-analysis/`): `energies-and-forces`, `relaxations`, `density-of-states`, `band-structures` (both routes from the author's protocol, KPOINTS_OPT for VASP >= 6.3), `charge-density`.
**Tasks**: 1. Session one: the four parsers against `tests/reference/vasp-outputs/`, then marching cubes. 2. Mark `partial` if needed with the exact remaining list. 3. Session two: the four viewers in workers, with keyboard and touch support. 4. Topics. 5. Example data only if real and documented.
**Tests and reference values** (`tests/reference/vasp-outputs/expected.json`):
- CHGCAR and CHGCAR_spin: grid `20 x 20 x 24`, the five sample values at the listed indices (compare raw rho*V within 1e-9 relative), electrons = sum/N_grid = 1.99995 (within 1e-6), max density 0.70151 e/Angstrom^3, magnetization integral 0.99997 for the spin file. The non-cubic grid catches axis-order mistakes.
- EIGENVAL ispin 1 and 2: k-points, weights, energies and occupations equal pymatgen's reading.
- XDATCAR: three frames with the listed fractional coordinates.
- DOSCAR: equals the expected arrays; note in the report that this fixture is not independently validated and must be re-checked with a real author DOSCAR (Q-008).
- Marching cubes on an analytic sphere `f = |r|` sampled on a 64^3 grid: enclosed volume within 1 % of `4/3 pi R^3` and the mesh is closed (every edge shared by two triangles) for an interior sphere.
- Band gap function: for a hand-made set of bands with VBM at Gamma and CBM at X the gap and "indirect" are reported correctly.
**Done when**:
- [ ] Parsers pass the fixtures; tools work with keyboard and touch; large files never freeze the page.
- [ ] No synthetic number is ever displayed as a result; examples are real and documented or absent.
**Not in this stage**: the worked example (M7.6).

## M7.6 Modules 10 and 11: Worked example and tool tour

**Goal**: A complete, honest worked example of a perovskite oxide workflow on the RCuO3 family, and a closing module that hands the learner to the research tools.
**Depends on**: M7.5, M8.4, M9.3, M10.5
**Scheduling note**: this stage deliberately comes after M10 because module 10 uses the tolerance-factor explorer and module 11 tours the Studio and the Builder. `STAGE: NEXT` skips it until those are done.
**Size**: L
**Sources**: S-001, S-002, S-003, S-042 and the author's data
**Deliverables**:
- Module 10 (`10-worked-example/`): `choosing-the-system` (why RCuO3, tolerance factors with the CN policy of D-028 and the Q-003 caveat), `structure-and-inputs`, `convergence`, `relaxation`, `electronic-structure`, `what-we-learned`. Every number comes from the author's files in `data/author/` (Q-008) and is attributed to them; if the files are not there, the module is written with the workflow and the inputs but **no result numbers**, a visible "Results pending: author data not yet supplied" note, and the stage is `partial`.
- Module 11 (`11-tools/`): `screening-studio`, `material-builder`, `research-tools-overview` (tolerance factor, input builder, convergence helper, k-path viewer), `what-next`.
**Tasks**: 1. Inventory the author's files and build `values.json` with a source path for every number. 2. Write module 10, or the honest partial version if data are missing. 3. Write module 11 against the finished tools. 4. Add the test that every number in module 10 is in `values.json`. 5. Lint and link check.
**Tests and reference values**:
- Every numeric value on the module 10 pages appears in a JSON next to the content (`src/content/handbook/10-worked-example/values.json`) with the source file path in `data/author/` or `public/examples/`; a test fails if a number in the MDX is not in that JSON.
**Done when**:
- [ ] Module 10 is complete with real data, or honestly partial; module 11 complete.
**Not in this stage**: new tools.
