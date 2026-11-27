# M16 The 3D handbook: every concept as a live, free-moving 3D view beside the text

Added 2026-11-27 at the author's request (D-106). The author's original idea for the handbook was that a learner **understands DFT by handling it in 3D, not by reading text**, because text about DFT is available everywhere. Today the handbook is text with a few pictures: of 72 topics only 35 carry a `<Scene>` or a `<Lab>` at all, and those scenes open as a flat SVG picture that the reader must click to turn into 3D. The camera (`OrbitControls` in `src/lib/three/SceneController.ts`) also stops at the poles, so a crystal cannot be tumbled freely the way VESTA or the builder's viewer allows. This milestone turns every topic into a side-by-side page: the text on one side, and a live 3D stage on the other that changes as you read, that you can rotate to any angle, zoom and pan, and whose physics you change with sliders and step controls.

Read with: `docs/milestones/M12-visual-layer.md` (the scene library this builds on), D-007, D-023, D-058, D-075, D-084, D-102, and the layout branch decisions numbered 103 to 105 there (Studio merge, sidebar shell, desktop only). The gap audit of 2026-11-27 (72 topics: 53 solid, 13 thin, 6 stubs, 11 missing subjects) is summarised in section 6.

## 1. What "real 3D" means here (binding for every stage)

A previous pass shipped pictures that look like 3D but do not move, and plot stations that are flat curves. To make that impossible, a scene in this milestone **counts only if all five hold**, and `scripts/guard/check-3d-stages.mjs` (M16.3) plus an e2e test enforce them:

1. It is drawn live by the shared engine (`Viewer3D`, section 3) from data or from a tested library. No raster image, no pre-rendered video, no SVG standing in for the live view once WebGL is available.
2. The camera turns to **any** orientation (no pole lock), zooms and pans, and resets.
3. At least one control changes the **geometry or the physics** (a slider, a toggle, a step), not just which picture is shown.
4. Every state has a text description generated from the same data (`describe()`), shown to screen readers and in the "Describe" panel.
5. It carries an honest badge: `computed` (from a tested library or a golden dataset), `toy-model` (a simplified model, stated), or `illustrative` (a drawing of an idea, no numbers). Sample or synthetic data shows a visible banner (CLAUDE.md, "Be honest in the UI").

The flat SVG projection of M12.2 stays, but only as the poster shown while the engine loads and as the fallback when WebGL is missing. It is never the finished state on a machine with WebGL.

**3D where it carries meaning.** M12's rule "use 3D when the subject is spatial" is widened, not dropped: every topic gets a live stage, and a concept that is not spatial is shown through one of its real extra dimensions (a quantity over two variables as a surface, a sweep of a parameter as a waterfall, a loop as a path through a space of states). A scene that only decorates, such as a spinning logo, still fails review.

## 2. Page layout: text and 3D side by side

The site is desktop only on the layout branch (its decision 105). The layout branch `claude/hopeful-rubin-adj3m0` (DS.1 to DS.3, not yet merged when this plan was written) gives every handbook page a fixed left sidebar, a top bar, a header row, and a left rail with a **Modules** card and an **On this page** card (`HandbookLayout.astro`, slot `rail`, `.hb-rail`, `.handbook-main`). M16 keeps all of that and adds a third region, the stage. Nothing here changes the sidebar or the top bar.

```
 sidebar | rail            | text column            | 3D stage (sticky)
 16.5rem | Modules         | h1, summary, sections  | canvas, toolbar, controls,
         | On this page    | Why, Intuition, ...    | state description, badge
```

- **Wide (at least 100rem):** rail (14rem) | text (flexible, at most 42rem, about 70 characters a line) | stage (the rest, at least 36rem). The stage is `position: sticky` under the top bar, height `calc(100vh - var(--topbar-h) - 2rem)`.
- **Desktop (64rem to 100rem):** the rail's two cards fold into a **Contents** button in the header row (a disclosure that opens both cards as a panel), so the page is text | stage at about 45 | 55.
- **Splitter:** a draggable divider between text and stage (ARIA `separator`, arrow keys move it by 2rem, Home and End snap to 35 % and 65 %; the position is a per-reader setting in local storage).
- **Focus 3D:** a toolbar button widens the stage to the whole main column and turns the text into a narrow drawer that keeps the current section; Escape returns. **Text only** collapses the stage to a thin strip with "Show 3D".
- **Below 64rem** (not a target under the layout branch decision 105, but it must not break): the stage stacks above the text at 55vh and stays fully interactive. The 360 px rule in CLAUDE.md is read under the layout branch decision 105 as "nothing overflows and nothing is lost", not as a design target; D-106 records this.
- **Labs and inline scenes:** a `<Lab>` or `<Scene>` in the text column no longer opens its own canvas. It shows its poster with a "Show on stage" button that loads it into the one stage. This is how D-058 (one live canvas per page) holds on a page with many pictures.

**Scroll sync.** Each topic declares stage **states**. A section of the text names the state it wants (`<StageState id="octahedra" />` placed in the section, or the `stage.states[].section` field). An `IntersectionObserver` on the section headings picks the section inside the reading band (the top 40 % of the viewport) and the stage moves to that state: a camera tween of 400 ms and a cross-fade of layers, or an instant cut under `prefers-reduced-motion`. A **Pin** toggle stops the stage following the scroll, so a reader can keep exploring one state while reading on. Words in the text can drive the stage directly: `<Show state="octahedra" highlight="Ti">the TiO6 octahedron</Show>` renders as a text button that moves the stage and highlights those atoms.

## 3. One shared 3D engine

### 3.1 Library: three.js, already pinned

The engine is **vanilla three.js 0.186.1**, the version pinned in D-002 and already used by `src/lib/three/*`, by the M12.2 scene library and, through `src/components/studio/threeSubset.ts`, by the builder's VESTA-style viewer. No new rendering dependency is added.

| Option | Why not |
|---|---|
| Babylon.js | About five times the gzipped size of the three.js subset we load; a second engine on the site. |
| react-three-fiber | Adds a reconciler on top of three; D-007 keeps 3D vanilla and outside React so the island stays thin and testable in Node. |
| regl or raw WebGL2 | We would rebuild cameras, picking, materials and text that three already gives us, with no gain. |
| Keep `vesta.js` as the engine | It is the best viewer on the site, but it is a 185 KB untyped plain-JS file in `public/dft-studio/js/` with its own CSP (`'unsafe-eval'`, layout branch decision 103), no unit tests, and it cannot be imported by content pages. |

What we **take from `vesta.js`** (branch `claude/hopeful-rubin-adj3m0`, lines 1440 to 1840): its camera model, which is what makes it feel free. It keeps a quaternion and a distance (`camState.quat`, `camState.dist`), rotates by trackball drags with no pole clamp, switches between perspective and orthographic cameras, views along any direction vector with a sensible up hint, redraws only on demand (changed on that branch on 2026-11-27), and draws polyhedra, spin cones and measurement pins. M16.1 ports exactly these ideas into typed, tested TypeScript. It does not copy the file and does not change `vesta.js` or the builder; a later, optional stage may move the builder onto the engine.

What we **replace in `src/lib/three/`**: `OrbitControls` (it clamps the polar angle, which is the "cannot turn it over" feeling) gives way to an arcball. `SceneController` keeps its proven parts (render on demand, pause when hidden or off screen, `dispose()` of every GPU resource, the injectable renderer for Node tests) and becomes the base of `Viewer3D`.

