# DFT Studio

One browser tool for a full VASP workflow. It merges three earlier tools:

- **VESTA-Web** (crystallographic editor and 3D viewer). This is the base: the layout, the theme, the viewer and all structure tools (supercells, slabs, defects, heterostructures, symmetry, magnetic configurations).
- **VASPKIT Studio** (lab tool). Supplies the POTCAR, INCAR, KPOINTS and run-bundle steps, the 350-structure crystal library, the VASPKIT function finder, and the post-processing tools.
- **k-point convergence kit**. Becomes step 5. Its generator logic is unchanged (`js/kconv-core.js`).

## Workflow

The step bar under the header runs left to right. Every step reads the live structure in the 3D viewer, so if you edit the structure later, every file updates.

| Step | What you do | Output |
|---|---|---|
| 1 Structure | Load a sample, the library, or your own POSCAR / CIF / XYZ. Edit the cell and set spins in the Magnetic tab. | POSCAR, MAGMOM |
| 2 POTCAR | Pick a variant for each species (the recommended one is preselected). | `make_potcar.sh`, ENCUT = 1.3 x max(ENMAX), NELECT |
| 3 INCAR | Pick a preset (VASPKIT style), then add magnetism, DFT+U, SOC, vdW or the dipole correction. Edit any tag. | INCAR |
| 4 KPOINTS | Choose a mesh from k-spacing, an explicit mesh, or a band path (built in, or SeekPath). | KPOINTS |
| 5 k-Convergence (optional) | Set up the convergence series, then load the CSV back to pick the mesh. | `kpoint_convergence.py`, trimmed INCAR, README |
| 6 Run bundle | Review the pre-flight checks, then pick a scheduler and an optional ENCUT sweep. | `<job>.zip` |
| 7 Analyze (optional) | Plot DOS, bands and gap, energy convergence, planar average, phonons, EOS, elastic moduli, thermochemistry and MD diffusion. | plots and numbers |

- Press **Ctrl+K** to jump to any VASPKIT function by number (for example 303) or by name.
- The "?" buttons explain each choice.

## Conventions (stated in the UI)

- **k-spacing:** N_i = max(1, ceil(|b_i| / (2 pi x spacing))), with |b_i| including 2 pi. This is the VASPKIT convention.
- **k-convergence series:** N_i = max(1, floor(L / a_i + 0.5)). This matches the original kit.
- **EOS:** a polynomial in V^(-2/3). With 5 or more points it is the 3rd-order Birch-Murnaghan fit (B0 and B0'). With fewer points it is the 2nd-order fit (B0' = 4).
- **Band paths:** Setyawan-Curtarolo coordinates refer to the primitive cell. The UI warns about centred lattices.

## POTCAR licensing

POTCAR files are licensed by VASP Software GmbH. They are **never shipped** with this tool and must never be committed.

- `data/pp_index.js` holds only header metadata (TITEL, ZVAL, ENMAX and similar), which is enough to choose variants and set ENCUT.
- The bundle contains `make_potcar.sh`, which builds POTCAR on the cluster from `VASP_PP_PATH`.
- **Lab-internal copies only:** put the licensed library in `data/potcars/<FUNCTIONAL>/<variant>.js` and set `window.PP_LOCAL_LIBRARY = true` in `data/pp_local.js`. The POTCAR and bundle steps can then include the real file. `data/potcars/` is in `.gitignore`.

## Running it

It is a static site with no build step. Serve the folder with any static server, for example:

```
python -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` straight from disk also works.

Network use:

- Tailwind, three.js, lucide, Plotly and JSZip load from CDNs.
- The optional Python engine (Pyodide with spglib, SeekPath and phonopy) downloads about 30 MB the first time it is used. It runs entirely in the browser.

## Files

```
index.html            page (VESTA-Web layout + step bar + step pane + modals)
css/vesta.css         VESTA-Web theme and tokens
css/studio.css        workflow layer, built on the same tokens
js/vesta.js           viewer and structure editor; exposes window.VESTA (bridge)
js/studio-data.js     presets, tag help, POTCAR suffix guide, VASPKIT catalog
js/studio.js          step bar, POTCAR, INCAR, KPOINTS, run bundle, library, Ctrl+K
js/kconv-core.js      k-point convergence generator (unchanged logic)
js/studio-kconv.js    step 5 UI and CSV results reader
js/studio-analyze.js  step 7 analyzers
js/wasm_engine.js     Pyodide engine (spglib, SeekPath, phonopy, NumPy)
data/                 crystal library, POTCAR header index, local library switch
```
