# M3 File explorer and VASP Input Builder

Seed material for this milestone is the author's two handbooks (`docs/source-material/`, source IDs S-041 and S-042, decision D-018). Their `Corrected` entries override the original notes. They contain one known slip (Q-017). Everything shipped from them is rewritten in the site's voice and tested.

## M3.1 Structure core: lattice math and POSCAR

**Goal**: A tested, dependency-free library that reads and writes POSCAR/CONTCAR and does the lattice and reciprocal-lattice math every other tool needs.
**Depends on**: M0.2
**Size**: M
**Sources**: S-019, S-041, S-042, S-036
**Deliverables**:
- `src/lib/crystal/types.ts` (`Vec3`, `Mat3`, `Structure` exactly as in `docs/ARCHITECTURE.md` section 3), `linalg.ts` (3x3 determinant, inverse, multiply, transpose, dot, cross, norm), `lattice.ts` (lattice parameters a, b, c, alpha, beta, gamma; volume; `fromParameters`; reciprocal lattice **with 2 pi**; frac/cart conversion; wrap to [0,1); minimum-image distance; cell type guess by metric: cubic, tetragonal, orthorhombic, hexagonal, rhombohedral, monoclinic, triclinic with tolerances), `structure.ts` (composition, reduced formula, number of atoms, species order and counts in order of first appearance, `groupBySpecies` with the permutation, supercell, density in g/cm3 using atomic masses from `src/data/atomic-masses.json` (IUPAC standard atomic weights, source recorded), selective dynamics helpers), `poscar.ts` (`parsePoscar(text)`, `writePoscar(structure, options)`), `errors.ts` (`ParseError` with `line`).
- `src/lib/handoff.ts` as specified in ARCHITECTURE section 5 (types, `sendHandoff`, `takeHandoff`, validation with tests; `sessionStorage` injected so tests need no DOM).
**POSCAR format rules to implement** (VASP wiki page POSCAR, S-019; handbook "Input and output files"):
1. Line 1 comment. Line 2 scale: one positive number multiplies lattice vectors (and Cartesian coordinates); one negative number is the **target cell volume in Angstrom^3** (`scale = (|s| / V0)^(1/3)`); three numbers (anisotropic scaling) are rare: throw a clear `ParseError` "three scaling factors are not supported yet" rather than guess. Lines 3 to 5: lattice vectors as rows.
2. Line 6: if it contains element symbols it is the VASP 5 format; if it contains integers it is the VASP 4 format (no symbols): parse counts, give species placeholders `X1, X2, ...`, and return `warnings: ['species names missing (VASP 4 format)']`. Symbols may carry a POTCAR-style suffix (`Ti_pv`): keep `label` verbatim and use the part before `_` as the element.
3. Counts line. Optional `Selective dynamics` line (first non-blank character `S` or `s`). Then `Direct` or `Cartesian` (first character `C`, `c`, `K` or `k` means Cartesian; anything else Direct). Then one line per atom: three numbers, optional three flags `T`/`F`, optional trailing text.
4. Tolerate: Windows line endings, trailing whitespace, tabs, blank lines after the coordinates, velocity or predictor-corrector blocks after the coordinates (ignore), numbers such as `1.0E+00` and `-.5`.
5. Writer: standard VASP 5 layout, lattice and coordinates with 16 decimals, `Direct`, sites grouped by species in order of first appearance. If grouping changes the input order the writer returns the permutation and the UI must tell the user (MAGMOM follows POSCAR order).
**Tasks**:
1. Types and `linalg` with tests; then `lattice`; then `poscar`; then `structure`.
2. Create fixtures as text files in `src/lib/crystal/__fixtures__/` (fcc Cu, NaCl rock salt conventional, a Cartesian one, a selective-dynamics slab, a VASP 4 one, a negative-scale one, CRLF).
3. Implement `handoff.ts` with a runtime validator for every `kind` and tests (rejects malformed payloads, `takeHandoff` clears storage).
4. Write `docs/reports/M3.1.md` with the table of every rule above and the test proving it.
**Tests and reference values**:
- Round trip on every structure in `tests/reference/kpaths.json` (39) (`structures.*.input`: `lattice_rows`, `frac_coords`, `atomic_numbers` mapped to symbols): write then parse equals the original to 1e-12.
- Reciprocal lattice rows with 2 pi equal `tests/reference/bz_geometry.json` `lattices.*.reciprocal_lattice_rows_with_2pi` to 1e-10 for all 12 lattices; `reciprocal . lattice^T = 2 pi I`.
- Volumes: fcc primitive a = 3.61 gives 11.7607 Angstrom^3 (a^3/4); `cell_volume` field of `bz_geometry.json` for all 12 lattices; BZ volume relation is tested in M5.2, not here.
- Negative scale: a cell of volume 8.0 with `-27.0` becomes volume 27.0 (all lengths x 1.5).
- Hexagonal lattice parameters round trip: `fromParameters(a, a, c, 90, 90, 120)` returns the same parameters.
- Wrapping, minimum image on a skewed cell (compare with a brute-force search over neighbouring cells).
- Cell type guess: Cu fcc primitive is `rhombohedral`-like in metric terms: document and test that this function reports **lattice metric class** and is not a Bravais lattice identification (that is M5).
**Done when**:
- [ ] All rules 1 to 5 above have a test; coverage of `src/lib/crystal/` is reported.
- [ ] `ParseError.line` is right for malformed files (tested with 6 broken fixtures).
- [ ] `handoff.ts` validated.
- [ ] No DOM or React imports in `src/lib/` (lint rule or a test that greps).
**Not in this stage**: CIF, symmetry, KPOINTS, any UI.

