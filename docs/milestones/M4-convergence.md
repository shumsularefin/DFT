# M4 Convergence helper, plotter, and the ENCUT and k-point labs

Author's reference practice (Workflow Handbook, "Convergence tests", S-042): ENCUT series `400 450 500 550 600 650 700` for ENMAX about 400 in folders `encut_<value>`; k-mesh series by VASPKIT resolution `0.06 0.05 0.04 0.03 0.025 0.02` (Gamma-centred) in folders `kpt_<resolution>`; energy read with `grep "energy  without entropy" OUTCAR | tail -1 | awk '{print $NF}'` (two spaces after "energy"; the last field is `energy(sigma->0)`, D-015); converged when the energy changes by less than 1 meV/atom.

## M4.1 Output parsers and convergence analysis

**Goal**: Robust, tested parsers for OSZICAR and OUTCAR (and pasted CSV) plus the convergence-detection algorithm.
**Depends on**: M3.2
**Size**: L
**Sources**: S-019, S-040, S-042
**Deliverables**:
- `src/lib/vasp/oszicar.ts`: `parseOszicar(text)` returns `{ electronic: ElectronicStep[], ionic: IonicStep[], isMD: boolean, warnings }`. Ionic lines look like `   1 F= -.12345678E+02 E0= -.12345678E+02  d E =-.123456E-01  mag=     1.2345`; parse `F`, `E0`, `dE`, optional `mag`, tolerate numbers glued to `=` (`F=-.1E+02`), spin-polarized and non-polarized forms, VASP 5.4 and 6.x. MD lines contain `T=`: set `isMD` and report. Electronic lines start with `DAV:`, `RMM:`, `CGA:` etc.
- `src/lib/vasp/outcar.ts`: `parseOutcar(text)` extracts, tolerating missing items: `nions` (`number of ions     NIONS =`), `encut` (`ENCUT  =`), per-species `enmax` (`ENMAX  =`), `nkpts`/`nbands` (`k-points           NKPTS = ... number of bands    NBANDS=`), every ionic step's `freeEnergyTOTEN` (`free  energy   TOTEN  =`), `energyWithoutEntropy` and `energySigma0` (`energy  without entropy=   <x>  energy(sigma->0) =   <y>`), `pressureKb` and `pulayKb` (`external pressure =  x kB  Pullay stress =  y kB`), final forces block (`TOTAL-FORCE (eV/Angst)`, `total drift:`) and the maximum force, `efermi` (`E-fermi :`), `reachedRequiredAccuracy`, `elapsedSec` (`Elapsed time (sec):`), `magnetization` total if present, `converged electronic loop` indicators. Each extracted item records the source line number. Unknown format versions yield `warnings`, never a thrown error for a missing optional item.
- `src/lib/vasp/csv.ts`: `parseSeriesCsv(text)` with flexible headers (`x`, `encut`, `kpoints`, `energy`, `natoms`, `pressure`, `label`), delimiter sniffing (comma, tab, semicolon, spaces), decimal comma tolerance rejected with a clear message.
- `src/lib/vasp/convergence.ts`: `analyzeSeries(points, { thresholdEvPerAtom = 1e-3, pressureThresholdKb = 5, quantity, enmax? })` returning `{ perAtom[], diffs[], convergedIndex | null, status: 'converged' | 'only-last-point' | 'not-converged' | 'too-few-points', monotonic, explanation, warnings }` following **D-014**: converged at the smallest `i` such that every later point is within the threshold of point `i`; if `i` is the last point there is no evidence (`only-last-point`). Energy per atom uses `nions`. Pressure follows the same rule with its own threshold (heuristic, Q-014). Warnings: lowest ENCUT below ENMAX (when given); energy converged but pressure not (Pulay stress, S-040), with advice to use 1.3 x ENMAX for relaxations; non-monotonic series; fewer than 4 points; points sorted by cost (ENCUT ascending; k resolution descending).
- `src/lib/vasp/kseries.ts`: map a folder or file label to a numeric x: `encut_450` to 450, `kpt_0.04` to resolution 0.04, `k8x8x8` to 8; helper to order by cost.
**Tasks**:
1. Write fixtures by hand in `src/lib/vasp/__fixtures__/` documenting each line format used (OSZICAR for non-spin and spin, relaxation of 3 ionic steps, MD; OUTCAR excerpts with the patterns above for VASP 5.4 and 6.x). If `data/author/` contains real files, add trimmed copies and state in the report which patterns were validated on **real** output.
2. Parsers with tests, then `analyzeSeries`.
3. Document in the report every regular expression with a sample matching line.
**Tests and reference values**:
- Convergence, hand-worked (put the reasoning in the test as a comment, and do not obtain the expectation by running the code): energies per atom relative to the last point, in meV, `[25, 8, 2.4, 0.9, 0.3, 0]` at ENCUT `400, 450, 500, 550, 600, 650` with a 1 meV threshold. Index 0 fails (|8 - 25| = 17), index 1 fails (|2.4 - 8| = 5.6), index 2 fails (|0.9 - 2.4| = 1.5 > 1), index 3 passes (the later points deviate from its 0.9 by 0.6 and 0.9, both <= 1). So `convergedIndex = 3`, ENCUT 550. Add three more hand-worked series: one where a later point is exactly at the threshold (counts as converged), one non-monotonic (flagged), one that never converges (`not-converged`).
- `energyPerAtom` for NIONS = 8 and total energy -34.0 gives -4.25 eV/atom.
- Parsers return the same values as a straightforward `grep`/`awk` pipeline on the fixtures (run the shell commands in a test when `grep` exists, else skip with a clear reason).
- `quantity` selector: `energySigma0` is the default (D-015) and equals `$NF` of the `energy  without entropy` line.
- `kseries`: `encut_450` to 450; `kpt_0.04` to 0.04; ordering by cost.
- CSV: comma, tab and semicolon files parse to identical points.
**Done when**:
- [ ] Every parser item has a fixture and a test; warnings (not exceptions) for missing optional data.
- [ ] D-014 rule implemented exactly; hand-worked series pass.
- [ ] Pressure threshold labelled heuristic and adjustable; Q-014 updated with any citation found.
- [ ] Report lists which line formats were validated on real author output (Q-008) and which only on hand-written fixtures.
**Not in this stage**: UI, zip generation.

