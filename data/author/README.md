# Author-supplied example data

Put trimmed example outputs from your own VASP calculations here, ideally from the NdCuO3 or another RCuO3 family member you studied. They are used to (a) check that the parsers read real files, and (b) build the worked example in module 10 with **real** numbers instead of an "Illustrative data" badge. Until files appear, builders use fixtures written to the documented formats and say so (Q-008).

## What helps most

| File | Why | Size guidance |
|---|---|---|
| `POSCAR` / `CONTCAR` (relaxed) | structure for the viewers and the Input Builder | tiny |
| `INCAR`, `KPOINTS` for relax, SCF, DOS, bands | real settings for the worked example | tiny |
| `OSZICAR` from a convergence series (several ENCUT or k-mesh runs) | convergence plotter validation | small |
| `OUTCAR` excerpts from the same runs | OUTCAR parser validation. See trimming rules below | trim to a few hundred KB |
| `DOSCAR`, `EIGENVAL` (and `KPOINTS` of the band run) | DOS and band builder | up to about 3 MB each |
| `XDATCAR` or a relaxation `OSZICAR`+`OUTCAR` | ionic relaxation viewer | small |
| `CHGCAR` or `CHG` for one case, ideally on a coarse grid | charge-density viewer | up to about 5 MB, otherwise subsample (tell the builder how) |

## Rules

1. **No POTCAR, ever.** Do not paste any POTCAR file or the pseudopotential body. The guard rejects it.
2. **Trim OUTCAR.** Keep the header up to the INCAR echo, one block of the electronic steps, the final energies, forces, stress and the "reached required accuracy" line. Delete the POTCAR parameter echo (the lines beginning `POTCAR:` and the `PAW_PBE ...` parameter blocks) if you are unsure about licence terms.
3. Name files so the content is obvious: `rcuo3-ndcuo3/relax/POSCAR`, `rcuo3-ndcuo3/conv/encut_450/OSZICAR`, and add a short `README.txt` per folder: VASP version, functional, any +U, how the run was made (VASPKIT task codes if used).
4. Say whether each file may be published on the website under the site's licence. If not, put it in `data/author/raw/` (git-ignored) and the builder will use it only for local testing.
5. Keep individual files under 5 MB; Firebase hosting transfer is limited, and examples are downloaded on demand.

Files placed here are copied (trimmed) to `public/examples/` by stage M7.5 or M7.6, which records exactly what was published.
