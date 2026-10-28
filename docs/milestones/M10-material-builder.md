# M10 Material Builder

A minimalist, ChemDraw-inspired editor with two modes, crystal and molecule. Its job is to stop absurd structures before they reach VASP, explain every concern, and offer one-click fixes. Everything it says about chemistry is heuristic and labelled so. Molecule mode uses RDKit JS for 2D layout and sanitization only; 3D clean-up is written here (D-004, verified: RDKit JS has no 3D embedding or force field).

Golden data: `tests/reference/element_reference.json` (Pauling electronegativity, Cordero covalent radii via ASE, vdW radii, ICSD 2024 oxidation-state shares from SMACT), `tests/reference/kpaths.json` and `tests/reference/cif/` (structures), `tests/reference/perovskite_reference.json` (tolerance factors).

## M10.1 Chemistry data and validity engine

**Goal**: A tested rule engine that judges a structure's chemical and geometric plausibility, with explanations and pure fix functions.
**Depends on**: M8.2, M5.1
**Size**: L
**Sources**: S-021, S-022, S-023, S-045, S-051, S-052, S-034
**Deliverables**:
- `scripts/data/build_elements.py` producing `src/data/elements.json` for all elements up to Z = 103 (symbol, name, Z, mass, period, group, block, category, Pauling electronegativity, vdW radius from pymatgen; covalent radius from Cordero via ASE 3.29.0; oxidation-state shares from SMACT's ICSD 2024 counts), `_meta` with sources and versions. Use the methods of `scripts/reference/gen_element_reference.py`.
- `src/lib/chem/validity.ts`: `check(structure, mode: 'crystal' | 'molecule') -> Issue[]` with `{ code, severity, title, why, atoms?, fix?: { label, apply(structure) -> structure } }`. Rule set (thresholds in one table, each a documented convention with `heuristic: true`):
  - B001 overlap: two atoms closer than 0.5 x the sum of covalent radii: **error**; fix "merge" when same element and within 0.1 Angstrom after wrapping, else "delete one" or "move apart".
  - B002 short contact: below 0.75 x the sum of covalent radii: warn.
  - B003 cell too dense: total covalent-sphere volume exceeds the cell volume: **error** (an impossible packing); fix: scale the cell.
  - B004 cell nearly degenerate: any cell angle below 20 degrees or above 160 degrees, or volume below 1 Angstrom^3 per atom: **error**.
  - B005 charge neutrality (SMACT-style, S-023): search oxidation-state assignments from states with a non-zero ICSD share for every element; require a neutral total and electronegativity ordering (every anion more electronegative than every cation); **error** if none exists, warn if only `known-rare` states make it work (name them), info with the most common assignment otherwise. Skip (with an info) for all-metal systems.
  - B006 Pauling's first rule (S-022): for ionic structures, the cation-anion radius ratio against the observed coordination number (limits 0.155, 0.225, 0.414, 0.732 from the radius-ratio geometry): warn when inconsistent.
  - B007 Pauling's second rule: electrostatic bond-strength sums at anions deviating from the anion valence by more than 25 %: warn.
  - B008 perovskite check: ABX3 detected by composition and site count reuses the M8 library; shows t and mu with the CN policy; info or warn.
  - B009 Hume-Rothery (S-045) for all-metal systems: radius mismatch above 15 % warn (the classic rule uses metallic radii, which `elements.json` does not contain; use the covalent radii as a stand-in and say so in the message, or add a cited metallic-radius table); Pauling electronegativity difference above 0.4 warn (record the threshold as a convention); different crystal structures of the pure elements: not checked (say so).
  - B010 periodic images: atoms outside [0, 1): info with fix "wrap"; two atoms of the same species within 0.1 Angstrom after wrapping: **error** with fix "merge duplicates".
  - B011 symmetry report from M5.1: info (space group, Wyckoff letters).
  - B012 molecule mode: valence and charge errors come from RDKit sanitization in M10.3; in crystal mode no valence rule.
- Errors block export unless the user explicitly overrides with a stated reason recorded in the exported file's comment line.
**Tasks**: 1. `build_elements.py` and `elements.json`, compared with `element_reference.json`. 2. The rule table as data, then each rule with its positive and negative test. 3. Fix functions as pure transforms with tests. 4. Override-with-reason flow for exports. 5. Record all thresholds as conventions (D entries).
**Tests and reference values**:
- Every rule has a positive and a negative test on hand-made structures: rock-salt NaCl (from `kpaths.json`) passes with no error; "Na2Cl" composition fails B005; two Na atoms 0.4 Angstrom apart fail B001 and the merge fix removes one; a cell with 30 atoms in 10 Angstrom^3 fails B003; a 10-degree cell angle fails B004; SrTiO3 passes and B008 reports t = 1.0016 (golden); NdCuO3 with Cu3+ triggers the `known-rare` warning in B005 (share 0.030 from `element_reference.json`).
- Covalent radii and electronegativities in `elements.json` equal `element_reference.json` for its 30 elements.
- Radius-ratio limits computed as `sqrt(3/2) - 1 = 0.225`, `sqrt(2) - 1 = 0.414`, `sqrt(3) - 1 = 0.732` and `2/sqrt(3) - 1 = 0.155` in the test (derivations in comments).
**Done when**:
- [ ] Every rule explains why in plain language and links to the relevant module; every fix is a pure function with a test.
**Not in this stage**: editors.

## M10.2 Crystal operations and exports

**Goal**: Clean-up and conversion operations for crystals, with undo and redo, and exporters.
**Depends on**: M10.1
**Size**: M
**Sources**: S-032, S-036
**Deliverables**:
- `src/lib/crystal/ops.ts`: `symmetrize` (moyo standardization and refinement back to the user's setting), `standardizePrimitive`, `standardizeConventional`, `wrap`, `mergeDuplicates(tol)`, `snapToWyckoff` (idealized positions from moyo's standardized cell mapped back with `std_linear` and the origin shift), `supercell(matrix)`, `setLattice`, `gentleRelax` (moves only atoms in B001/B002 contacts, soft pair repulsion, maximum step 0.05 Angstrom, at most 200 steps, never changes the cell; labelled "geometric clean-up, not a physical relaxation").
- `src/lib/history.ts`: undo/redo as an immutable command stack with a size cap.
- Exporters: POSCAR (M3.1 writer), CIF in P1 and with symmetry operations from moyo, extended XYZ (`Lattice="..." Properties=species:S:1:pos:R:3`), each round-tripping through the M5.1 and M3.1 parsers.
**Tasks**: 1. `history.ts` (undo/redo) with tests. 2. Operations one by one, each with a test and a change description. 3. `gentleRelax` with its safeguards. 4. Exporters and round-trip tests.
**Tests and reference values**:
- Perturb rock-salt NaCl by 0.01 Angstrom random displacements (seeded): `symmetrize` returns space group 225 and positions within 1e-6 of the ideal ones.
- `standardizePrimitive` of conventional fcc Cu gives one atom and the metric of the golden fcc primitive cell.
- Round trips: POSCAR, CIF (P1 and symmetrized) and XYZ preserve the structure to 1e-8 (CIF symmetrized: same expanded structure).
- Undo/redo: a sequence of 5 operations undone and redone returns identical states.
**Done when**:
- [ ] All operations tested; none changes the structure silently (each returns a description of what changed for the UI).
**Not in this stage**: UI.

## M10.3 Molecule engine (RDKit 2D, in-house 3D)

**Goal**: Molecules can be built as graphs, checked for valence, laid out in 2D, and given a rough 3D geometry, all in the browser.
**Depends on**: M10.1
**Size**: L
**Sources**: S-035, S-021, S-022
**Deliverables**:
- Add `@rdkit/rdkit@2026.9.1`, loaded lazily in a worker only when molecule mode opens; budget entry `lazy.rdkit` (2.4 MB gzipped wasm, measured in planning); service-worker runtime caching after first use.
- `src/lib/chem/molgraph.ts`: atoms (element, formal charge, explicit H count), bonds (order 1, 2, 3, aromatic), conversion to and from MOL blocks (RDKit `get_molblock`, `get_mol`) and SMILES; sanitization through RDKit (`is_valid`, error message surfaced as an issue B012 with the offending atom); 2D coordinates via `set_new_coords(true)` (CoordGen) with fallback to `set_new_coords()`; SVG depiction via `get_svg`.
- `src/lib/chem/geom3d.ts` (no RDKit): initial 3D coordinates from the 2D layout plus small seeded out-of-plane offsets; optimizer minimizing harmonic bond terms with targets from Cordero single-bond covalent radii (S-021; a bond-order correction is allowed only with a cited source added to the register, otherwise use single-bond targets and say the result is rougher), harmonic angle terms with VSEPR ideal angles from the steric number (2: 180, 3: 120, 4: 109.47 degrees; lone pairs from the valence electron count), and a soft repulsion between non-bonded atoms; gradient descent with line search; deterministic with a seed. Result labelled "rough starting geometry for DFT, not a quantum-chemical optimization".
- Molecule-in-a-box export for VASP: cubic cell with at least 10 Angstrom of vacuum around the molecule (configurable), POSCAR in Cartesian or Direct, a note on Gamma-only k-points and that ISIF must stay 2 for molecules (V023).
- Exporters: XYZ, MOL.
**Tasks**: 1. Graph model and MOL/SMILES conversion through RDKit in a worker. 2. Sanitization mapped to B012 issues. 3. 2D layout and SVG. 4. `geom3d.ts` optimizer with the test molecules. 5. Molecule-in-a-box export.
**Tests and reference values** (targets are the model's own definitions, not experimental geometries):
- Methane: four C-H bonds at the Cordero sum 0.31 + 0.76 = 1.07 Angstrom within 0.01, all H-C-H angles 109.47 within 1 degree.
- CO2: linear within 1 degree. Ethene: planar (all atoms within 0.05 Angstrom of a plane). Benzene (aromatic): planar ring.
- Water: H-O-H between 100 and 110 degrees (steric number 4 with two lone pairs gives 109.47 in this model; the experimental 104.5 is mentioned in the UI as a known limitation).
- Valence error: carbon with five single bonds is rejected by sanitization with an explanation.
- Determinism: same seed, same coordinates.
**Done when**:
- [ ] RDKit loads only in molecule mode; the 3D optimizer converges for the test set in under 200 ms each (record).
**Not in this stage**: UI.

## M10.4 Crystal editor UI

**Goal**: `/builder/` crystal mode: build or import a crystal, see it in 3D, edit atoms and cell, watch the validity panel react, fix issues in one click, export or hand off.
**Depends on**: M10.2, M5.5, M8.3
**Size**: L
**Deliverables**:
- Layout: periodic table palette (shared component), 3D view (`CellScene` with atom picking by raycasting), site table (element, fractional coordinates, editable), lattice panel (a, b, c, alpha, beta, gamma or vectors), validity panel (grouped issues with fix buttons), toolbar (undo, redo, symmetrize, standardize, wrap, merge, snap, gentle relax, supercell, templates, import, export, hand off).
- Adding atoms: drag from the palette onto the 3D view (placed on a plane through the cell centre, then editable) or, without a pointer, select an element and press "Add at coordinates"; delete with Delete key; move by numeric edit or by dragging on a constrained plane.
- Templates from the golden structures (rock salt, fcc, bcc, hcp, cubic perovskite, rutile), each loaded as a normal editable structure.
- Import: POSCAR, CIF, XYZ; hand-offs in and out (Input Builder, k-path tool, tolerance explorer composition to a cubic perovskite template).
- Keyboard shortcuts (shown in a help dialog), touch support, 360 px layout (3D view on top, panels in tabs).
**Tasks**: 1. Layout and state wiring to the operations and validity engine. 2. Palette drag and the keyboard alternative. 3. 3D picking and constrained moves. 4. Templates, import, export, hand-offs. 5. e2e and accessibility.
**Tests and reference values**:
- e2e: load the rock-salt template, add an overlapping Na, see B001, apply the merge fix, export POSCAR and parse it; symmetrize a perturbed structure; undo/redo by keyboard; hand off to the k-path tool.
- Axe on the builder in both themes; the 3D view has a text summary (formula, cell, space group, issue count).
**Done when**:
- [ ] Every operation reachable without a mouse; exports blocked on errors unless overridden with a reason.
**Not in this stage**: molecule mode UI.

## M10.5 Molecule editor UI

**Goal**: `/builder/` molecule mode: a ChemDraw-inspired 2D editor with valence checking, tidy layout, 3D clean-up, and export.
**Depends on**: M10.3, M10.4
**Size**: L
**Deliverables**:
- 2D canvas (SVG): click to add an atom, drag from an atom to create a bond, click a bond to cycle its order, element shortcuts by key (C, N, O, H, S, P, F, Cl, Br, I), charge +/-, delete, marquee select, implicit hydrogens shown, tidy layout button (RDKit 2D), SMILES box (import and live export).
- Validity panel (B012 from sanitization, plus M10.1 distance rules after 3D clean-up), one-click fixes where meaningful (add or remove hydrogens, set charge).
- "Clean up in 3D" with progress and the honest label; 3D preview (CellScene in molecule mode); undo/redo across 2D edits and 3D clean-up.
- Exports: MOL, XYZ, POSCAR in a box; hand-off to the Input Builder as a molecule in a box.
- RDKit loading state and a clear error if WebAssembly is unavailable (molecule mode then offers XYZ import only).
**Tasks**: 1. 2D canvas interactions with a pure editing model under test. 2. Keyboard drawing path. 3. RDKit integration (tidy, SMILES) with loading and error states. 4. 3D clean-up and preview. 5. Exports, hand-off, e2e, accessibility.
**Tests and reference values**:
- e2e: draw ethanol by keyboard and pointer, see a valid SMILES, tidy, clean up in 3D, export XYZ and check atom count and C-O bond length near the model target; draw a pentavalent carbon and see the error.
- Axe; keyboard-only drawing path documented and tested (select element, place at a grid position, connect with arrow keys and Enter).
**Done when**:
- [ ] Both modes share the palette and hand-offs; RDKit never loads in crystal mode.
**Not in this stage**: anything beyond these two editors.
