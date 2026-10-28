# M1 Design system and handbook shell

## M1.1 Design tokens, themes and UI primitives

**Goal**: A restrained, modern design system (tokens, light and dark themes, type scale) and the accessible UI primitives every later stage reuses, shown in a gallery.
**Depends on**: M0.2
**Size**: M
**Deliverables**:
- `src/styles/tokens.css` (CSS custom properties), `base.css`, themes via `data-theme="light|dark"` on `<html>` with `prefers-color-scheme` fallback.
- Fonts (D-021): `@fontsource/ibm-plex-sans` (400, 500, 600, latin) and `@fontsource-variable/jetbrains-mono` (latin) added at the versions in `docs/verified-stack/package.json.reference` `addLater`; only the latin subset files are imported; metric-matched fallback `@font-face` (`size-adjust`) to prevent layout shift; preload the body font only.
- Primitives in `src/components/ui/` (Astro unless stateful): `Button`, `LinkButton`, `Tabs` (roving tabindex, arrow keys, Home/End, `aria-selected`), `Callout` (variants note, tip, warning, mistake), `Disclosure` (native `<details>` styled), `Card`, `Badge` (variants `illustrative`, `heuristic`, `toy-model`, `draft`, `verified`), `Kbd`, `CodeBlock` (monospace, copy button, optional line annotations, no client highlighter), `Slider` and `Toggle` (React, labeled, touch friendly 44 px targets, value readout), `Readout`, `ProgressBar`, `Stepper`.
- `src/pages/design/index.astro` gallery (`noindex`, `/design/`), every component in both themes. Later stages add demo pages beside it under `src/pages/design/`.
- `scripts/build/contrast.mjs`: checks every foreground/background token pair used for text against WCAG AA (4.5:1 body, 3:1 large and UI), run by `npm run verify`.
**Tasks**:
1. Choose one restrained accent color and a neutral scale; define light and dark tokens: `--bg`, `--surface`, `--surface-2`, `--text`, `--text-muted`, `--border`, `--accent`, `--accent-contrast`, `--danger`, `--warn`, `--ok`, focus ring. Pick values that pass `contrast.mjs`; record the final ratios in the report.
2. Type scale with fluid `clamp()` sizes (step -1 to 5), line heights, measure (max 68ch for prose), spacing scale (4 px base), radii, shadows, motion durations. Wrap all non-essential motion in `@media (prefers-reduced-motion: no-preference)`.
3. Theme handling: an inline `<script>` in `<head>` (tiny, no dependencies) reads `localStorage['dft:theme']` through a try/catch and sets `data-theme` before first paint; no-JS default follows `prefers-color-scheme`. The toggle itself is built in M1.3.
4. Build the primitives. All interactive ones are keyboard operable with a visible focus ring, have accessible names, and do not rely on color alone (badges carry text and an icon shape).
5. `CodeBlock` supports a `lang` of `incar`, `kpoints`, `poscar`, `shell`, `text`; implement a tiny build-time tokenizer for the three VASP formats (comments after `#` or `!`, `TAG = value` highlighting for INCAR) with no client JS besides the copy button (progressive enhancement).
6. Gallery page with a theme switcher stub (button toggling the attribute) so both themes can be inspected and tested.
7. e2e: axe on `/design/` in both themes, Tabs keyboard test, Slider keyboard test, copy-button test, 360 px no horizontal scroll.
**Tests and reference values**:
- Contrast script exits non-zero on a failing pair (unit-tested with a deliberately bad pair).
- Tokenizer unit tests (INCAR line with comment, KPOINTS, POSCAR header).
- No science.
**Done when**:
- [ ] Gallery shows every primitive in light and dark; axe zero violations in both.
- [ ] `npm run size` passes; fonts on first view under 100 KB; CSS under 30 KB gzip.
- [ ] Lighthouse on `/design/` recorded (target 95, record actuals).
- [ ] Keyboard-only walkthrough of Tabs, Disclosure, Slider, Button documented in the report.
**Not in this stage**: header/nav/footer, level switch, content collections, any handbook page.

## M1.2 Content system and topic anatomy

