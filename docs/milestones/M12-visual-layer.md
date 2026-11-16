# M12 Visual layer: terminal-minimal design, scene library, visual questions, guided 3D path

Added in plan v3 (D-055, `docs/ROADMAP_V3.md`). The goal of this milestone is that **every idea on the site can be seen**: a reusable library of small 3D scenes (with a flat SVG fallback) that labs, questions and a guided path all share, inside a calm, minimal, keyboard-first interface.

Rules that apply to every stage here: 3D and WebAssembly load lazily (after a user action or when visible and idle); every scene has a text alternative and a static SVG projection; reduced motion turns animation into stepped states; every scene is labelled `computed`, `toy-model` or `illustrative`; 360 px works. **Only one WebGL canvas is live on a page at a time** (D-058): every other scene shows its SVG projection until the user activates it, and activating one releases the previous one. Use 3D when the subject is spatial and a computed 2D plot when it is a curve; no decorative scenes.

## M12.1 Design language v3: terminal-minimal look, command palette and status line

**Goal**: The whole site gets a calm, focused, minimal look inspired by terminal coding tools (warm neutral surfaces, one warm accent, monospace for interface text, thin borders, no decoration), a keyboard command palette that reaches every page, tool, topic, tag and term, and a quiet status line. Done now, before more UI is built, so later stages inherit it.
**Depends on**: M1.3, M5.6
**Size**: M
**Sources**: S-056 (contrast), D-021 (fonts), D-054
**Deliverables**:
- `src/styles/tokens.css`: new values for the three colour blocks (keep the selectors exactly, `scripts/build/contrast.mjs` reads them). Direction, final hex values chosen by the contrast gate: light `--bg` warm off-white (around `#faf9f6`), `--surface` a step darker, `--text` warm near-black; dark `--bg` warm charcoal (around `#1c1b19`), `--surface` a step lighter, `--text` warm off-white; **one** accent, a warm clay or terracotta, used for focus, primary actions and the active nav item only. Status colours stay distinct from the accent. No gradients, no shadows deeper than 1 px, radius 6 to 8 px.
- Typography: fonts unchanged (D-021). Prose stays IBM Plex Sans. **JetBrains Mono becomes the interface face**: nav, sidebar, buttons, badges, readouts, tables of numbers, breadcrumbs, the status line, the palette. Headings stay sans, medium weight, no all-caps.
- Interface idioms (CSS and existing primitives only, no new dependency): badges as bracketed monospace tags (`[computed]`, `[toy model]`, `[illustrative]`, `[heuristic]`); step lists with a filled-circle marker (U+25CF) and nested results with a corner connector (U+23BF), each with a text equivalent for screen readers; panels as 1 px bordered blocks; a busy indicator that is a short monospace label with a slow pulse (static under reduced motion).
- Landing page restyled as a "session": a single prompt line (`>` followed by a placeholder such as "what do you want to learn or build?") that opens the command palette, then a short list of starting points (Start learning, Build a structure, Prepare VASP inputs, Magnetic orderings, k-path, Convergence). No hero image, no marketing copy.
- `src/lib/commands.ts` (pure, tested): command registry type `{ id, title, group, keywords, href | action }`, fuzzy ranking (prefix and word-start matches before substring, ties broken by group order), slash aliases (`/learn`, `/build`, `/incar`, `/kpoints`, `/kpath`, `/converge`, `/magnetic` once it exists, `/level beginner|intermediate|pro`, `/theme light|dark|system`).
- `scripts/build/build-commands.mjs`: writes the command index (routes, tools, handbook topics from the content collection, VASP tags from `src/data/vasp-tags.json`, glossary terms) to a versioned JSON under `public/data/commands/` (under 40 KB gzipped; measure).
- `src/components/chrome/CommandPalette` (vanilla TS, not React): opens with Ctrl+K or Cmd+K, `/` when focus is not in a text field, or the landing prompt; the code and the index load on first open by dynamic import, so the content-page initial JS budget (15 KB) still holds; ARIA combobox and listbox pattern, arrow keys, Enter, Escape, focus returns to the trigger.
- `src/components/chrome/StatusLine.astro`: one monospace line at the bottom of every page: level, theme, handbook progress (modules done of 11), offline state; each item is a button that opens the matching control; hidden from print.
- Every existing page and component checked in both themes; screenshots in the report (landing, a topic, the Input Builder, the k-path tool) at 360 px and desktop.
**Tasks**: 1. Tokens, both themes, contrast gate. 2. Restyle primitives and chrome (mono interface face, badges, panels, step lists). 3. `commands.ts` with tests, the index builder. 4. Command palette, lazy, accessible, e2e. 5. Status line and landing session. 6. Re-run every existing e2e and axe in both themes; record Lighthouse for each page class.
**Tests and reference values**:
- Contrast gate passes: text at least 4.5:1, large text and UI components at least 3:1 in both themes (S-056).
- `commands.ts`: ranking order on a fixed fixture list (exact expected order written in the test, derived from the stated rule); slash aliases resolve; unknown slash text falls back to search.
- e2e: Ctrl+K opens the palette on a content page, typing `encut` lists the ENCUT tag card and the ENCUT topic, Enter navigates; `/theme dark` switches theme; Escape restores focus; the palette works at 360 px; no request for the palette chunk before the first open (network assertion).
- Size: content page initial JS still at most 15 KB gzipped; CSS at most 30 KB.
**Done when**:
- [ ] Both themes pass contrast and axe on every existing route; Lighthouse per page class at least the previous scores (95 floor, D-023).
- [ ] The palette reaches every route, tool, topic, tag and term; it is fully keyboard operable and lazy.
- [ ] No third-party logo, product name or brand asset is used; the palette is the site's own (D-054). The author approves the screenshots (Q-043).
**Not in this stage**: new tools or content; changing fonts; any server-side search.

