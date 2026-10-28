# M2 Modules 1 to 3 with labs

Content stages follow `docs/CONTENT_GUIDE.md`. Questions for "Check your understanding" are authored now as data in `src/data/questions/module-NN.json` using the fields listed in CONTENT_GUIDE section 7 (stage M6.1 formalizes and validates the schema; keep the shape simple so migration is mechanical). Any claim without a source in the register gets either a new register entry (honest status) or an entry in `docs/OPEN_QUESTIONS.md`, never silence.

## M2.1 Lab framework

**Goal**: A reusable frame for interactive labs: lazy 3D, WebGL detection with fallback, reduced-motion handling, honest badges, and a lifecycle that never leaks GPU memory.
**Depends on**: M1.3
**Size**: M
**Deliverables**:
- Add `three@0.186.1` and `@types/three@0.186.0`.
- `src/components/labs/LabShell.tsx`: title, one-sentence goal, controls area, view area, readouts, "What to notice" box, reset button, a visually available text description (also `aria-describedby` for the view), badge (`illustrative` | `toy-model` | `computed`), error and loading states.
- `src/lib/three/SceneController.ts` (the one base class from D-007): constructor takes a container; `start()`, `stop()`, `dispose()`, `resize()`, `setDprCap(2)`, render-on-demand (renders on change, not a permanent loop, unless an animation is active), pauses when `document.hidden` or off-screen (IntersectionObserver), honors `prefers-reduced-motion` (animations become step-by-step), disposes geometries, materials, textures and the renderer. Helpers: instanced spheres, line segments, text labels as HTML overlays positioned by projection (accessible, selectable), simple lights.
- Orbit-style camera control with touch support (use `three/examples/jsm/controls/OrbitControls.js`), damping off when reduced motion is set.
- `src/lib/three/capabilities.ts`: `hasWebGL()` (try `webgl2` then `webgl`, never throws) and the pure function `shouldStart3D({ webgl, reducedMotion, visible, userRequested })`.
- `src/components/labs/Lazy3D.tsx`: shows a poster card with a "Start 3D view" button; on click (or when visible and idle if `autoStart` is set and motion is allowed) dynamically imports the controller module; shows the 2D fallback component when WebGL is unavailable or the import fails.
- `src/components/labs/Fallback2D.tsx`: SVG/Canvas2D static projection with rotation sliders (azimuth and elevation) usable by simple scenes.
- `src/pages/design/lab-demo.astro` (`noindex`): a demo lab (rotating cluster of instanced spheres and a unit-cell wireframe, no science) proving start, fallback, dispose and reduced motion.
- Budgets: add a `lazy.three` entry (measured gzip of the three chunk) to `budgets.json`.
**Tasks**:
1. Add the packages; build `capabilities.ts` and its tests first.
2. Implement `SceneController` and verify disposal: after `dispose()` there are no listeners left (count them in a test through a spy on `addEventListener`/`removeEventListener` on a fake container) and `renderer.dispose()` was called.
3. Build the shell, lazy wrapper and fallback; wire the demo.
4. e2e (Playwright, WebGL available in the cloud Chromium): Start button creates a canvas; navigating away and back leaves a single canvas; with an init script that makes `getContext('webgl')` and `getContext('webgl2')` return `null`, the fallback appears and sliders work; with `reducedMotion: 'reduce'` no continuous animation frame loop runs (assert via `requestAnimationFrame` call count after idle); keyboard: Start button and sliders reachable.
5. Measure the three chunk size and the page's initial JS (must not include three).
**Tests and reference values**:
- `shouldStart3D` truth table; `hasWebGL` with a fake `document`; SceneController lifecycle with a mocked renderer (inject a factory so tests need no GPU).
- No science.
**Done when**:
- [ ] Demo works with WebGL, without WebGL, and with reduced motion.
- [ ] Initial page JS excludes three; the lazy chunk size is recorded in `budgets.json` and the report.
- [ ] Axe zero violations on the demo page including the poster state and the running state.
- [ ] Memory: opening and closing the view 20 times does not increase the count of `WebGLRenderer` instances alive (test with a counter in the injected factory).
**Not in this stage**: any physics, any handbook text.

## M2.2 Module 1: Why DFT exists