### 3.2 The shared component (the name both handbook and learn work use)

```
src/lib/viewer3d/                  pure or three-only, tested in Node
  Viewer3D.ts        engine: one renderer, one scene, layers, camera, loop, picking, dispose
  arcball.ts         pure quaternion arcball, zoom to cursor, pan, inertia (off under reduced motion)
  views.ts           pure: view along a, b, c, a*, b*, c*, [uvw], (hkl) normal, iso; up-vector rules
  loop.ts            render on demand: invalidate() schedules one frame; animations hold the loop only while running
  layers/            atoms, bonds, cell, polyhedra, spins, vectors, planes, labels, isosurface, slice,
                     pointCloud, surface (z = f(x, y)), curve3d, mesh, arrowsField
  pick.ts            screen point to layer item (atom index, k-point, grid value)
  describe.ts        pure: state to text description (alt text and the Describe panel)
  timeline.ts        pure: steps and keyframes for step-through stories, scrub and play
src/components/viewer3d/
  Stage.tsx          the one React island: poster, auto-boot, toolbar, controls, keyboard, live region
  StageControls.tsx  sliders, toggles, selects and the step bar, generated from the stage schema
  stage.css
```

- **`Stage`** is the single component that the handbook topic stage, the `/learn/` guided path, and (from M16.4) the existing `Scene` island all mount. The sibling fix of the learn viewer (its own branch, 2026-11-27) should keep the public props of `Scene` and `GuidedPath` unchanged, so M16.4 can swap their insides for `Stage` without touching content.
- **Layers** take plain typed data (`Float32Array` positions, indices, colours by palette index), never three objects, so every layer's geometry is unit tested in Node, as M12.2 did for `resolveScene`.
- **Existing scenes** (`CellScene`, `BzScene`, `EncutScene`, `KmeshScene`, `OrbitalScene`, `SpecScene`) are ported to layers stage by stage; their tests move with them. `src/lib/physics/marchingCubes.ts` and `volumetric.ts` already exist and feed the isosurface and slice layers.

### 3.3 Interaction vocabulary (the same on every stage)

| Action | Pointer | Keyboard | Notes |
|---|---|---|---|
| Rotate freely | left drag (arcball, no pole lock) | arrow keys, 15 degree steps | Shift held: fine steps of 3 degrees |
| Roll | right drag in a circle, or Q and E | Q, E | for aligning a crystal axis upright |
| Zoom | wheel or pinch, toward the cursor | + and - | clamped to the scene's bounds |
| Pan | middle drag, or Shift and left drag | Shift and arrow keys | |
| Reset | toolbar | 0 or R | back to the state's own camera |
| View along a, b, c | toolbar menu | 1, 2, 3 | crystal scenes only |
| View along a*, b*, c* | toolbar menu | Shift and 1, 2, 3 | |
| View along [uvw] or normal to (hkl) | toolbar field | V | three integers, validated |
| Perspective or orthographic | toolbar | P | orthographic is the default for crystals, as in VESTA |
| Pick | click an item | Tab into the item list, Enter | reads the value: atom, distance, k-point label, density at a point |
| Measure | toolbar | M | two picks give a distance, three an angle (reuses `crystal/measure.ts`, D-075) |
| Physics sliders | drag | Tab, arrows, Page Up and Down | native `input type=range`, label, unit, current value, debounced redraw |
| Step through an algorithm | step bar | [ and ], Space plays or pauses | SCF loop, relaxation, NEB, MD; play is off under reduced motion |
| Layers | toolbar menu | L | atoms, bonds, cell, polyhedra, labels, isosurface, axes |
| Describe | toolbar | D | opens the text description of the current state |
| Focus 3D, Text only, Pin | toolbar | F, T, Shift and P | layout controls from section 2 |

The stage container is a focusable `role="group"` with `aria-roledescription="3D view"` and a visible key map; the canvas itself is `aria-hidden` (the readouts and the description carry the content, as in `ViewScene.ts`). Colour is never the only cue (shape, labels and outlines also differ). A live region announces each state change in one sentence.

### 3.4 Performance budget (against the 0.95 Lighthouse floor)

The topic page stays in the `content` page class (15 KB initial JS, `budgets.json`) and must keep the performance floor of 0.95, median of three runs (D-023, D-102). The engine is never in the initial load:

- **Poster first.** At build time the page renders the first state's SVG projection (M12.2 `SceneSvg.astro`) as the stage poster, so the stage has content at first paint with zero JavaScript.
- **Auto-boot, no click.** After the `load` event, when the stage is visible and the main thread is idle (`requestIdleCallback`, timeout 2 s), the island imports the engine and goes live by itself. The boot yields between steps (import, renderer, first layer, the rest) so no task exceeds 50 ms. If measurement shows Total Blocking Time above 100 ms, the fallback is to boot on the first pointer move, scroll or key press: still no click, and recorded as a D entry with the numbers.
- **Chunks (gzip):** `three` chunk at most 150 KB (now 136.8 KB; the arcball replaces `OrbitControls`, so it should shrink); a new `viewer3d` chunk at most 45 KB; each scene dataset at most 64 KB; all datasets of one topic at most 200 KB. `budgets.json` gains the `viewer3d` lazy chunk and a `sceneData` total; `npm run size` enforces both.
- **Frame budget:** render on demand only (zero frames while nothing changes, tested); device pixel ratio capped at 2; at most 300 k triangles and 100 draw calls per state (instancing for atoms and k-points); heavy geometry (isosurfaces, phonon dispersions, MD steps) is built in a worker and handed over as transferable arrays; a frame under 8 ms on a mid laptop at 1440 by 900.
- **Lifecycle:** pause when the tab is hidden or the stage is off screen; handle `webglcontextlost` and restore; `dispose()` frees every geometry, material and texture (asserted through `renderer.info.memory`).

### 3.5 Accessibility, reduced motion and no WebGL

- Keyboard reaches every control and every pickable item (section 3.3); focus is always visible; axe is clean on every topic page in both themes.
- `prefers-reduced-motion`: no camera tweens (cuts), no inertia, no autoplay; animations (phonon modes, MD, the SCF loop) become step lists with a step bar.
- No WebGL, or WebGL blocked: the poster stays, with a one-line note "3D needs WebGL; this is a flat view", the controls still change the SVG projection where `project.ts` supports it, and the description stays complete.

### 3.6 CSP and security

The main site CSP (`firebase.json`: `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' ...`) is not loosened. The engine uses no `eval` or `new Function`; shaders are three's own; workers come from the site origin; datasets are fetched from `'self'` only and cached by the service worker. No CDN at runtime (as for Studio, layout branch decision 103). The a11y and CSP e2e spec gains a topic page with a live stage and asserts no CSP violation is reported.

## 4. How scenes get their data (no server)

Spark plan only, so every number on a stage comes from one of three places, and the badge says which:

