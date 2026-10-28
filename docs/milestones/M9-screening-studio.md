# M9 Screening Studio (Materials Project powered)

Goal of the Studio: a beginner who has learned the basics picks a sensible first DFT project. Data come from a pipeline the **author** runs once with their own Materials Project API key; the key never enters the repository, CI or the browser. Builders write and test the pipeline against mocks and ship clearly synthetic sample data until the author's real data are committed; the deploy workflow refuses synthetic data on the live site (`scripts/build/check-real-data.mjs`).

Verified in planning (reading `mp-api 0.47.0` and `emmet-core 0.88.1` source, S-044): the client is `from mp_api.client import MPRester`, search via `mpr.materials.summary.search(...)` with range filters such as `energy_above_hull=(min, max)`, `band_gap=(min, max)`, `num_sites=(min, max)` (maps to `nsites`), `num_elements`, `elements`, `exclude_elements`, `is_stable`, `theoretical`, and a `fields=[...]` list; summary fields include `material_id`, `formula_pretty`, `chemsys`, `elements`, `nelements`, `nsites`, `volume`, `density`, `energy_above_hull`, `formation_energy_per_atom`, `is_stable`, `band_gap`, `is_gap_direct`, `is_metal`, `is_magnetic`, `ordering`, `total_magnetization`, `num_magnetic_sites`, `symmetry`, `structure`, `theoretical`; full-database snapshots are versioned (`db_version`). `mp-api` needs Python >= 3.12.

Size budget (Spark, Q-006): the filter index at most 1.5 MB gzipped; structures are shipped **only** for a curated "starter" subset (default: stable or `energy_above_hull <= 0.025` eV/atom, `nsites <= 20`), sharded at about 100 KB gzipped per shard and fetched on demand; every other material links to its Materials Project page instead of shipping a structure. Total data at most 10 MB gzipped.

## M9.1 Data pipeline, schema, validation and sample data

**Goal**: A reproducible pipeline the author can run in one command, a strict schema shared by Python and TypeScript, a validator, and synthetic sample data for development.
**Depends on**: M5.1
**Size**: L
**Sources**: S-024, S-044
**Deliverables**:
- `scripts/mp/README.md`: exact steps for the author (create a virtualenv with Python 3.12+, `pip install -r scripts/mp/requirements.txt`, `export MP_API_KEY=...` in the shell only, `python scripts/mp/fetch.py --config scripts/mp/config.yaml`, `python scripts/mp/build_shards.py`, `python scripts/mp/validate.py`, commit `public/data/mp/<db_version>/`), expected runtime and size, and what to send back if something fails.
- `scripts/mp/requirements.txt` pinning `mp-api==0.47.0` (and its pymatgen), `scripts/mp/config.yaml` (filters for the index and for the starter subset, fields, element exclusions such as noble gases and radioactive elements with no stable isotopes, a `db_version` to pin).
- `scripts/mp/fetch.py`: queries, retries with backoff, local cache of raw responses (git-ignored), records `db_version`, query, date, client version; never writes the key anywhere.
- `scripts/mp/build_shards.py`: columnar index `index.json` (arrays per field, plus small lookup tables for symbols and space groups) and starter structure shards `s/<shard>.json` (lattice, species, fractional coordinates, plus the full summary record), `manifest.json` with `synthetic: false`, `dbVersion`, `generated`, `count`, `licence`, `attribution`, file hashes and sizes.
- `scripts/mp/validate.py` and the same checks in TypeScript (`src/lib/mp/validate.ts`): JSON Schema in `scripts/mp/schema.json` (shared), value ranges (`energy_above_hull >= 0`, `band_gap >= 0`, `nsites >= 1`), unique ids, every starter id has a shard entry, hashes match, size budgets above.
- `scripts/mp/make_sample.py`: synthetic dataset of about 30 entries using the structures in `tests/reference/kpaths.json` (ids `sample-0001` ...), property values clearly synthetic, `manifest.synthetic: true`; written to `public/data/mp/sample/`. The UI shows a full-width "Synthetic demo data" banner whenever `synthetic` is true.
- `src/lib/mp/schema.ts` types generated from or kept in sync with `schema.json` (a test checks they agree).
- `Q-009` updated with the licence and attribution text the author confirms (believed CC BY 4.0).
**Tasks**: schema first; validator (Python and TS) with fixtures; fetch with a mocked client (`unittest.mock`) so tests never call the network; shard builder; sample generator; README.
**Tests and reference values**:
- Python unit tests (run in the reference virtualenv) for the mocked fetch, shard building and validation, including a corrupted-hash case and an over-budget case.
- TypeScript validator accepts the sample dataset and rejects the same corrupted fixtures.
- `check-real-data.mjs` fails on the sample manifest copied into a fake `dist/` and passes on a fixture with `synthetic: false` (test in `scripts/build/`).
**Done when**:
- [ ] The author can follow the README without reading code; a dry run with `--mock` produces a valid dataset.
- [ ] Sample data validate and are unmistakably synthetic; the deploy gate is tested.
- [ ] Report lists "For the author: run the pipeline" with the exact commands.
**Not in this stage**: UI.

