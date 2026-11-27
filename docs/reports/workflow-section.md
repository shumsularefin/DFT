# Stage Report: WF.1 Workflow section

- **Stage:** WF.1 (Workflow section from the VASP Workflow Handbook, S-042)
- **Date:** 2026-11-27
- **Branch:** `claude/workflow-section`
- **Decision:** D-110. **Questions:** Q-074 to Q-078.

## What was built

- `/workflow/`: the workflow map in four lanes, the project folder layout, how to use the section, links for when you need more, and the Revisions list with the version line.
- 16 step pages in `src/content/workflow/`, in this order: Prepare the inputs, Convergence tests, Relaxation (Geometry); Static SCF, DOS and PDOS, Band structure, Optics, Bader (Electronic); Elastic constants, Equation of state, Phonons, Dielectric tensor and Born charges, Magnetic ground state (Lattice and response); DFT+U, Meta-GGA, Hybrid functionals (Beyond PBE).
- Each step: a step card (folder, needs, runs, leaves), the protocol quote and notes (protocol steps 1 to 5), the INCAR from the Input Builder preset with the values to replace and an "Open in the Input Builder" link, the commands copied from S-042, what to check, the pre-submit checklist row, Learn-why links to the Handbook and Tools links, sources.
- The Input Builder opens a preset from `?preset=&variant=`; a `relax/fixed-volume` variant for the E-V scan.
- Modifiability: `src/data/workflow-protocol.json` (generated), `src/data/workflow.json` (version and history), `Protocol.astro`, `docs/WORKFLOW_GUIDE.md`.
- Older pages aligned with S-042 where the owner chose (D-110 (4)), and the missing reference rows added to the Handbook (D-110 (5)).

## How a future change is made

See `docs/WORKFLOW_GUIDE.md`. In short: step text is in `src/content/workflow/<id>.mdx`; INCAR values and the protocol wording come from the HTML handbook and are regenerated with `extract-handbooks.mjs` and `build-vasp-data.mjs`, so every page and tool that shows them changes together; order and grouping are front matter; each change raises the version in `src/data/workflow.json` with one history line. `src/lib/workflow.test.ts` fails if the site and the handbook disagree.

## Coverage map (S-042 section, then where it lives)

| S-042 section | Workflow page | Handbook and tools |
| --- | --- | --- |
| Workflow map | `/workflow/` (map, layout) | `07-running/the-workflow` |
| Your protocol (fixed) | Protocol quote and notes on relaxation, static-scf, band-structure, elastic, optics (from `workflow-protocol.json`) | `07-running/the-workflow` |
| Input and output files | prepare-inputs#inputs, #outputs | `06-vasp-files/output-files` ("Who reads each file"), `06-vasp-files/poscar` |
| ISTART and ICHARG | prepare-inputs#files-read | `07-running/restarts-istart-icharg` |
| VASPkit command map | prepare-inputs#run-vaspkit, #settings, #generate, #symmetry; the codes on each step | `07-running/vaspkit-in-practice` (full map, single home) |
| INCAR tag dictionary | Tag tables on each step | `src/data/vasp-tags.json` (Input Builder tag cards) |
| Convergence tests | convergence-tests | `08-convergence-and-errors/why-converge`, `encut-convergence`, `kpoint-convergence`; `/tools/convergence/` |
| Structural relaxation | relaxation | `09-analysis/relaxations`, `08-convergence-and-errors/relaxation-trouble` |
| Static SCF | static-scf | `07-running/the-workflow` |
| DOS and PDOS | dos | `09-analysis/density-of-states` |
| Band structure | band-structure (routes A and B) | `09-analysis/band-structures`; `/tools/kpath/` |
| Optical properties | optics | `12-properties/optical-properties` |
| Elastic constants | elastic (IBRION 6, Born criteria, VRH, indicators, energy-strain 201) | `12-properties/elastic-constants` |
| Energy-volume and EOS | equation-of-state (fixed-volume preset) | `12-properties/equation-of-state`; `/tools/eos/` |
| Phonons | phonons (routes A and B, LO-TO, Gamma modes) | `12-properties/phonons` |
| Dielectric tensor and Born charges | dielectric | `12-properties/dielectric-tensor` |
| Bader charges | bader | `12-properties/bader-charges` |
| Magnetic properties | magnetic (configurations, MAGMOM lines, T_C, MAE) | `05-practical-choices/finding-the-magnetic-ground-state`; `/tools/magnetic/` |
| DFT+U | dft-plus-u (U table, choosing U, pitfalls) | `05-practical-choices/dft-plus-u` |
| Meta-GGA | meta-gga (r2SCAN, mBJ, bands) | `05-practical-choices/functionals` |
| Hybrid functionals | hybrid (HSE06, PBE0, hybrid bands) | `05-practical-choices/functionals` |
| Other calculations | `/workflow/` "When you need more" | `12-properties/other-calculations` |
| Troubleshooting convergence | static-scf#converge, relaxation#check | `08-convergence-and-errors/scf-trouble` (diagnose commands, ladder) |
| Error message index | Linked from each step | `/errors/`, `08-convergence-and-errors/common-errors` |
| Units and quick formulas | Linked from `/workflow/` | `/reference/units/`, `/reference/where-to-read/` |
| Pre-submit checklist | "Before you submit" on each step | `/reference/checklist/` |

`scripts/guard/check-handbook-coverage.mjs` maps every S-042 section to these files and reports 0 uncovered.

## Where S-042 and the site differed

Changed to S-042 (the owner's choice): EDIFFG -0.005 with EDIFF 1E-6; band INCAR without LMAXMIX; elastic is protocol step 4 with NFREE 4, EDIFF 1E-8 and ±1 kB; optics with about 3× NBANDS, ALGO Normal and NEDOS 2001; E-V points as fixed-volume relaxations over ±5 to 10%; TIME 0.4 and 0.2; ALGO Fast as a Sub-Space-Matrix cause.

Kept, with S-042's version noted next to it: even Monkhorst-Pack meshes on hexagonal cells (Q-017); the Curie temperature formula (magnetic step and tool); whether the total energy converges (`why-converge`); the DOS from the SCF with an optional denser run (`density-of-states`); magnetic energies per formula unit or per magnetic ion (`finding-the-magnetic-ground-state`).

Raised as questions: Q-074 (soc preset and MAE), Q-075 (NSW in DFPT), Q-076 (ISTART in band route A), Q-077 (hybrid in the dielectric checklist row), Q-078 (two recipes and the first EDIFF rung).

## Verification

See the pull request for `npm run verify`, the e2e run (`tests/e2e/workflow.spec.ts`) and Lighthouse.
