# Screening Studio data pipeline (for the author)

This folder turns Materials Project data into the small files the Screening Studio loads in the browser. **You run it once**, on your own computer, with your own Materials Project API key. The key stays in your shell: it never goes into a file, the repository, CI or the browser.

You do not need to read the code. Follow the steps below in order.

## What you need

- Python 3.12 or newer (`python3 --version`). mp-api 0.47.0 needs 3.12 or newer.
- A Materials Project account and API key, from your dashboard on materialsproject.org (the "API" page).
- About 1 GB free disk for the Python packages and the raw download.

## Steps

Run these from the repository root (the folder with `package.json`).

1. Create a virtual environment and install the pinned packages (about 2 minutes):

   ```bash
   python3 -m venv .venv-mp
   ```

   ```bash
   source .venv-mp/bin/activate
   ```

   ```bash
   pip install -r scripts/mp/requirements.txt
   ```

2. Optional, but a good first check: a dry run with synthetic data. It needs no key and no network:

   ```bash
   python scripts/mp/fetch.py --mock
   ```

   ```bash
   python scripts/mp/build_shards.py
   ```

   This writes to `scripts/mp/.cache/mock-out/mock/` (git-ignored) and prints `synthetic: true`. Nothing in `public/` changes.

3. Put your key in this shell only. Do not write it into any file, including `.env`:

   ```bash
   export MP_API_KEY=paste-your-key-here
   ```

4. Fetch (typically 5 to 20 minutes, depending on the server and your connection):

   ```bash
   python scripts/mp/fetch.py --config scripts/mp/config.yaml
   ```

   It prints the database version the server serves, for example `2026.04.13`. The raw answers go to `scripts/mp/.cache/raw-<version>.json` (git-ignored). If `config.yaml` pins a different `db_version`, the script stops and tells you what to do (see "If something fails" below).

5. Build the published files:

   ```bash
   python scripts/mp/build_shards.py
   ```

   This writes `public/data/mp/<version>/` (manifest, index and structure shards) and `public/data/mp/current.json`. It validates them straight away and prints the number of materials and the total gzipped size.

6. Validate everything once more (the sample data are checked too):

   ```bash
   python scripts/mp/validate.py
   ```

   Every line should start with `OK`.

7. Pin the version you used, so a later rerun gets the same database: set `db_version: "<version>"` in `scripts/mp/config.yaml`.

8. Confirm the licence. Check the Materials Project terms page. If the data licence is not CC BY 4.0, or the attribution they ask for differs, edit `licence` and `attribution` in `config.yaml`, then run step 5 again with `--force`. Write what you confirmed in `docs/OPEN_QUESTIONS.md`, Q-009.

9. Commit the data. Do not commit `.cache/` or `.venv-mp/`; both are ignored.

   ```bash
   git add public/data/mp/current.json public/data/mp/<version>/ scripts/mp/config.yaml docs/OPEN_QUESTIONS.md
   ```

   ```bash
   git commit -m "feat(data): Materials Project snapshot <version>"
   ```

You can close the shell afterwards; the key goes with it. Running `unset MP_API_KEY` also works.

## What to expect

- **Index:** every material that passes the `index` filters in `config.yaml` gets one row: formula, elements, stability, band gap, magnetism and space group. It has no structure. The budget is 1.5 MB gzipped. A simulation with random values came out at about 27 gzipped bytes per row, so roughly 55,000 materials fit. The real count is known only after the fetch.
- **Starter structures:** materials that pass the `starter` filters (energy above hull at most 0.025 eV/atom, at most 20 sites) also ship their structure. They come in shards of about 100 KB gzipped each.
- **Total:** at most 10 MB gzipped. The budgets live in `scripts/mp/schema.json` (`x-budgets`).
- **Skipped records:** records with missing values or partially occupied sites are skipped. The counts are written into `manifest.json` under `source.skipped`.

## If something fails

Send back:

- the full terminal output of the failing command (check that your key is not in it);
- the output of `python --version` and `pip freeze | grep -E "mp-api|emmet|pymatgen"`;
- the first 30 lines of `scripts/mp/.cache/raw-*.json` if it exists. That file holds only data, never the key.

Common cases:

| Message | What to do |
|---|---|
| `MP_API_KEY is not set` | Run step 3 in the same shell where you run fetch. |
| `config pins db_version X but the API serves Y` | The REST API serves only its current version. Set `db_version: "Y"` in `config.yaml`, or pass `--accept-db-version` if you really want Y. |
| `gave up after 4 attempts` | The server or network was down. Wait and run step 4 again. |
| `over-budget: index.json ...` | Too many materials. Lower `index: energy_above_hull` (for example to `[0, 0.03]`) or `num_sites` in `config.yaml`, then run steps 4 to 6 again. |
| `exists; pass --force` | You built this version before. Add `--force` to step 5 to replace it. |

## Files

| File | Purpose |
|---|---|
| `config.yaml` | Filters, element exclusions, db_version pin, licence and attribution. The only file you normally edit. |
| `requirements.txt` | Exact package versions. |
| `fetch.py` | Queries the API with retries and backoff, then writes the raw cache. Reads the key only through mp-api. |
| `build_shards.py` | Raw cache to `index.json`, `s/NNN.json` and `manifest.json` (hashes and sizes). |
| `validate.py` | Schema, value ranges, unique ids, shard entries, hashes and budgets. `src/lib/mp/validate.ts` runs the same checks in TypeScript. |
| `make_sample.py` | Writes the synthetic sample to `public/data/mp/sample/`. Builders use it; you do not need it. |
| `schema.json` | The JSON Schema shared by Python and TypeScript. |
| `mpdata.py` | Shared code. |
| `tests/` | Unit tests: `python -m unittest discover -s scripts/mp/tests`. They never touch the network. |

The live site never ships the sample: the deploy workflow deletes `dist/data/mp/sample` and then `scripts/build/check-real-data.mjs` refuses any manifest that is not `synthetic: false`.
