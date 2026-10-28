# M5 Brillouin zone and k-path viewer

Golden data for this milestone: `tests/reference/bz_geometry.json` (12 lattices), `tests/reference/kpaths.json` (39 structures covering all 29 HPKOT extended Bravais lattices and the 20 non-degenerate Setyawan-Curtarolo variants), `tests/reference/cif/` (CIF parser fixtures with `expected.json`). Verified moyo usage in Node: `docs/verified-stack/moyo-node.reference.mjs`.

## M5.1 Symmetry (moyo), CIF and standardization

**Goal**: Given any structure (POSCAR, CIF, Builder hand-off), find its space group and produce standardized conventional and primitive cells, with the transformation shown to the user; read CIF files safely.
**Depends on**: M3.1
**Size**: L
**Sources**: S-032, S-036, S-034
**Deliverables**:
- Add `@spglib/moyo-wasm@0.21.0`. Budget entry `lazy.moyo` (about 277 KB gzipped wasm).
- `src/lib/crystal/symmetry.ts`: `analyze(structure, { symprec = 1e-4, setting: 'Standard' | 'Spglib' })` returning `{ number, hmSymbol, hallNumber, pearson, operations: { rotation: Mat3Int; translation: Vec3 }[], wyckoffs, siteSymmetries, stdCell: Structure, primStdCell: Structure, stdLinear: Mat3, stdOriginShift: Vec3, primStdLinear: Mat3 }`. Conversion rules verified in planning: `lattice.basis` is the 9 numbers `[a1x, a1y, a1z, a2x, ...]` (our row-major `Mat3` flattened), and **every flat matrix from moyo is column-major**: element (i, j) is at index `i + 3 j`, so a rotation `r` maps to `[[r0, r3, r6], [r1, r4, r7], [r2, r5, r8]]`. Moyo's operations for a centred input cell include the centring translations (fcc Cu conventional: 192 operations = 48 x 4).
- Initialization: in the browser `init(wasmUrl)` with `import wasmUrl from '@spglib/moyo-wasm/moyo_wasm_bg.wasm?url'`; in Vitest `initSync({ module: readFileSync(...) })` exactly as in the verified snippet. Analysis runs in `src/workers/symmetry.worker.ts`; the main thread never blocks.
- `src/lib/crystal/standardize.ts`: user-facing description of what changed: "Your cell was converted from ... to the standardized primitive cell; new parameters ...; transformation matrix ...; atoms per cell changed from N to M"; and the reverse mapping of atoms (`mapping_std_prim`).
- `src/lib/crystal/cif.ts`: `parseCif(text)` returning one result per data block: tokenizer for tags, `loop_`, quoted strings (single, double, `;` text fields), numbers with standard uncertainties in parentheses (`5.64(2)` is 5.64), `?` and `.` as unknown; symmetry operations from `_symmetry_equiv_pos_as_xyz` or `_space_group_symop_operation_xyz` parsed as affine maps (`x+1/2`, `-y`, `1/2+z`); atom sites from `_atom_site_fract_x/y/z`, `_atom_site_type_symbol` (fallback: element prefix of `_atom_site_label`), `_atom_site_occupancy`; expansion of the asymmetric unit by the operations with duplicate merging (tolerance 1e-3 in fractional coordinates, with periodic wrap). Partial occupancy is **rejected** with a plain explanation (VASP needs an ordered structure; suggest building an ordered supercell). `writeCif(structure, { symmetry? })` in P1 (symmetry-aware writing is in M10.2).
- `src/lib/crystal/io.ts`: `readStructure(file)` auto-detecting POSCAR/CONTCAR, CIF, and XYZ (XYZ needs a user-supplied cell or becomes a molecule in a box with a warning).
**Tasks**:
1. Copy the verified snippet's init pattern into a test helper; write the conversion functions and their tests first (a hand-checked rotation for hcp, a translation for a centred cell).
2. `analyze` and `standardize` with tests against golden data; then the worker wrapper.
3. CIF tokenizer and parser with tests against every file in `tests/reference/cif/` (compare with `expected.json`), plus fuzz-style tests for malformed input (unterminated quote, loop with missing values) that must raise a `ParseError` with a line number, not crash.
4. Add a `THIRD_PARTY_NOTICES.md` row only if code is copied; calling the npm package needs none.
**Tests and reference values**:
- For every structure in `kpaths.json`: `analyze(input).number` equals `hpkot.spacegroup_number`, and `primStdCell` has as many atoms as `hpkot.primitive_types` (39 cases; tolerance `symprec = 1e-3` as in the generator).
- For the same structures, the metric tensor `A A^T` of `primStdCell` equals that of `hpkot.primitive_lattice_rows` within 1e-6 after the same axis convention, **or** the report documents for which variants moyo's standard primitive cell differs from seekpath's (expected for some conventions) and the HPKOT stage (M5.3) applies seekpath's own transformation instead. Do not fudge this: list the differing cases.
- CIF: every `.sym.cif` and `.p1.cif` file expands to `n_atoms_input_cell` atoms with lattice parameters within 1e-4 and the expected space group after `analyze`; `edge_uncertainties.cif` parses like the plain file; `edge_alternate_symop_tag.cif` parses; `edge_partial_occupancy.cif` is rejected with the reason in `expected.json`; `edge_two_blocks.cif` yields two blocks.
- Wyckoff letters for hcp Mg are `c, c` and for fcc Cu conventional `a` x 4 (checked in planning with moyo).
**Done when**:
- [ ] All golden comparisons pass; moyo loads lazily in a worker and never on pages that do not need it.
- [ ] The standardization message is clear to a beginner (screenshot in the report) and shows the matrix for pros.
- [ ] CIF rejection messages explain why and what to do.
**Not in this stage**: Brillouin zone, k-paths, UI pages.