**Goal**: Module 1 is written, with one honest interactive lab, questions, glossary terms and sources.
**Depends on**: M1.3
**Size**: M
**Deliverables**:
- Topics in `src/content/handbook/01-why-dft/`, each with the full nine-part anatomy: `why-simulate-materials`, `the-ladder-of-methods`, `what-dft-can-and-cannot-tell-you`, `your-roadmap-to-a-first-vasp-project` (links to the other modules, previews the Screening Studio and tools, honest about effort).
- Lab `cost-of-exactness` (React island, badge `illustrative`): log-log plot of how the cost of different method families grows with system size, with a size slider and a method toggle. Use the formal scaling exponents only if each has a source in the register (for example from S-048 and S-049); otherwise mark the curve "qualitative" and open a Q. Do not draw numbers on the axes that imply real timings.
- 3 to 6 questions per topic in `src/data/questions/module-01.json`.
- Glossary entries for every new term (at least: simulation, atom, electron, nucleus, quantum mechanics, wavefunction, approximation, DFT, functional, basis set, supercell, property, ground state).
**Tasks**:
1. Outline each topic against the nine sections; write the beginner text first, then add `Level` blocks for intermediate and pro.
2. Make the story concrete: the author's own struggle is a legitimate "why this site exists" paragraph on the roadmap page (ask the author to review wording in the report; keep it factual).
3. For every factual claim in the Pro blocks (history, accuracy statements, "DFT is the most used method") either cite a register source or rephrase to something you can source; list unsourced ones in the report.
4. Write the lab and its text description; check it at 360 px.
5. Run `npm run lint:content`, fix. Read each page aloud once as a beginner would; remove jargon that is not defined.
**Tests and reference values**:
- Lab data function (cost curves) as a pure function in `src/lib/physics/scaling.ts` with tests that check monotonicity, correct exponents for the chosen formal scalings and that no function returns NaN for the slider range.
- Content lint. No numeric science claims beyond the formal exponents.
**Done when**:
- [ ] Four topics, nine sections each, all levels present, lint clean, glossary terms resolve.
- [ ] Every statement a reader could mistake for a fact has a source or is flagged as opinion/story.
- [ ] Lab labeled "Illustrative", keyboard operable, text description present.
- [ ] axe clean; Lighthouse >= 95 mobile on one topic page (record).
**Not in this stage**: modules 2 and 3.

## M2.3 Module 2: Quantum basics without math (with labs)

