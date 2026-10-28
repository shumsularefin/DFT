#!/usr/bin/env python
"""Golden element data anchors for the chemistry engine (stages M8.2 and M10.1).

Sources (each independent of the TypeScript code):
  * Pauling electronegativity, atomic mass, van der Waals radius: pymatgen element data (MIT).
  * Covalent radii: B. Cordero et al., Dalton Trans. 2832 (2008) (S-021), as transcribed in ASE's data
    module (ase 3.29.0, LGPL; the numbers are Cordero's published values).
  * Oxidation-state frequencies: SMACT 4.0.2 data file oxidation_states_icsd24_counts.json (MIT code;
    counts of ICSD 2024 entries per element and oxidation state). Share = count / sum of counts over
    non-zero oxidation states (state 0 = metallic entries is excluded).

Recalled anchor values are asserted so that a wrong source or column fails loudly.
Output: tests/reference/element_reference.json
Needs: pip install ase==3.29.0 ; SMACT's data file is fetched with `pip download smact==4.0.2 --no-deps`.
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import zipfile
from collections import defaultdict

from ase.data import atomic_numbers, covalent_radii
from pymatgen.core import Element

OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "element_reference.json"
ELEMENTS = ["H", "C", "N", "O", "F", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "K", "Ca", "Ti", "Mn", "Fe", "Co",
            "Ni", "Cu", "Zn", "Sr", "Zr", "Nb", "Ba", "La", "Nd", "Pb", "I", "Cs"]
# Values recalled from the cited tables; generation aborts if a source disagrees.
RECALLED_CORDERO = {"H": 0.31, "C": 0.76, "N": 0.71, "O": 0.66, "Si": 1.11, "Cu": 1.32, "Fe": 1.32}
RECALLED_PAULING = {"C": 2.55, "O": 3.44, "H": 2.20, "F": 3.98, "Cu": 1.90, "Fe": 1.83, "Na": 0.93}


def smact_counts():
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, "-m", "pip", "download", "smact==4.0.2", "--no-deps", "-q", "-d", tmp], check=True)
        whl = next(pathlib.Path(tmp).glob("smact-*.whl"))
        with zipfile.ZipFile(whl) as z:
            rows = json.loads(z.read("smact/data/oxidation_states_icsd24_counts.json"))
    counts = defaultdict(dict)
    for r in rows:
        if r["results_count"] > 0:
            counts[r["element"]][r["oxidation_state"]] = r["results_count"]
    return counts


def main():
    counts = smact_counts()
    out = {"_meta": {
        "generator": "scripts/reference/gen_element_reference.py",
        "sources": {"electronegativity_mass_vdw": "pymatgen (Pauling X)", "covalent_radius": "Cordero 2008 via ase 3.29.0",
                    "oxidation_frequency": "SMACT 4.0.2 oxidation_states_icsd24_counts.json"},
        "share_definition": "count of a non-zero oxidation state / sum over non-zero states for that element",
    }, "elements": {}}
    for el in ELEMENTS:
        e = Element(el)
        c = counts.get(el, {})
        nonzero = {k: v for k, v in c.items() if k != 0}
        tot = sum(nonzero.values()) or 1
        out["elements"][el] = {
            "Z": e.Z, "mass": float(e.atomic_mass), "pauling_x": e.data.get("X"),
            "vdw_radius": e.data.get("Van der waals radius"),
            "covalent_radius_cordero": float(covalent_radii[atomic_numbers[el]]),
            "oxidation_share_icsd24": {str(k): round(v / tot, 4) for k, v in sorted(nonzero.items(), key=lambda kv: -kv[1])},
            "oxidation_counts_icsd24": {str(k): v for k, v in sorted(c.items())},
        }
    for el, v in RECALLED_CORDERO.items():
        assert abs(out["elements"][el]["covalent_radius_cordero"] - v) < 1e-9, (el, out["elements"][el]["covalent_radius_cordero"])
    for el, v in RECALLED_PAULING.items():
        assert abs(out["elements"][el]["pauling_x"] - v) < 1e-9, (el, out["elements"][el]["pauling_x"])
    cu = out["elements"]["Cu"]["oxidation_share_icsd24"]
    assert cu["2"] > 0.5 and cu["1"] > 0.35 and cu["3"] < 0.05, cu
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("Cu shares:", cu, " Fe:", out["elements"]["Fe"]["oxidation_share_icsd24"])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
