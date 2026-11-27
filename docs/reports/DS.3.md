# DS.3: One workspace from the owner's template

Branch `claude/hopeful-rubin-adj3m0`, PR #74 (draft, held by the owner). Builds on DS.2. Decision D-105.

## Asked for

1. The VESTA-style tool (DFT Studio) looked like another website inside the site. Make it native, and make the whole site feel like one tool. Keep the content and the VASP workflow idea; restructure the handbook side instead.
2. Use the owner's HTML template (sidebar, top bar, cards, tiles, segmented controls, stepper, line-numbered code) as the base design, applied logically, not copied.
3. Consistent margins on every page; thin 1 px borders everywhere, no thick one-sided borders; remove the unexplained "[draft]" marks; fix the handbook index; the "Your progress" text that wrapped in half; the reading-level switch; the Input Builder.
4. Desktop only (owner ruling, mid-stage).

## What changed

- **Shell.** Sidebar groups Study (Learn, Handbook, Practice, Progress), Build (Material Builder, Input Builder, Screening) and Calculate (Convergence, k-path, Magnetic, Error finder, All tools). A fixed top bar shows section and page, the reading level as a segmented control, search and theme. Template neutrals and density (14 px base, 32 px controls); shared components in `src/styles/components.css`.
- **Material Builder.** The Studio runs inside the site layout at `/builder/` (no iframe, no own brand or theme), with Crystal and Molecule as one switch (`/builder/molecule/`). `/dft-studio/` redirects. Its CSS is page-only and scoped under `.studio-root`.
- **Performance.** The 3D viewer drew every frame forever (CI Lighthouse 0.66 on `/builder/`; 140 s of blocking time locally). It now draws on demand, compiles shaders with `compileAsync`, and start-up is split into short tasks; an idle Builder uses no CPU. Lighthouse CI uses the `desktop` preset (the supported device class), floors unchanged at 0.95.
- **Toolbar fit.** The structure picker slid under the Open button at 1350 px; the toolbar now sizes by a container query and nothing overlaps from 1024 to 1920 px.
- **Learning pages.** Topic pages have a Modules tree card, an "On this page" card, "First edition, updated <date>" in place of "[draft]", Mark complete, and sections, labs and checks as cards. Progress has four tiles and twelve module bars from stored data. Practice is a question card beside a mastery card. `/learn/` uses a station list card.
- **Tool pages.** Input Builder: header with Single/Series switch and Download bundle, stepper card, step form beside a Generated files card (tabs, line-numbered code, Copy, pre-flight notice). Calculators: Inputs card on the left, tiles and chart cards on the right; tiles show only numbers the tools already compute. Screening: preset pills, results table, inspector card. `/tools/`: feature cards grouped by workflow stage.
- **Consistency.** One container rule; callouts, notes, feedback and review checks use 1 px borders; the handbook index has one review notice and module cards.

No formula, constant or reference value changed; no golden file was edited.

## Tests

- `npm run verify`: passes (format, lint, typecheck, unit tests, guards, build, size budget, contrast).
- Full desktop e2e once: 325 passed, 8 skipped (the mobile-360-only checks), 1 failed: `convergence-series` axe in dark measured the sidebar link mid-fade after the theme switch. Root cause was a colour transition on the nav links added in this stage; removed. That spec, `convergence` and `shell` then passed 135 of 135 with `--repeat-each=3`.
- Lighthouse on `/builder/` (desktop preset, local): performance 0.91 to 0.99 across runs, accessibility 1, best practices 1.
- Removed: the `mobile-360` Playwright project (desktop only). The header control size test now checks 24 px (WCAG 2.5.8) instead of 44 px.

## Not done / open

- Specs that skip unless `mobile-360` runs are left in place and no longer run; they can be deleted in a later clean-up.
- `SPEC.md` still names module 11 "Materials Screening Studio"; the site shows "Materials Screening and Material Builder".
- `check-headers.mjs` was not run against the Firebase emulator for the moved Studio CSP.
- The `/builder/` Lighthouse score varies with the CI machine's software GL; if a run falls under 0.95 the remaining cost is the first WebGL draw.