**Goal**: A beginner understands waves, wavefunctions, quantization, orbitals and spin well enough for the rest of the course, with two correct labs.
**Depends on**: M2.1, M2.2
**Size**: L
**Sources**: S-047, S-031
**Deliverables**:
- Topics in `src/content/handbook/02-quantum-basics/`: `particles-and-waves`, `the-wavefunction`, `particle-in-a-box` (lab 1), `orbitals` (lab 2), `spin-and-the-pauli-principle`, `why-energy-levels-matter-for-materials` (bridges to bands and DOS in a single paragraph; links forward).
- `src/lib/physics/constants.ts`: `HBAR2_OVER_2M_EV_A2 = 3.80998...` computed from CODATA (`@source S-031`), Rydberg energy in eV, Bohr radius in Angstrom; each with its source and a test.
- `src/lib/physics/box.ts`: energy `E_n = n^2 pi^2 (hbar^2/2m) / L^2` in eV for L in Angstrom, wavefunction `sqrt(2/L) sin(n pi x / L)`, superposition probability density and its beating period `T = h / (E_2 - E_1)` reported in femtoseconds.
- `src/lib/physics/hydrogen.ts`: radial functions `R_nl(r)` for n up to 4 via associated Laguerre polynomials, real spherical harmonics for l up to 3, orbital density sampling with a seeded PRNG (rejection or inverse CDF on r, rejection on angle) producing point clouds, radial node counts, expectation values.
- Lab 1 `particle-in-a-box` (2D SVG/Canvas, no 3D needed): sliders for box length (0.5 to 10 Angstrom) and state n (1 to 6) plus a superposition mix; readouts of E_n in eV and the node count; badge `computed` (closed-form exact, not a simulation) and a note that it is a model of one electron in a 1D box.
- Lab 2 `orbitals` (3D point cloud via the M2.1 framework, instanced points, 2D fallback shows radial probability curve only): choose n, l, m (real orbital label like 2p_z, 3d_xy); toggles for nodes highlight; readouts: energy (-13.6057/n^2 eV), most probable radius from the sampled distribution, radial node count. Badge `computed`; label that real atoms have many electrons and these are one-electron hydrogenic orbitals.
- Questions (at least 4 per concept) in `module-02.json`; glossary additions (wave, frequency, amplitude, quantization, boundary condition, node, orbital, quantum number, s/p/d/f, spin, Pauli exclusion principle, degenerate).
**Tasks**:
1. Constants and `box.ts` with tests first.
2. `hydrogen.ts` with tests (below). Radial normalization uses Simpson on a fine non-uniform grid; do not tune tolerances to make tests pass without understanding why.
3. Sampling: in a Web Worker for 20k to 50k points; main thread stays responsive (test: drag a slider while sampling).
4. Build labs, then write the six topics. In "In VASP" for this module say only what is true and short (plane waves and orbitals come later; one sentence: VASP does not use hydrogen orbitals, it uses plane waves, explained in module 5).
5. Content lint, axe, Lighthouse for a lab page; record.
**Tests and reference values** (all expected values below are exact results or from `tests/reference/pw_kmesh_reference.json` `_meta`; do not copy numbers from running your own code):
- hbar^2/2m = 3.80998 eV Angstrom^2 (tolerance 1e-4 relative; golden `_meta.hbar2_over_2m_eV_A2_from_scipy_constants`).
- Box: E_1(L = 1 Angstrom) = 37.603 eV, E_1(L = 5) = 1.5041 eV, E_1(L = 10) = 0.37603 eV; E_n = n^2 E_1; E_2 - E_1 (L = 5) = 4.5124 eV. Normalization of psi_n integrates to 1 (numeric, 1e-9); psi_n, psi_m orthogonal for n != m (1e-9); number of interior nodes = n - 1.
- Hydrogen: E_n = -13.6057/n^2 eV (n = 1, 2, 3: -13.6057, -3.40142, -1.51174; tolerance 1e-4 eV); radial normalization `integral R_nl^2 r^2 dr = 1` for (1,0), (2,0), (2,1), (3,0), (3,1), (3,2), (4,3) within 1e-8; `integral R_10 R_20 r^2 dr = 0`; `<r> = (a0/2)(3 n^2 - l(l+1))` (1s: 1.5 a0, 2p: 5 a0, 3d: 10.5 a0) within 1e-8; radial nodes n - l - 1; most probable radius of 1s equals a0; real spherical harmonics: `integral |Y|^2 dOmega = 1` and orthogonality over a Lebedev or tensor-product quadrature within 1e-10.
- Sampling: with a fixed seed and 200k samples the mean of r for 1s is within 1% of 1.5 a0 (statistical test with a margin, deterministic by seed).
**Done when**:
- [ ] Six topics complete; both labs work on touch devices; fallbacks tested.
- [ ] All reference tests above pass and none was loosened below the stated tolerances.
- [ ] Worker keeps UI responsive (documented measurement).
- [ ] Labs labeled correctly; the "one electron only" caveat is visible.
**Not in this stage**: many-electron physics, density functional ideas.

## M2.4 Module 3: The many-electron problem and why density helps (with labs)

