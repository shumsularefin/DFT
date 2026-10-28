# Decisions

Format: ID, decision, why (with evidence), consequences. New decisions get the next free `D-nnn`. Entries D-001 to D-028 were made during planning (numbers are grouped by topic, not by time) and verified where marked. "Verified" means it was run or inspected in a sandbox on 2026-10-27; see `docs/verified-stack/`.

## Stack and tooling

**D-001. Astro 7 (static) with React islands and MDX, replacing the "Vite SPA with React Router" suggestion.**
Why: the site is mostly content (11 modules, many topic pages) with a few heavy interactive tools. A client-rendered SPA ships all content as JavaScript, needs extra work for per-page titles and crawlability, and threatens the 200 KB first-load budget and the Lighthouse 95 target. Astro prerenders every page to HTML, ships near-zero JavaScript on content pages, hydrates only the labs and tools, and lets the level switch work with CSS alone (D-011). Each tool is one island that behaves like an SPA inside its page.
Consequences: routes are files in `src/pages/`; cross-tool hand-off goes through `src/lib/handoff.ts` (D-012), not a router.

**D-002. Exact version pins and the incompatibilities found.** (Verified: build, test, typecheck, lint, Pagefind, Playwright, axe and Lighthouse CI ran with this set.)
- `astro 7.3.8`, not 7.4.x: 7.4.0 needs Node >= 22.22 and 7.4.2 needs >= 22.23.4, while cloud sessions run Node 22.22.0. 7.3.x needs >= 22.12.
- `typescript 6.0.3`, not 7: typescript-eslint 8.72 supports TypeScript < 6.1, and `astro check` refuses TypeScript 7.
- `eslint 10.13.0` without `eslint-plugin-jsx-a11y` (it caps at ESLint 9). Accessibility is enforced with axe-core in Playwright (G4).
- No `@vite-pwa/astro` (peer range stops at Astro 5). The PWA uses `workbox-build` in a post-build script (D-010).
- Astro 7 no longer ships the unified Markdown pipeline by default: install `@astrojs/markdown-remark` and configure `markdown.processor: unified({...})` (see `docs/verified-stack/astro.config.mjs.reference`).
- Astro 7's `astro preview` detaches into a background daemon when not attached to a terminal, so Playwright's `webServer` uses a small static server (`docs/verified-stack/serve.mjs.reference`) that also mimics Firebase's trailing-slash redirects. ESLint needs Node globals declared for config files and scripts. Both found by a dry run of M0.1 built from the reference files alone.
- `vitest 5.0.5`, `@playwright/test 1.64.1`, `@lhci/cli 0.15.1`, `pagefind 1.5.2`, `zustand 5.0.16`, `react 19.3.1`, `three 0.186.1`.
Consequences: do not "update to latest". Bumps happen only in a dedicated chore commit with the full verify run.

**D-003. Symmetry engine: `@spglib/moyo-wasm 0.21.0`** (MIT or Apache-2.0, wasm 746 KB raw, 277 KB gzipped, from the spglib project). The SPEC's "spglib WebAssembly" is satisfied by moyo, the Rust successor from the same project. It gives space group, Hall number, standardized conventional and primitive cells with transformation matrices, Wyckoff letters and operations, and a Spglib-compatible setting. It has no irreducible k-mesh function, so mesh reduction is implemented in TypeScript from the operations and tested against `tests/reference/pw_kmesh_reference.json` (spglib counts).

**D-004. Molecule mode: RDKit JS (`@rdkit/rdkit 2026.9.1`, wasm 7.4 MB raw, 2.4 MB gzipped, lazy) for 2D layout, sanitization/valence checking, SMILES and MOL I/O only.** Verified by inspecting `RDKit_minimal.d.ts` and the wasm symbols: this build has **no 3D embedding (ETKDG) and no MMFF/UFF force field**. The SPEC's "RDKit 3D force field cleanup" is therefore not possible as written. Decision: implement a small valence-geometry optimizer in TypeScript (bond lengths from covalent radii, VSEPR ideal angles, soft repulsion), labelled "rough starting geometry, not a quantum result". The 2.4 MB download happens only when the user opens molecule mode and is cached by the service worker. Under the stricter 360 MB/day reading of Spark limits (Q-006) that is about 150 first-time molecule-mode users per day; acceptable, to be re-checked at M11.1.

