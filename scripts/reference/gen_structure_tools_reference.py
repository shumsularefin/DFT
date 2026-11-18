#!/usr/bin/env python
"""Golden data for the structure toolkit: slabs, symmetry-distinct sites and defect pairs (milestone M13.5).

Independent code path (never a copy of the TypeScript logic):
  * Slabs come from pymatgen's own SlabGenerator (W. Sun, G. Ceder, Surf. Sci. 617, 53 (2013), S-064) with its
    defaults (primitive=True, ftol=0.1, symmetrically equivalent slabs filtered by StructureMatcher). For each
    (fixture, hkl) we record the number of distinct terminations and, for every termination, the atom count at
    several minimum thicknesses, the surface area, pymatgen's `is_polar()` (nominal oxidation states typed in
    below; P. W. Tasker, J. Phys. C 12, 4977 (1979), S-063) and `is_symmetric()`.
  * Symmetry-distinct sites: spglib's `equivalent_atoms` for every structure in tests/reference/kpaths.json.
  * Defect pairs: BRUTE FORCE over every unordered pair of distinct sites (i < j) whose minimum-image distance is
    at most r_max, classes formed by spglib's symmetry operations of the cell acting as permutations of the sites.

Nominal oxidation states for the polarity flag are a convention typed in here (Cu 0, Na +1, Cl -1, Ti +4, O -2).
Fixtures are illustrative test cells, not claims about real surfaces.

Output: tests/reference/structure_tools_reference.json
Run:    python scripts/reference/gen_structure_tools_reference.py
"""
import importlib.metadata
import itertools
import json
import pathlib

import numpy as np
import spglib
from pymatgen.core import Lattice, Structure
from pymatgen.core.surface import SlabGenerator

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "reference" / "structure_tools_reference.json"
KPATHS = ROOT / "tests" / "reference" / "kpaths.json"
SYMPREC = 1e-4
OXI = {"Cu": 0, "Na": 1, "Cl": -1, "Ti": 4, "O": -2}
THICKNESSES = [5.0, 10.0, 15.0]
VACUUM = 10.0

SLAB_CASES = [
    ("fcc_Cu", [1, 0, 0]),
    ("fcc_Cu", [1, 1, 0]),
    ("fcc_Cu", [1, 1, 1]),
    ("rocksalt_NaCl", [1, 0, 0]),
    ("rocksalt_NaCl", [1, 1, 1]),
    ("rutile_TiO2_tetragonal_P", [1, 1, 0]),
]
PAIR_CASES = [
    ("rocksalt_NaCl", [1, 1, 1], 4.0),
    ("fcc_Cu", [2, 2, 2], 3.7),
    ("rutile_TiO2_tetragonal_P", [1, 1, 1], 3.6),
]


def kpaths():
    return json.loads(KPATHS.read_text())["structures"]


def load(name):
    d = kpaths()[name]["input"]
    return Structure(Lattice(d["lattice_rows"]), d["atomic_numbers"], d["frac_coords"])


def slab_case(name, hkl):
    s = load(name)
    s.add_oxidation_state_by_element({el: OXI[el] for el in {sp.symbol for sp in s.species}})
    per_thickness = []
    terminations = None
    for t in THICKNESSES:
        gen = SlabGenerator(s, hkl, min_slab_size=t, min_vacuum_size=VACUUM, center_slab=True)
        slabs = gen.get_slabs()
        if terminations is None:
            terminations = len(slabs)
        assert len(slabs) == terminations, "termination count changed with thickness"
        per_thickness.append(
            {
                "min_slab_size": t,
                "n_input_spacings": int(np.ceil(t / gen._proj_height - 1e-12)),
                "slabs": sorted(
                    (
                        {
                            "n_atoms": len(sl),
                            "composition": {str(k): int(v) for k, v in sl.composition.element_composition.items()},
                            "surface_area": float(sl.surface_area),
                            "polar": bool(sl.is_polar()),
                            "symmetric": bool(sl.is_symmetric()),
                        }
                        for sl in slabs
                    ),
                    key=lambda x: (x["n_atoms"], x["polar"], x["symmetric"]),
                ),
            }
        )
    return {
        "structure": name,
        "hkl": hkl,
        "d_hkl_input": float(s.lattice.d_hkl(hkl)),
        "proj_height": float(gen._proj_height),
        "n_terminations": terminations,
        "thicknesses": per_thickness,
    }


def orbits(name):
    s = load(name)
    cell = (s.lattice.matrix, s.frac_coords, s.atomic_numbers)
    ds = spglib.get_symmetry_dataset(cell, symprec=SYMPREC)
    eq = [int(x) for x in ds.equivalent_atoms]
    return {"n_orbits": len(set(eq)), "equivalent_atoms": eq, "spacegroup_number": int(ds.number)}


def pair_classes(name, diag, rmax):
    s = load(name)
    s.make_supercell(diag)
    lat = s.lattice.matrix
    f = np.mod(s.frac_coords, 1.0)
    n = len(s)
    cell = (lat, f, s.atomic_numbers)
    sym = spglib.get_symmetry(cell, symprec=SYMPREC)
    # Permutation of the sites by each operation (x' = R x + t, fractional).
    perms = []
    for R, t in zip(sym["rotations"], sym["translations"]):
        img = np.mod(f @ R.T + t, 1.0)
        p = []
        for x in img:
            d = f - x
            d -= np.rint(d)
            k = int(np.argmin(np.linalg.norm(d @ lat, axis=1)))
            assert np.linalg.norm(d[k] @ lat) < 1e-3
            p.append(k)
        perms.append(p)
    shifts = np.array(list(itertools.product(range(-2, 3), repeat=3)))
    pairs = {}
    for i, j in itertools.combinations(range(n), 2):
        dmin = float(np.min(np.linalg.norm((f[j] - f[i] + shifts) @ lat, axis=1)))
        if dmin <= rmax:
            pairs[(i, j)] = dmin
    seen = set()
    classes = []
    for pair in sorted(pairs, key=lambda p: (round(pairs[p], 6), p)):
        if pair in seen:
            continue
        orbit = {tuple(sorted((p[pair[0]], p[pair[1]]))) for p in perms}
        seen |= orbit
        i, j = pair
        classes.append(
            {
                "distance": round(pairs[pair], 8),
                "species": sorted([s[i].specie.symbol, s[j].specie.symbol]),
                "multiplicity": len(orbit),
            }
        )
    return {
        "structure": name,
        "supercell_diagonal": diag,
        "n_atoms": n,
        "r_max": rmax,
        "n_pairs": len(pairs),
        "n_classes": len(classes),
        "classes": classes,
    }


def main():
    out = {
        "_meta": {
            "generator": "scripts/reference/gen_structure_tools_reference.py",
            "milestone": "M13.5",
            "sources": ["S-063", "S-064"],
            "versions": {p: importlib.metadata.version(p) for p in ("pymatgen", "spglib", "numpy", "scipy")},
            "symprec": SYMPREC,
            "slab_defaults": {
                "primitive": True,
                "ftol": 0.1,
                "min_vacuum_size": VACUUM,
                "center_slab": True,
                "filter_out_sym_slabs": True,
                "oxidation_states": OXI,
            },
            "note": "Golden file. Never hand-edit; rerun the generator.",
        },
        "slabs": [slab_case(n, h) for n, h in SLAB_CASES],
        "orbits": {name: orbits(name) for name in kpaths()},
        "pairs": [pair_classes(n, d, r) for n, d, r in PAIR_CASES],
    }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