1. **Computed in the browser from a tested library** (`computed` or `toy-model`): hydrogen orbitals (`physics/hydrogen.ts`), particle in a box (`box.ts`), plane-wave spheres (`planewaves.ts`), Brillouin zones and k-paths (`crystal/brillouin.ts`, `kpath/`), k-meshes, the SCF toy (`scf1d.ts`), smearing functions, DFT+U toy, Stoner model, tight-binding bands (`tightbinding2d.ts`, extended to simple 3D lattices in M16.10), EOS fits, strain of a cell, slabs and defects (`crystal/slab.ts`, `defects.ts`), symmetry from moyo. New small models (for example a ball-and-spring phonon model, a two-dimensional energy landscape for NEB, a Lennard-Jones toy MD) are added as pure libraries with golden tests, by the Tier A stage that needs them.
2. **Precomputed datasets in the repo** (`computed`): generators in `scripts/scenes3d/*.py` (pinned in `scripts/reference/requirements.txt`) write `public/data/scenes3d/<id>.json` (metadata, source ids, units, grid shape, badge) and `<id>.bin` (little-endian `Float32` or `Uint16` quantised with a stated scale and offset). A golden test checks each dataset against its generator's reference values, and the generator never runs at build time on the site. Datasets follow ARCHITECTURE section 6 for versioning.
3. **The author's own VASP output** (`computed`, "real calculation"): CHGCAR, PROCAR, OUTCAR and phonon files only from `data/author/` (Q-008). Until they exist, a scene that needs real DFT output uses a model dataset with the `toy-model` badge and a banner, never invented numbers.

The reader's own files can also be dropped onto any analysis stage (module 9 and 12 viewers already parse them locally); nothing is uploaded.

## 5. Stage schema (per topic)

Each topic's front matter gains a `stage` block, validated by `src/lib/viewer3d/stageSchema.ts` (pure) and the content linter:

```yaml
stage:
  scene: perovskite-octahedra        # a scene id: preset, dataset or generator
  badge: computed
  states:
    - id: overview
      section: why                   # the section that selects this state
      camera: { view: iso }
      layers: [atoms, cell]
      alt: "Cubic SrTiO3 cell, Ti at the centre, O on the face centres, Sr on the corners."
    - id: octahedra
      section: intuition
      layers: [atoms, polyhedra]
      highlight: { element: Ti }
  controls:
    - { kind: slider, param: tilt, label: "Octahedral tilt", unit: "degree", min: 0, max: 15, step: 0.5, value: 0 }
  sources: [S-043]
```

The schema says what each control is bound to (a generator parameter, a layer option, a timeline position), so controls are generated, never hand-wired per page.

## 6. Concept by concept

Every existing topic (72) and every missing subject from the gap audit (11). "Sees" is the 3D picture, "does" the interaction, "data" where the numbers come from. Status is the audit's (S solid, T thin, X stub, N new). Stage column is the M16 stage that builds it.

### Module 0 and 1: start and why DFT

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| How to use this site (S) | the stage itself, with a small crystal | a guided tour of the controls: rotate, zoom, pan, view along c, pick an atom, move a slider | rock-salt preset | computed | M16.5 |
| Why simulate materials (S) | zoom from a crystal block to one unit cell to the electron density around one atom | scroll zoom across three scales; toggle "what experiment sees" vs "what DFT computes" | NaCl preset, superposed atomic densities | illustrative | M16.5 |
| The ladder of methods (S) | a 3D chart: system size, cost and accuracy, one marker per method (force fields, DFT, hybrids, GW, CCSD(T)) | drag a system-size slider and watch which methods stay affordable | cost scaling exponents from `physics/scaling.ts` (sourced) | illustrative (axes), computed (scaling) | M16.5 |
| What DFT can and cannot tell you (S) | one crystal with property "probes": density isosurface, band gap arrow, spin arrows, phonon motion, each tagged reliable, approximate or out of reach | click a probe to read what DFT says about it and why | rock-salt and perovskite presets | illustrative | M16.5 |
| Your roadmap to a first VASP project (S) | a path through stations (structure, inputs, convergence, relaxation, analysis) laid out in 3D, each station a mini scene | click a station to jump to its module; progress marks from the progress store | site routes, progress store | illustrative | M16.5 |

### Module 2: quantum basics

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| Particles and waves (S) | a wave packet as a ribbon over a plane: position, time and amplitude | slider for momentum spread; play time; the packet spreads | analytic Gaussian packet | computed | M16.5 |
| The wavefunction and probability (S) | real and imaginary parts as a twisting ribbon around the x axis, with the density as a shaded band underneath | slider for momentum; toggle phase colouring; pick a point to read the probability | analytic | computed | M16.5 |
| Why energy levels matter (S) | levels of two atoms as stacked plates that split into bonding and antibonding as the atoms approach, then into bands for a chain | distance slider; atom count slider 2 to 20 | tight-binding chain (`tightbinding2d.ts` reduced to 1D) | toy-model | M16.5 |
| The particle in a box (S) | a 3D box with the probability isosurface of state (nx, ny, nz); the energy ladder beside it | pick nx, ny, nz; stretch the box along one axis; see degeneracy split | analytic (`box.ts` extended to 3D) | computed | M16.5 |
| Orbitals of the hydrogen atom (S) | true isosurfaces of s, p, d (and f) orbitals with the sign of the wavefunction, radial nodes as clipped shells | choose n, l, m; isovalue slider; clip plane to see inside; real or complex form | `hydrogen.ts`, marching cubes in a worker | computed | M16.5 |
| Spin and the Pauli principle (S) | electrons as up and down arrows filling level plates; a two-electron wavefunction surface psi(x1, x2) that is symmetric or antisymmetric | add electrons one by one; swap the two electrons and watch the surface change sign | analytic two-particle box states | computed | M16.5 |

### Module 3: many electrons

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| The many-electron problem (S) | the two-electron wavefunction of a 1D model atom as a surface over (x1, x2), with the electron repulsion as a ridge along x1 = x2 | interaction strength slider; the ridge cuts a valley in the surface | `solver1d.ts` two-particle grid (golden) | computed | M16.5 |
| The exponential wall (S) | a grid of points for one electron in 3D, then a "cost tower" that grows by grid points to the power of N | electron count slider 1 to 10; grid points slider; the tower and the memory readout | `combinatorics.ts`, `scaling.ts` | computed | M16.5 |
| Electron density (S) | density isosurface and a colour-mapped slice through a small molecule or crystal | isovalue slider; move the slice plane; pick a point to read n(r) | superposed atomic densities, later the author's CHGCAR | toy-model | M16.5 |
| From wavefunction to density (S) | the psi(x1, x2) surface, and the density as its "shadow" projected onto the x axis wall | interaction slider; toggle "integrate out x2" to animate the projection | `solver1d.ts`, `density1d.ts` | computed | M16.5 |
| What we still have to approximate (S) | the exact density next to the density from a simple approximation, as two transparent surfaces with the difference coloured | switch approximation (none, Hartree, exchange only); read the energy error | 1D toy models (golden) | toy-model | M16.5 |

### Module 4: Kohn-Sham

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| The Hohenberg-Kohn theorems (S) | a potential landscape v(x, y) as a surface and, beside it, the density it produces | drag a well's depth and position; the density follows; try to find a second potential with the same density (it cannot) | 2D grid toy solver (new, M16.6, golden vs a finite-difference reference) | toy-model | M16.6 |
| The Kohn-Sham idea (S) | the interacting system and the non-interacting system side by side with the same density surface | toggle between the two; the effective potential grows until the densities match | 1D toys rendered as surfaces over a parameter | toy-model | M16.6 |
| Exchange and correlation (S) | the exchange-correlation hole around a fixed electron as a dip in a density surface | move the reference electron; switch LDA-like and exact hole in the model | 1D toy (golden) | toy-model | M16.6 |
| The self-consistency loop (S) | the SCF loop as a ring of stations (density, potential, solve, new density, mix) and a waterfall of densities by iteration | step through iterations; mixing slider; watch convergence or oscillation | `scf1d.ts` (golden, D-observed alpha = 1 oscillation) | computed | M16.6 |
| When the SCF loop goes wrong (S) | the density waterfall oscillating or diverging, and the residual as a path on an error surface | change mixing, smearing and starting guess to make it converge | `scf1d.ts` | computed | M16.6 |

