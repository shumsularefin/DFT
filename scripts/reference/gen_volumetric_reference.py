#!/usr/bin/env python
"""Golden planar averages for the volumetric tools (milestone M14.3, added in the M15.2 re-audit).

Independent code path: pymatgen writes a SYNTHETIC LOCPOT and a spin-polarized CHGCAR (seeded values on a
non-cubic grid, so an axis mix-up fails), reads them back with `Locpot.from_file` / `Chgcar.from_file`, and
`VolumetricData.get_average_along_axis(ind)` (S-034) gives the expected planar averages for ind = 0, 1, 2.
The averages are taken from the re-read object, so they refer to exactly the numbers in the files that the
TypeScript parsers read. For CHGCAR the average is of the stored rho * V_cell values (pymatgen's `data["total"]`),
the same quantity as `ChgcarResult.totalRaw`.

The values are made up (a smooth slab-like profile plus seeded noise), not the result of any calculation.

Output: tests/reference/volumetric_reference.json and tests/reference/volumetric/{LOCPOT_slab,CHGCAR_spin}
Run:    python scripts/reference/gen_volumetric_reference.py
"""
import importlib.metadata
import json
import pathlib
import warnings

import numpy as np
from pymatgen.core import Lattice, Structure
from pymatgen.io.vasp import Poscar
from pymatgen.io.vasp.outputs import Chgcar, Locpot

warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "reference" / "volumetric_reference.json"
FIX = ROOT / "tests" / "reference" / "volumetric"
SEED = 20261126
GRID = (6, 5, 16)


def profile(rng):
    nx, ny, nz = GRID
    z = np.arange(nz) / nz
    slab = -8.0 * np.exp(-((z - 0.5) ** 2) / 0.02)  # eV, a well in the middle, flat vacuum at the edges
    base = np.broadcast_to(slab, GRID).copy()
    return base + 0.3 * rng.standard_normal(GRID)


def main():
    FIX.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    st = Structure(Lattice.orthorhombic(3.9, 4.1, 22.0), ["Ti", "O"], [[0, 0, 0.5], [0.5, 0.5, 0.45]])
    poscar = Poscar(st)
    out = {
        "_meta": {
            "generator": "scripts/reference/gen_volumetric_reference.py",
            "pymatgen": importlib.metadata.version("pymatgen"),
            "pymatgen_core": importlib.metadata.version("pymatgen-core"),
            "numpy": np.__version__,
            "seed": SEED,
            "note": "Synthetic data, not a calculation. Averages from pymatgen get_average_along_axis on the re-read file.",
        },
        "files": {},
    }

    loc_path = FIX / "LOCPOT_slab"
    Locpot(poscar, {"total": profile(rng)}).write_file(str(loc_path))
    loc = Locpot.from_file(str(loc_path))

    total = np.abs(rng.standard_normal(GRID)) * st.volume  # rho * V, positive
    diff = 0.2 * rng.standard_normal(GRID) * st.volume
    chg_path = FIX / "CHGCAR_spin"
    Chgcar(poscar, {"total": total, "diff": diff}).write_file(str(chg_path))
    chg = Chgcar.from_file(str(chg_path))

    for name, obj in (("LOCPOT_slab", loc), ("CHGCAR_spin", chg)):
        out["files"][name] = {
            "file": f"volumetric/{name}",
            "grid": list(obj.dim),
            "average_along_axis": {str(i): obj.get_average_along_axis(i).tolist() for i in range(3)},
        }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} and 2 fixtures")


if __name__ == "__main__":
    main()
