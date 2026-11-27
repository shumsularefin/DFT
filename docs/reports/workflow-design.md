# Report: Workflow in the handbook design, previous and next buttons, text width (D-126)

- **Date:** 2026-11-27
- **Branch:** `claude/workflow-design-text-width` (from `main` at 3039c88, with `main` at d0bc595 merged in)
- **Decision:** D-126. **Questions:** none opened.

## What the owner asked

1. Give the Workflow section the design of the handbook topics.
2. Make the previous and next buttons stand out from the text, in the vibe of Learn's "Previous station" and "Next station".
3. Text inside cards stopped about two thirds of the way across while code blocks ran to the edge; fix it throughout the site. The right rail of a Workflow step drew one entry over another.

## What changed

- **Workflow steps:** every step has the handbook's live 3D stage beside its text (`stage:` front matter, the same engine, poster, keys, Focus 3D, Text only and splitter). States follow the step's own sections and the chips read the start of each heading. Scenes are reused from the handbook topics each step links to: POSCAR (inputs), convergence surface, relaxation, restarts (static SCF), DOS, bands, optics, Bader, elastic strain, E-V, phonon chain, dielectric ellipsoid, magnetic orderings, DFT+U, functionals (meta-GGA) and PBE against measured gaps (hybrid). No scene was added; badges are the scenes' own.
- **Workflow index:** the five-step protocol scene beside the map, an "On this page" card, and map lanes that wrap to the narrower column.
- **Previous and next:** filled buttons with an arrow, a small label and the title; next in the accent colour, previous in the grey button colour, under a rule. Shared by the handbook and the Workflow.
- **Text width:** one rule in `interface.css` lifts the 68ch measure (base.css) and the 78ch topic measure (removed from learning.css) inside any panel (card, callout, readout, lab shell, notice, stage, disclosure), including callouts and disclosures inside cards. Text outside panels keeps its measure.
- **Rail overlap:** the cause was layout, not wrapping. On screens of 100rem and up every rail card was placed on the first row of the right column, so a second card ("Learn why") was drawn over "On this page". The page's rail cards now sit in one `.hb-aside` column in both layouts.
- **Words split in tables:** table cells used `overflow-wrap: anywhere`, which lets a browser squeeze a column below its longest word, so "POSCAR" printed as "POS / CAR". The narrower column beside the stage made this worse ("Fil / e"). On desktop cells now use `break-word`, so a column is at least as wide as its longest word; code tokens still break, a table of formulas that cannot fit scrolls inside its card (the smearing topic), and phones keep wrapping anywhere (M7.3).
- **Main took D-125** while this branch was open, so this change is D-126.

What the redesign alone would have fixed: on Workflow steps, most of the short text. With the stage beside it the text column is narrower than the 78ch cap, so the gap mostly disappears at the owner's screen width; that is why handbook topics hid it. The cap itself (`.topic-section`, shared with the handbook) still cut text short in Text only mode, on the Workflow index, in callouts and disclosures and on other pages with cards, so it is removed for every panel. The rail overlap was not fixed by the redesign: it came from the shared rail grid and needed its own fix. The split words in tables got worse with the redesign, not better, because the text column is narrower, and needed their own fix.

## Checks

| Check | Result |
| --- | --- |
| `npm run verify` (format, lint, typecheck, 3291 unit tests, guards, content lint, build, links, size, contrast) | pass |
| `stages.test.ts`: 16 Workflow stages (scene, parameters, layers, sections in page order) | pass |
| `check-3d-stages` now covers Workflow steps | pass |
| e2e (Playwright, axe), Lighthouse, Firestore rules, preview deploy | pass in CI on the pull request (this cloud session has no Chromium, so they run there) |

New tests: `tests/e2e/layout-width.spec.ts` (text fills its card on two Workflow and two handbook pages, rail cards and entries do not overlap, the buttons' colours and rule, the stage beside the text on three Workflow pages, no word split over two lines in a table cell on every handbook topic and Workflow step that has a table) and `tests/e2e/ui-shots.spec.ts` (review screenshots, printed by CI).