## M9.2 Explorer UI

**Goal**: `/studio/`: filter materials by elements, stability, band gap, size and application preset, and open a material card.
**Depends on**: M9.1, M8.3
**Size**: L
**Deliverables**:
- Data loader: fetch `manifest.json` (revalidated) and `index.json` (cached by the service worker), lazy shard loading, an in-memory columnar filter engine in a worker (`src/lib/mp/query.ts`, pure and tested).
- Filters: include and exclude elements (shared periodic table), number of elements, `energy_above_hull` (default at most 0.05 eV/atom, with an explanation of the hull at beginner level), band gap range, direct gap only, metal/non-metal, magnetic yes/no, number of sites, crystal system and space group, "has starter structure".
- Application presets as labelled filter bundles, not predictions, each with a short rationale and source where one exists (for example a photovoltaic-absorber preset built on a band-gap window; the window's numbers need a source added to the register, otherwise the preset is labelled "rule of thumb, no source yet" and listed in the report; always with the caveat that PBE underestimates gaps); presets can be edited after applying.
- Cost and toxicity flags only from cited data (Q-011): ship the flag columns empty with "data not loaded" if the author has not supplied sources; never invent prices. Radioactive elements (no stable isotopes) may be flagged from the periodic table itself.
- Results: virtualized table (sortable, keyboard navigable) and card view; result count; CSV export of the current selection with attribution.
- Material card: formula, id with a link to the Materials Project page, space group, sites, properties with units and their PBE-level caveats, a structure preview (CellScene) when a starter structure exists, perovskite detection (ABX3 by formula and site count) with a link to the tolerance explorer pre-filled, buttons for feasibility (M9.3) and hand-off to the k-path tool and the Builder.
- Attribution footer on every Studio page (data source, `dbVersion`, date, licence).
**Tasks**: 1. Query engine in a worker with unit tests on the sample data. 2. Filters and presets (with sources or the "no source yet" label). 3. Results table and card view. 4. Material card and hand-offs. 5. Performance measurement with 50k synthetic rows; e2e; attribution footer.
**Tests and reference values**:
- Query engine unit tests on the sample dataset (each filter alone and combined, counts computed by hand from the sample file).
- e2e: filter to a known sample entry, open its card, export CSV; banner visible on sample data; keyboard-only flow; 360 px layout.
**Done when**:
- [ ] Filtering 50k synthetic rows (generated in a test fixture) responds in under 100 ms in the worker (record).
- [ ] Budgets met: the page ships the island, the index loads after first paint.
**Not in this stage**: feasibility rules and project builder.

## M9.3 Feasibility check and first-project builder

**Goal**: For any material, a transparent Green/Yellow/Red feasibility verdict with reasons, and a starter project card that a beginner can actually run.
**Depends on**: M9.2, M3.5, M4.2
**Size**: L
**Sources**: S-042, S-019 (for the PAW table, Q-010)
**Deliverables**:
- `src/lib/mp/feasibility.ts` (all thresholds in one documented table, labelled heuristic, each with its reason):
  - atoms in the primitive cell: up to 10 green, 11 to 30 yellow, above 30 red (cost grows steeply with size);
  - f-electron elements (lanthanides Ce to Lu, actinides) yellow: may need DFT+U, careful spin and long SCF (module 5);
  - magnetic (`is_magnetic`) yellow; `ordering` antiferromagnetic or ferrimagnetic yellow (needs the right supercell and MAGMOM pattern, module 5);
  - metallic (`is_metal`) yellow: dense k-mesh and smearing tests;
  - heavy elements (Z above 54) yellow note: spin-orbit coupling may matter;
  - an element without a recommended PAW potential red (table from Q-010; if the table is not yet available, the rule says "unknown, check your POTCAR library" instead of guessing);
  - rough compute time as an order-of-magnitude bucket (minutes, hours, days, weeks) from atoms, estimated irreducible k-points and the series in the author's protocol, with the formula and assumptions shown and an editable core count.
  The overall colour is the worst rule; every rule shows why.
- First project card (`/studio/project/` with the material id in the URL fragment): structure downloads (POSCAR from the starter shard, CIF), the sequence from the author's protocol (convergence tests, relaxation, static SCF with DOS, bands), INCAR and KPOINTS generated with the Input Builder library for each step (ENMAX entered by the user; ENCUT placeholders until then), the convergence series zip (M4.2), expected runtime bucket, and a sanity-check box: the Materials Project lattice parameters and PBE band gap to compare with the user's result, with the caveats that PBE overestimates lattice constants by about 1 to 2 % and underestimates gaps (S-042).
- Hand-off to the Input Builder (structure) and the k-path tool.
**Tasks**: 1. Feasibility rules table and its tests. 2. Compute-time bucket with the formula shown. 3. Project card using the Input Builder and series libraries. 4. Sanity-check box with caveats. 5. Validator run on generated INCARs; e2e.
**Tests and reference values**:
- Each feasibility rule has positive and negative unit tests; the combination picks the worst colour; a test confirms the PAW rule says "unknown" when the table is missing.
- The project card for a sample entry produces INCARs that pass the M3.4 validator with no errors.
**Done when**:
- [ ] Every verdict is explained in plain language at the current level; nothing claims precision it does not have.
**Not in this stage**: ML estimates.

## M9.4 Hooks, attribution, offline and integration

**Goal**: Finish the Studio: the marked hook for an optional ML column, attribution and licence pages, offline behaviour, cross-links.
**Depends on**: M9.3
**Size**: S
**Deliverables**:
- Schema field `ml_e_above_hull: number | null` with `ml_model` metadata, always null; UI column hidden when all null; a short "Why there is no ML column yet" note (no model can be trained or served on Spark, and an unvalidated model would break the site's honesty rules).
- Data and licence page section (in `/about/`) with the Materials Project citation (S-024), attribution text, `dbVersion`, date.
- Offline: index and visited shards available offline; a clear message when an uncached shard is needed offline.
- Links from module 11 and from the tolerance explorer; the Studio linked in the header.
**Tasks**: 1. Schema hook for the ML column (always null) and the explanatory note. 2. Data and licence section. 3. Offline behaviour and its e2e. 4. Cross-links and header entry.
**Tests and reference values**: offline e2e (visit, go offline, reload, filter still works); attribution visible on every Studio route.
**Done when**:
- [ ] The Studio works end to end with sample data and is ready for the author's real data (one command plus commit).
**Not in this stage**: running the real pipeline (author task).