## M4.2 Convergence series generator

**Goal**: From a structure, an INCAR preset and an ENMAX value, generate ready-to-run ENCUT and k-mesh test folders as a zip built in the browser.
**Depends on**: M3.5, M4.1
**Size**: M
**Sources**: S-042
**Deliverables**:
- `src/lib/vasp/series.ts`: `encutSeries(enmax, opts)`: default start `floor(ENMAX/50)*50`, end `ceil(1.75 x ENMAX / 50) * 50`, step 50, always including the value nearest to `1.3 x ENMAX` (rounded to 10); `kmeshSeries(opts)`: default VASPKIT resolutions `[0.06, 0.05, 0.04, 0.03, 0.025, 0.02]` or explicit `N x N x N` lists; `buildProject(...)` returns a virtual file tree `{ path, content }[]`.
- Folder layout like the author's: `00_conv/encut_<E>/` and `00_conv/kpt_<res>/`, each with `POSCAR`, `INCAR` (preset `convergence` with ENCUT set, and for the k-series ENCUT fixed at a user-chosen value), `KPOINTS` (Gamma-centred by default), `job.sh` (SLURM or PBS from `jobscript.ts`), plus top-level `run_all.sh` (sequential loop like the author's script), `collect.sh` (prints `label E_sigma0 pressure nions` as CSV using the exact two-space `grep "energy  without entropy"` pipeline and `grep "external pressure"`), `README.txt` (what to do, how to make POTCAR under your own licence with the species order, how to drop results into the plotter), `make_potcar.sh` that concatenates files from a path the user sets (`POTCAR_DIR`), contains **no** POTCAR content.
- Zip creation with fflate (in a worker if the file tree exceeds 2 MB).
- Safety: refuse series longer than 40 runs; warn when the estimated total cost (from atoms and k-points) is large; show the folder tree before download.
**Tasks**:
1. Pure functions and tests. 2. Text templates with exact expected strings. 3. Zip builder test (unzip with fflate in the test and compare file list and contents).
**Tests and reference values**:
- `encutSeries(400)` equals `[400, 450, 500, 550, 600, 650, 700]` (the author's own series); `encutSeries(520)` starts at 500, ends at 950 and contains 680 (nearest ten to 676).
- `kmeshSeries()` default equals the six resolutions; each converts to a mesh for the fcc Cu fixture via `meshFromResolution` and the meshes are non-decreasing.
- Every generated INCAR passes the M3.4 validator without errors; no path or file named `POTCAR`; `collect.sh` contains the two-space `energy  without entropy` pattern.
**Done when**:
- [ ] Zip opens, structure matches the README, scripts are executable text (shebang) and syntactically valid (`bash -n` in a test when bash exists).
- [ ] The author can run `bash run_all.sh` after adding POTCAR (documented).
**Not in this stage**: UI beyond a minimal panel inside the Input Builder (a "Convergence series" tab reusing M3.5 state), plotter.

## M4.3 Convergence plotter UI

**Goal**: Drop results, see the plot, the threshold band, the converged setting and a plain-language explanation; export PNG/SVG.
**Depends on**: M4.1
**Size**: M
**Deliverables**:
- Add `d3-scale`, `d3-shape`, `d3-axis`, `d3-selection` at the pinned versions.
- `/tools/convergence/`: drop zone accepting multiple OSZICAR/OUTCAR files (label from file name or folder name via `kseries`), paste CSV, manual table editor (add rows), series type toggle (ENCUT or k-mesh), quantity selector (default `energy(sigma->0)`), NIONS input when not parseable, threshold slider (0.1 to 10 meV/atom, default 1), pressure plot when available, ENMAX input for the Pulay advice.
- `src/components/tools/convergence/ConvergencePlot.tsx`: SVG with D3 scales; energy per atom relative to the last point (or absolute toggle), threshold band around the final value, converged marker with label, hover/focus tooltips, keyboard focus traversal of points, a data table beside the chart (accessible alternative), unit labels.
- Explanation panel: result in plain language at the current level, for example "Your energy stops changing by more than 1 meV per atom from ENCUT = 550 eV. For a relaxation use 1.3 x ENMAX = 520 anyway because the stress converges more slowly" with the Pulay warning logic from `analyzeSeries`.
- Export: SVG (serialize the SVG with inline styles and fonts as system fallbacks), PNG via canvas at 2x, CSV of the table.
- Everything local: no upload; files over 25 MB rejected with a message.
**Tasks**: components with a pure view-model in `src/lib/vasp/convergenceView.ts` (axis ticks, label formatting, tooltip text) tested separately; e2e with fixtures.
**Tests and reference values**:
- View-model: tick generation for the energy range, formatting of meV/atom, tooltip text for a converged point.
- e2e: drop three OSZICAR fixtures, see the converged marker at the expected x (from the hand-worked series), change threshold to 5 meV and see the marker move earlier, export SVG and parse it (contains `<svg` and the expected number of points), keyboard traversal.
**Done when**:
- [ ] Works at 360 px and desktop; axe clean; charts have text alternatives.
- [ ] SVG and PNG exports open correctly (screenshot compare in the report).
- [ ] Bundle within budget; d3 modules tree-shaken (report sizes).
**Not in this stage**: DOS/band plots (M7.5).

## M4.4 ENCUT lab and toy plane-wave solver

**Goal**: A 3D lab that shows what the cutoff energy means (a sphere of plane waves in reciprocal space) with exact counts, plus a real toy plane-wave calculation whose energy converges as the cutoff grows.
**Depends on**: M2.1, M3.1
**Size**: L
**Sources**: S-049, S-050, S-031, S-040
**Deliverables**:
- `src/lib/physics/planewaves.ts`: `gVectorsWithin(lattice, encutEv)` enumerating reciprocal lattice vectors with `HBAR2_OVER_2M x |G|^2 <= ENCUT` (G includes 2 pi), exact count, the continuum estimate `V k_c^3 / (6 pi^2)` with `k_c = sqrt(ENCUT / HBAR2_OVER_2M)`, and the ratio; robust for skewed bases. Use the rigorous search bound: writing G = n1 b1 + n2 b2 + n3 b3, each `|n_i| <= k_c |a_i| / (2 pi)` because `n_i = G . a_i / (2 pi)` (a bound based on the shortest reciprocal vector is NOT safe for skewed bases; the golden generator uses the rigorous one).
- `src/lib/physics/kp1d.ts` (toy model, D-004 spirit): 1D periodic potential `V(x) = V0 cos(2 pi x / a)` or a Kronig-Penney form; basis of plane waves `exp(i (k+G) x)` with `(hbar^2/2m)(k+G)^2 <= ENCUT`; builds the Hamiltonian, diagonalizes it with a dependency-free symmetric (Hermitian) eigen-solver (Jacobi or tridiagonalization plus QL on the real symmetric form for a cosine potential), and returns the lowest `nBands` energies at a chosen k and the sum of occupied band energies; runs in a worker.
- Lab `encut-sphere` (3D via M2.1): lattice chooser (sc, fcc, bcc, hex presets, or a POSCAR from M3.1), ENCUT slider 50 to 800 eV, G-vector sphere drawn as instanced points inside a translucent sphere of radius G_cut with the reciprocal cell wireframe; readouts: G_cut (1/Angstrom), exact number of plane waves, continuum estimate and its error, relative memory and time scaling hints (labelled "scaling estimate, not a runtime prediction"); beside it the **convergence curve** of the toy model: energy of the lowest bands versus cutoff, with the 1 meV/atom style band, computed live; badge `toy-model` for the curve and `computed` for the counts. 2D fallback: the same counts and curve, sphere drawn as a circle slice.
- Topic text stubs are not part of this stage (module 5 prose is in M7.2); the lab ships with `LabShell` text description.
**Tasks**: library and tests first; then the worker; then the lab and e2e.
**Tests and reference values**:
- Counts equal `tests/reference/pw_kmesh_reference.json` `plane_wave_counts` for the four cells and five cutoffs (exact integers), e.g. fcc Cu primitive a = 3.61 at 400 eV gives 181 (not the continuum estimate 213.7: the lab must show both and explain the difference), at 520 eV gives 331.
- The count is invariant under a unimodular change of the lattice basis (use the skewed fcc basis).
- Count is monotone non-decreasing in ENCUT; at ENCUT = 0 only G = 0.
- Toy model: V0 = 0 gives free-electron energies `(hbar^2/2m)(k+G)^2` sorted; at k = 0 these are `0, E_G, E_G, ...` (compare with the analytic list); the lowest-band energy is non-increasing as the plane-wave basis grows (variational principle, tested for 10 cutoffs); a weak cosine potential `V(x) = V0 cos(2 pi x / a)` couples plane waves that differ by `G1 = 2 pi / a` with matrix element `V0 / 2`, so for a non-degenerate state at wavevector `k` the second-order shift is `(V0^2 / 4) [ 1 / (E_k - E_{k-G1}) + 1 / (E_k - E_{k+G1}) ]` with `E_q = (hbar^2/2m) q^2`; the exact diagonalization agrees with this to better than 1e-3 relative for `V0 <= 0.05 eV` at `k = 0.2 G1` (use a wide enough basis; cite S-050 for the nearly-free-electron picture).
**Done when**:
- [ ] Lab works with mouse, touch, keyboard; 2D fallback tested; no main-thread freezing (worker).
- [ ] The exact-versus-estimate message is visible and correct.
- [ ] All reference tests pass at the stated tolerances; scaling hints carry the "estimate" label.
**Not in this stage**: k-point lab, module prose.

## M4.5 K-point mesh lab

**Goal**: A lab where the user sees Monkhorst-Pack and Gamma-centred meshes in the Brillouin zone cell, counts irreducible points under the lattice symmetry, and sees why metals need denser meshes.
**Depends on**: M4.4, M3.2
**Size**: L
**Sources**: S-007, S-049, S-050
**Deliverables**:
- `src/lib/crystal/pointgroup.ts`: `latticePointGroup(lattice)` returns the rotation matrices (integer matrices in the lattice basis) preserving the metric tensor, found the way spglib does it: Delaunay-reduce the basis, then enumerate the 3^9 integer matrices with entries in {-1, 0, 1} and keep those that preserve the metric tensor within a tolerance, then transform back to the input basis (document the reduction and cite S-032); `hasInversion`; order of the group.
- `src/lib/crystal/kmesh.ts`: `meshPoints(n, centering)`, `irreducibleCount(mesh, rotations, {timeReversal: true})` computing the irreducible wedge count by orbit enumeration in the reciprocal lattice basis (reciprocal action is the inverse transpose), with weights; `meshIsSymmetric(...)` (the Q-017 test).
- Lab `kpoint-mesh` (3D via M2.1): lattice chooser (as the ENCUT lab), mesh `n1 n2 n3` sliders (1 to 24), Gamma-centred versus Monkhorst-Pack toggle, shows the reciprocal cell with mesh points, highlights Gamma, optionally colors points by their irreducible orbit; readouts: total points, irreducible points, symmetric yes/no with the reason (Q-017), relative cost (proportional to irreducible points).
- Toy-model panel `metal-vs-insulator` (2D tight-binding band `E(k) = -2t (cos kx + cos ky)`): integrate the occupied-band energy over the mesh at half filling (a metal: the Fermi surface cuts the zone) versus a gapped band (add a staggered potential `+-Delta`, an insulator) with and without smearing (Gaussian sigma slider), plotting the error against mesh size on a log axis; shows that the metal converges slowly and the insulator exponentially quickly. Badge `toy-model`; formulas shown.
**Tasks**: point group and mesh code with tests, then lab, then toy panel.
**Tests and reference values**:
- Irreducible counts equal `pw_kmesh_reference.json` `irreducible_counts_spglib` (fcc Cu primitive, meshes 2, 4, 6, 8, 10, 12: Gamma-centred `3, 8, 16, 29, 47, 72`; shifted `2, 10, 28, 60, 110, 182`). Note the shifted grid in the golden file is spglib's half-step shift, which equals Monkhorst-Pack for **even** n only; the test only compares even n for the shifted case.
- `meshIsSymmetric` equals every boolean in `mesh_point_group_symmetry` (4 systems x n = 2, 3, 4, 5, 6, 8, both centerings).
- Lattice point group order (holohedry): sc 48, fcc primitive 48, bcc primitive 48, hexagonal 24 (D6h), rhombohedral 12 (D3d), tetragonal 16, orthorhombic 8, monoclinic 4, triclinic 2 (inversion only), using the lattices of `bz_geometry.json`; invariance under change of basis (`fcc_skewed_basis` gives 48).
- Toy model: for `E(k) = -2t (cos kx + cos ky)` at half filling (occupied where E < 0, i.e. |kx| + |ky| < pi) the exact energy per site and per spin is `-8 t / pi^2` (= -0.810569 t). Derivation to place in the test comment: integrate over the diamond, the cosine terms give `-4 * integral((pi - |k|) cos k dk) = -16` and `-4 * integral(sin |k| dk) = -16`, total `-32 / (4 pi^2)`. It was also checked numerically on a 4000 x 4000 midpoint grid (-0.8105694). The two regimes are told apart by how the error falls, not by a fixed factor. Reference for the gapped case: no closed form, so compare with a 4000 x 4000 Gamma-centred mesh (lower band `-sqrt(Delta^2 + eps^2)`, energy per site per spin `-(1/2) <sqrt(Delta^2 + eps(k)^2)>`, which reduces to `-8t/pi^2` at Delta = 0). Planning computation on Gamma-centred N x N meshes, N = 4, 6, ..., 24: metal (Delta = 0) error 6.1e-2 at N = 4 and 2.3e-3 at N = 24, with successive-error ratios rising steadily from 0.54 to 0.84 (algebraic decay); insulator Delta = 1.0 t error 8.6e-3 at N = 4 and 1.5e-8 at N = 24, with ratios staying between 0.18 and 0.32 (exponential decay); Delta = 0.5 t ratios about 0.37 to 0.51. Assert: for Delta = 1.0 t the error at N = 24 is below 1e-7 and every ratio for N >= 6 is below 0.35; for the metal the error at N = 24 is above 1e-3 and the ratios increase with N.
**Done when**:
- [ ] Counts reproduce spglib for the golden cases; point group orders pass.
- [ ] Lab accessible, labelled; Q-017 explanation visible when a mesh is not symmetric.
- [ ] Toy panel labelled `toy-model` with formulas.
**Not in this stage**: spglib/moyo symmetry of a real structure with atoms (M5.1), k-paths.