## M5.2 Brillouin zone geometry

**Goal**: Exact first-Brillouin-zone polyhedra (vertices, edges, faces) for any lattice, computed by a method independent of the golden generator.
**Depends on**: M3.1
**Size**: M
**Sources**: S-036, S-050
**Deliverables**:
- `src/lib/crystal/brillouin.ts`: `brillouinZone(reciprocalLattice)` returning `{ vertices: Vec3[], faces: { normal: Vec3; planePoint: Vec3; vertexIds: number[] }[], edges: [number, number][], volume }` built by **half-space clipping**: start from a box that contains the zone, clip by the bisector plane of each candidate reciprocal lattice vector G (plane through G/2 with normal G), with candidates taken from a reduced basis (Delaunay or Minkowski reduction, then coefficients in -2..2), remove degenerate faces, merge vertices within 1e-9, order face vertices counter-clockwise seen from outside.
- `src/lib/crystal/reduction.ts`: a basis reduction (Delaunay/Selling or Minkowski) with tests; reused by M4.5's point group if not already present (reuse, do not duplicate).
**Tasks**: reduction, then clipping, then topology (faces, edges), then volume (sum of tetrahedra from the origin). Tests first for each.
**Tests and reference values** (all from `tests/reference/bz_geometry.json`, generated with Qhull Voronoi, which this code must not use):
- For all 12 lattices: vertex count, edge count, face count equal; volume equals `bz_volume` and `(2 pi)^3 / V` within 1e-9 relative; the sorted vertex list equals `vertices_sorted` within 1e-8; the sorted face plane points equal `face_plane_points_G_over_2_sorted` within 1e-8.
- Textbook counts (asserted at generation too): sc 8/12/6, fcc 24/36/14, bcc 14/24/12, hexagonal 12/18/8 vertices/edges/faces; Euler V - E + F = 2 for every lattice.
- `fcc_skewed_basis` gives the same polyhedron as `fcc_primitive` (basis independence).
**Done when**:
- [ ] All 12 golden lattices pass; random lattices (seeded) satisfy volume and Euler checks.
- [ ] Performance: under 5 ms per zone in Node for the golden lattices (report the number).
**Not in this stage**: rendering, labels, paths.

## M5.3 HPKOT k-paths (default convention)