## M3.2 KPOINTS generation

**Goal**: Correct KPOINTS files and mesh sizes from a structure and a target density, with honest handling of the one rule that is not yet calibrated.
**Depends on**: M3.1
**Size**: M
**Sources**: S-007, S-019, S-042
**Deliverables**:
- `src/lib/vasp/kpoints.ts`: `meshFromKspacing(lattice, kspacingInvA, rule)`, `meshFromResolution(lattice, resolution2PiInvA, rule)` (VASPKIT "resolution" in units of 2 pi/Angstrom, so spacing = 2 pi x resolution), `meshFromLength(lattice, length)` (VASP `Auto` mode, with |b| **without** 2 pi: `N_i = max(1, int(length x |b_i| + 0.5))`, recalled from the VASP wiki KPOINTS page and flagged unverified (Q-018)), `type RoundingRule = 'ceil' | 'round' | 'plus0.999'`, default `ceil` (D-016).
- Mesh coordinates: `monkhorstPackCoords(n)` = `(2r - n - 1)/(2n)`, `gammaCoords(n)` = `i/n` folded to (-1/2, 1/2].
- Writers with exact VASP text: Gamma-centred / Monkhorst-Pack with optional shift, `Auto` length mode, explicit list (`Reciprocal` or `Cartesian`, weights), line mode (`Line-mode`, `Reciprocal`, point pairs with `! label` comments), Gamma-only (`1 1 1`).
- `meshSymmetryRisk(lattice, kind, n)`: true when a Monkhorst-Pack mesh with even `n` is known to break the lattice symmetry. Implemented by explicit metric tests, not by the generic metric class: hexagonal metric (a = b, gamma = 120 or 60 degrees, alpha = beta = 90) and fcc-primitive metric (a = b = c, all angles 60 degrees) return true for even `n`; bcc-primitive (angles 109.47 degrees) and orthogonal cubic return false, as the golden data shows (`mesh_point_group_symmetry`: Mg and fcc Cu break at even N, sc and bcc do not). Gamma-centred meshes always return false.
- `recommendCentering(structure)`: returns `{ centering: 'gamma' | 'either', reason }`: `gamma` for hexagonal, trigonal (rhombohedral) and fcc-primitive metrics, otherwise `either`. The reason text cites the handbook rule "use Gamma-centred meshes for hexagonal and trigonal cells" (S-042) and, for hexagonal and fcc-primitive cells only, the measured symmetry breaking of even Monkhorst-Pack meshes (Q-017). It must not claim measured breaking for other rhombohedral cells, which the golden data do not cover.
- `kpointCount(mesh)` and a clear note that the irreducible count needs symmetry (M4.5, M5.1).
- A parser `parseKpoints(text)` for the same formats (needed by the validator and the convergence helper).
**Tasks**:
1. Pure functions and tests first. 2. Text writers with snapshot strings written by hand from the VASP file format (comment line, `0`, `Gamma`, `n n n`, `s s s`). 3. `recommendCentering` using the metric class from M3.1. 4. Document the three rounding rules and the calibration protocol (Q-004) in code comments and in the report.
**Tests and reference values**:
- Meshes: `monkhorstPackCoords` and `gammaCoords` equal `tests/reference/pw_kmesh_reference.json` `mp_and_gamma_coordinates` for N = 1 to 6.
- KSPACING: for each entry of `kspacing_candidates`, `meshFromKspacing` with each of the three rules equals the golden `mesh_rule_ceil`, `mesh_rule_round_half_up`, `mesh_rule_int_plus_0p999` (cells: fcc Cu primitive, hex a = 3.0 c = 5.0, Si primitive).
- The Q-004 calibration cases (fcc Cu primitive, a = 3.61, KSPACING 0.3, 0.28, 0.30145) are in the golden file; expected meshes per rule: ceil 11/11/11, round-half-up 10/11/10, int(x + 0.999) 11/11/10. The test reads them from the file.
- Any mesh for a 1x1x1-like tiny reciprocal vector is at least 1.
- `meshSymmetryRisk` reproduces every `monkhorst_pack_symmetric` boolean in `mesh_point_group_symmetry` (systems hcp Mg, fcc Cu primitive, sc, bcc Fe primitive; n = 2, 3, 4, 5, 6, 8): risk is `!monkhorst_pack_symmetric`.
- `recommendCentering` returns `gamma` for `hex_ideal`, `hex_tall`, `fcc_primitive` and `rhombohedral` in `bz_geometry.json`; `either` for `sc`, `tetragonal` and `orthorhombic`.
- Text snapshots: Gamma 4 4 4:
```
Automatic mesh
0
Gamma
 4 4 4
 0 0 0
```
**Done when**:
- [ ] All golden comparisons pass without edits to golden files.
- [ ] The default rule is `ceil` and the UI-facing function returns which rule it used.
- [ ] The report states plainly that Q-004 is open and what the author must run.
**Not in this stage**: UI, k-path generation (M5), irreducible counting (M4.5).

