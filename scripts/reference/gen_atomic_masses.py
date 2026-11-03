#!/usr/bin/env python
"""Standard atomic masses (u) for Z = 1..103, taken from pymatgen's element table.

Output: src/data/atomic-masses.json   Source: S-034 (pymatgen table; derived from IUPAC standard atomic weights,
not independently re-checked against the IUPAC publication, see Q-027). Elements without a standard weight are
omitted from the output rather than guessed.
"""
import json, pathlib
import pymatgen
from pymatgen.core import Element

OUT = pathlib.Path(__file__).resolve().parents[2] / "src" / "data" / "atomic-masses.json"
masses = {}
for z in range(1, 104):
    e = Element.from_Z(z)
    m = e.atomic_mass
    if m is None:
        continue
    masses[e.symbol] = round(float(m), 6)
doc = {"_meta": {"source": "S-034", "generator": "scripts/reference/gen_atomic_masses.py",
                 "pymatgen": pymatgen.__version__ if hasattr(pymatgen, "__version__") else "unknown",
                 "unit": "u (g/mol)", "open_question": "Q-027"}, "masses": masses}
OUT.write_text(json.dumps(doc, indent=1) + "\n")
print("wrote", OUT, len(masses))
