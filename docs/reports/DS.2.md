# DS.2: UI repair and redesign

Branch `claude/hopeful-rubin-adj3m0`, PR #74 (draft, held by the owner). Builds on DS.1.

## Asked for

1. Fix the broken UI the owner listed in a PDF (Guided path figures: black shapes, overlapping labels, piled-up atoms).
2. Find and fix other broken UI across the site.
3. Redesign the site in the style of three apps the owner likes (Claude, Google Antigravity, Codex): quiet chrome, a left sidebar, a centred working column, so learners can focus.

Work ran in parallel: one agent on the Guided path figures, one on a site-wide audit, and the shell redesign in the main checkout. Their branches were merged here.

## Redesign (D-104)

- **Shell.** At 64rem and wider the header is a fixed left sidebar: brand, icon navigation under "Explore", then search, reading level, progress and theme under "Your study". Below 64rem it is a top bar with the existing Menu drawer; `chrome.ts` is unchanged. Search sits after the navigation to keep the keyboard order `shell.spec` checks.
- **Palette.** Warm paper light theme and warm charcoal dark theme with one terracotta accent, a `--sidebar` token, softer radii and shadows. `npm run contrast` passes every pair; the accent clears 4.5:1 on its own soft tint (badges).
- **Details.** Quieter handbook module column (muted links, indent rule, current topic as a raised row); theme toggle drawn as a moon or sun; Studio buttons use the sans font; the shared `.btn` rules load on every page from `BaseLayout`.
- **Follow-on.** `LIGHT_BG` and `DARK_BG` in `src/lib/three/palette.ts` follow the new `--bg`; Okabe-Ito blue is 2.92:1 on the warm dark background and joins grey in the outlined set. The contrast script's self-tests now mutate the current token values.

## Guided path figures

Root cause: the `vp-*` plot classes were styled only in `practice.css`, which `/learn/` never loaded, so every shape fell back to a black fill and every label to 16 px. The rules moved to `src/lib/visual/plots.css`, imported by `practice.css` and `GuidedPath.tsx`. Also: y titles longer than their axis wrap to two lines (16 user units apart so wider fallback fonts do not collide), powers of ten draw as a raised exponent, the k-point cell is an outline with an open ring at Gamma, the band labels are centred, stations 7 and 8 use the 30/22 degree camera, and atoms are drawn at 0.35 of the covalent radius site-wide (a drawing choice, no test depends on it). No scientific value changed. New `tests/e2e/learn.spec.ts` fails on any black fill, text over 13 px, clipped label or overlapping labels, at 360 px and desktop, both themes.

## Site-wide audit

Every non-topic page plus 13 handbook topics at 1280 and 360 px, light and dark, and every closed section of all 72 topics at 360 px.

| Where | Defect | Fix |
|---|---|---|
| /builder/ | Studio start button tiny and unexplained; mode tabs showed no state | Heading, description, primary button; tabs with arrow keys and a tab panel |
| Topics, /practice/, /progress/ | React error 418 at hydration; storage warning in the HTML for everyone | Same learner state on server and first render |
| Labs, scenes, periodic table, tools | Browser-grey buttons and fields | Shared `ui/button.css`, styled inputs, selects and file pickers |
| /tools/magnetic | Card content ran under the next card | Fixed grid |
| /tools/eos, /tools/convergence at 360 px | Drop zone overflow; page 400 px wide | Fixed |
| /tools/kpath, /progress/ at 360 px | Page 367 px and 497 px wide | Fixed |
| SCF, density, smearing topics at 360 px | Equations and tables 430 to 500 px wide | Scroll inside their box |
| Disclosures, /errors/ | Missing open/close triangle | Shared `ui/disclosure.css` |
| /design/structure-demo/ | axe `landmark-unique` | Region names include the formula |

Regression checks: `tests/e2e/ui-audit.spec.ts`.

Not fixed: the k-path table caption clips at its scroll edge at 360 px (minor); Studio logs a 404 for `/data/mp/current.json` and falls back to the sample data on purpose; the status line wraps to two lines at 360 px; station 10 vector labels sit on atoms (readable with a halo).

## Gates

| Gate | Result |
|---|---|
| `npm run verify` | pass |
| `npm run contrast` | pass, both themes |
| Shell, palette, a11y-csp e2e | 109 passed |
| Guided path and scenes e2e | 34 passed |
| Full e2e | see below |

### Full e2e run

Pending at the time of writing; the PR description carries the result.