## M12.2 Scene library: one data format for every 3D picture, with a flat fallback

**Goal**: A small, tested `SceneSpec` data format and renderer so any page, lab or question can show a 3D picture (atoms, bonds, coordination polyhedra, spin arrows, planes, vectors, labels) from a few lines of JSON, with a static SVG projection when WebGL is absent or not yet loaded.
**Depends on**: M5.5, M12.1
**Size**: L
**Sources**: S-021 (covalent radii for bonds), S-043 (VESTA-style polyhedra convention), S-056, S-057
**Deliverables**:
- `src/lib/scene/spec.ts` (pure): `SceneSpec` type and validator. Fields: `id`, `badge` (`computed` | `toy-model` | `illustrative`), `alt` (required text alternative), `caption`, `structure` (a `Structure` or a reference to a golden structure id), `repeat` (supercell display only, never changes the data), `show` (`atoms`, `bonds`, `cell`, `polyhedra: { centre: element[], ligand: element[], cutoffA }`, `labels`), `spins` (per-site collinear sign and magnitude, or a 3-vector for non-collinear), `planes` (Miller indices), `vectors` (real or reciprocal), `highlight` (site indices), `camera` (preset `a|b|c|iso` or explicit), `steps` (an ordered list of partial overrides for step-by-step stories; reduced motion shows them as discrete steps).
- `src/lib/scene/project.ts` (pure): orthographic projection of a spec to 2D primitives (circles, lines, polygons, arrows, text) with painter's ordering, so the SVG fallback is computed, not drawn by hand.
- `src/lib/scene/polyhedra.ts` (pure): coordination polyhedra by cutoff with periodic images; convex hull faces for display.
- `src/components/scene/Scene.tsx` (React island, lazy): shows the SVG projection first (zero three.js on load), a "View in 3D" button loads `src/lib/three/SpecScene.ts` (built on `ViewScene`/`CellScene`), orbit, zoom, touch, keyboard rotation (arrow keys), reset view, step controls when `steps` exist.
- `src/components/scene/SceneSvg.astro`: the same projection rendered at build time for content pages (no JS).
- Spin arrows: up and down differ by **direction and shape** (arrow head and a small `+`/`-` label), not by colour alone; zero-moment sites shown as plain atoms.
- Preset scenes in `src/data/scenes/*.json` (each small): `sc`, `bcc`, `fcc`, `hcp`, `rocksalt`, `perovskite-octahedra`, `diamond`, `graphite`, `fm-cubic`, `afm-a`, `afm-c`, `afm-g` (the last four may use hand-set signs here; M13.1 replaces them with generated ones), `miller-111-fcc`, `reciprocal-fcc`.
- MDX component `<Scene id="..." />` registered for content.
**Tasks**: 1. `spec.ts` validator with tests. 2. `project.ts` and `polyhedra.ts` with tests. 3. `SpecScene.ts` renderer reusing the existing scene controllers. 4. `Scene.tsx` island and `SceneSvg.astro`. 5. Presets, demo page `/design/scenes/`, e2e, axe, size.
**Tests and reference values**:
- Polyhedra: cubic perovskite SrTiO3 from `tests/reference/kpaths.json` gives one TiO6 octahedron per Ti with 6 vertices, 8 faces and 12 edges, and Ti-O distance equal to a/2 within 1e-9 (geometry of the golden cell).
- Rock-salt NaCl: every Na has 6 Cl neighbours at a/2 within the cutoff.
- Projection: a unit cube viewed along `[001]` projects to a square with the 4 back vertices coincident with the front ones; painter's order puts the nearer atom last.
- Validator: missing `alt` is an error; spins count must equal site count.
- e2e: demo page shows SVG first with no three.js request; "View in 3D" loads it; keyboard rotation changes the view; no-WebGL project still shows the SVG and the text alternative.
**Done when**:
- [ ] Every preset renders as SVG at build time and in 3D on demand; budgets hold (three stays in its lazy chunk).
- [ ] Axe clean on the demo page in both states and themes.
**Not in this stage**: magnetic ordering generation (M13.1), question integration (M12.3).

