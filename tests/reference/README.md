# Golden reference data

Files here are **generated** by the Python scripts in `scripts/reference/` using independent implementations (scipy/Qhull, spglib, seekpath, pymatgen). The TypeScript code must reproduce them with algorithms of its own. Nobody edits them by hand; a hook and `CLAUDE.md` forbid it. To extend: change the generator, run it, commit both.

Regenerate (pinned versions in `scripts/reference/requirements.txt`):

```bash
python -m venv .venv && .venv/bin/pip install -r scripts/reference/requirements.txt
.venv/bin/python scripts/reference/gen_bz_geometry.py
.venv/bin/python scripts/reference/gen_kpaths.py
.venv/bin/python scripts/reference/gen_perovskite_reference.py
.venv/bin/python scripts/reference/gen_pw_kmesh_reference.py
.venv/bin/python scripts/reference/gen_cif_fixtures.py   # after gen_kpaths.py (reuses its fixtures)
.venv/bin/python scripts/reference/gen_scf1d_reference.py
.venv/bin/python scripts/reference/gen_vasp_output_fixtures.py
.venv/bin/python scripts/reference/gen_element_reference.py   # downloads the SMACT wheel for its data file
```

| File | Content | Used by | Caveat |
|---|---|---|---|
| `bz_geometry.json` | First Brillouin zone of 12 lattices: vertices, face planes, vertex/edge/face counts, volume | M5.2 | Asserted at generation: textbook counts and volume = (2 pi)^3/V |
| `kpaths.json` | 39 illustrative structures covering all 29 HPKOT extended Bravais lattices and the 20 non-degenerate Setyawan-Curtarolo variants (the variant each one hits is recorded; `_meta.coverage` lists them): point coordinates, paths, primitive cells | M5.3, M5.4 | Fractional coordinates are in the basis of the standardized reciprocal primitive cell; compare invariants, not raw Cartesian orientation. Fixtures are illustrative, not claims about real materials |
| `perovskite_reference.json` | Shannon anchors, t, mu, tau for 16 compounds, RCuO3 sweeps for three CN policies, Ln3+ CN coverage | M8 | **tau equation unconfirmed against the paper (Q-003).** Radii are pymatgen's table (Q-002) |
| `pw_kmesh_reference.json` | hbar^2/2m, exact plane-wave counts, MP and Gamma mesh coordinates, spglib irreducible counts, point-group symmetry of each mesh (hcp, fcc, sc, bcc), KSPACING rounding candidates | M3.2, M4.4, M4.5 | The KSPACING rule is open (Q-004); the candidates are not a result. Mesh symmetry evidence for Q-017 |
| `cif/*.cif`, `cif/expected.json` | 9 structures written by pymatgen's CifWriter (symmetrized and P1) plus 4 edge cases (uncertainties, alternate symmetry tag, partial occupancy to reject, two data blocks) with expected parse results | M5.1 | Edge cases are text edits of generated files, described in `expected.json` |
| `scf1d_reference.json` | 1D two-electron restricted Hartree-Fock toy (soft-Coulomb, Z = 1 and 2): energies, orbital energy, plus the exact two-electron energy on the same grid as a variational bound | M7.1 | Model and grid must be reproduced exactly (see the generator) |
| `vasp-outputs/*`, `vasp-outputs/expected.json` | SYNTHETIC CHGCAR (spin and non-spin, non-cubic grid), EIGENVAL (ISPIN 1, 2), OSZICAR, XDATCAR written or read back by pymatgen; DOSCAR from the documented layout | M4.1, M7.3, M7.5 | Parser tests only, never results; DOSCAR not independently validated (Q-008) |
| `element_reference.json` | 30 elements: Pauling electronegativity, mass, vdW radius (pymatgen), Cordero covalent radius (via ASE), ICSD 2024 oxidation-state counts and shares (SMACT) | M8.2, M10.1 | Recalled anchors asserted at generation |

Provenance and versions are inside each file's `_meta`.