### Module 5: practical choices

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| Plane waves and the cutoff energy (S) | reciprocal lattice points inside the cutoff sphere, and a real-space wave built from them | ENCUT slider (count updates live); toggle real space; view along axes | `planewaves.ts` (golden counts) | computed | M16.7 |
| k-points and the Brillouin zone (S) | the zone, the mesh, irreducible points by symmetry colour, the k-path | mesh slider, Gamma or Monkhorst-Pack, shift; change the lattice | `brillouin.ts`, `kmesh.ts`, `kpath/` | computed | M16.7 |
| Pseudopotentials and PAW (S) | the all-electron and pseudo wavefunctions as radial surfaces of revolution, with the augmentation sphere | core radius slider; toggle all-electron and pseudo | `paw.ts` | toy-model | M16.7 |
| Choosing a functional (S) | a "Jacob's ladder" in 3D with each rung's ingredient shown on a density (n, gradient, kinetic density) | climb rungs; see lattice constant and gap error bars change | sourced benchmark tables only (S- ids) | illustrative with sourced values | M16.7 |
| Smearing and the Fermi level (S) | band levels filling up as a sheet with occupation as height, near the Fermi level | SIGMA slider; ISMEAR choice; read the energy shift | `smearing.ts` | computed | M16.7 |
| DFT+U (S) | d orbitals on a metal site, with occupation shown as filled lobes, and the level splitting | U slider; watch the gap open in the DOS panel | `dftu.ts` | toy-model | M16.7 |
| van der Waals corrections (T) | two graphite layers or an MoS2 bilayer with the pairwise dispersion energy as a surface over (spacing, sliding) | spacing and sliding sliders; switch no correction, D2-like pair form; read the binding curve | pair dispersion model with sourced C6 and radii (source to be registered in the stage; Q if none) | toy-model | M16.7 |
| Spin and magnetism (S) | up and down density lobes on a magnetic ion, and the net moment arrow | toggle spin channels; moment slider | Stoner toy (`stoner.ts`) | toy-model | M16.8 |
| Spin-polarized calculations (S) | two sets of level plates (up, down) that split as ISPIN goes from 1 to 2 | ISPIN toggle; MAGMOM per site | `tagVisual.ts` mappings (M12.5) | computed | M16.8 |
| Magnetic orderings (S) | FM, A, C, G orderings on a perovskite supercell with spin cones | switch ordering; supercell size; rotate to see the planes | `crystal/magnetic` (golden) | computed | M16.8 |
| Finding the magnetic ground state (T) | the candidate orderings on one common supercell, with an energy ladder beside | pick candidates; read the energy differences from an example or the reader's OUTCARs | M13.3 analysis, example dataset labelled | computed or sample | M16.8 |
| Reading magnetic output (T) | per-site moments as arrow lengths on the structure, read from OUTCAR | drop an OUTCAR; pick a site to read its moment and charge | OUTCAR reader (M13.3) | computed | M16.8 |
| Non-collinear and spin-orbit (S) | canted and spiral spins as free 3D arrows; the quantisation axis | rotate the SAXIS; cant angle slider; spiral wavevector slider | analytic spin textures | illustrative | M16.8 |

### Module 6: VASP files

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| POSCAR (S) | the structure built line by line as the reader moves through the file | hover a POSCAR line to highlight its atom and the reverse; edit a coordinate and see the atom move | POSCAR reader, `StructureView` (D-075) | computed | M16.9 |
| INCAR (S) | each tag shown on the system it changes (spin plates, cutoff sphere, smearing sheet, relaxation arrows) | click a tag to load its picture; change its value | `tag-visuals.json` (M12.5) | computed | M16.9 |
| KPOINTS (S) | the mesh in the zone, line mode as the k-path | edit the file and watch the mesh or path update | `kpoints.ts`, `kpath/` | computed | M16.9 |
| POTCAR (S) | the valence and core shells of the chosen element as nested isosurfaces, with ENMAX as the cutoff sphere | choose element and variant (_pv, _sv) | element table, PAW toy | illustrative | M16.9 |
| The output files (S) | a 3D "file tree" of a run folder; each file opens its own small scene (CHGCAR isosurface, DOSCAR sheet, OUTCAR forces) | open a file to see what it holds | sample files with banner | illustrative | M16.9 |

### Module 7: running a calculation

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| The five-step protocol (S) | the project folder as a 3D tree with the five steps as levels | step through the protocol; each level shows its inputs | `the-workflow` content | illustrative | M16.9 |
| Job scripts and parallel settings (S) | k-points and bands distributed over a grid of cores (KPAR, NCORE) as coloured blocks | KPAR and NCORE sliders; see the split and the idle cores | pure mapping (new, tested) | computed | M16.9 |
| Reading OSZICAR and OUTCAR (S) | energy, forces and ionic steps as a 3D trace (step, iteration, energy) | drop files or use the sample; pick a point to read its line | output readers (M4.1, M7.3), sample with banner | computed | M16.9 |
| Restarts with ISTART and ICHARG (S) | a density starting from atoms, from a previous run, or fixed, as three surfaces converging | choose ICHARG; step the SCF | `scf1d.ts` with three starts | toy-model | M16.9 |
| VASPKIT in practice (S) | the task tree as a 3D menu; picking a task shows what file it makes (k-path, DOS projection) | browse tasks | VASPKIT map (M15.9) | illustrative | M16.9 |

### Module 8: convergence and errors

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| Why you must test convergence (S) | an energy surface over (ENCUT, k-mesh) flattening toward the converged plateau | move both sliders; set a tolerance and see the safe region | series model from M4.2 plus sample data, banner | toy-model | M16.9 |
| Convergence of the cutoff energy (S) | the cutoff sphere growing beside the energy curve settling | ENCUT slider | `planewaves.ts`, `kp1d.ts` | computed | M16.9 |
| Convergence of the k-point mesh (S) | the mesh densifying in the zone, metal versus insulator panels | mesh slider; switch metal or insulator | `kmesh.ts`, `tightbinding2d.ts` | computed | M16.9 |
| When the electronic loop will not converge (S) | the SCF waterfall with each ladder step as a fix that changes the path | apply the ladder steps in order | `scf1d.ts` | toy-model | M16.9 |
| When a relaxation misbehaves (S) | atoms moving step by step on a 2D energy landscape (zig-zag, overshoot, stuck) | change POTIM and IBRION in the model; step | 2D landscape toy (shared with NEB, M16.14) | toy-model | M16.9 |
| Common errors and how to read them (S) | the error finder with a picture of each error's cause (bad mesh, overlapping atoms, wrong MAGMOM count) | pick an error | `errors.json` | illustrative | M16.9 |