**Goal**: Authors can write a handbook topic in MDX with the nine-part anatomy, levels, glossary terms, citations and math, and a linter enforces the rules.
**Depends on**: M1.1
**Size**: L
**Deliverables**:
- Astro content collection `handbook` (`src/content.config.ts`, glob loader over `src/content/handbook/**/*.mdx`) with a Zod schema matching `docs/CONTENT_GUIDE.md` section 3 (`id`, `title`, `module` 1 to 11, `order`, `summary`, `concepts`, `requires`, `vaspTags`, `sources` matching `/^S-\d{3}$/`, `status`, `updated`).
- MDX components in `src/components/handbook/`: `Why`, `Intuition`, `Lab` (slot or `id` prop; renders a labeled placeholder until M2.1), `TheMath`, `InVasp`, `WhatChanges`, `Mistakes`, `Check` (placeholder until M6.4), `GoDeeper`, `Level` (`min`/`max`), `Term` (glossary popover with no-JS fallback via `title` and a link), `Cite` (numbered, links to `/references/#S-nnn`), `VaspFile` (wraps `CodeBlock`).
- `src/data/glossary.json` (start with 40 terms needed by modules 1 to 3; each term: id, label, short definition in plain language, level, sources). Add more as stages need them.
- Routes `src/pages/handbook/[module]/[topic].astro` generated from the collection (output `/handbook/<module-slug>/<topic>/`), module index `src/pages/handbook/index.astro`.
- `scripts/build/sources-to-json.mjs` creating `src/data/sources.json` from `docs/SCIENCE_SOURCES.md` (id, citation, status, notes), run before build; `src/pages/references.astro` rendering it with anchors `#S-nnn` and showing each status honestly.
- KaTeX as MathML (D-008) via the verified config; a sample equation renders in the sample topic.
- `scripts/lint-content.mjs` and `npm run lint:content` (added to `verify`): front matter schema; the nine sections present and in order; at least one entry in `sources` on every topic whose `status` is not `draft`; every `Term` id exists in the glossary; every `Cite` id and `sources` id exists in the register; no U+2014; no unresolved `TODO`; each `<Level>` has `min` or `max`; no empty sections; math delimiters balanced; links to `/handbook/` resolve to existing topics.
- One sample topic `src/content/handbook/00-start/how-to-use-this-site.mdx` exercising everything, marked `status: draft`.
**Tasks**:
1. Define the schema and collection; add the sample topic first and make the build fail meaningfully on a bad front matter (test by temporarily breaking it).
2. Implement the anatomy components so section headings have stable ids (`why`, `intuition`, `lab`, `math`, `in-vasp`, `what-changes`, `mistakes`, `check`, `go-deeper`) and a left-aligned "On this page" list can be built from them.
3. `Level`: server-render both branches with `data-min`/`data-max`; CSS rules keyed on `html[data-level]` show/hide (D-011). With `data-level` missing, show beginner. Unit-test the visibility logic as a pure function `visibleAt(level, {min,max})` in `src/lib/levels.ts`.
4. `Term`: first-use definition popover opened by focus or click, closes on Escape, announces via `aria-describedby`; works without JS as an inline link to `/glossary/#id`. Add `src/pages/glossary.astro`.
5. `Cite`: numbering is per page, in order of first use; the list renders at the bottom under "Go deeper".
6. Write the content linter with unit tests (valid and invalid fixtures in `scripts/__fixtures__/`).
7. Generate the references page; make sure statuses such as `cited-from-memory` are displayed with a short explanation of what that means.
8. e2e: sample topic renders all nine sections, the math is MathML, axe passes, `Level` switching by setting the attribute through the (stub) control shows and hides blocks.
**Tests and reference values**:
- `levels.test.ts` (truth table for the three levels with min/max combinations), linter fixtures, sources-to-json parser test against a small markdown fixture and against the real register (count of rows equals count of `| S-` lines).
- No science beyond the sample equation: use the Planck relation E = h nu or de Broglie lambda = h/p, cite S-031 for constants.
**Done when**:
- [ ] A new topic needs only an MDX file plus glossary entries; the linter explains each mistake in one line.
- [ ] `npm run verify` includes `lint:content` and passes.
- [ ] `/references/` lists every source in the register with its honest status (the count equals the number of `| S-` rows).
- [ ] Sample topic passes axe in both themes; MathML renders in Chromium (record a screenshot).
**Not in this stage**: header, level switch UI, progress, search, labs, real content.
**Notes**: if the stage runs long, finish the schema, anatomy and linter first (they unblock all content), then glossary and references, and mark `partial` rather than skipping the linter.

## M1.3 Handbook shell, level switch, progress, search and SEO

