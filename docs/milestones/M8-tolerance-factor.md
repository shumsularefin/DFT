# M8 Perovskite Tolerance Factor Explorer

Golden data: `tests/reference/perovskite_reference.json` (anchors, 16 compounds with t, mu, tau, RCuO3 sweeps under three A-site coordination policies, Ln3+ coverage). Known limits: tau is from memory until Q-003 closes; Shannon completeness and licence are Q-002; region boundaries Q-005; mixed-site convention Q-016; oxidation-state data Q-012; rare-earth CN policy D-028.

## M8.1 Shannon radii dataset and lookup

**Goal**: A compact, versioned, cited Shannon radii dataset with a lookup API that never silently substitutes a value.
**Depends on**: M0.2
**Size**: M
**Sources**: S-001, S-034
**Deliverables**:
- `scripts/data/build_shannon.py` (Python, pinned pymatgen as in `scripts/reference/requirements.txt`): exports every entry of pymatgen's Shannon table to `src/data/shannon-radii.json` (about 25 KB; imported only by the pages that need it) with `_meta` (source S-001 via pymatgen version, generation date, entry count 492, element count 94, licence status pointing to Q-002).
- Entry schema: `{ el, ox, cn, geometry: null | 'SQ' | 'PY', spin: null | 'HS' | 'LS', ionic, crystal }`. Map pymatgen's coordination keys to integers (`I` 1 ... `XIV` 14) and keep the suffixes `SQ` (square planar, for example Cu2+ `IVSQ`) and `PY` (pyramidal, `IIIPY`, `IVPY`) in `geometry`; map spin labels `High Spin`/`Low Spin`/empty to `HS`/`LS`/null.
- `src/lib/perovskite/shannon.ts`: `getRadius({ el, ox, cn, spin?, geometry?, kind: 'ionic' | 'crystal' })` returning `{ ok: true, value, entry }` or `{ ok: false, reason, available: Entry[] }` (never a nearest-neighbour guess); helpers `oxidationStates(el)`, `coordinations(el, ox)`, `spins(el, ox, cn)`; a spin is required when the table distinguishes HS and LS for that ion and coordination, otherwise the result explains the choice.
- `docs/reports/M8.1.md` section "Completeness": compare entry counts per element with the original table if the builder can read it (needs network, Q-007) or list the comparison as not done.
**Tasks**: 1. Write `build_shannon.py` and generate the dataset. 2. Lookup functions that return reasons instead of guesses. 3. Tests against the anchors and the coverage table. 4. Completeness section in the report and the Q-002 update.
**Tests and reference values**:
- Every anchor in `perovskite_reference.json` (`anchor_radii`, 34 entries, ionic and crystal) is returned exactly.
- `ln3plus_shannon_cn_coverage` equals the coordinations the lookup reports for each Ln3+ and Y3+ (CN 12 only for La, Ce, Nd, Sm).
- Unknown combinations (for example Cu3+ CN 12) return `ok: false` with the available list; Fe3+ CN 6 without spin returns `ok: false` with reason "spin required" and both options.
- Totals: 492 entries, 94 elements (read from `_meta`, not typed in the test).
**Done when**:
- [ ] Dataset generated reproducibly; lookup never guesses; Q-002 updated with what was or was not checked.
**Not in this stage**: formulas, UI.

## M8.2 Factors, checks and mixed sites

**Goal**: Correct, explained tolerance factors with honest checks and warnings.
**Depends on**: M8.1
**Size**: M
**Sources**: S-001, S-002, S-003, S-022, S-034, S-051
**Deliverables**:
- `src/lib/perovskite/factors.ts`: `goldschmidt(rA, rB, rX) = (rA + rX) / (sqrt(2) (rB + rX))`; `octahedral(rB, rX) = rB / rX`; `bartelTau(rA, rB, rX, nA) = rX/rB - nA (nA - (rA/rB) / ln(rA/rB))` with the threshold 4.18, returning `{ value, predictsPerovskite, confirmed: false }` until Q-003 is closed (the flag drives a visible "formula not yet confirmed against the paper" note); `tau` is undefined when `rA = rB` (ln 1 = 0): return no number and say why. When `rA < rB` the formula still evaluates, but A is by convention the larger cation in ABX3 perovskites, so show a warning that the site assignment looks swapped and offer to swap A and B; do not silently swap.
- `src/lib/perovskite/sites.ts`: mixed sites `A1-x A'x` and `B1-y B'y`: occupancy-weighted ionic radius and oxidation state (Q-016 convention, labelled), occupancy sums must equal 1, each occupant has its own CN and spin.
- `src/lib/chem/oxidation.ts` and `src/data/oxidation-states.json`: oxidation-state frequencies from SMACT's ICSD 2024 counts (S-051), built by `scripts/data/build_oxidation.py` with the method of `scripts/reference/gen_element_reference.py` for all elements. Classification (record as a convention, D-nnn): share among non-zero states >= 0.10 is `common`, any count above zero is `known-rare`, no count is `not-observed`. Do **not** use pymatgen's `Common oxidation states` field for this: it lists only +2 for Cu, which would wrongly flag Cu(I).
- `src/lib/perovskite/checks.ts`: charge balance for ABX3 (`nA + nB + 3 nX = 0`, with mixed-site averages), uncommon oxidation states, missing Shannon entries, coordination policy notes, heuristic ranges with sources: octahedral factor between `sqrt(2) - 1 = 0.414` (octahedral stability limit from the radius-ratio rule, S-022) and `sqrt(3) - 1 = 0.732`; Goldschmidt t "typically about 0.8 to 1.0 for perovskites, near 1 for cubic, below for tilted structures, above about 1 favours hexagonal stacking" stated as a rule of thumb (Q-005 until a formability-window paper is read); all results carry `heuristic: true`.
**Tasks**: 1. `factors.ts` with the golden comparisons first. 2. Mixed sites. 3. `build_oxidation.py` and the classification with tests. 4. Checks and warnings with their sources and heuristic flags. 5. Record the conventions as D entries; update Q-003, Q-012 and Q-016.
**Tests and reference values** (`perovskite_reference.json`; read values from the file):
- For all 16 compounds: t, mu and tau within 1e-6, `tau_predicts_perovskite` equal, `charge_balance_sum` 0.
- RCuO3 sweeps: for each policy, every row's t, mu, tau within 1e-6, and `null` rows (CN 12 missing) produce `ok: false` with the reason, never a number.
- Mixed site: Sr0.5Ba0.5TiO3 equals the factors computed from the averaged radius (1.44 + 1.61)/2 = 1.525 Angstrom with nA = 2 (hand-computed expectation in the test comment).
- Oxidation classification from `tests/reference/element_reference.json`: Cu +2 (share 0.564) and +1 (0.406) `common`, Cu +3 (0.030) `known-rare`; Fe +3 and +2 `common`, Fe +4 `known-rare`; read the shares from the file.
**Done when**:
- [ ] Every number in the tool is traceable to the dataset entry and formula; the tau flag is visible until Q-003 closes.
**Not in this stage**: UI.

