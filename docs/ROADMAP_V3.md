# Roadmap v3: audit of the build so far and the plan for the rest

Written 2026-11-16 after a full read of the repository (plan v2, 29 finished stages, reports, tests and a clean `npm run verify`). It extends the plan; it does not replace `SPEC.md`, `docs/WORKFLOW.md` or the work orders. New stages are in `docs/milestones/M12-visual-layer.md`, `M13-magnetism-and-structures.md` and `M14-research-guidance.md`, and in the build order of `docs/PROGRESS.md`. Decisions D-054 to D-057, questions Q-040 to Q-044, sources S-058 to S-068.

## 1. Where the project stands (measured 2026-11-16 on `main`)

| Area | State |
|---|---|
| Gates | `npm run verify` green: 69 test files, 1215 tests passed, 4 `it.todo` (each names an open question); guards, content lint (16 topics, 73 concepts, 95 questions), size budgets and contrast all pass |
| Done | M0 to M5 complete (scaffold, design system, shell, modules 1 to 3 with labs, Input Builder with 33 sourced rules, convergence generator and plotter, ENCUT and k-mesh labs, moyo symmetry, CIF, exact Brillouin zone, HPKOT and Setyawan-Curtarolo paths, 3D BZ and cell viewers, k-path tool); M6.1 to M6.3 (concept graph, mastery, spacing, bandit; no UI yet) |
| Content | Modules 1 to 3 only (16 topics). Modules 4 to 11 are not written |
| Not started | Practice UI and sync, modules 4 to 11, tolerance factor explorer, Screening Studio, Material Builder, polish |
| Science quality | Strong: golden files from independent libraries, a source register, honest open questions. Keep this standard for everything below |
| Housekeeping found | `docs/PROGRESS.md` rows M6.2 and M6.3 had no report links and the session log stopped at M5.3 (fixed in this revision); the Q index table at the top of `OPEN_QUESTIONS.md` stopped at Q-035 (fixed) |

## 2. The author's vision against the plan: what was missing

| Vision | In plan v2? | Added in v3 |
|---|---|---|
| Everything understandable through 3D pictures | Partly (labs per topic) | **M12.2** one scene format for every picture, SVG fallback; **M12.4** guided 3D path through the whole subject |
| Every question has its own 3D visual | No | **M12.3** a `visual` on every question, enforced by the question linter |
| Build your own crystal like a 3D program | Yes (M10.4) but late and form-like | M10.4 amended: viewport-first layout, keyboard shortcuts, structure toolkit in the toolbar; moved earlier in the build order |
| Prepare POSCAR and INCAR easily | Yes (Input Builder, done) | Hand-offs from the new tools |
| Understand `ISPIN = 2` and magnetism visually | One cartoon lab (M7.2 lab 4) | **M13.4** five topics, a computed Stoner toy, generated FM/A/C/G scenes |
| Prepare A-, C-, G-type antiferromagnetic structures | **No** | **M13.1** library (supercells, orderings, enumeration, MAGMOM), **M13.2** tool with 3D spins and a zip per ordering, **M13.3** ground-state ranking, moment checks and exchange fit |
| Other tasks that are hard by hand | Partly | **M13.5** slabs, vacancies, substitutions, doping; **M13.6** equation of state; **M14.3** charge-density difference, spin density, work function |
| Research guidance with high, validated accuracy | Input validation only | **M14.1** pre-flight and post-flight review of a real calculation folder; **M14.2** goal-to-workflow planner with a guard that rejects unsourced steps |
| Clean, minimal, focused interface like a terminal coding tool | Generic clean design | **M12.1** design language v3, command palette, status line (D-054) |
| Lean and fast build sessions | Good process, no model guidance | Sections 4 and 5 below |

Features considered and **not** added, with the reason: an on-site AI tutor or chat (needs a server or a paid API, breaks Spark-only and the honesty rules); machine-learned property predictions (no validated model can be served; the hook in M9 stays empty); running VASP or connecting to HPC (outside the browser-only contract); Bader analysis (needs the external program; the site explains how to run it instead); SQS generation and interfaces (large, rarely a first project; revisit after M11).

## 3. Build order