**Goal**: The site feels like a product: header with navigation, level switch, theme toggle, persistent progress tracker, search, footer, landing page, and the SEO/PWA plumbing, all with near-zero JavaScript.
**Depends on**: M1.2
**Size**: M
**Deliverables**:
- `src/components/chrome/` vanilla TS + Astro: `Header` (brand, tab-style top navigation: Handbook, Tools, Studio, Builder, Practice; mobile menu), `LevelSwitch` (three-state, `role="radiogroup"`), `ThemeToggle`, `ProgressTracker` (thin bar plus "n of N topics" popover), `SearchBox` (Pagefind loaded on first focus), `Footer` (links to About, References, Privacy, Changelog, disclaimer line), `Breadcrumbs`, `PrevNext`.
- Stores in `src/stores/` using `zustand/vanilla`: `level` (`beginner|intermediate|pro`, default beginner), `theme`, `progress` (`{ visited: string[], completed: string[], updated }`, versioned through `storage.ts`). The inline head script sets `data-level` and `data-theme` before paint.
- Handbook layout with sidebar (module list, current module expanded, ticks for completed), "On this page" list, mark-complete button, keyboard shortcuts documented in a help dialog (`?`).
- Pages: `/` landing (story-led hero, what you can do, three level cards, tools teaser; no fake numbers), `/handbook/` module map (11 modules, topic counts from the collection), `/about/` (method, honest limits, disclaimer about ML and heuristics), `/privacy/` (nothing leaves the device; optional sync described as off by default), `/changelog/` with `CHANGELOG.md` rendered, `/tools/` index (cards for the four tools marked "coming soon" until built, no dead links).
- SEO: per-page `<title>` pattern, description, canonical, Open Graph and Twitter tags, JSON-LD `WebSite`, sitemap (still `noindex`, flag in one config constant `INDEXING_ENABLED = false` flipped in M11.3), `robots.txt`.
- Pagefind: `data-pagefind-body` on handbook content; search UI in the header with grouped results; `postbuild.mjs` runs Pagefind and the service worker precache excludes the index.
- `CHANGELOG.md` created (Keep a Changelog format).
**Tasks**:
1. Build the chrome as Astro components with small TS modules; no React (D-001, ARCHITECTURE section 8). Measure the JS per page and keep it at or below 15 KB gzipped.
2. Persistence: level, theme and progress through `storage.ts`; storage failure leaves defaults and shows nothing broken. Provide "Reset progress" in the progress popover with a confirmation.
3. Progress: opening a topic adds it to `visited`; "Mark complete" (and later quiz mastery, M6.4) adds to `completed`. Pure functions in `src/lib/progress.ts` with tests (add, dedupe, percent, per-module percent, merge of two states by union).
4. Search: Pagefind UI wrapper; the index excludes the design gallery; result titles show module and level notes.
5. Landing and about copy: follow `docs/CONTENT_GUIDE.md`; no em dashes; say plainly that the site is under construction with the draft badge system.
6. Mobile first: 360 px nav, tap targets 44 px, no horizontal scroll; skip link; landmarks; focus management when the mobile menu opens and closes.
7. e2e: level switch persists across reload and changes visible text on the sample topic; theme persists; progress persists; search finds the sample topic; keyboard-only navigation of the header; offline reload of a visited page; axe on `/`, `/handbook/`, the sample topic, `/about/`, `/privacy/`, `/references/` in both themes at both viewports.
8. Lighthouse for `/` and the sample topic, record all four scores; fix until 95 or better (mobile emulation) or document the cause. The SEO score is expected to be lowered only by `is-crawlable` while pages are `noindex`; say so next to the number.
**Tests and reference values**:
- `progress.test.ts`; `levels.test.ts` extended with store behavior; e2e as above. No science.
**Done when**:
- [ ] Level, theme and progress persist and degrade gracefully with storage blocked (Playwright test with storage disabled).
- [ ] Content pages ship at most 15 KB gzipped JavaScript; budgets enforced.
- [ ] Lighthouse mobile >= 95 for performance, accessibility and best practices on `/` and the sample topic, and every individual SEO audit passing except `is-crawlable` (pages are `noindex` by design until M11.3, D-027), or a documented exception.
- [ ] No dead internal links (a link check in e2e or `lint:content`).
**Not in this stage**: real modules, labs, adaptive engine hooks beyond the progress store.
