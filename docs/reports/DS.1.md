# DS.1 DFT Studio merged into the site (VESTA-style viewer, VASP workflow, k-point kit)

Status: done        Branch: claude/hopeful-rubin-adj3m0        Decision: D-103

Requested by the author outside the milestone plan: merge the `dft-studio` branch (VESTA-Web viewer and editor,
VASPKIT Studio, k-point convergence kit) into the site, replace the weak parts of the site with it, keep every
feature the site had, and connect Studio to the rest of the site.

## What replaced what
| Site before | Now | Why |
|---|---|---|
| Material Builder crystal mode (`CrystalBuilder.tsx`, React, one StructureView) | DFT Studio in a same-origin frame at `/builder/`, full screen at `/dft-studio/` | Studio is a VESTA-style editor: styles, polyhedra, boundary, supercell and matrix transforms, slabs, adsorbates, heterostructures, defects, symmetry, magnetic moments, 350-crystal library, POSCAR, CIF and XYZ in and out |
| (nothing) | `/dft-studio/` workflow: POTCAR, INCAR, KPOINTS, k-convergence, run bundle, analysis | New: one place from structure to a run folder |
| Molecule mode | kept, plus "Open in DFT Studio" | Studio has no molecule editor |
| Input Builder, k-path, magnetic, convergence, EOS, work function, review | kept (golden tested) and linked from the matching Studio step | Studio's versions are not verified (Q-059) |

## Features the old crystal builder had that Studio lacked, now added
- Structure checks B001 to B012 live on every edit: header badge with the count, Checks tab with explanations,
  fixes, "Show atoms", Heuristic labels (`SiteBridge.check`, `applyFix`).
- Export gate: a POSCAR with an error needs a reason, written into the comment line (`SiteBridge.gate`).
- Clean-up operations: wrap into the cell, merge duplicates, gentle relax (Heuristic).
- Handbook starter templates in the structure menu; periodic-table element picker.
- Redo (button, Ctrl+Shift+Z, Ctrl+Y), undo history raised to 100 steps.
- Hand-offs in (structure with MAGMOM, Tolerance Explorer composition, molecule) and out (Input Builder,
  k-path, magnetic, planner, with MAGMOM mapped to POSCAR order).

## Connections
- Studio "Send to" menu; step 3 shows the site's 33 INCAR rules on Studio's INCAR; step 4 links to the k-path
  tool (39 golden structures); step 5 sends convergence rows to the convergence plotter (new `series` hand-off);
  step 6 links to the Input Builder, planner and magnetic tool; step 7 links to the verified analyzers.
- Site tools open structures in Studio: k-path, Input Builder (StructureView button), magnetic tool (with spins),
  molecule mode. Tools hub and home page list DFT Studio.

## Made to work under the site rules
- CSP: no CDN at runtime (three from the bundle, inline icons, SVG plotter, fflate zip, prebuilt Tailwind);
  per-path headers for `/dft-studio` (Pyodide only), checked with the hosting emulator.
- POTCAR: removed 1624 verbatim POTCAR header excerpts from `pp_index.js`; set the lab-local library switch off
  (it was on, so the public site probed for POTCAR files).
- Viewer fixes: canvas sized by a ResizeObserver (it was 1x1 in the frame and on phones), aspect-aware camera fit,
  page height (Tailwind `h-screen` was missing from the generated CSS), header no longer overlaps at 1000 px.
- Accessibility: axe clean on all 7 steps and all 10 panel tabs, light and dark, at 360 px and desktop
  (labels for about 60 controls, landmarks, h1, POTCAR picker without nested buttons, contrast of muted and accent text).

## Gate results
| Gate | Result | Evidence |
|---|---|---|
| G1 Verify | pass | `npm run verify` exit 0, 2075 tests passed, 6 todo |
| G2 Guards | pass | part of verify (em dash, sources, links) |
| G3 Science | partial | site code reused through the bridge is golden tested; Studio's own science is Heuristic and listed in Q-059 |
| G4 UI | pass | `tests/e2e/dft-studio.spec.ts` (production CSP boot, axe all steps and tabs in both themes, checks and gate, hand-offs), `builder.spec.ts` rewritten for the frame (not weakened: supercell, undo, redo, checks, templates, axe), `/dft-studio/` added to the 360 px CSP smoke |
| G5 Performance | pass | three chunk 131.4 of 150 KB gz; `/dft-studio/` 60.6 KB initial JS; `/builder/` 76.2 KB |
| G7 Done when | pass | author's request: replace, keep features, connect |

## Unit tests added
`bridge.test.ts` (checks, fix, gate, merge tolerance, templates, element grid, INCAR rules), `miniPlot.test.ts`,
`zipShim.test.ts`, `handoff.test.ts` (series kind).

## Not done
- Studio's analyzers, presets and element data are not verified (Q-059). Crystal library source unknown (Q-061).
- POTCAR metadata licence and the branch history (Q-060).
- Lighthouse was not run for `/dft-studio/` (a tool page with a WebGL canvas at load).

## Full e2e run
636 tests: 618 passed, 12 skipped, 6 failed on the first run. `palette.spec.ts` expected 12 starting points; the home
page now has 13 (DFT Studio was added), so the count was updated. The other failures (`kpath-tool` axe and 360 px,
`convergence` ENMAX advice, `convergence-series` dark axe) are intermittent and fail the same way on `main`
(checked in a worktree of main); they pass on a rerun.
