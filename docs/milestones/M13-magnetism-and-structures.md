# M13 Magnetism and structure toolkit

Added in plan v3 (D-055, `docs/ROADMAP_V3.md`). Preparing magnetic orderings, supercells, slabs and defects by hand is slow and error-prone (wrong MAGMOM order, wrong supercell, a ferromagnet hiding in a "G-type" cell). This milestone makes these steps visual and checked, and teaches spin-polarized DFT so a learner can see what `ISPIN = 2` does.

Golden data for this milestone is produced by new generators in `scripts/reference/` that use pymatgen and spglib through independent code paths (never by copying the TypeScript logic). Every generator writes its library versions into the file's `_meta`.

## M13.1 Supercells and collinear magnetic orderings (library)

**Goal**: A tested library that builds supercells and assigns collinear magnetic orderings (ferromagnetic, A-, C- and G-type antiferromagnetic, rock-salt type-II, custom, and all symmetry-distinct configurations of a small cell), and writes a correct MAGMOM line in POSCAR order.
**Depends on**: M5.1, M3.1, M3.4
**Size**: L
**Sources**: S-058, S-059, S-034, S-065, S-041, S-042
**Deliverables**:
- `src/lib/crystal/supercell.ts`: `supercell(structure, M)` for any integer 3x3 matrix with det > 0 (sites generated exactly, fractional coordinates wrapped with a stable tolerance, site order documented and deterministic), `diagonalSupercell(n1, n2, n3)`, `minimalCommensurateSupercell(structure, k)` (searches Hermite normal form matrices by increasing determinant up to a cap, returns the first M with `k . (M rows)` integer for every row, then reduces the cell with the existing `reduction.ts`). M10.2 reuses this file instead of writing its own.
- `src/lib/magnetism/sublattice.ts`: select magnetic sites (by element, default the transition-metal or f-block sites), build the nearest-neighbour graph of the magnetic sublattice with periodic images (shells by distance with a stated tolerance), and detect pseudocubic axes for perovskite-like sublattices (cluster nearest-neighbour vectors into three axis pairs; refuse with a clear message when the sublattice is not pseudocubic).
- `src/lib/magnetism/orderings.ts`:
  - by propagation vector: sign `s_j = cos(2 pi k . R_j)` with `R_j` the lattice translation of site j in the reference cell, valid only when every `s_j` is +1 or -1 (k components in {0, 1/2}); else a typed error.
  - perovskite naming on the pseudocubic magnetic sublattice (Wollan-Koehler, S-058): FM all +; **A-type** ferromagnetic planes stacked antiferromagnetically along the chosen axis (`(-1)^n_c`); **C-type** antiferromagnetic in the plane, ferromagnetic chains along the axis (`(-1)^(n_a + n_b)`); **G-type** every nearest neighbour antiparallel (`(-1)^(n_a + n_b + n_c)`). The axis is a user choice (default the longest pseudocubic axis for orthorhombic cells, the c axis otherwise) and is always shown.
  - rock-salt type-II (MnO/NiO type): ferromagnetic (111) planes stacked antiferromagnetically.
  - custom: per-site signs and magnitudes.
  - `enumerateCollinear(structure, magneticSites, { maxSites: 12 })`: all spin assignments up to a global flip, de-duplicated by the parent structure's space-group operations acting as site permutations (moyo operations from M5.1), with the multiplicity of each class.
  - checks: net moment per cell, `isTrulyAntiferro` (zero net moment and not equivalent to FM), bond statistics per neighbour shell (parallel and antiparallel counts per magnetic site), and a warning when the requested ordering does not fit the current cell with the minimal supercell proposed.
  - `commonSupercell(structure, orderings[])`: the smallest cell (same Hermite-normal-form search) that hosts **all** the requested orderings at once, so every configuration of a comparison can be run in one cell with one atom order and one k-mesh. Comparing energies from differently shaped cells mixes in k-point sampling differences that can be as large as the magnetic energy differences.