## M3.3 INCAR data model, presets and handbook extraction

**Goal**: A structured, level-aware database of INCAR tags and task presets built from the author's handbooks, plus an INCAR parser and writer.
**Depends on**: M3.1
**Size**: L
**Sources**: S-019, S-041, S-042, S-020
**Deliverables**:
- `scripts/build/extract-handbooks.mjs` (Node, uses Playwright's Chromium already installed, `PW_CHROMIUM_PATH`): opens each HTML file from `docs/source-material/` and exports JSON to `scripts/__generated__/` (git-tracked, reviewed): from the Field Handbook the data constants `OUT` (16 file entries), `INP` (4), `TAGS` (24), `TROUBLE` (22), `RECIPES` (7) with their `fixed` (correction) records; from the Workflow Handbook the tag dictionary table (53 rows), the error index table (20 rows), every `pre.incar` block with its figure caption (15 blocks: 11 complete INCARs: relaxation, SCF, band route B (`ICHARG = 11`), optics, elastic, phonon `each displacement`, DFPT dielectric, Bader, r2SCAN, mBJ, HSE06; two fragments meant to be merged into a template: the `+U block` and the `MAGMOM` supercell example; and two phonopy files that use the same styling: `band.conf` and `mesh.conf`, which must be classified as non-INCAR), the protocol box ("Your protocol (fixed)", five steps), the VASPKIT command map tables.
- `src/data/vasp-tags.json` (target at least 60 tags: all 53 dictionary rows split into single tags such as LDAUL/LDAUU/LDAUJ, plus the 24 Field Handbook tags merged, plus tags needed by presets), schema:
```ts
interface TagInfo {
  name: string; aliases?: string[];
  group: 'accuracy' | 'electronic' | 'ionic' | 'smearing' | 'spin' | 'dos' | 'restart' | 'output' | 'parallel' | 'mixing' | 'optics' | 'dielectric' | 'dftu' | 'metagga' | 'hybrid' | 'vdw' | 'soc' | 'symmetry' | 'kpoints' | 'slab';
  type: 'int' | 'real' | 'bool' | 'string' | 'int-array' | 'real-array' | 'string-array';
  default: string;            // as VASP states it, plain text, with its condition
  typical: string;
  vaspVersion: string;        // '5.4+', '6.3+', ...
  summary: { beginner: string; intermediate?: string; pro?: string };
  why: string;                // why this value
  breaks: string;             // what goes wrong if it is wrong
  tasks: string[];            // preset ids that use it
  related: string[];          // other tag names
  handbook: string | null;    // topic id when the page exists (filled in M7; null is allowed until then)
  sources: string[];          // S-ids
  fromHandbook: ('field' | 'workflow')[];
  corrections?: { was: string; now: string }[];
}
```
  Beginner text is **written fresh** in plain language (do not paste the handbook sentences); intermediate and pro text may stay close to the handbook's facts, shortened.
- `src/data/incar-presets.json`: presets `relax`, `static`, `dos`, `band` (route A for VASP >= 6.3 with `KPOINTS_OPT`, route B with `ICHARG = 11`), `convergence`, `spin`, `dftu`, `hybrid`, `vdw`, `elastic`, `optics`, `phonon-finite-displacement`, `dielectric`, `bader`, `r2scan`, `mbj`. Each preset: ordered tags with value, an inline comment (why), which values are placeholders the user must set (`ENCUT = <1.3 x ENMAX>`, `MAGMOM = <one value per atom>`), the stage of the protocol it belongs to, the prerequisite files (CHGCAR, WAVECAR), and `sources`. The default presets reproduce the author's protocol (Workflow Handbook "Your protocol (fixed)") faithfully.
- `src/lib/vasp/incar.ts`: `parseIncar(text)` (tags case-insensitive, `#` and `!` comments, `;` separators, `.TRUE.`/`.T.`/`T`, repeat syntax `2*5.0 4*0.6`, line continuation `\`; returns tags in file order plus warnings for duplicates), `writeIncar(entries, {comments})`, `expandRepeats`, `magmomCount`.
**Tasks**:
1. Write and run the extraction script; commit the generated JSON; review a sample of 10 entries against the HTML by eye.
2. Build `incar.ts` with tests (including every extracted INCAR block: parse then write then parse gives the same tags).
3. Author the tag database: start from the extraction, restructure, write beginner text, assign groups, set `vaspVersion` conservatively (use "6.x" unless the handbook says otherwise, and say "unchecked" in `notes` when unsure; do not invent minimum versions).
4. Author the presets from the extracted INCARs and the protocol; keep their comments.
5. Validate JSON with a Zod schema in a test (import `z` from `astro/zod`, which ships with Astro; do not add `zod` separately); every tag name referenced by presets or `related` exists; every `sources` ID exists in the register (guard).
**Tests and reference values**:
- Extraction counts: 16 / 4 / 24 / 22 / 7 for the Field Handbook; 53 dictionary rows; 20 error rows; 15 `pre.incar` blocks classified as 11 INCARs, 2 fragments, 2 phonopy configs (fail loudly if the handbook changes).
- Parser: repeat syntax `MAGMOM = 2*5.0 4*0.6` expands to `[5,5,0.6,0.6,0.6,0.6]`; `magmomCount` equals 6; `.TRUE.`, `.T.`, `T` all parse as true; comments; duplicate tags warn.
- Every extracted handbook INCAR (and fragment) round-trips through `writeIncar`.
- The `fixed` records survive extraction (count equals the number of `fixed` entries in the data, computed in the test from the JSON, not typed).
**Done when**:
- [ ] At least 60 tags with complete fields; no empty `beginner` text; lint clean.
- [ ] All presets exist, parse, and contain only known tags.
- [ ] Extraction is reproducible (`node scripts/build/extract-handbooks.mjs` regenerates identical JSON).
- [ ] Report lists any handbook entry that was left out and why.
**Not in this stage**: validation rules (M3.4), UI (M3.5).

## M3.4 INCAR validation rules engine

**Goal**: A rule engine that catches risky or inconsistent INCAR/KPOINTS/POSCAR combinations, with every rule sourced, explained, tested and (where possible) fixable in one click.
**Depends on**: M3.2, M3.3
**Size**: L
**Sources**: S-019, S-041, S-042
**Deliverables**:
- `src/lib/vasp/validate.ts`: `validate(ctx): Issue[]` where `ctx = { incar, kpoints?, structure?, enmaxEv?, zvalBySpecies?: Record<string, number>, systemType?: 'metal' | 'semiconductor' | 'insulator' | 'slab' | 'molecule' | 'unknown', cores?: number, vaspVersion?: '5.4' | '6.3' | '6.4' }` (ENMAX and ZVAL are typed by the user from `grep ENMAX POTCAR` / `grep ZVAL POTCAR`; the site never reads a POTCAR) and
```ts
interface Issue { rule: string; severity: 'error' | 'warn' | 'info'; title: string; why: string; fix?: { label: string; apply: (incar) => incar }; source: string[]; handbook?: string; vasp: string }
```
- `src/lib/vasp/rules/*.ts`: one file per group, each rule a small object with `id`, `title`, `check`, `source`.
- Rule IDs are stable and documented in `docs/reports/M3.4.md` with: what it checks, the handbook entry or VASP wiki page it comes from, the test that triggers it and the test that proves it stays silent on valid input. **A rule without a source does not ship.**
**Initial rule set** (each is grounded in the handbooks; ID, check, severity, source):
| ID | Check | Sev. | Origin |
|---|---|---|---|
| V001 | MAGMOM entry count != NIONS (3 x NIONS when LSORBIT or non-collinear) | error | Workflow dictionary MAGMOM; Field `magmom` |
| V002 | MAGMOM present but ISPIN != 2 | warn | Field `ispin` |
| V003 | ISPIN = 2 without MAGMOM on a system with d/f elements (default moments may collapse) | warn | Field troubleshooting t-moment |
| V004 | ISMEAR = -5 with fewer than 4 k-points | error | t-tetra |
| V005 | ISMEAR = -5 with NSW > 0 when `systemType` is `metal` or `unknown` | warn | Workflow dictionary ISMEAR ("not for metal forces") |
| V006 | ISMEAR absent or >= 1 for semiconductor/insulator (VASP default is 1) | warn | Workflow protocol step 2 |
| V007 | SIGMA > 0.1 with ISMEAR = 0 for semiconductor/insulator | warn | dictionary SIGMA; t-entropy |
| V008 | ENCUT < ENMAX (user-supplied) | warn | Field `encut` |
| V009 | ISIF >= 3 or IBRION = 6 with ENCUT < 1.3 x ENMAX | warn | protocol step 1; t-pulay |
| V010 | NSW > 0 and IBRION absent | error | t-md |
| V011 | IBRION = 6 with ISIF < 3 | warn | protocol step 4 |
| V012 | IBRION in 5 to 8 with NSW != 1 | warn | dictionary NSW |
| V013 | NCORE set with IBRION in 6, 7, 8 or LEPSILON or LELF | warn | protocol step 4; dictionary NCORE |
| V014 | EDIFFG < 0 with |EDIFFG| <= 0.001 and EDIFF > 1E-7 | warn | relaxation INCAR comment: EDIFF "1E-7 to 1E-8 when EDIFFG = -0.001" |
| V015 | EDIFFG > 0 and EDIFF > 0.1 x EDIFFG | warn | dictionary EDIFFG |
| V016 | LDAU arrays (LDAUL, LDAUU, LDAUJ) length != number of species | error | dictionary LDAUL |
| V017 | LDAU = .TRUE. without LASPH = .TRUE. | warn | dictionary LASPH |
| V018 | LDAU or ICHARG = 11 on d (f) systems with LMAXMIX < 4 (6) | warn | dictionary LMAXMIX |
| V019 | METAGGA set without LASPH = .TRUE. | error | dictionary METAGGA/LASPH |
| V020 | METAGGA together with a GGA tag | warn | dictionary METAGGA |
| V021 | LEPSILON with LHFCALC | error | dictionary LEPSILON |
| V022 | LOPTICS without NBANDS (needs about 2 to 3 times the default), or EDIFF > 1E-6, or NEDOS < 2000 | warn | protocol step 5; dictionary |
| V023 | ISIF = 3 for slab or molecule | error | t-slab; dictionary ISIF |
| V024 | LREAL not .FALSE. with IBRION 5 to 8 or LEPSILON | warn | dictionary LREAL ("use .FALSE. for phonons, elastic") |
| V025 | ICHARG = 11 | info | "ISTART and ICHARG" rule: list what must match the SCF (ENCUT, ISPIN, MAGMOM, LMAXMIX, functional, LDAU, cell) |
| V026 | ICHARG < 10 with line-mode KPOINTS, unless VASP >= 6.3 with `KPOINTS_OPT` | error | protocol step 3 (wiki rule quoted there) |
| V027 | LHFCALC with (AEXX, HFSCREEN) other than (0.25, 0.2) HSE06 or (0.25, 0) PBE0 | info | dictionary HFSCREEN |
| V028 | LHFCALC = .TRUE. with ALGO Normal or Fast | info | dictionary ALGO (All or Damped recommended for hybrids; the handbook HSE06 INCAR uses Damped) |
| V029 | KPOINTS Monkhorst-Pack with `meshSymmetryRisk` true (even N on hexagonal or fcc-primitive cells) | warn | Workflow table (see Q-017) + `mesh_point_group_symmetry` golden |
| V030 | LSORBIT = .TRUE. | info | dictionary: needs the non-collinear executable |
| V031 | LREAL = .FALSE. with more than about 20 atoms and no IBRION 5 to 8 or LEPSILON | info | dictionary LREAL ("Auto for > ~20 atoms"); t-slow |
| V032 | NBANDS too small, with NELECT = sum of user-entered ZVAL x atoms: **error** if NBANDS < ceil(NELECT/2) (ISPIN = 1 or 2) or NBANDS < NELECT (LSORBIT or LNONCOLLINEAR); **warn** for ISPIN = 2 if NBANDS < ceil((NELECT + |sum MAGMOM|)/2) (the majority-spin channel needs that many bands) | error / warn | dictionary NBANDS ("must exceed occupied bands") |
| V033 | KPAR does not divide the core count (when `cores` given) | warn | dictionary KPAR ("divides cores") |
Add rules only with a source. The fix functions must be pure (return a new INCAR).
**Tasks**:
1. Rule infrastructure and `Issue` rendering helpers; tests for the engine itself.
2. Implement rules group by group; for each, write the failing and passing test first.
3. **False-positive test**: run `validate` on every INCAR extracted from the author's handbooks, with fragments merged into the `static` preset first (with a plausible `ctx` per block: a structure with as many atoms as MAGMOM entries, the species of the `+U` caption, systemType `semiconductor`). **None may produce an `error`.** Every `warn`/`info` result is listed in the report with an explanation. Expected example: V018 warns on the band route B INCAR (`ICHARG = 11`, d-element MAGMOM, no LMAXMIX), which matches Q-019.
4. Document the VASP version column for every rule; where a rule is version dependent (V026 and `KPOINTS_OPT`), encode it.
5. Write the user-facing text (`why`) at beginner level with the intermediate depth in an optional field.
**Tests and reference values**:
- One positive and one negative test per rule ID (33 x 2). Expected outcomes come from the rule table above, not from running the code.
- The false-positive suite above.
- V009: ENMAX 400 gives threshold 520; ENCUT 500 warns; ENCUT 520 does not.
**Done when**:
- [ ] 33 rules implemented with sources; any rule dropped for lack of a source is listed with a Q number.
- [ ] False-positive suite passes (zero errors on the author's own INCARs).
- [ ] Every issue carries source IDs that exist in the register.
**Not in this stage**: UI.

## M3.5 Input Builder UI

**Goal**: The first research tool: a page where a user turns a structure and a task into an INCAR, KPOINTS and job script, with live validation and plain-language tag cards.
**Depends on**: M3.4, M1.3
**Size**: L
**Deliverables**:
- Add `fflate@0.8.3`.
- `/tools/input-builder/` (React island, `client:load` on this page only): steps (1 Structure, 2 Task, 3 Settings, 4 Check, 5 K-points, 6 Job script and download), responsive: stepper on mobile, two-column (editor and explanation) on desktop.
- Structure step: drop or paste POSCAR/CONTCAR (size cap 25 MB, parsed in the page), or take a hand-off; shows formula, atoms, volume, lattice parameters, cell type, species order with a loud "POSCAR order is the order for MAGMOM and LDAU values".
- Task step: preset chooser with one-paragraph descriptions and prerequisites (needs CHGCAR from SCF etc.); system type selector (metal, semiconductor, insulator, slab, molecule, unknown) feeding the validator; user enters ENMAX (helper text: how to get it with `grep ENMAX POTCAR` and that this site never needs POTCAR content); computed ENCUT suggestion shown with its reason: 1.3 x ENMAX for relaxation, elastic and EOS work, and for every other task the same ENCUT as the relaxation it builds on (the author's protocol keeps one ENCUT across relax, SCF, DOS and bands; the dictionary: "keep it identical in every calculation you compare"); never below ENMAX.
- Settings step: table of tags with value editors, **tag cards** (summary at the current level, why this value, default, typical, what breaks, related tags, link placeholder to the handbook), search/filter by group, "reset to preset", add tag from the database; MAGMOM helper (per-species values expanded to per-atom, with the 2*5.0 4*0.6 compressed form and the count shown); LDAU helper (per-species table).
- Check step: validator output grouped by severity with fix buttons; errors block "Download" unless the user ticks "I understand"; shows VASP version selector (5.4, 6.3, 6.4).
- K-points step: mode (Gamma, Monkhorst-Pack, line mode placeholder linking to the k-path tool, KSPACING in INCAR), target spacing or resolution slider, mesh readout and number of k-points, centering recommendation with its reason, warning that the rounding rule is awaiting calibration (Q-004) and what rule is used.
- Job script step: SLURM or PBS template with editable fields (job name, nodes, tasks per node, walltime, partition/queue, modules, executable `vasp_std`/`vasp_gam`/`vasp_ncl`, `mpirun` or `srun`), parallel tags suggestions (NCORE/KPAR) given cores; **POTCAR section**: shows how to build it (`cat` command for the species order, license note), never any POTCAR content.
- Downloads: individual files and a zip (INCAR, KPOINTS, POSCAR, job script, README with the exact POTCAR instructions) built with fflate in the page.
- URL-fragment share of settings (no structure content over 2 KB), copy buttons.
- `src/lib/vasp/jobscript.ts`: pure template functions for SLURM and PBS with tests (exact text).
**Tasks**:
1. Build state with a small zustand store (React side) and pure selectors; no logic in components.
2. Implement steps in order; after each step add its e2e test.
3. Accessibility: every control labeled; validator list is a live region (polite) that announces count changes; keyboard-only completion of the whole flow is an e2e test.
4. Lighthouse and bundle: the island plus libs must stay within the 200 KB budget; report sizes.
**Tests and reference values**:
- Job script text snapshots (hand-written expected strings, documented SLURM/PBS directives).
- e2e: load the fcc Cu POSCAR fixture, choose relax, enter ENMAX 400, see ENCUT 520, see no errors, download the zip, unzip in the test and check the files; hexagonal fixture with Monkhorst-Pack even shows V029; break MAGMOM count shows V001 and the fix works.
- The zip never contains a file named POTCAR (asserted).
**Done when**:
- [ ] Complete flow works by keyboard and touch at 360 px; axe clean in both themes.
- [ ] Validator issues from M3.4 all render with title, why, source link and fix.
- [ ] Lighthouse mobile >= 95 (record) and budget met.
- [ ] The tool states its VASP version target and that it generates inputs, not guarantees.
**Not in this stage**: convergence series (M4.2), line-mode k-paths (M5.6), screening hand-offs (M9).

## M3.6 Clickable file explorer

**Goal**: A reusable lab component that shows a real VASP file and explains every line on click, used throughout modules 6 and 7.
**Depends on**: M3.3, M1.2
**Size**: S
**Deliverables**:
- `src/components/labs/FileExplorer.tsx`: props `{ kind: 'POSCAR' | 'KPOINTS' | 'INCAR' | 'OSZICAR' | 'OUTCAR-excerpt', text, annotations }`; monospace display; each annotatable line or token is a button; the side panel shows the explanation (beginner, intermediate, pro text), the related tag card for INCAR tags (from `vasp-tags.json`) and the "what if it were different" note; keyboard: arrow keys move between annotated lines, Enter opens, Escape closes.
- `src/lib/vasp/annotate.ts`: builds default annotations: POSCAR (comment, scale, each lattice vector, species, counts, selective dynamics, Direct/Cartesian, coordinates), KPOINTS (each line of each mode), INCAR (every tag from the database, unknown tags flagged "not in the database"), OSZICAR lines (reuses M4.1 when available; before that only POSCAR/KPOINTS/INCAR).
- MDX wrapper `<VaspFileExplorer file="..." />` for use in topics; example topic stubs not required.
- A POTCAR panel: a fixed, short explanation of a POTCAR's header **structure only** (which fields exist and what they mean: `TITEL`, `ZVAL`, `ENMAX`, `ENMIN`, `LEXCH`...) using invented-free, generic descriptions, with no real dataset text.
**Tasks**: build `annotate.ts` with tests, then the component, then axe and keyboard e2e.
**Tests and reference values**:
- Annotations for the fcc Cu primitive POSCAR fixture (one atom): all 9 lines annotated (comment, scale, three lattice vectors, species, counts, Direct, one coordinate); for an INCAR with an unknown tag the unknown tag is flagged; every INCAR tag in the relax preset has an annotation.
**Done when**:
- [ ] Works with mouse, keyboard and touch; axe clean; the POTCAR panel contains no dataset text (guard passes).
- [ ] Reusable from MDX with a one-line import.
**Not in this stage**: module 6 prose (M7.3).