**D-005. Default k-path convention: HPKOT (Hinuma et al. 2017, as in SeeK-path), second convention Setyawan-Curtarolo (as in pymatgen and Materials Project). Both are required; the UI always names the convention.** Why: the author's Workflow Handbook states VASPKIT task 303 uses the SeeK-path algorithm, so HPKOT matches the author's own protocol (the v1 SPEC defaulted to Setyawan-Curtarolo). Evidence the choice matters: for plain fcc both conventions give the same coordinates for X, W, K, L, U but different paths, HPKOT `Γ-X-U | K-Γ-L-W-X` versus Setyawan-Curtarolo `Γ-X-W-K-Γ-L-U-W-L-K | U-X` (`tests/reference/kpaths.json`). Band structures along the two are not interchangeable without care. Q-013 asks the author to confirm VASPKIT's behaviour with one run.

**D-006. 2D scientific plots use D3 modules (`d3-scale`, `d3-shape`, `d3-axis`, `d3-selection`) rendering SVG,** so SVG export is exact and PNG export is a canvas rasterization of that SVG. uPlot (canvas only) is allowed only for plots with more than 10,000 points (dense DOS or bands), where PNG export is enough.

**D-007. 3D uses vanilla Three.js behind a small `SceneController` class per tool, not react-three-fiber.** Smaller bundle, geometry stays testable without React, one disposal path. Loaded lazily after a user action or when scrolled into view, with a "Start 3D" fallback card and a 2D SVG/Canvas fallback when WebGL is unavailable. Device pixel ratio capped at 2.

**D-008. Math is rendered at build time with KaTeX as MathML (`output: 'mathml'`)** via `remark-math` and `rehype-katex`. No client JavaScript, no KaTeX CSS, no math fonts. Verified. Check rendering in Chromium and WebKit in M1.2; if a formula renders poorly, switch that formula to `htmlAndMathml` and include only the KaTeX fonts it needs.

**D-009. Search: Pagefind** (static index built after `astro build`, loaded on first focus of the search box).

**D-010. PWA: `workbox-build` `generateSW` run by `scripts/build/sw.mjs` after the build.** Precache the shell and critical CSS; runtime-cache `/_astro/**` (CacheFirst), datasets (StaleWhileRevalidate), navigations (NetworkFirst with an offline page). Heavy WASM is cached only after first use.

**D-011. Levels (Beginner, Intermediate, Pro) are cumulative and implemented with a `data-level` attribute on `<html>`.** `<Level min="intermediate">` content shows at Intermediate and Pro; `<Level max="beginner">` shows only at Beginner (simplifications that the deeper levels replace). An inline script sets the attribute before first paint from `localStorage`; with no script the default is Beginner. The route never changes.

**D-012. State.** Zustand stores with a versioned `localStorage` wrapper (`src/lib/storage.ts`, all access in try/catch, renders correctly with storage unavailable). Cross-tool hand-off uses `sessionStorage` key `dft:handoff` carrying a typed discriminated union from `src/lib/handoff.ts`, plus a URL fragment for small shareable payloads.

**D-013. Adaptive engine: Bayesian knowledge tracing per concept, Elo/IRT difficulty, SM-2 spacing, Thompson sampling (Beta-Bernoulli with fractional rewards) to choose the next item.** FSRS was considered and rejected for now: its parameters cannot be verified offline and SM-2 is fully specified and testable. This is an adaptive heuristic, not trained reinforcement learning, and the UI says so.

## Science and data conventions

**D-014. Convergence criterion.** A series is converged at the smallest setting x_i such that every later point differs from x_i by no more than the threshold (default 1 meV/atom, adjustable; a difference exactly equal to the threshold counts as converged). This is stricter than "the next point is within threshold" and avoids declaring convergence on a flat spot.

**D-015. Default energy quantity for convergence plots: `energy(sigma->0)`.** The author's own scripts run `grep "energy  without entropy" OUTCAR | tail -1 | awk '{print $NF}'` (two spaces after "energy", exactly as OUTCAR prints it); that OUTCAR line ends with `energy(sigma->0) = <value>`, so `$NF` is the sigma-to-zero energy. The tool offers all three quantities (free energy TOTEN, energy without entropy, energy(sigma->0)) and defaults to the one the author's workflow actually uses.