### Module 9: analysis (thin today; 3D is the main fix)

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| Reading a band structure (T) | the bands along the k-path as ribbons, the zone with the path beside them, and E(kx, ky) as a band surface over a plane of the zone; projected (fat) bands as ribbon width | move a cursor along the path and see the k-point in the zone; switch to the surface view; pick a band for its gap and effective mass | tight-binding 3D model (new, golden), example dataset, the reader's EIGENVAL and PROCAR | computed | M16.10 |
| Reading a density of states (T) | the DOS as a sheet, energy against k-integrated weight, linked to the band surfaces; projections stacked by element and orbital | EMIN, EMAX, NEDOS, smearing sliders; tetrahedron on or off; pick a peak to see its bands | same model, DOSCAR reader | computed | M16.10 |
| Charge density and volumetric files (T) | CHGCAR isosurface, a movable slice, charge-density difference with gain and loss colours, spin density, ELF | isovalue slider; slice plane by (hkl) and offset; toggle CDD, spin, ELF | `chgcar.ts`, `volumetric.ts`, `marchingCubes.ts`, example dataset, the reader's files | computed | M16.10 |
| Reading energies and forces (T) | force arrows on atoms and the stress as a deformed cell | drop an OUTCAR or sample; pick an atom for its force; exaggerate the stress | OUTCAR reader | computed | M16.10 |
| Judging a geometry relaxation (T) | the relaxation trajectory: atoms moving step by step with the energy and max force traces | scrub the ionic steps; compare start and end; read max force against EDIFFG | OUTCAR or XDATCAR reader, sample with banner | computed | M16.10 |

### Module 10: worked example (stubs; inputs before results, D-101)

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| Choosing the RCuO3 system (X) | the RCuO3 perovskite with CuO6 octahedra and the R sites, tolerance factor readout | swap R across the lanthanides and watch t and the octahedra | M8 tolerance library | computed | M16.12 |
| Structure and starting inputs (X) | the actual POSCAR of the example on the stage, MAGMOM arrows, the INCAR tags pictured | hover INCAR and POSCAR lines | the example input files (author) | computed | M16.12 |
| Convergence testing on RCuO3 (X) | the convergence surfaces of M16.9 with the example's series when it exists | sliders over the series | author results when supplied, else "awaiting results" state | computed or pending | M16.12 |
| Structural relaxation of RCuO3 (X) | the relaxation trajectory of the example | scrub | author results | computed or pending | M16.12 |
| Electronic structure of RCuO3 (X) | bands, DOS and the Cu d density of the example | as module 9 | author results | computed or pending | M16.12 |
| What the worked example teaches (X) | the whole pipeline as the roadmap scene with the example's numbers on each station | click a station | as above | computed or pending | M16.12 |

### Module 11: tools (thin; the stage becomes a live walkthrough)

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| Research tools overview (T) | each tool's own scene in a carousel of small stages | open a tool in place | tool presets | computed | M16.12 |
| Tour of the Material Builder (T) | a guided build: pick a template, make a supercell, cut a slab, add a vacancy, on the stage | follow the steps; hand off to the builder | `crystal/ops.ts`, `slab.ts`, `defects.ts` | computed | M16.12 |
| Tour of the Screening Studio (T) | candidates as points in a 3D property space (tolerance factor, hull distance, gap) | filter with sliders; pick a point | MP sample (synthetic banner until a real pull) | sample | M16.12 |
| Where to go next (T) | the map of subjects as the roadmap scene, with the new topics | pick a subject | site routes | illustrative | M16.12 |

### Module 12: properties

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| Elastic constants (S) | the cell under each of the six strains, and the directional Young's modulus as a 3D surface | strain amplitude slider; pick a strain; read Cij; stable or unstable by Born criteria | `mechanics/elastic.ts` (golden) | computed | M16.11 |
| Energy-volume curves (S) | the cell breathing as the volume changes, with the E(V) fit beside it | volume slider; fit form choice | `physics/eos.ts` (golden) | computed | M16.11 |
| Phonons (S) | atoms vibrating in a chosen mode, with the dispersion along the path; imaginary modes shown as a falling motion | pick a branch and q-point on the dispersion; amplitude slider; step under reduced motion | ball-and-spring force-constant model (new, golden vs analytic chains), Gamma modes from the reader (M15.6) | computed | M16.11 |
| Dielectric tensor and Born charges (S) | the dielectric ellipsoid on the crystal and Born charge tensors as ellipsoids on atoms | drop an OUTCAR or use the sample; rotate the field direction to read epsilon along it | M15.5 readers | computed | M16.11 |
| Optical properties (S) | absorption as a surface over (energy, polarisation direction) | choose polarisation; energy cursor | M15.5 derived quantities | computed | M16.11 |
| Bader charges (S) | Bader basins as coloured regions of the density with zero-flux surfaces, charge per atom | pick an atom for its charge; isovalue slider | example dataset (generator), the reader's ACF.dat | computed | M16.11 |
| Other calculations (T) | a map of property families, each opening its own mini scene | pick a property | property catalogue (M15.8) | illustrative | M16.11 |

### New topics (missing today, written with their stage)

| Topic | Sees in 3D | Does | Data | Badge | Stage |
|---|---|---|---|---|---|
| Crystal structure and symmetry basics (N) | lattice, basis, unit and primitive cells, symmetry operations animated (rotation axes, mirror planes, inversion, screw axes), Bravais lattices; Bloch periodicity as a wave across cells | apply an operation and watch the crystal map onto itself; switch conventional and primitive cell; pick a space group | moyo (M5.1), golden structures | computed | M16.13 |
| Relaxation, a dedicated topic (N, closes the broken pointer) | the relaxation on an energy landscape and on a real cell; ISIF degrees of freedom as allowed motions | choose IBRION, ISIF; step | 2D landscape toy, `tag-visuals` ISIF table | toy-model | M16.13 |
| Surfaces and slabs (N) | slab cut from the bulk by (hkl), terminations, vacuum, the dipole and the planar average | Miller index fields; layers and vacuum sliders; termination choice; symmetric or asymmetric | `crystal/slab.ts` (golden), `volumetric.ts` planar averages | computed | M16.13 |
| Point and charged defects (N) | a supercell with a vacancy, interstitial or substitution, neighbours relaxing, images of the defect in neighbouring cells | supercell size slider (see defect-defect distance); charge state; formation energy against Fermi level | `crystal/defects.ts` (golden), formation-energy formula (sourced) | computed | M16.13 |
| Formation energy, stability and the convex hull (N) | a ternary hull as a 3D surface over the composition triangle, with stable and unstable phases | pick a phase for its distance to the hull; drag a phase's energy and watch the hull change | hull algorithm (new, golden vs pymatgen), MP sample with banner | computed | M16.14 |
| Transition states and NEB (N) | a 2D energy landscape as a surface with the band of images, the minimum energy path and the saddle | step the NEB; toggle climbing image; image count slider | analytic landscape (Muller-Brown or similar, sourced), new pure NEB library (golden) | toy-model | M16.14 |
| Molecular dynamics and machine-learned force fields (N) | atoms moving in a box at temperature, with a thermostat; trajectory and energy traces | temperature, time step and thermostat sliders; play and step; see a too-large time step blow up | Lennard-Jones toy MD in a worker (new, golden vs a reference integration) | toy-model | M16.14 |
| Performance and parallelisation in depth (N) | extends the job-script scene with memory and LREAL | sliders | as M16.9 | computed | M16.9 |
| Bonding analysis, COHP (N, short) | bonding and antibonding regions between two atoms as a density difference, with the COHP sheet | pick a bond | example dataset | toy-model | M16.14 |
| Beyond DFT: Hartree-Fock, GW, BSE (N, short) | extends the ladder of methods scene with gap corrections | pick a method | sourced values only | illustrative | M16.14 |
| Wannier functions and topology (N, low priority) | Bloch functions turning into localised Wannier functions on a chain | localisation slider | 1D tight-binding toy | toy-model | later, not in M16 |

