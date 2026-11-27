#!/usr/bin/env python
"""Materials Project GGA+U values and starting moments, read from pymatgen's input-set files (D-110, Q-072).

Source: pymatgen-core 2026.10.31 (MIT), the package that holds `pymatgen.io.vasp` since the 2026 split:
  * io/vasp/MPRelaxSet.yaml: LDAUTYPE, and LDAUL, LDAUU and LDAUJ keyed by the anion (O, F) then the metal.
  * io/vasp/VASPIncarBase.yaml: MAGMOM per element (and per ion, e.g. Mn3+).
  * io/vasp/sets.py: an element with no MAGMOM entry starts at 0.6 (checked as text below).
The U values are a fit to binary oxide formation enthalpies (S-080); the Materials Project page on Hubbard U
values describes the fit. Recalled values are asserted so a changed file fails loudly.

Output: tests/reference/mp_defaults_reference.json
Needs: PyYAML. The wheel is fetched with `pip download pymatgen-core==2026.10.31 --no-deps` (not installed).
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import zipfile

import yaml

VERSION = "2026.10.31"
OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "mp_defaults_reference.json"
RECALLED_U = {"Co": 3.32, "Cr": 3.7, "Fe": 5.3, "Mn": 3.9, "Mo": 4.38, "Ni": 6.2, "V": 3.25, "W": 6.2}


def main():
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, "-m", "pip", "download", f"pymatgen-core=={VERSION}", "--no-deps", "-q",
                        "-d", tmp], check=True)
        whl = next(pathlib.Path(tmp).glob("pymatgen_core-*.whl"))
        with zipfile.ZipFile(whl) as z:
            relax = yaml.safe_load(z.read("pymatgen/io/vasp/MPRelaxSet.yaml"))["INCAR"]
            base = yaml.safe_load(z.read("pymatgen/io/vasp/VASPIncarBase.yaml"))["INCAR"]
            sets_py = z.read("pymatgen/io/vasp/sets.py").decode()
    assert relax["LDAUTYPE"] == 2, "MP uses the Dudarev scheme"
    anions = sorted(relax["LDAUU"])
    assert anions == ["F", "O"], anions
    u = relax["LDAUU"]["O"]
    assert u == relax["LDAUU"]["F"], "oxide and fluoride U differ"
    assert u == RECALLED_U, u
    assert set(relax["LDAUL"]["O"].values()) == {2} and set(relax["LDAUJ"]["O"].values()) == {0}
    magmom = base["MAGMOM"]
    assert "setting.get(specie.symbol, 0.6)" in sets_py or "setting.get(site.specie.symbol, 0.6)" in sets_py
    out = {
        "_meta": {
            "generator": "scripts/reference/gen_mp_defaults_reference.py",
            "source": f"pymatgen-core {VERSION}: io/vasp/MPRelaxSet.yaml, io/vasp/VASPIncarBase.yaml, io/vasp/sets.py",
            "note": "U applies only when O or F is present (the most electronegative element); same table for both.",
        },
        "ldautype": relax["LDAUTYPE"],
        "u_anions": anions,
        "u": u,
        "ldaul": relax["LDAUL"]["O"],
        "ldauj": relax["LDAUJ"]["O"],
        "magmom_element": {k: v for k, v in magmom.items() if k.isalpha()},
        "magmom_ion": {k: v for k, v in magmom.items() if not k.isalpha()},
        "magmom_default": 0.6,
    }
    OUT.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