**Goal**: A beginner sees why exact quantum mechanics is hopeless for solids and why working with the electron density is the way out, via two real computed labs.
**Depends on**: M2.3
**Size**: L
**Sources**: S-047, S-048, S-011
**Deliverables**:
- Topics in `src/content/handbook/03-many-electrons/`: `the-many-electron-problem`, `the-exponential-wall` (lab 1), `electron-density` (lab 2), `from-wavefunction-to-density` (the idea behind Hohenberg-Kohn stated in words, with the formal theorem deferred to module 4), `what-we-still-have-to-approximate` (sets up exchange and correlation).
- `src/lib/physics/combinatorics.ts`: `binomial(n, k)` with `BigInt`, number of Slater determinants for N electrons in M spin orbitals, memory in bytes for double precision, human-readable formatting (powers of ten, comparisons to well-known memory sizes such as "more than all the RAM on Earth" only if the arithmetic is shown).
- `src/lib/physics/solver1d.ts`: finite-difference solver for `-(hbar^2/2m) psi'' + V psi = E psi` on a uniform grid with Dirichlet boundaries; symmetric tridiagonal eigenvalues and eigenvectors by implicit QL (or Sturm bisection plus inverse iteration), no dependencies; returns lowest k states; density `n(x) = sum_i f_i |psi_i|^2` for given occupations; works for up to 2000 grid points quickly (document timing; the oscillator test uses 1200).
- `src/lib/physics/density1d.ts`: for one electron, the exact inverse problem: from a smooth positive density `n(x)` compute `psi = sqrt(n)` and `V(x) = E + (hbar^2/2m) psi''/psi` up to a constant, via finite differences; round trip check.
- Lab 1 `exponential-wall`: sliders for electrons N (1 to 60) and orbitals per electron; plots the number of determinants (log scale) and the bytes needed; badge `computed` (exact counting). Message: even the best computer cannot store the wavefunction beyond small N.
- Lab 2 `density-as-a-map`: the user picks or draws a smooth 1D density (preset shapes plus a few draggable control points with keyboard alternative) for one electron; the lab computes the potential that produces it exactly, then solves the Schrodinger equation for that potential and overlays the resulting density on the target. Shows "one density, one potential (up to a constant)" for one electron: the Hohenberg-Kohn idea made concrete. Badge `toy-model` (1D, one electron). Include a second panel with N non-interacting electrons in a chosen well (harmonic or box) showing the density as the sum over occupied orbitals.
- Questions in `module-03.json` (at least 4 per concept); glossary additions (Hilbert space, Slater determinant, many-body, correlation, electron density, external potential, ground state density, functional).
**Tasks**:
1. Combinatorics and its tests; solver1d and its tests; inverse density and its tests.
2. Performance check of the solver in a worker for 2000 points; keep the main thread free.
3. Labs, then topics. Stay honest: the exponential wall statement is about exact diagonalization or full configuration interaction; cite S-048 for context and do not claim more than it supports.
4. Questions, glossary, lint, axe, Lighthouse record.
**Tests and reference values**:
- `binomial(10,5) = 252`, `binomial(20,10) = 184756`, `binomial(40,20) = 137846528820`; memory for C(40,20) doubles = 8 x that = 1102772230560 bytes (about 1.1 terabytes); `binomial(n,0)=1`, symmetry `C(n,k)=C(n,n-k)`, Pascal identity; BigInt exactness for `binomial(100,50) = 100891344545564193334812497256`.
- Solver, infinite well of width L with N interior points (h = L/(N+1)): the finite-difference eigenvalues are known exactly, `E_k = (4 (hbar^2/2m) / h^2) sin^2(k pi h / (2L))`; the solver must match that to 1e-10 relative (this tests the eigen-solver itself). Against the continuum value `k^2 pi^2 (hbar^2/2m) / L^2` the relative error for k = 5 is 1.28e-4 at N = 400 and 3.2e-5 at N = 800 (planning computation), so assert below 2e-4 at N = 400, below 5e-5 at N = 800, and a ratio of about 4 between them (second-order convergence).
- Solver, harmonic oscillator `V = k x^2/2`: `E_n = (n + 1/2) sqrt(2 (hbar^2/2m) k)`; for k = 10 eV/A^2 the spacing is 8.7292 eV. On x in [-6, 6] Angstrom with 1200 interior points (h about 0.01 Angstrom) the maximum relative error for n <= 4 is about 3.3e-5 (planning computation); assert below 1e-4.
- Density: integrates to N (1e-10); equals the sum of squared orbitals; inverse problem round trip: for `n(x) proportional to exp(-x^2/sigma^2)` the recovered potential is a parabola whose curvature `V''` equals `2 (hbar^2/2m) / sigma^4` within 1e-3 relative for |x| < 4 sigma (planning check on [-6, 6] Angstrom, 1200 points, sigma = 1 Angstrom: 2e-4); the forward solve with the same finite-difference operator reproduces the density within 1e-8 relative L2 error (the discrete inverse is exact; planning check gave 1e-13).
- Eigenvector normalization and orthogonality (1e-10).
**Done when**:
- [ ] Five topics, labs working with keyboard and touch, text descriptions present.
- [ ] All tests above pass with the stated tolerances.
- [ ] Module 3 questions and glossary complete; lint clean.
- [ ] The report lists every claim in the content with its source or marks it as opinion.
**Not in this stage**: Kohn-Sham equations, exchange-correlation, SCF (module 4, M7.1).