## 7. Stages

Tier rule (ROADMAP_V3, M15): **Tier A** builds anything that computes a number a researcher reads, and the engine every stage stands on. **Tier B** builds content, UI and wiring on tested libraries. Lean execution (`docs/WORKFLOW.md` section 2a) is binding; each stage has a Budget and finishes `partial` rather than overrun.

**Order.** M16.1 first. M16.2 and M16.3 next (they can run in parallel). M16.4 after both. The content stages M16.5 to M16.14 can run in any order once M16.2 and M16.3 are done; M16.10, M16.11, M16.13 and M16.14 are Tier A because they add physics. M16.15 last.

**Every content stage** (M16.5 to M16.14): build the rows of section 6 for its topics exactly; one stage per topic, scroll-synced states for at least Why, Intuition and The math; a "try this" control on every topic; describe text for every state; the stage linter passes; one e2e per module that loads a topic, waits for the live stage without clicking, drags to rotate, moves a slider and asserts the geometry changed (section 1); axe clean; `npm run size` within budget; Lighthouse on one topic of the module. Content text changes are limited to what the stage needs (state markers, `<Show>` links, a caption) unless the stage says otherwise.

---

## M16.1 Viewer3D engine: free-moving camera, layers and render on demand (Tier A)

**Goal**: One tested engine that every 3D view on the site can use, with a camera that turns freely to any angle like VESTA, and a frame loop that costs nothing when idle.
**Depends on**: M12.2
**Size**: L
**Budget**: 90 min; second session for the scene ports if needed.
**Sources**: S-021, S-043, S-057; `vesta.js` camera on branch `claude/hopeful-rubin-adj3m0` as prior art (not a science source)
**Deliverables**:
- `src/lib/viewer3d/arcball.ts` (pure): quaternion state and distance, drag to rotation (Shoemake arcball), roll, zoom toward a screen point, pan, optional inertia, normalisation after every update.
- `src/lib/viewer3d/views.ts` (pure): view along a, b, c, a*, b*, c*, [uvw] and the (hkl) normal for any lattice, with VESTA's up-vector rule; iso view.
- `Viewer3D.ts`: renderer, scene, perspective and orthographic cameras sharing the arcball state, layer registry, `invalidate()`, picking, context loss handling, `dispose()`. Built from `SceneController` (keep its injectable renderer and Node tests); `OrbitControls` removed from the engine.
- Layers: atoms (instanced), bonds, cell, polyhedra, spins, vectors, planes, labels (reuse `labelPlacement.ts`), isosurface (from `marchingCubes.ts`, in a worker), slice, point cloud, surface z = f(x, y), curve3d.
- Port `CellScene`, `BzScene` and `SpecScene` onto the engine with their existing tests green; the others in M16.4 or the content stages.
- `budgets.json`: `viewer3d` lazy chunk (45 KB gz).
**Tasks**: 1. `arcball.ts` and `views.ts` with tests. 2. `loop.ts` and `Viewer3D.ts` with a fake renderer. 3. Layers with geometry tests. 4. Port three scenes. 5. Demo page `/design/viewer3d/` with every layer; e2e; size.
**Tests and reference values**:
- Arcball: 200 upward drags of 2 degrees carry the camera through the pole and back without a jump (angle between successive view vectors at most 2.01 degrees); the quaternion stays unit within 1e-12 after 10 000 random drags.
- Views: for every golden lattice in `tests/reference/kpaths.json`, view along c puts c parallel to the view direction within 1e-9, and view along c* puts the ab plane parallel to the screen within 1e-9.
- Zoom to cursor: the world point under the cursor stays under it within 0.5 px.
- Loop: zero frames over 2 s with no input; after one drag, frames stop within 300 ms (immediately under reduced motion).
- Dispose: `renderer.info.memory.geometries` and `.textures` return to 0.
- Pick: a click at an atom's projected centre returns its site index for the NaCl and SrTiO3 golden cells.
- e2e on the demo page: drag rotates (the camera quaternion exposed on `data-camera` changes and canvas pixels differ), keyboard 1, 2, 3 views, P toggles projection, no CSP violation.
**Done when**:
- [ ] The three ported scenes behave as before and now turn freely; the `three` chunk is at most 150 KB and `viewer3d` at most 45 KB gzipped.
- [ ] D entry for the engine and the arcball, with the measured sizes.
**Not in this stage**: the topic layout, content, the guided path, changing `vesta.js` or the builder.

## M16.2 Topic stage: the side-by-side layout, auto-boot and scroll sync (Tier B)

**Goal**: Every handbook topic page shows the text beside a live 3D stage that starts by itself, follows the reading position, and can be focused, pinned or hidden.
**Depends on**: M16.1, and the layout branch (DS.1 to DS.3, `claude/hopeful-rubin-adj3m0`) merged into main. If it is not merged, stop and report: the stage must sit in that layout, not the old one.
**Size**: L
**Budget**: 90 min.
**Sources**: S-056
**Deliverables**:
- `src/components/viewer3d/Stage.tsx`, `StageControls.tsx`, `stage.css`: poster, auto-boot on idle (section 3.4), toolbar (section 3.3), step bar, live region, Describe panel, no-WebGL note.
- `HandbookLayout.astro`: a `stage` slot and the three layouts of section 2 (wide, desktop with the Contents disclosure, narrow stack); the splitter; Focus 3D, Text only and Pin.
- Scroll sync: `src/lib/viewer3d/sync.ts` (pure: given section positions and the viewport, which state is active) and its observer wiring; `<StageState>` and `<Show>` MDX components.
- `<Lab>` and `<Scene>` inside a topic become posters with "Show on stage".
- Three pilot topics wired end to end with states from section 6: Orbitals of the hydrogen atom, k-points and the Brillouin zone, Magnetic orderings.
**Tasks**: 1. `sync.ts` with tests. 2. `Stage` island. 3. Layout and splitter. 4. MDX components. 5. Pilot topics. 6. e2e, axe, Lighthouse on a pilot.
**Tests and reference values**:
- `sync.ts`: fixed section layouts give the expected active state at given scroll offsets (cases written in the test from the stated rule: the last heading above 40 % of the viewport).
- e2e at 1440 by 900: the stage is live without any click (canvas present, `data-live="true"`); no request for the `three` chunk before the `load` event; scrolling to The math changes `data-state`; Pin stops it; Focus 3D and Escape; splitter by keyboard; reduced motion gives instant state changes; no WebGL shows the poster and the note.
- Lighthouse on the Orbitals topic: performance at least 0.95 (median of three), Total Blocking Time recorded.
**Done when**:
- [ ] The three pilots pass section 1 on a machine with WebGL; content page initial JS still at most 15 KB gzipped.
- [ ] D entry with the measured TBT and the boot rule chosen.
**Not in this stage**: other topics, the guided path.

## M16.3 Stage schema, datasets, generators and the stage guard (Tier A)

