# Progress

Updated by every build session (see `docs/WORKFLOW.md` section 6). The table order is the build order; `STAGE: NEXT` takes the first row that is `todo` or `partial` and whose dependencies are all `done`. Status values: `todo`, `in-progress`, `partial`, `blocked`, `done`. The **Branch** column is what you paste as `BASE` for the next stage when you stack stages without merging (Mode B).

Planning baseline (2026-10-27): environment, rules, work orders, golden reference data and guards are in place; no application code exists yet. Start with `STAGE: M0.1`, `BASE: main` after merging the planning branch.

| Stage | Title | Status | Depends on | Size | Branch | PR | Updated | Note |
|---|---|---|---|---|---|---|---|---|
| M0.1 | Scaffold the project | done | none | M | claude/vigilant-newton-ws593b | | 2026-10-28 | [work order](milestones/M0-scaffold.md) |
| M0.2 | Hosting, CI/CD, budgets and first deploy | done | M0.1 | M | claude/vigilant-newton-ws593b | [#1](https://github.com/shumsularefin/DFT/pull/1) | 2026-10-28 | [work order](milestones/M0-scaffold.md) |
| M1.1 | Design tokens, themes and UI primitives | todo | M0.2 | M | | | | [work order](milestones/M1-design-and-shell.md) |
| M1.2 | Content system and topic anatomy | todo | M1.1 | L | | | | [work order](milestones/M1-design-and-shell.md) |
| M1.3 | Handbook shell, level switch, progress, search and SEO | todo | M1.2 | M | | | | [work order](milestones/M1-design-and-shell.md) |
| M2.1 | Lab framework | todo | M1.3 | M | | | | [work order](milestones/M2-modules-1-3.md) |
| M2.2 | Module 1: Why DFT exists | todo | M1.3 | M | | | | [work order](milestones/M2-modules-1-3.md) |
| M2.3 | Module 2: Quantum basics without math (with labs) | todo | M2.1, M2.2 | L | | | | [work order](milestones/M2-modules-1-3.md) |
| M2.4 | Module 3: The many-electron problem and why density helps (with labs) | todo | M2.3 | L | | | | [work order](milestones/M2-modules-1-3.md) |
| M3.1 | Structure core: lattice math and POSCAR | todo | M0.2 | M | | | | [work order](milestones/M3-input-builder.md) |
| M3.2 | KPOINTS generation | todo | M3.1 | M | | | | [work order](milestones/M3-input-builder.md) |
| M3.3 | INCAR data model, presets and handbook extraction | todo | M3.1 | L | | | | [work order](milestones/M3-input-builder.md) |
| M3.4 | INCAR validation rules engine | todo | M3.2, M3.3 | L | | | | [work order](milestones/M3-input-builder.md) |
| M3.5 | Input Builder UI | todo | M3.4, M1.3 | L | | | | [work order](milestones/M3-input-builder.md) |
| M3.6 | Clickable file explorer | todo | M3.3, M1.2 | S | | | | [work order](milestones/M3-input-builder.md) |
| M4.1 | Output parsers and convergence analysis | todo | M3.2 | L | | | | [work order](milestones/M4-convergence.md) |
| M4.2 | Convergence series generator | todo | M3.5, M4.1 | M | | | | [work order](milestones/M4-convergence.md) |
| M4.3 | Convergence plotter UI | todo | M4.1 | M | | | | [work order](milestones/M4-convergence.md) |
| M4.4 | ENCUT lab and toy plane-wave solver | todo | M2.1, M3.1 | L | | | | [work order](milestones/M4-convergence.md) |
| M4.5 | K-point mesh lab | todo | M4.4, M3.2 | L | | | | [work order](milestones/M4-convergence.md) |
| M5.1 | Symmetry (moyo), CIF and standardization | todo | M3.1 | L | | | | [work order](milestones/M5-brillouin-zone.md) |
| M5.2 | Brillouin zone geometry | todo | M3.1 | M | | | | [work order](milestones/M5-brillouin-zone.md) |
| M5.3 | HPKOT k-paths (default convention) | todo | M5.1, M5.2 | L | | | | [work order](milestones/M5-brillouin-zone.md) |
| M5.4 | Setyawan-Curtarolo k-paths (second convention) | todo | M5.3 | L | | | | [work order](milestones/M5-brillouin-zone.md) |
| M5.5 | 3D Brillouin zone and lattice viewer | todo | M5.2, M2.1 | M | | | | [work order](milestones/M5-brillouin-zone.md) |
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

- 2026-10-28, M0.2: sw, manifest, size budgets, headers check (emulator, 18 pass), Lighthouse 100/100/100; preview pending Q-015. Same branch and PR as M0.1.
- 2026-10-28, M0.1: scaffold done, verify and e2e green. Branch `claude/vigilant-newton-ws593b`.
- 2026-10-27, planning: environment created (rules, SPEC v2, workflow, 53 work orders, guards, CI, hosting config, golden reference data). Branch `claude/great-dijkstra-oj0kbx`.

## Author actions outstanding

See `docs/SETUP_FIREBASE.md` and the "author" rows of `docs/OPEN_QUESTIONS.md` (Q-001, Q-004, Q-006, Q-007, Q-008, Q-011, Q-013, Q-015, Q-017, Q-019).