## M12.3 Every question gets a visual

**Goal**: Each question in the bank carries a picture that shows what the question is about (a scene preset with overrides, or a computed plot), so a learner sees the meaning before reading the options.
**Depends on**: M6.4, M12.2
**Size**: M
**Sources**: the sources already cited by each question
**Deliverables**:
- Question schema (`src/data/questions/*.json`, linter `scripts/lint-questions.mjs`) gains `visual`: `{ scene: '<preset id>', overrides?: Partial<SceneSpec>, caption, alt }` or `{ plot: '<plot id>', params, caption, alt }` (plots reuse existing lab view-models, for example the box levels or the convergence curve), or `{ none: '<reason>' }`.
- The linter requires `visual` on every question; `none` is allowed only with a reason and the report lists every such question (target zero).
- `Check` (M6.4) shows the visual above the stem as the SVG projection, with "View in 3D" when the scene has depth; explanations may refer to labelled parts of the visual ("site 2", "the arrow at Gamma").
- Every existing question (95 at plan time, more by now) gets a visual; new questions written by later stages must include one (content guide updated with a short section and an example).
**Tasks**: 1. Schema and linter rule with tests. 2. `Check` integration (SVG first, 3D on demand, no-JS fallback shows the build-time SVG). 3. Visuals for all existing questions, module by module. 4. Content guide section. 5. e2e, axe, size on a topic page with a check.
**Tests and reference values**:
- Linter: a question without `visual` fails; `none` without a reason fails; unknown preset id fails.
- e2e: a topic's check shows the visual, the 3D button works, keyboard path intact; page initial JS within its class budget.
**Done when**:
- [ ] 100 % of questions have a visual or a listed, reasoned exemption; the visuals never show an invented number.
**Not in this stage**: new questions beyond those needed to keep coverage.

## M12.4 Guided path: learn DFT step by step in 3D

**Goal**: A single guided route (`/learn/`) that walks a beginner through DFT as a sequence of 3D stations, each one scene, three short sentences, one thing to try, and a link to the full topic, so the whole subject can be seen and remembered in one sitting.
**Depends on**: M12.2, M7.2, M13.2
**Size**: L
**Sources**: those of the linked topics (each station cites them)
**Deliverables**:
- `/learn/` page and `src/content/learn/stations.json` (ordered stations): atom and electron cloud; a wavefunction and an orbital; the exponential wall (many electrons); density as a map; the Kohn-Sham idea (effective potential); the SCF loop; the crystal and its unit cell; periodic images; plane waves and the ENCUT sphere; reciprocal space, the Brillouin zone and k-points; bands and the DOS; spin up and down and magnetic orderings (FM, A, C, G from M13); your first VASP folder (POSCAR, INCAR, KPOINTS, POTCAR as a 3D "file tree" scene linked to the file explorer).
- Each station: one `SceneSpec` (or an existing lab in compact mode), badge, three sentences at beginner level, a "try this" interaction (one slider or toggle), "go deeper" link; stations advance by buttons, arrow keys or scroll; progress saved in the progress store; reduced motion uses cuts instead of camera tweens.
- One shared canvas for the whole path (scene swapped per station, not one WebGL context per station).
**Tasks**: 1. Station schema and linter (every station has badge, alt, sources, link). 2. Shared-canvas station player. 3. Write the stations. 4. Progress integration. 5. e2e (keyboard through all stations), axe, Lighthouse, size.
**Tests and reference values**:
- Linter on `stations.json`; every linked topic exists (link checker).
- e2e: the path runs end to end by keyboard; only one WebGL context exists at any time; no-WebGL shows SVG stations.
**Done when**:
- [ ] All stations written, labelled honestly and linked; the page meets the island budget and Lighthouse floor.
**Not in this stage**: new physics labs (reuse existing ones).