**Goal**: Stages are data, not code: a validated schema, a compact dataset format with generators and golden checks, and a guard that fails any page whose "3D" is really a picture.
**Depends on**: M16.1
**Size**: L
**Budget**: 90 min.
**Sources**: those of each dataset; S-030 for isosurfaces
**Deliverables**:
- `src/lib/viewer3d/stageSchema.ts` (pure) and its use in `scripts/lint-content` (or the existing content linter): every state has `alt`; badge present; controls bound to a known parameter; sources exist in `docs/SCIENCE_SOURCES.md`.
- Dataset format (section 4): `src/lib/viewer3d/dataset.ts` (pure reader with scale and offset dequantisation, bounds checks), `public/data/scenes3d/` layout and versioning, service worker caching entry.
- `scripts/scenes3d/`: a generator skeleton, the first two datasets (superposed atomic density of NaCl for module 3, one tight-binding band surface for the M16.2 k-points pilot), and their golden tests.
- `scripts/guard/check-3d-stages.mjs` in `npm run verify`: every topic has a `stage` (warn-only until M16.15, then failing); no stage uses a raster image or video; every state has alt text; every dataset referenced exists and is within 64 KB gz; per-topic total within 200 KB gz.
**Tasks**: 1. Schema and linter with tests. 2. Dataset reader with tests. 3. Generators and golden files. 4. Guard script with tests on fixtures. 5. Budgets.
**Tests and reference values**:
- Dataset round trip: values dequantised within the stated scale step of the generator's float values (generator writes both).
- Guard: a fixture with an image stage fails; a fixture with a missing alt fails; a valid fixture passes.
**Done when**:
- [ ] `npm run verify` runs the guard; the two datasets load on the demo page.
**Not in this stage**: topic content.

## M16.4 The guided path and the Scene island on the engine (Tier B)

**Goal**: `/learn/` and every remaining `Scene` use the same `Stage`, so the learn path is a real free-moving 3D view at every station, with no flat picture left on a WebGL machine.
**Depends on**: M16.2, M16.3, and the learn-viewer fix of 2026-11-27 merged (separate branch).
**Size**: M
**Budget**: 60 min.
**Sources**: those of each station (D-084)
**Deliverables**:
- `GuidedPath.tsx` mounts one `Stage` for the whole path (D-084, D-058); `Scene.tsx` becomes a thin wrapper around `Stage` with its props unchanged.
- Stations whose visual is a `plot` today (for example `atom-cloud`, `orbital`) move to 3D scenes from section 6 (the hydrogen radial curve becomes the orbital isosurface with its radial node shells; the plot stays as a small panel beside it).
- `OrbitalScene`, `EncutScene`, `KmeshScene` ported to layers.
**Tasks**: 1. `Scene.tsx` as a wrapper of `Stage`. 2. `GuidedPath.tsx` on one `Stage`. 3. Plot stations moved to 3D scenes. 4. Port the three remaining scenes. 5. Learn e2e, axe, size.
**Tests and reference values**: the existing learn e2e (keyboard through all stations, one WebGL context at a time, no-WebGL SVG stations) plus the section 1 check on three stations.
**Done when**:
- [ ] Every station is live 3D on a WebGL machine and passes section 1; budgets hold.
**Not in this stage**: new stations.

## M16.5 Modules 0 to 3 in 3D (Tier B)

**Goal**: The quantum basics and many-electron modules are understood by handling them: orbitals, boxes, two-electron surfaces, densities.
**Depends on**: M16.2, M16.3
**Size**: L
**Budget**: 90 min; split by module if needed (0 and 1, then 2, then 3).
**Deliverables**: the rows of section 6 for modules 0, 1, 2 and 3 (16 topics). The 3D particle in a box extends `physics/box.ts` with a golden test; the two-electron surfaces reuse `solver1d.ts` golden data.
**Tasks**: 1. Any new library or dataset first, with its tests. 2. The stage rows of section 6, topic by topic. 3. State markers and `<Show>` links in the text. 4. The module e2e, axe, size and one Lighthouse run.
**Tests and reference values**: box energies for (1,1,1), (2,1,1), (2,2,1) in a cube equal the analytic values within 1e-12; orbital isosurface of 1s at a set isovalue has the analytic radius within one grid step.
**Done when**: [ ] all 16 topics pass section 1 and the content-stage checks.
**Not in this stage**: rewriting the topics' text.

## M16.6 Module 4 in 3D: Kohn-Sham and the SCF loop (Tier A)

**Goal**: The Kohn-Sham idea and the SCF loop are seen and stepped through, including how it fails.
**Depends on**: M16.2, M16.3
**Size**: M
**Budget**: 60 min.
**Deliverables**: the module 4 rows (5 topics); a 2D grid toy solver for the Hohenberg-Kohn scene (`physics/solver2d.ts`, pure) with a golden reference from `scripts/reference/`; the SCF waterfall and loop ring on `scf1d.ts`.
**Tasks**: 1. `solver2d.ts` and its golden generator. 2. The Hohenberg-Kohn and Kohn-Sham scenes. 3. The SCF loop ring and waterfall. 4. The module e2e, axe, size and one Lighthouse run.
**Tests and reference values**: `solver2d` lowest energies of a 2D harmonic well match the analytic values within the grid error stated in the test; the SCF scene's iteration count equals `scf1d_reference.json`.
**Done when**: [ ] 5 topics pass section 1.
**Not in this stage**: rewriting the topics' text beyond state markers, captions and `<Show>` links; topics of other modules.

## M16.7 Module 5 in 3D: electronic choices (Tier B)

**Goal**: ENCUT, k-points, PAW, functionals, smearing, DFT+U and vdW are each a control on a picture.
**Depends on**: M16.2, M16.3
**Size**: L
**Budget**: 90 min.
**Deliverables**: the rows for plane waves, k-points, PAW, functionals, smearing, DFT+U, vdW (7 topics). For vdW, register the dispersion source before building; if none can be verified, ship the scene as `illustrative` without numbers and add a Q.
**Tasks**: 1. Any new library or dataset first, with its tests. 2. The stage rows of section 6, topic by topic. 3. State markers and `<Show>` links in the text. 4. The module e2e, axe, size and one Lighthouse run.
**Tests and reference values**: plane-wave counts equal `planewaves.ts` golden counts at each ENCUT; irreducible k-point counts equal the spglib golden counts; plus the content-stage checks above.
**Done when**: [ ] 7 topics pass section 1.
**Not in this stage**: rewriting the topics' text beyond state markers, captions and `<Show>` links; topics of other modules.

## M16.8 Module 5 in 3D: spin and magnetism (Tier B)

**Goal**: The six magnetism topics show spins as free 3D arrows on real orderings.
**Depends on**: M16.2, M16.3
**Size**: M
**Budget**: 60 min.
**Deliverables**: the rows for spin and magnetism, spin-polarized, orderings, ground state, reading output, non-collinear (6 topics); the audit's fourth question on the four thin magnetism pages, each with a visual (M12.3), since this stage touches them.
**Tasks**: 1. Any new library or dataset first, with its tests. 2. The stage rows of section 6, topic by topic. 3. State markers and `<Show>` links in the text. 4. The module e2e, axe, size and one Lighthouse run.
**Tests and reference values**: the spin signs of FM, A, C and G on the common supercell equal `magnetic_reference.json`; plus the content-stage checks above.
**Done when**: [ ] 6 topics pass section 1.
**Not in this stage**: rewriting the topics' text beyond state markers, captions and `<Show>` links; topics of other modules.

## M16.9 Modules 6 to 8 in 3D: files, running and convergence (Tier B)