**D-016. K-mesh from KSPACING or resolution uses `ceil(|b_i| / spacing)` by default (|b_i| is the reciprocal lattice vector length including the factor 2 pi, as KSPACING is defined; VASPKIT's resolution r corresponds to spacing 2 pi r),** with the other plausible rounding rules available behind an interface and tested, until the author runs the calibration in Q-004. Ceil never under-samples. The UI always shows the resulting mesh so the user can see and override it.

**D-017. VASP target: 6.x, reference 6.4.x, noting where 5.4 differs,** exactly as the author's handbooks do ("VASP 5.4 / 6.x"). Every INCAR validation rule states the version it applies to.

**D-018. The author's two handbooks (`docs/source-material/`) are the content seed.** Their "Corrected" entries (the `fixed` records) override the original notes. Content derived from them is rewritten in the site's voice, keeps their VASP-wiki citations, and is never copied verbatim in bulk. One erratum has already been found in them (odd versus even Monkhorst-Pack meshes, Q-017), so they are a verified seed, not an oracle: every rule derived from them still needs its test.

**D-025. Shannon radii dataset: built from pymatgen's bundled table (MIT-licensed code, data from Shannon 1976),** then compared with 34 textbook anchor values, which all agree (`scripts/reference/gen_perovskite_reference.py`). This is a consistency check, not an independent verification: the planner wrote the anchor values from memory of the widely tabulated Shannon table, but had already seen several of them printed from pymatgen. An independent check against the original table is still required (Q-002). Completeness (the table has 492 entries) and licensing are still open (Q-002). Ionic radii (not crystal radii) are used for t, mu and tau.

**D-028. Rare-earth A-site coordination.** Shannon lists CN 12 for Ln3+ only for La, Ce, Nd, Sm; CN 9 and CN 8 exist for all of La to Lu. The family-trend view therefore needs an explicit, visible "A-site coordination policy" (CN 12 where available else flagged missing, or CN 9 for all, or CN 8 for all) and must never extrapolate silently. Golden sweeps for all three policies are in `tests/reference/perovskite_reference.json`.

## Process and platform

**D-019. Branching.** One branch and one PR per stage. Stages may be stacked (docs/WORKFLOW.md section 9). Merge commits, not squash, when stacked.

**D-020. Tests.** Vitest, test files next to the code (`*.test.ts`). Golden data in `tests/reference/`, regenerated only by `scripts/reference/*.py`. End-to-end with Playwright (`tests/e2e/`), `PW_CHROMIUM_PATH` for cloud sessions. Reference-generation scripts are pinned in `scripts/reference/requirements.txt`.

**D-021. Fonts: IBM Plex Sans (body) and JetBrains Mono (code and VASP files), self-hosted through Fontsource, latin subset, `font-display: swap`, with metric-matched fallbacks.** Matches the look of the author's Field Handbook. No requests to Google Fonts at runtime.

**D-022. The product name stays "DFT Handbook"** (working title; it is plain and searchable). The name lives in one place, `src/lib/site.ts`, so a rename is a one-line change.

**D-023. Lighthouse targets are measured per page class on mobile emulation:** content pages and tool pages must reach 95 or better in all four categories on initial load. 3D canvases and WebAssembly start only after a user action ("Start lab") or when scrolled into view and idle, which keeps main-thread work out of the measured load. If a tool page cannot reach 95 for performance with measured evidence, record the number and cause here and set a justified lower floor (not below 90). SEO is measured as described in D-027 until M11.3.

**D-024. Licence is undecided (Q-001).** Until the author decides, the repository has no LICENSE file and `THIRD_PARTY_NOTICES.md` records upstream licences. Ported MIT code (seekpath, pymatgen) must keep its copyright notice there.

**D-026. Firebase web configuration is not hard-coded.** `PUBLIC_FIREBASE_*` variables are injected at build time from GitHub repository variables. The site must build and work with none set (sync features hidden).

**D-027. Hosting.** `cleanUrls: true`, `trailingSlash: true` to match Astro `build.format: 'directory'`; hashed assets under `/_astro/` cached immutably for a year; HTML revalidated on every load; service worker never cached. `robots.txt` disallows all and pages carry `noindex` until M11.3 flips them, so half-built pages never get indexed. Consequence for Lighthouse: a `noindex` page always fails the SEO audit `is-crawlable`, so until M11.3 the SEO category is not asserted as a whole; the individual SEO audits (title, meta description, status code, link text, crawlable anchors, canonical, robots.txt validity, image alt) are asserted instead, and the report records the SEO score next to the note "noindex by design".

**D-028. Handbook content mechanics (M1.2).** Front matter schema lives in `src/lib/content-schema.mjs`, imported by both the Astro collection and `scripts/lint-content.mjs`, so build and linter cannot disagree. `<Level>` renders both branches with `data-visible` (computed by `visibleAt`) and CSS keyed on `html[data-level]` shows them with `display: contents`. Citation numbers are computed by the topic route from the MDX source (`citeOrder`) and passed through `Astro.locals.cites`, so numbering does not depend on render order. Topic MDX files import nothing: the route passes the anatomy components to `<Content components>`. Topics with no lab set `noLab: true` in front matter, the only way the linter accepts a missing `<Lab>`.