- `src/lib/magnetism/magmom.ts`: MAGMOM in **POSCAR order after species grouping** (re-use the M3.1 writer's ordering), compressed repeats (`2*4.0 2*-4.0`), non-magnetic default value configurable (default 0), magnitudes per element with a starting-guess table only where a source supports it (otherwise the user enters them; S-042 values where the handbook gives them). Optional "split species" export (Mn1, Mn2 as separate POSCAR species) for codes or viewers that need it, off by default, with the POTCAR consequence explained.
- Validation hook: the generated MAGMOM passes rule V001 (count) and V002 (ISPIN) of the M3.4 engine.
**Tasks**: 1. `scripts/reference/gen_magnetic_reference.py`: for `cubic_perovskite_SrTiO3`, `pnma_perovskite_like` and `rocksalt_NaCl` from `tests/reference/kpaths.json` (with the B site or cation as the magnetic site), build the orderings with pymatgen's own supercell code and its own neighbour search, and write per-ordering: supercell determinant, number of magnetic sites, net moment, per-site count of parallel and antiparallel nearest neighbours; and for two small cells the number of symmetry-distinct collinear configurations computed by brute force with spglib operations. 2. `supercell.ts` with tests. 3. `sublattice.ts` and `orderings.ts` against the golden file. 4. `enumerateCollinear`. 5. `magmom.ts` and the validator hook. 6. Record conventions in a D entry.
**Tests and reference values** (`tests/reference/magnetic_reference.json`, plus invariants):
- Cubic perovskite (one B per cell, 6 nearest B neighbours): A-type has 4 parallel and 2 antiparallel neighbours per site; C-type 2 parallel and 4 antiparallel; G-type 0 parallel and 6 antiparallel; FM 6 and 0. These counts are a geometric consequence of the definitions; the test reads them from the golden file and also asserts them as invariants.
- Minimal commensurate supercells for the cubic perovskite: determinant 2 (two formula units) for each of A, C and G (k = (0,0,1/2), (1/2,1/2,0), (1/2,1/2,1/2)); diagonal option gives 1x1x2, 2x2x1, 2x2x2.
- `commonSupercell` for FM, A, C and G together on the cubic perovskite has determinant 4 (four formula units, for example the `sqrt(2) x sqrt(2) x 2` cell): the lattice translations must have an even index along the axis and an even sum of the two in-plane indices, a sublattice of index 4. The golden file records it.
- Every antiferromagnetic ordering has zero net moment; FM has the sum of magnitudes.
- Pnma perovskite-like cell (4 B sites): A, C and G fit without enlargement and match the golden neighbour counts.
- Rock salt type-II: each cation has 6 parallel (in-plane) and 6 antiparallel nearest cation neighbours.
- `enumerateCollinear`: counts equal the golden brute-force counts.
- MAGMOM: for a 10-atom G-type SrMnO3-like cell the string has 10 entries in POSCAR order and round-trips through the M3.3 INCAR parser; V001 passes.
- `it.todo('Q-040 ...')` for the VASP symmetry statement and `it.todo('Q-041 ...')` if moyo has no magnetic symmetry.
**Done when**:
- [ ] All golden comparisons and invariants pass; conventions recorded (D entry); open items in Q-040 and Q-041.
- [ ] No starting magnetic moment is shown as a recommendation without a source.
**Not in this stage**: UI, non-collinear orderings, spirals, energy analysis.

## M13.2 Magnetic configuration tool (UI)

**Goal**: `/tools/magnetic/`: drop a POSCAR or CIF, pick the magnetic element, choose FM, A, C, G (or rock-salt type-II, or click spins by hand, or enumerate), see the ordering in 3D with spin arrows and coordination octahedra, and download ready inputs for every configuration.
**Depends on**: M13.1, M12.2, M3.5
**Size**: L
**Sources**: those of M13.1
**Deliverables**:
- Layout (design language v3): left, structure input and options; centre, `Scene` with spin arrows, polyhedra toggle, supercell display; right, a transcript-style output panel (supercell matrix and why, number of magnetic sites, net moment, neighbour statistics, warnings).
- Orderings as tabs FM, A, C, G, rock-salt II, Custom, Enumerate; axis choice for A and C with the axis drawn in the scene; "why this cell" explanation (minimal commensurate supercell versus diagonal).
- Custom mode: click or keyboard-select a site and press `U`, `D` or `0`; table of sites with sign and magnitude editable.
- Outputs per configuration: POSCAR, INCAR snippet (`ISPIN = 2`, `MAGMOM`, `LORBIT = 11` so per-site moments are written, optional `LDAU*` block when the user enables DFT+U, with values entered by the user), and the same folder layout as the M4.2 series generator; "download all" as one zip with folders `FM/`, `A/`, `C/`, `G/` (or `config-01/`... for enumeration), plus a README listing each configuration and what to compare (total energies per magnetic ion). **Default "one cell for all"**: the zip uses `commonSupercell` so every folder has the same lattice, atom order and KPOINTS; a "smallest cell per ordering" switch exists, and when it is on the README and the transcript say that the k-meshes must then be converged separately before energies are compared.
- Hand-offs: to the Input Builder (structure plus MAGMOM), to the k-path tool (for the magnetic cell), and in from the Material Builder later.
- Clear statements: "the starting moments only seed the calculation; check the final moments in OUTCAR"; "VASP may find a different ground state"; badge `computed` for geometry, the physics claims link to module 5.
**Tasks**: 1. Page and state model (thin UI over M13.1). 2. Scene integration with arrows and polyhedra. 3. Custom and enumerate modes with keyboard paths. 4. Exports and zip. 5. e2e, axe, Lighthouse, size.
**Tests and reference values**:
- e2e: load the cubic perovskite fixture, choose G with "smallest cell per ordering", see a 10-atom cell with one up and one down B site; with the default "one cell for all" every POSCAR in the zip has the same lattice and atom order (counts read from `magnetic_reference.json`, not typed into the test), download the zip and check the MAGMOM line against the golden; Pnma fixture with A-type along the long axis; custom mode by keyboard only.
**Done when**:
- [ ] Every number shown comes from the M13.1 library; every export passes the M3.4 validator with no errors.
- [ ] Works at 360 px, keyboard only, and without WebGL (SVG scene).
**Not in this stage**: energy analysis (M13.3).

## M13.3 Magnetic ground state and exchange analysis

**Goal**: After the user runs the configurations, they drop the OSZICAR or OUTCAR files (or type the energies) and the tool ranks the orderings, reports energy differences per magnetic ion, reads the final per-site moments, checks that each calculation kept its intended pattern, and, optionally, fits Heisenberg exchange constants with the convention written out in full.
**Depends on**: M13.2, M4.1
**Size**: L
**Sources**: S-059, S-060, S-065, S-034
**Deliverables**:
- `src/lib/vasp/outcar.ts` extended: the `magnetization (x)` per-site table (s, p, d, f, total columns; LORBIT 11), last occurrence, tolerant of missing columns.
- `scripts/reference/gen_vasp_output_fixtures.py` extended with a synthetic OUTCAR fragment containing that table, read back with pymatgen's `Outcar` to produce the expected values.
- `src/lib/magnetism/analysis.ts`: energy per magnetic ion relative to FM; ranking; `patternKept(intended, finalMoments, { tol })` (signs preserved, moments not collapsed below a stated fraction, labelled heuristic); total-moment check against OSZICAR `mag`.
- `src/lib/magnetism/heisenberg.ts`: generic least squares `E_config = E0 + sum_n c_n(config) J_n` where `c_n` is computed from the M13.1 bond statistics per neighbour shell; the Hamiltonian convention is a parameter and is printed with every result (sign, whether each pair is counted once or twice, whether spins are unit vectors or moments of magnitude S). Requires at least as many configurations as unknowns plus one; reports residuals and the condition number; warns when the fit is under-determined.
- UI on `/tools/magnetic/` (Analyse tab): energy table, bar chart of relative energies, per-site moment table with the intended sign, "pattern kept" flags, optional J fit with the convention box always visible.
- No Neel or Curie temperature estimate in this stage (mean-field estimates need a cited formula and come with large known errors; Q-042).
**Tasks**: 1. Fixture generator and OUTCAR table parser. 2. `analysis.ts` with tests. 3. `heisenberg.ts` with the round-trip tests. 4. Analyse tab. 5. e2e, axe.
**Tests and reference values**:
- OUTCAR table equals the pymatgen reading of the synthetic fixture.
- Round trip (mathematical, no invented physics): choose J1 and J2 in the test, compute energies of FM, A, C and G with the library's own bond counts, add noise of 1e-6 eV, fit, and recover J1 and J2 within 1e-5 eV; an under-determined set raises the warning.
- Convention switch: the same energies under "each pair once" versus "each pair twice" give J values that differ by exactly a factor 2.
- `it.todo('Q-042 ...')` for the convention the author wants as default and the check against S-060.
**Done when**:
- [ ] Every printed J carries its convention; no transition temperature is shown; all numbers trace to the user's files.
**Not in this stage**: non-collinear analysis, spin-orbit, magnetic anisotropy.

## M13.4 Handbook: spin-polarized DFT and magnetism, visually

**Goal**: A beginner understands what `ISPIN = 2` changes (two densities, up and down), why MAGMOM is a starting guess, what FM and A, C, G antiferromagnets look like, how to read the moments a calculation returns, and when non-collinear or spin-orbit calculations are needed, with a 3D picture on every page.
**Depends on**: M7.2, M13.3, M12.2
**Size**: L
**Sources**: S-058, S-059, S-060, S-065, S-041, S-042, S-014
**Deliverables**:
- Topics in `src/content/handbook/05-practical-choices/` after `spin-and-magnetism` (which becomes the overview): `spin-polarized-calculations` (two densities, magnetization density, `ISPIN`, `MAGMOM`, `NUPDOWN`; a scene that splits one density cloud into up and down), `magnetic-orderings` (FM, A, C, G and rock-salt type-II with generated scenes from M13.1; why the supercell must be larger; links to the tool), `finding-the-magnetic-ground-state` (compare several orderings, same settings for all, energy per magnetic ion, pitfalls: moments collapsing, wrong ordering kept by symmetry, DFT+U dependence), `reading-magnetic-output` (OSZICAR `mag`, OUTCAR `magnetization (x)`, spin-polarized DOS mirrored), `noncollinear-and-spin-orbit` (overview only: `LNONCOLLINEAR`, `LSORBIT`, `SAXIS`, 3 values per atom in MAGMOM, `vasp_ncl`; no lab).
- Lab `stoner-toy` (badge `toy-model`, computed): a model DOS with a Stoner parameter slider showing when the spin-split solution has lower energy than the non-magnetic one; the criterion quoted with S-059; clearly a toy.
- The M7.2 `spin-cartoon` lab is replaced by M12.2 scenes generated with M13.1 (no hand-set signs remain).
- Questions with visuals for every new concept; glossary (spin polarization, magnetization density, collinear, non-collinear, antiferromagnet, ferrimagnet, propagation vector, exchange constant, Stoner criterion).
**Tasks**: 1. `src/lib/physics/stoner.ts` with tests. 2. Lab. 3. Five topics with scenes. 4. Questions and glossary. 5. Lint, axe, Lighthouse.
**Tests and reference values**:
- Stoner toy: for a constant model DOS N per spin and Stoner parameter I, the magnetic solution appears exactly when I N > 1 (analytic in this model; derivation in comments with S-059), tested on both sides of the threshold.
- Every MAGMOM example on these pages passes V001 and V002.
**Done when**:
- [ ] Five topics and one lab; every page has a scene; every claim sourced; lint clean.
**Not in this stage**: magnetic anisotropy energies, spin spirals, DMFT.

## M13.5 Structure toolkit: slabs, vacancies, substitutions and doping (library)

**Goal**: Tested operations that turn a bulk crystal into the structures research needs most: surface slabs with vacuum, single and paired vacancies or substitutions at symmetry-distinct sites, and supercells for doping, each with a plain explanation and warnings.
**Depends on**: M13.1, M5.1
**Size**: L
**Sources**: S-063, S-064, S-066, S-067, S-034
**Deliverables**:
- `src/lib/crystal/slab.ts`: for Miller indices (hkl) of the conventional cell, the in-plane lattice vectors (shortest pair, reduced), a stacking vector, `layers` (or minimum thickness in Angstrom), `vacuumA`, centring in the cell, the list of distinct terminations (distinct shifts along the normal), and flags: `symmetric` (top and bottom equivalent), `polar` (nominal-charge dipole along the normal non-zero; heuristic, Tasker type III, S-063) with the advice to consider symmetric slabs or a dipole correction (`LDIPOL`, `IDIPOL`, S-066, by VASP wiki page name), `selective` dynamics option fixing the bottom n layers.
- `src/lib/crystal/defects.ts`: symmetry-distinct sites from moyo Wyckoff orbits; `vacancy(structure, orbit)`, `substitute(structure, orbit, element)`; pairs of defects up to a distance with de-duplication by symmetry; suggested supercell size from a minimum defect-image distance (user value, default 10 Angstrom, labelled a convention); neutral defect formation energy helper `E_f = E_defect - E_bulk - sum n_i mu_i` with chemical potentials entered by the user (S-067; charged defects and corrections explicitly out of scope and said so).
- Feeds the Material Builder toolbar (M10.4) and the research planner (M14.1).
**Tasks**: 1. `scripts/reference/gen_structure_tools_reference.py`: pymatgen `SlabGenerator` for fcc Cu (100), (110), (111), rock-salt NaCl (100) and (111), rutile TiO2 (110): number of terminations, atoms per slab for a given thickness, surface area, polarity flag; spglib `equivalent_atoms` orbit counts for every golden structure; pair-defect class counts for two small cells by brute force. 2. `slab.ts` against the golden file. 3. `defects.ts` against the golden file. 4. Formation-energy helper tests. 5. D entry for conventions.
**Tests and reference values** (`tests/reference/structure_tools_reference.json`):
- Slab surface areas equal the golden values within 1e-6; termination counts equal pymatgen's; NaCl (111) is flagged polar and NaCl (100) is not.
- Orbit counts equal spglib's for every golden structure.
- Formation-energy helper: a hand-checked example with integer energies in the test.
**Done when**:
- [ ] All golden comparisons pass; every warning is labelled heuristic and sourced.
**Not in this stage**: UI (the Builder adds it), interfaces and heterostructures, SQS.

## M13.6 Equation of state and lattice-constant tool

**Goal**: The classic first project: generate a volume series, run it, drop the energies, and fit an equation of state to get the equilibrium volume, lattice constant, bulk modulus and its pressure derivative, with the fit quality shown honestly.
**Depends on**: M4.1, M4.2
**Size**: M
**Sources**: S-061, S-062, S-068, S-041, S-042
**Deliverables**:
- `src/lib/physics/eos.ts`: Birch-Murnaghan third order (S-061) and Murnaghan (S-062) energy-volume forms, a Levenberg-Marquardt fit (S-068) with a parabola-based starting guess, unit handling (B0 in eV/Angstrom^3 and GPa with the conversion constant from `constants.ts`), residuals, and warnings: minimum outside the sampled range, fewer than 5 points, asymmetric sampling, large residuals.
- `src/lib/vasp/series.ts` extended: `volumeSeries(structure, { fractions })` scaling the cell isotropically (default volumes 0.94 to 1.06 of V0 in 7 steps, a convention), with the INCAR choice explained (fixed-volume relaxations with `ISIF = 4` for non-cubic cells versus static points for cubic cells, from the author's handbooks; Pulay stress note).
- `/tools/eos/`: input by file drop (OSZICAR or OUTCAR per folder, or CSV), table, fit plot with residuals, results with units, lattice constant for cubic cells, SVG/PNG/CSV export; mode in the Input Builder series step.
**Tasks**: 1. Golden generator `scripts/reference/gen_eos_reference.py`: synthetic E(V) points from fixed parameters (noise-free and with seeded noise), fitted with pymatgen's `EOS` and with scipy directly. 2. `eos.ts` against it. 3. Volume series and zip. 4. Tool page. 5. e2e, axe, Lighthouse.
**Tests and reference values** (`tests/reference/eos_reference.json`):
- Noise-free data: fitted V0, E0, B0, B0' equal the generating parameters within 1e-6 relative; noisy data: equal pymatgen's fit within 1e-4 relative.
- The GPa conversion uses the constant from the register (1 eV/Angstrom^3 = 160.21766 GPa, scipy.constants in the generator).
**Done when**:
- [ ] Fit reproduces the golden values; warnings fire on the bad-sampling fixtures; nothing is shown without units.
**Not in this stage**: elastic constants, phonons, thermal expansion.