`docs/PROGRESS.md` is the single source of truth; this is the reasoning. The visual layer comes first so that every later page inherits it; the magnetism tool comes early because nothing else on the web does it well; the Material Builder moves ahead of the remaining VASP-file modules because building structures is central to the author's vision.

1. **M12.1** design language v3, palette, status line (next stage)
2. **M12.2** scene library
3. **M13.1**, **M13.2** magnetic orderings library and tool
4. M6.4 practice UI, then **M12.3** visuals for every question
5. M7.1, M7.2 modules 4 and 5, then **M13.3**, **M13.4** magnetic analysis and the magnetism topics
6. M8.1 to M8.3 tolerance factor (the Builder needs its library and periodic table)
7. M10.1, M10.2, **M13.5**, M10.4, M10.3, M10.5 Material Builder with the structure toolkit
8. M7.3, M7.4, **M13.6**, M7.5, **M14.3**, **M14.1** files, running, errors, analysis, review
9. M8.4, M9.1 to M9.4, **M14.2** maps, Screening Studio, research planner
10. M6.5 optional sync, **M12.4** guided 3D path, M7.6 worked example
11. M11.1 to M11.3 polish and release

## 4. Which model tier builds which stage

Two tiers. **Tier A**: the strongest reasoning model available, for stages where a subtle mistake would put a wrong number in front of a researcher (ports of algorithms, parsers, fits, symmetry, golden generators). **Tier B**: the fast model, for stages that are mostly UI, content and wiring on top of tested libraries. A Tier B stage that hits a science question it cannot settle records it in `OPEN_QUESTIONS.md` and moves on; it does not improvise. Every Tier B stage that adds content runs the `science-verifier` agent before finishing. Audits (`/audit-stage`) always use Tier A.

| Tier A | Tier B |
|---|---|
| M7.1, M7.5, M8.1, M8.2, M9.1, M10.1, M10.2, M10.3, M11.3, M13.1, M13.3, M13.5, M13.6, M14.1, M14.2, M14.3 | M6.4, M6.5, M7.2, M7.3, M7.4, M7.6, M8.3, M8.4, M9.2, M9.3, M9.4, M10.4, M10.5, M11.1, M11.2, M12.1, M12.2, M12.3, M12.4, M13.2, M13.4 |

The tier is also noted in the Note column of `docs/PROGRESS.md`.

## 5. Working lean (time and tokens) without losing accuracy

These refine `docs/WORKFLOW.md`; where they seem to conflict, `CLAUDE.md` and the workflow win.

1. **Read narrowly.** Read `CLAUDE.md`, the stage section and the documents it cites. For `SPEC.md`, read section 0 once and then only the sections your stage touches. Find things with `grep -n` and read ranges, not whole files. Never print a whole golden file; load it in a test.
2. **Reuse first.** Before writing a helper, search `src/lib/` (linear algebra, reduction, symmetry, parsers, scene controllers, writers and the zip builder all exist). Extend a file in place; never fork a second version.
3. **Fast inner loop.** During work run `npx vitest run <path>` and single e2e specs (`npx playwright test <file> --project=desktop --trace off`). Run the full `npm run verify` and the full e2e suite once before pushing, and again only if something failed.
4. **Keep output short.** Pipe long commands through `tail -n 30`. Put full logs in the scratchpad, quote only the summary lines in the report.
5. **Science before UI.** Generator and golden file, then the library with its tests green, then the UI. Never build UI on an untested library; it doubles the work when a number changes.
6. **One stage, one session.** If the context is getting long, finish as `partial` with an exact remaining list (workflow section 7) rather than rushing the end.
7. **Lighthouse only where pages changed.** Record the page classes the stage touched; M11 re-measures everything.

## 6. What only the author can do (new items)

- Approve the v3 look from the M12.1 screenshots (Q-043).
- Say which Heisenberg convention the magnetic tool should show by default (Q-042) and, if possible, run one small FM versus G-type calculation so the M13 tools can be checked against a real OUTCAR (add to `data/author/`, Q-008).
- Allow `vasp.at` and `arxiv.org` in the environment's network settings if you want builders to verify VASP wiki statements and papers directly (Q-007, Q-040).