## M8.3 Explorer UI and the shared periodic table

**Goal**: The tool page `/tools/tolerance-factor/`: pick ions, see radii with their source entries, the three factors with explanations, checks and warnings.
**Depends on**: M8.2, M1.3
**Size**: M
**Deliverables**:
- `src/components/ui/PeriodicTable.tsx` (shared with M9 and M10): responsive grid (18 columns on wide screens, a compact scrollable list plus search at 360 px), keyboard navigation (arrow keys move by position, Enter selects, type-to-search), each cell labelled with name, symbol and Z for screen readers, highlighting and disabled states from props, colour plus text for categories.
- Page: three site panels (A, B, X), each with element picker, oxidation state, coordination (defaults A 12, B 6, X 6), spin when needed, and an "add second occupant" control for mixed sites; the exact radius used with its source line ("Shannon 1976, Cu3+, CN VI, low spin, ionic radius 0.54 Angstrom"); results cards for t, mu, tau with a plain-language explanation at the current level and the formula one click away; warnings list; A-site coordination policy selector visible whenever an Ln is chosen (D-028).
- Shareable URL fragment for the current composition; hand-off buttons (wired in M8.4).
- Honesty line under the results: "Tolerance factors are rules of thumb. They do not guarantee that a compound exists or is stable."
**Tasks**: 1. `PeriodicTable` component with keyboard and screen-reader tests. 2. Site panels wired to the M8.2 library. 3. Results cards and warnings. 4. URL fragment state. 5. e2e with the golden numbers, accessibility at 360 px.
**Tests and reference values**:
- e2e: build SrTiO3 and see t = 1.0016 (from the golden file); build NdCuO3 with Cu3+ LS and see the uncommon-oxidation warning and the CN policy selector; switch the policy to CN 9 and see t = 0.9342.
- Keyboard-only selection of all three ions; axe clean; 360 px usable.
**Done when**:
- [ ] Every displayed number matches the library; the periodic table is reusable and accessible.
**Not in this stage**: maps and sweeps.

## M8.4 Maps, family trend and hand-offs

**Goal**: Stability maps, the lanthanide family sweep, exports and hand-offs to the other tools.
**Depends on**: M8.3, M4.3
**Size**: M
**Sources**: S-001, S-002, S-003, S-022
**Deliverables**:
- t versus mu map (SVG, D3): the current composition as a point (and mixed-site interpolation as a line when x varies), region shading only for boundaries that have a source (the 0.414 and 0.732 octahedral lines, S-022; the t band as "rule of thumb" until Q-005 closes), axis labels with units.
- tau view: tau against rA/rB for nA = 1, 2, 3 at the current rX/rB, the 4.18 line, the composition as a point; the unconfirmed flag shown.
- Family trend: choose B and X, sweep A over La to Lu (plus Y) with the coordination policy selector; plot t, mu, tau versus element with missing points shown as gaps with a reason, never interpolated.
- Mixed-site sweep: x from 0 to 1 for A1-xA'x or B1-yB'y.
- Exports: CSV of the sweep, SVG and PNG of the plots; hand-off to the Material Builder (composition), Screening Studio (chemical system filter), Input Builder (via Builder later; for now a note).
- Embed: an MDX component for module 10.
**Tasks**: 1. Pure plot view-models with tests (axes, gaps, octahedral lines). 2. t-mu map, tau view, family sweep, mixed-site sweep. 3. Exports. 4. Hand-offs validated by the M3.1 validator. 5. MDX component, accessibility.
**Tests and reference values**:
- Sweep values equal `rcuo3_family_sweep` for all three policies, gaps exactly where the golden file has `null`.
- Map point coordinates equal the computed factors; the octahedral lines sit at 0.414 and 0.732 (computed as `sqrt(2) - 1` and `sqrt(3) - 1`).
**Done when**:
- [ ] Plots accessible (data tables beside them), exports work, hand-offs send valid payloads (M3.1 validator).
- [ ] Q-005 updated with what region boundaries were sourced.
**Not in this stage**: Builder and Studio internals.