**Goal**: Files are seen as the structures and choices they encode; convergence is a surface you walk on.
**Depends on**: M16.2, M16.3
**Size**: L
**Budget**: 90 min; split 6 and 7, then 8.
**Deliverables**: the rows for modules 6, 7 and 8 (16 topics) and the parallelisation extension; the KPAR and NCORE mapping as a pure tested function.
**Tasks**: 1. Any new library or dataset first, with its tests. 2. The stage rows of section 6, topic by topic. 3. State markers and `<Show>` links in the text. 4. The module e2e, axe, size and one Lighthouse run.
**Tests and reference values**: the KPAR and NCORE mapping gives the core split stated by the tag data for a fixed set of cases written in the test; plus the content-stage checks above.
**Done when**: [ ] 16 topics pass section 1.
**Not in this stage**: rewriting the topics' text beyond state markers, captions and `<Show>` links; topics of other modules.

## M16.10 Module 9 in 3D: bands, DOS, charge density, forces, relaxation (Tier A)

**Goal**: The thinnest module becomes the most visual: band surfaces, linked DOS, isosurfaces and slices, force arrows, relaxation trajectories, each with an example dataset so there is something to explore before the reader has a run.
**Depends on**: M16.2, M16.3
**Size**: L
**Budget**: 90 min; second session likely.
**Sources**: S-019, S-030, S-043, and those of the tight-binding model
**Deliverables**: the module 9 rows (5 topics); a 3D tight-binding band library for sc, bcc and fcc s bands (`physics/tightbinding3d.ts`, golden vs the analytic dispersions); example datasets with generators; band cursor linking path, zone and surface.
**Tasks**: 1. `tightbinding3d.ts` with golden tests. 2. Example datasets and generators. 3. Band, DOS, density, force and relaxation stages. 4. The module e2e, axe, size and one Lighthouse run.
**Tests and reference values**: fcc s-band E(k) at Gamma, X, L equals the analytic nearest-neighbour values within 1e-12; band width equals the analytic width.
**Done when**: [ ] 5 topics pass section 1; every viewer has example data with an honest badge.
**Not in this stage**: the text depth the audit asks for (a separate content stage may follow); this stage adds only what the stage needs.

## M16.11 Module 12 in 3D: properties (Tier A)

**Goal**: Strains, vibrations, tensors and basins are handled, not read.
**Depends on**: M16.2, M16.3
**Size**: L
**Budget**: 90 min.
**Deliverables**: the module 12 rows (7 topics); a ball-and-spring phonon library (`physics/phonon_model.ts`: monatomic and diatomic chains, fcc nearest neighbour) with golden analytic dispersions; directional Young's modulus surface from `mechanics/elastic.ts`.
**Tasks**: 1. `phonon_model.ts` with golden tests. 2. Directional modulus surface. 3. The seven stages. 4. The module e2e, axe, size and one Lighthouse run.
**Tests and reference values**: chain dispersions equal the analytic formulas within 1e-12; the directional modulus of an isotropic tensor is constant within 1e-9 and matches `elastic_reference.json` for the golden tensors.
**Done when**: [ ] 7 topics pass section 1.
**Not in this stage**: rewriting the topics' text beyond state markers, captions and `<Show>` links; topics of other modules.

## M16.12 Modules 10 and 11 in 3D: worked example and tools (Tier B)

**Goal**: The worked example shows its real system and inputs in 3D now, and the tool pages become live walkthroughs.
**Depends on**: M16.2, M16.3, M16.10
**Size**: M
**Budget**: 60 min.
**Deliverables**: the module 10 and 11 rows (10 topics); module 10 states that need results show an "awaiting results" state with no numbers (D-101); the tool walkthroughs hand off to the tools.
**Tasks**: 1. Any new library or dataset first, with its tests. 2. The stage rows of section 6, topic by topic. 3. State markers and `<Show>` links in the text. 4. The module e2e, axe, size and one Lighthouse run.
**Tests and reference values**: the tolerance factor shown for each lanthanide equals the M8 library value; a module 10 state without author results shows no number (asserted in e2e); plus the content-stage checks above.
**Done when**: [ ] 10 topics pass section 1; no invented result appears.
**Not in this stage**: author results that have not been supplied (D-101); changes to the tools themselves.

## M16.13 New topics with 3D, part 1: symmetry, relaxation, surfaces, defects (Tier A)

**Goal**: Four subjects the handbook lacks are written as 3D-first topics.
**Depends on**: M16.2, M16.3
**Size**: L
**Budget**: 90 min; two sessions expected (symmetry and relaxation, then surfaces and defects).
**Deliverables**: four new topics with full anatomy (CONTENT_GUIDE section 3), questions with visuals, glossary terms, sources, and their stages from section 6; the module 8 pointer to the relaxation topic fixed.
**Tasks**: 1. Write each topic (anatomy, questions, glossary, sources). 2. Its stage from section 6. 3. Fix the module 8 pointer. 4. Content linter, e2e, axe, size.
**Tests and reference values**: space groups and symmetry operation counts of the golden structures equal moyo's; slab layer counts and terminations equal `structure_tools_reference.json`; defect formation energy formula checked against its source's worked example; plus the content-stage checks above.
**Done when**: [ ] 4 topics pass section 1, the content linter and the science gate (G3).
**Not in this stage**: the part 2 topics (M16.14); charged-defect finite-size corrections beyond what the source states.

## M16.14 New topics with 3D, part 2: hull, NEB, MD, COHP, beyond DFT (Tier A)

**Goal**: The remaining missing subjects, each with its model library and stage.
**Depends on**: M16.2, M16.3, M16.13
**Size**: L
**Budget**: 90 min; two sessions expected.
**Deliverables**: topics and stages for the convex hull (hull library, golden vs pymatgen), NEB (pure NEB library on an analytic landscape, golden), MD and MLFF (Lennard-Jones toy MD in a worker, golden energy conservation), and the short COHP and beyond-DFT pages.
**Tasks**: 1. Hull, NEB and MD libraries with golden tests. 2. Write each topic. 3. Its stage from section 6. 4. Content linter, e2e, axe, size.
**Tests and reference values**: hull vertices for the golden ternary set equal pymatgen's; NEB saddle of the analytic landscape within 1e-6 of the reference; MD total energy drift below the stated tolerance at the stated time step.
**Done when**: [ ] each topic passes section 1 and G3.
**Not in this stage**: a real MLFF training run; Wannier functions and topology (later).

## M16.15 Coverage, performance and accessibility audit (Tier B)

**Goal**: Prove the handbook is 3D everywhere and still fast and accessible.
**Depends on**: M16.4 to M16.14
**Size**: M
**Budget**: 60 min.
**Deliverables**: `check-3d-stages.mjs` switched to failing; a coverage table in the report (every topic, its stage, badge, states, controls); Lighthouse on one topic per module; axe on every topic in both themes; a timing table (boot time, TBT, frame time on the heaviest state per module).
**Tasks**: 1. Switch the 3D stage guard to failing. 2. Coverage table. 3. Lighthouse, axe and timing runs. 4. Fix what fails or record it with a Q.
**Tests and reference values**: the full e2e suite, the guard on every topic, Lighthouse median of three on one topic per module, axe in both themes.
**Done when**:
- [ ] Every topic has a live stage that passes section 1; budgets and the 0.95 floor hold; axe clean.
**Not in this stage**: new scenes or topics.

## 8. Not in M16

Rewriting topic text beyond what the stages need (the audit's content fixes can run as their own stages); moving the builder's `vesta.js` onto the engine (optional later stage); VR or AR; any server-side rendering of scenes.