**Goal**: The recommended band path for any structure in the HPKOT convention (the one SeeK-path and, per the author's handbook, VASPKIT 303 use), with exact labels and coordinates.
**Depends on**: M5.1, M5.2
**Size**: L
**Sources**: S-006, S-033
**Deliverables**:
- `src/lib/crystal/kpath/hpkot.ts`: port of seekpath's HPKOT logic (seekpath 2.2.2, MIT; read it from the PyPI wheel: `pip download seekpath==2.2.2 --no-deps` and unzip; files `seekpath/hpkot/__init__.py`, `spg_mapping.py`, `tools.py` and the `band_path_data/<variant>/` tables). Steps: standardized conventional cell from the symmetry dataset, extended Bravais lattice selection exactly as seekpath does (space-group ranges for cP/cF/hP, axis-length conditions for tI, oF, oI, oC, oA, hR, mC, reciprocal-angle conditions for aP, with the same `threshold` and edge-case warnings), primitive cell via seekpath's transformation matrices, point coordinates from the variant table including parameter expressions (eta, zeta, nu, ...), path segments, time-reversal handling.
- `src/data/kpath/hpkot/*.json`: the band-path tables converted from seekpath's text files by a script `scripts/build/convert-hpkot-tables.mjs` (keep it in the repo so the conversion is reproducible).
- Labels mapped to display form (`GAMMA` to the Greek letter, `_0` subscripts) in one function.
- `THIRD_PARTY_NOTICES.md`: seekpath MIT notice and the files ported.
**Tasks**:
1. Read the seekpath source; write the table converter; commit the JSON tables.
2. Port variant selection with a test per branch (29 variants).
3. Port the primitive transformation and the point evaluation.
4. Decide, using M5.1's report, whether to take moyo's standardized cell directly or apply seekpath's transformations to moyo's `Spglib`-setting conventional cell. Record the decision (D-nnn).
**Tests and reference values** (`tests/reference/kpaths.json`, field `hpkot`):
- For every one of the 39 structures: `bravais_lattice_extended` equal; the set of point labels equal; every point's fractional coordinates equal within 1e-6 (they are in the basis of the standardized reciprocal primitive lattice, so compare after producing that same basis); the `path` segment list equal in order; the primitive cell's metric tensor equal within 1e-6.
- `_meta.coverage.hpkot_extended_bravais` lists 29 variants; the test asserts each variant was exercised at least once.
- fcc Cu path is `Γ-X-U | K-Γ-L-W-X` (also stated in D-005).
**Done when**:
- [ ] All 39 structures match; no test skipped; edge-case warnings are surfaced to the caller.
- [ ] The report states which seekpath files were ported and confirms the MIT notice.
**Not in this stage**: Setyawan-Curtarolo (M5.4), UI.

## M5.4 Setyawan-Curtarolo k-paths (second convention)

**Goal**: The same capability in the Setyawan-Curtarolo convention used by pymatgen and the Materials Project, so users can match those band structures.
**Depends on**: M5.3
**Size**: L
**Sources**: S-005, S-034
**Deliverables**:
- `src/lib/crystal/kpath/setyawan.ts`: port of pymatgen's `KPathSetyawanCurtarolo` (pymatgen 2026.10.24, MIT; `pymatgen/symmetry/kpath.py`) together with the cell standardization it requires (`SpacegroupAnalyzer.get_conventional_standard_structure` and `get_primitive_standard_structure(international_monoclinic=False)` in `pymatgen/symmetry/analyzer.py`): lattice-type detection, axis ordering rules per lattice type, the 23 branch methods (`cubic`, `fcc`, `bcc`, `tet`, `bctet1`, `bctet2`, `orc`, `orcf1`, `orcf2`, `orcf3`, `orci`, `orcc`, `hex`, `rhl1`, `rhl2`, `mcl`, `mclc1` to `mclc5`, `tria`, `trib`) with their k-point formulas.
- A `convention` switch in the public API: `kpath(structure, { convention: 'hpkot' | 'setyawan-curtarolo' })`, with the convention name included in every result.
- `THIRD_PARTY_NOTICES.md`: pymatgen MIT notice and the functions ported.
**Tasks**: 1. Download pymatgen 2026.10.24's wheel and read `symmetry/kpath.py` and the standardization functions in `symmetry/analyzer.py`. 2. Port the conventional and primitive standardization with tests against the golden primitive metrics. 3. Port the 23 branch methods and the branch selection, one test per branch. 4. Wire the `convention` switch and compare all 39 structures. 5. Add the boundary-case unit tests and the THIRD_PARTY_NOTICES entry.
**Tests and reference values** (`kpaths.json`, field `setyawan_curtarolo`):
- For all 39 structures: `sc_variant` equals the branch the port selects; labels, coordinates (1e-6) and path equal; primitive metric tensor equal.
- `_meta.coverage.setyawan_curtarolo_variants` has 20 entries; each is exercised. The three boundary branches (`orcf3`, `mclc2`, `mclc4`) get unit tests constructed at the exact boundary condition from the paper's definitions (S-005), marked as such.
- fcc Cu path is `Γ-X-W-K-Γ-L-U-W-L-K | U-X`.
**Done when**:
- [ ] All golden structures match in both conventions; switching convention never silently reuses the other's cell.
**Not in this stage**: UI.

## M5.5 3D Brillouin zone and lattice viewer

**Goal**: A visually excellent, accessible 3D view of the Brillouin zone with reciprocal vectors, labeled points and the path, plus a real-space unit-cell view (the "unit cell and lattice explorer" lab).
**Depends on**: M5.2, M2.1
**Size**: M
**Deliverables**:
- `src/lib/three/BzScene.ts` (extends `SceneController`): translucent faces with visible edges, reciprocal vectors as arrows with labels, high-symmetry points as small spheres with HTML labels (the label layer is real text, selectable and readable by screen readers), path as thick lines with direction ticks, optional k-mesh points (from M4.5's `meshPoints`), Gamma at the origin, axes helper toggle.
- `src/lib/three/CellScene.ts`: real-space unit cell with atoms (instanced spheres, radii from covalent radii, colors by element from a documented palette with a colorblind-safe check), bonds optional, supercell repeat 1 to 3 per axis.
- Controls: orbit, zoom, pan, reset, preset views (along a, b, c, and along the path start), touch gestures, keyboard (arrow keys rotate, +/- zoom, R reset).
- Reduced motion: no inertia, no auto-rotate. No WebGL: 2D SVG projection of the same polyhedron (vertices projected, hidden edges dashed) with rotation sliders.
- `src/components/labs/BrillouinLab.tsx` and `UnitCellLab.tsx` usable from MDX.
**Tasks**: 1. Pure helpers first (label placement, SVG projection, palette contrast) with tests. 2. `BzScene` on top of `SceneController`, then `CellScene`. 3. Controls, keyboard and touch, reduced motion. 4. 2D fallback. 5. MDX lab wrappers, e2e and the frame-rate measurement.
**Tests and reference values**:
- Pure functions (label placement, projection for the SVG fallback, color palette contrast) unit-tested; e2e for start, fallback and keyboard control.
- Geometry correctness is inherited from M5.2; this stage adds no new science.
**Done when**:
- [ ] Both labs run at 60 fps on a mid-range laptop (record the measurement method) and degrade gracefully on mobile.
- [ ] Axe clean; labels readable in both themes; fallback tested.
**Not in this stage**: the tool page and exports (M5.6).

## M5.6 k-path tool page and exports

**Goal**: The research tool at `/tools/kpath/`: input a structure, see the standardized cell, the zone and the path in either convention, adjust points per segment, export KPOINTS.
**Depends on**: M5.3, M5.4, M5.5, M3.2
**Size**: M
**Deliverables**:
- Inputs: Bravais lattice chooser with parameter fields (validated: positive lengths, angles that form a valid cell), POSCAR/CIF drop, hand-off from the Builder and the Input Builder.
- Panel "What happened to your cell": standardization message from M5.1 (always shown when the cell changed).
- Convention switch (HPKOT default, Setyawan-Curtarolo) with a one-paragraph explanation of why conventions differ and which tools use which (VASPKIT 303, pymatgen/Materials Project; Q-013 caveat until confirmed).
- Path table: segments with start and end labels, segment length in 1/Angstrom (with 2 pi), points per segment (global density in points per 1/Angstrom or per-segment override), total points; animate a marker along the path in the 3D view (respecting reduced motion).
- Exports: VASP line-mode KPOINTS (`Line-mode`, `Reciprocal`, pairs of points with `! label` comments, blank line between segments), a VASPKIT-style `KPATH.in` with the same content, a plain coordinate list (CSV and JSON with labels and cumulative distance), and a `KPOINTS_OPT` variant for VASP 6.3 and later with a note on route A versus route B from the author's protocol.
- Link to the band-structure module (placeholder link checked by the link checker once M7.5 exists).
**Tasks**: 1. Page skeleton with the inputs and the standardization panel. 2. Path table and segment-length computation with tests. 3. KPOINTS, KPATH.in, KPOINTS_OPT and coordinate-list writers with exact-text tests. 4. Animation and mesh overlay. 5. Hand-offs, e2e, accessibility and budget checks.
**Tests and reference values**:
- Line-mode writer: exact text for the fcc Cu HPKOT path with 20 points per segment (hand-written expected file from the KPOINTS format, checked against the coordinates in `kpaths.json`).
- Segment lengths equal `|(k_end - k_start) B|` with B the reciprocal primitive lattice from the golden file, within 1e-9.
- e2e: drop the hcp Mg POSCAR, switch conventions, change points per segment, download KPOINTS and compare.
**Done when**:
- [ ] Both conventions export valid KPOINTS; the convention name is written into the KPOINTS comment line.
- [ ] Axe clean, keyboard flow complete, Lighthouse recorded, budgets met (moyo and three are lazy).
**Not in this stage**: band-structure plotting (M7.5).