## M12.5 See what a tag does

**Goal**: The most used INCAR tags show, inside their card in the Input Builder and in the handbook, a small picture of what the tag changes, so a learner remembers `ISPIN = 2` as "two sets of electrons, up and down" and not as a number.
**Depends on**: M12.3, M7.2, M3.5
**Size**: M
**Sources**: S-041, S-042 (tag meanings exactly as the handbook data in `src/data/vasp-tags.json` states them)
**Deliverables**:
- `src/data/tag-visuals.json`: for each covered tag a `visual` in the M12.3 shape (a scene preset with overrides, or a plot id), a pure mapping from the tag's value to the overrides or plot params, a one-sentence caption per level, a badge, and source ids. First set, each reusing a scene or lab view-model that already exists by then: `ISPIN` (one occupation ladder versus separate up and down ladders; arrows on the user's own structure when one is loaded), `MAGMOM` (arrows per atom in POSCAR order, the count shown against the atom count, tied to V001), `ENCUT` (cutoff sphere, M4.4), `KSPACING` and the KPOINTS mesh (mesh in the zone, M4.5), `ISMEAR` and `SIGMA` (smearing lab, M7.2), `LDAUU` and `LDAUJ` (the DFT+U toy, M7.2), `IBRION`, `ISIF` and `NSW` (which degrees of freedom may move: atoms, cell shape, cell volume, on a small cell; the ISIF table comes from the tag data and nothing else), `EDIFF` and `EDIFFG` (a convergence trace with the threshold band), `NELM` (the SCF loop of M7.1 stopping early).
- `src/lib/vasp/tagVisual.ts` (pure, tested): `visualFor(tag, value, structure?)`.
- `TagCard` shows the figure behind a "Show me" disclosure, so nothing loads until asked; changing the value in the builder updates the picture and its text alternative.
- MDX component `<TagVisual tag="ISPIN" />`.
- A tag without an entry shows no figure. The report lists uncovered tags; the linter does not fail on them.
**Tasks**: 1. Data file with a schema test (every preset, plot and source id exists). 2. `tagVisual.ts` mappings with unit tests. 3. `TagCard` and `<TagVisual>`. 4. e2e and axe. 5. Coverage table in the report.
**Tests and reference values**:
- Each mapping: the tag values documented in `src/data/vasp-tags.json` produce the documented params (for example `ISPIN = 1` gives one ladder and `ISPIN = 2` gives two); an unknown value gives no figure, not a wrong one.
- e2e: open the ISPIN card, switch 1 to 2, the figure and its text alternative change; no three.js request before "Show me".
**Done when**:
- [ ] The first set is covered; every caption carries its badge and says no more than the tag data does.
**Not in this stage**: new physics, tags outside the handbook data.

## M12.6 A structure view wherever a POSCAR appears

**Goal**: Whenever the site shows or receives a structure, the learner also sees it: in the Input Builder, in the file explorer and in every tool that accepts a POSCAR or CIF, with simple measuring.
**Depends on**: M12.2, M3.5, M3.6
**Size**: S
**Sources**: S-021
**Deliverables**:
- `src/lib/crystal/measure.ts` (pure): minimum-image distance, angle and dihedral between sites; coordination number within the bond rule of M12.2.
- `StructureView` (a thin wrapper that turns a `Structure` into a `SceneSpec` and renders `Scene`): SVG first, 3D on demand, a site table as the keyboard path (selecting a row highlights the atom), a measure mode (pick two or three sites, read distance or angle), and the text summary (formula, cell parameters, atom count).
- Embedded in: the Input Builder structure step (the user sees the POSCAR they loaded, with MAGMOM arrows when a hand-off carries them), the file explorer when the file is a POSCAR (focusing a coordinate line highlights that atom and the reverse), and the k-path tool's real-space panel in place of its private scene code.
**Tasks**: 1. `measure.ts` with tests. 2. `StructureView`. 3. The three embeddings. 4. e2e, axe, size.
**Tests and reference values**:
- Rock-salt NaCl from `tests/reference/kpaths.json`: Na to nearest Cl equals half the cubic lattice parameter (computed from the golden lattice in the test); Cl-Na-Cl angles are 90 and 180 degrees within 1e-9; a pair across the cell boundary uses the minimum image.
- e2e: load a POSCAR in the Input Builder and see the view; measure a distance by keyboard only; a page with two views has one live canvas.
**Done when**:
- [ ] One component, three embeddings, no duplicated scene code left in the tools; budgets hold.
**Not in this stage**: editing atoms (M10.4).
