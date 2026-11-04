# Progress

Updated by every build session (see `docs/WORKFLOW.md` section 6). The table order is the build order; `STAGE: NEXT` takes the first row that is `todo` or `partial` and whose dependencies are all `done`. Status values: `todo`, `in-progress`, `partial`, `blocked`, `done`. The **Branch** column is what you paste as `BASE` for the next stage when you stack stages without merging (Mode B).

Planning baseline (2026-10-27): environment, rules, work orders, golden reference data and guards are in place; no application code exists yet. Start with `STAGE: M0.1`, `BASE: main` after merging the planning branch.

| Stage | Title | Status | Depends on | Size | Branch | PR | Updated | Note |
|---|---|---|---|---|---|---|---|---|
| M0.1 | Scaffold the project | done | none | M | claude/vigilant-newton-ws593b | | 2026-10-28 | [work order](milestones/M0-scaffold.md) |
| M0.2 | Hosting, CI/CD, budgets and first deploy | done | M0.1 | M | claude/vigilant-newton-ws593b | [#1](https://github.com/shumsularefin/DFT/pull/1) | 2026-10-28 | [work order](milestones/M0-scaffold.md) |
| M1.1 | Design tokens, themes and UI primitives | done | M0.2 | M | claude/vigilant-newton-ws593b | | 2026-10-28 | [work order](milestones/M1-design-and-shell.md) |
| M1.2 | Content system and topic anatomy | done | M1.1 | L | claude/vigilant-newton-ws593b | | 2026-10-28 | [work order](milestones/M1-design-and-shell.md) |
| M1.3 | Handbook shell, level switch, progress, search and SEO | done | M1.2 | M | claude/vigilant-newton-ws593b | | 2026-10-29 | [work order](milestones/M1-design-and-shell.md) |
| M2.1 | Lab framework | done | M1.3 | M | claude/vigilant-newton-ws593b | | 2026-10-29 | [work order](milestones/M2-modules-1-3.md) |
| M2.2 | Module 1: Why DFT exists | done | M1.3 | M | claude/vigilant-newton-ws593b | | 2026-10-29 | [work order](milestones/M2-modules-1-3.md) |
| M2.3 | Module 2: Quantum basics without math (with labs) | done | M2.1, M2.2 | L | claude/vigilant-newton-ws593b | | 2026-11-03 | [work order](milestones/M2-modules-1-3.md) |
| M2.4 | Module 3: The many-electron problem and why density helps (with labs) | done | M2.3 | L | claude/vigilant-newton-ws593b | | 2026-11-03 | [work order](milestones/M2-modules-1-3.md) |
| M3.1 | Structure core: lattice math and POSCAR | done | M0.2 | M | claude/vigilant-newton-ws593b | | 2026-11-03 | [report](reports/M3.1.md), [work order](milestones/M3-input-builder.md) |
| M3.2 | KPOINTS generation | done | M3.1 | M | claude/vigilant-newton-ws593b | | 2026-11-03 | [report](reports/M3.2.md), [work order](milestones/M3-input-builder.md) |
| M3.3 | INCAR data model, presets and handbook extraction | done | M3.1 | L | claude/vigilant-newton-ws593b | | 2026-11-03 | [report](reports/M3.3.md), [work order](milestones/M3-input-builder.md) |
| M3.4 | INCAR validation rules engine | done | M3.2, M3.3 | L | claude/vigilant-newton-ws593b | | 2026-11-03 | [report](reports/M3.4.md), [work order](milestones/M3-input-builder.md) |
| M3.5 | Input Builder UI | done | M3.4, M1.3 | L | claude/vigilant-newton-ws593b | | 2026-11-03 | [report](reports/M3.5.md), [work order](milestones/M3-input-builder.md) |
| M3.6 | Clickable file explorer | done | M3.3, M1.2 | S | claude/vigilant-newton-ws593b | | 2026-11-03 | [report](reports/M3.6.md), [work order](milestones/M3-input-builder.md) |
| M4.1 | Output parsers and convergence analysis | done | M3.2 | L | claude/vigilant-newton-ws593b | | 2026-11-03 | [report](reports/M4.1.md), [work order](milestones/M4-convergence.md) |
| M4.2 | Convergence series generator | done | M3.5, M4.1 | M | claude/vigilant-newton-ws593b | | 2026-11-04 | [report](reports/M4.2.md), [work order](milestones/M4-convergence.md) |
| M4.3 | Convergence plotter UI | done | M4.1 | M | claude/vigilant-newton-ws593b | | 2026-11-04 | [report](reports/M4.3.md), [work order](milestones/M4-convergence.md) |
| M4.4 | ENCUT lab and toy plane-wave solver | done | M2.1, M3.1 | L | claude/vigilant-newton-ws593b | | 2026-11-04 | [report](reports/M4.4.md), [work order](milestones/M4-convergence.md) |
| M4.5 | K-point mesh lab | done | M4.4, M3.2 | L | claude/vigilant-newton-ws593b | | 2026-11-04 | [report](reports/M4.5.md), [work order](milestones/M4-convergence.md) |
| M5.1 | Symmetry (moyo), CIF and standardization | done | M3.1 | L | claude/vigilant-newton-ws593b | | 2026-11-04 | [report](reports/M5.1.md), [work order](milestones/M5-brillouin-zone.md) |
| M5.2 | Brillouin zone geometry | done | M3.1 | M | claude/vigilant-newton-ws593b | | 2026-11-04 | [report](reports/M5.2.md), [work order](milestones/M5-brillouin-zone.md) |
| M5.3 | HPKOT k-paths (default convention) | done | M5.1, M5.2 | L | claude/vigilant-newton-ws593b | | 2026-11-04 | [report](reports/M5.3.md), [work order](milestones/M5-brillouin-zone.md) |
| M5.4 | Setyawan-Curtarolo k-paths (second convention) | done | M5.3 | L | claude/vigilant-newton-ws593b | | 2026-11-04 | [report](reports/M5.4.md), [work order](milestones/M5-brillouin-zone.md) |
| M5.5 | 3D Brillouin zone and lattice viewer | done | M5.2, M2.1 | M | claude/vigilant-newton-ws593b | | 2026-11-04 | [report](reports/M5.5.md), [work order](milestones/M5-brillouin-zone.md) |
| M5.6 | k-path tool page and exports | todo | M5.3, M5.4, M5.5, M3.2 | M | | | | [work order](milestones/M5-brillouin-zone.md) |
| M6.1 | Concept graph and question bank | todo | M2.4 | M | | | | [work order](milestones/M6-adaptive-engine.md) |
| M6.2 | Mastery and spacing models | todo | M6.1 | M | | | | [work order](milestones/M6-adaptive-engine.md) |
| M6.3 | Thompson-sampling policy | todo | M6.2 | M | | | | [work order](milestones/M6-adaptive-engine.md) |
| M6.4 | Practice UI, quizzes, mastery map and gentle gamification | todo | M6.3, M1.3 | L | | | | [work order](milestones/M6-adaptive-engine.md) |
| M6.5 | Optional progress sync with Firebase (Spark) | todo | M6.4, M0.2 | M | | | | [work order](milestones/M6-adaptive-engine.md) |
| M7.1 | Module 4: Hohenberg-Kohn, Kohn-Sham and the SCF loop (with SCF lab) | todo | M6.1, M2.4 | L | | | | [work order](milestones/M7-remaining-modules.md) |
| M7.2 | Module 5: Practical choices | todo | M7.1, M4.4, M4.5, M5.5 | L | | | | [work order](milestones/M7-remaining-modules.md) |
| M7.3 | Modules 6 and 7: VASP files and running a calculation | todo | M3.6, M4.1 | L | | | | [work order](milestones/M7-remaining-modules.md) |
| M7.4 | Module 8: Convergence testing and common errors (with error finder) | todo | M7.3, M4.3 | M | | | | [work order](milestones/M7-remaining-modules.md) |
| M7.5 | Module 9: Analysis (with relaxation, DOS/band and charge-density tools) | todo | M7.4, M5.6, M2.1 | L | | | | [work order](milestones/M7-remaining-modules.md) |
| M8.1 | Shannon radii dataset and lookup | todo | M0.2 | M | | | | [work order](milestones/M8-tolerance-factor.md) |
| M8.2 | Factors, checks and mixed sites | todo | M8.1 | M | | | | [work order](milestones/M8-tolerance-factor.md) |
| M8.3 | Explorer UI and the shared periodic table | todo | M8.2, M1.3 | M | | | | [work order](milestones/M8-tolerance-factor.md) |
| M8.4 | Maps, family trend and hand-offs | todo | M8.3, M4.3 | M | | | | [work order](milestones/M8-tolerance-factor.md) |
| M9.1 | Data pipeline, schema, validation and sample data | todo | M5.1 | L | | | | [work order](milestones/M9-screening-studio.md) |
| M9.2 | Explorer UI | todo | M9.1, M8.3 | L | | | | [work order](milestones/M9-screening-studio.md) |
| M9.3 | Feasibility check and first-project builder | todo | M9.2, M3.5, M4.2 | L | | | | [work order](milestones/M9-screening-studio.md) |
| M9.4 | Hooks, attribution, offline and integration | todo | M9.3 | S | | | | [work order](milestones/M9-screening-studio.md) |
| M10.1 | Chemistry data and validity engine | todo | M8.2, M5.1 | L | | | | [work order](milestones/M10-material-builder.md) |
| M10.2 | Crystal operations and exports | todo | M10.1 | M | | | | [work order](milestones/M10-material-builder.md) |
| M10.3 | Molecule engine (RDKit 2D, in-house 3D) | todo | M10.1 | L | | | | [work order](milestones/M10-material-builder.md) |
| M10.4 | Crystal editor UI | todo | M10.2, M5.5, M8.3 | L | | | | [work order](milestones/M10-material-builder.md) |
| M10.5 | Molecule editor UI | todo | M10.3, M10.4 | L | | | | [work order](milestones/M10-material-builder.md) |
| M7.6 | Modules 10 and 11: Worked example and tool tour | todo | M7.5, M8.4, M9.3, M10.5 | L | | | | [work order](milestones/M7-remaining-modules.md) |
| M11.1 | Performance and offline audit | todo | M10.5, M9.4, M7.6, M6.5 | M | | | | [work order](milestones/M11-polish.md) |
| M11.2 | Accessibility and security audit | todo | M11.1 | M | | | | [work order](milestones/M11-polish.md) |
| M11.3 | Content integrity and release preparation | todo | M11.2 | M | | | | [work order](milestones/M11-polish.md) |

## Session log

Newest first. One line per session: date, stage, outcome, branch.

- 2026-10-29, M2.2: Module 1 (4 topics, 17 questions, 14 glossary terms), cost-of-exactness lab, scaling.ts; Lighthouse mobile 100/100/100; 145 e2e pass. Branch `claude/vigilant-newton-ws593b`
- 2026-10-29, M2.1: SceneController, capabilities, LabShell, Lazy3D, Fallback2D, demo page; three chunk 135 KB gz lazy; e2e incl. no-WebGL and reduced motion. Branch `claude/vigilant-newton-ws593b`.
- 2026-10-29, M1.3: chrome, stores, progress, search, landing/about/privacy/tools/changelog, link check; 114 e2e pass; Lighthouse 100/100/100 (SEO 66, noindex). Branch `claude/vigilant-newton-ws593b`.
- 2026-10-28, M1.2: collection, anatomy components, Level, Term, Cite, glossary (41), references (52), content linter in verify; 48 e2e pass; Q-020, Q-021 raised. Branch `claude/vigilant-newton-ws593b`.
- 2026-10-28, M1.1: tokens, themes, 14 primitives, /design/ gallery, contrast gate; axe clean both themes; fonts 87 KB. Branch `claude/vigilant-newton-ws593b`.
- 2026-10-28, M0.2: sw, manifest, size budgets, headers check (emulator, 18 pass), Lighthouse 100/100/100; preview pending Q-015. Same branch and PR as M0.1.
- 2026-10-28, M0.1: scaffold done, verify and e2e green. Branch `claude/vigilant-newton-ws593b`.
- 2026-10-27, planning: environment created (rules, SPEC v2, workflow, 53 work orders, guards, CI, hosting config, golden reference data). Branch `claude/great-dijkstra-oj0kbx`.

## Author actions outstanding

See `docs/SETUP_FIREBASE.md` and the "author" rows of `docs/OPEN_QUESTIONS.md` (Q-001, Q-004, Q-006, Q-007, Q-008, Q-011, Q-013, Q-015, Q-017, Q-019).
- 2026-11-03, M2.3: Module 2 (6 topics, 31 questions, 9 glossary terms), particle-in-a-box and orbitals labs, constants, box, hydrogen, sampler worker; golden file `quantum_basics_reference.json`. Branch `claude/vigilant-newton-ws593b`
- 2026-11-03, M2.4: Module 3 (5 topics, 24 questions, 6 glossary terms), exponential-wall and density-as-a-map labs, combinatorics, solver1d, density1d; golden file `solver1d_reference.json`. Branch `claude/vigilant-newton-ws593b`
- 2026-11-03, M3.1: structure core (`src/lib/crystal/`: linalg, lattice, POSCAR reader and writer, structure helpers), `src/lib/handoff.ts`, atomic masses table; round trip on 39 golden structures, 12 reciprocal lattices. Branch `claude/vigilant-newton-ws593b`.
- 2026-11-03, M3.2: KPOINTS library (`src/lib/vasp/kpoints.ts`): meshes from KSPACING, resolution and length with three rounding rules (default ceil), mesh coordinates, writers, parser, symmetry risk and centring advice; all golden comparisons pass. Q-004 and Q-018 remain open. Branch `claude/vigilant-newton-ws593b`.
- 2026-11-03, M3.3: INCAR parser and writer (`src/lib/vasp/incar.ts`), handbook extractor (`scripts/build/extract-handbooks.mjs`), generator (`scripts/build/build-vasp-data.mjs`), 71 tags and 16 presets as JSON, schema and count tests. Defaults the handbooks do not state are marked so (Q-028).
- 2026-11-03, M3.4: validation engine (`src/lib/vasp/validate.ts`, `rules/*.ts`): 33 rules, each sourced, tested both ways, with pure fixes; zero errors on the author's own INCARs. Judgement calls in Q-029.
- 2026-11-03, M3.5: Input Builder UI at `/tools/input-builder/` (six steps, zip download via fflate, share link, job scripts). Lighthouse mobile 98/100/100, tool JS 118.4/200 KB gzip. Judgement calls in D-038.
- 2026-11-03, M3.6: clickable file explorer (`annotate.ts`, `FileExplorer`, `PseudopotentialHeader`, MDX `<VaspFileExplorer>` and `<PseudopotentialHeader>`); 14 unit and 12 e2e tests. Q-030 raised.
- 2026-11-03, M4.1: OSZICAR, OUTCAR and series-CSV parsers, label mapping and `analyzeSeries` (D-014) with 30 tests; formats validated on hand-written fixtures only. Q-031 raised, Q-014 updated.
- 2026-11-04, M4.2: convergence series generator (`series.ts`: ENCUT and k-mesh series, project tree, run/collect/make_potcar scripts, zip) and a "Convergence series" mode in the Input Builder; 23 unit and 7 e2e tests. D-041, Q-032.
- 2026-11-04, M4.3: convergence plotter at `/tools/convergence/` (file drop, CSV paste, editable table, threshold slider, plain-language result, SVG/PNG/CSV export); view-model `convergenceView.ts` and `seriesInput.ts`. D-042, Q-033.
- 2026-11-04, M4.4: ENCUT lab (`EncutLab`, lab id `encut-sphere`, demo `/design/encut-lab/`), exact plane-wave counts (`planewaves.ts`, 20 golden counts) and a toy 1D plane-wave solver (`kp1d.ts`, worker). D-043, Q-034.
- 2026-11-04, M4.5: k-point mesh lab (`KmeshLab`, lab id `kpoint-mesh`, demo `/design/kpoint-lab/`): lattice point group (`pointgroup.ts`), mesh points, irreducible counts and the Q-017 symmetry test (`kmesh.ts`, golden spglib counts), toy metal-versus-insulator panel (`tightbinding2d.ts`). D-044, Q-035, S-053.
- 2026-11-04, M5.1: moyo symmetry (`symmetry.ts`, worker + client, `/design/symmetry-check/`), standardization message (`standardize.ts`), CIF reader/writer (`cif.ts`), format detection (`io.ts`), element table; 39/39 golden space groups and atom counts; 10 seekpath primitive-metric differences listed in the report; `lazy.moyo` budget. See [report](reports/M5.1.md).
- 2026-11-04, M5.2: exact first Brillouin zone by half-space clipping (`brillouin.ts`), shared basis reduction (`reduction.ts`); 12/12 golden lattices, 300 seeded random cells, median 0.3 to 1.2 ms per zone. See [report](reports/M5.2.md).
- 2026-11-04, M5.3: HPKOT k-paths (`kpath/hpkot.ts`, `kpath/expr.ts`, `niggli.ts`, tables in `src/data/kpath/hpkot/`); 39/39 golden structures and all 29 variants match. D-047, Q-037. See [report](reports/M5.3.md).
