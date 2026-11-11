#!/usr/bin/env python
"""Export element names to src/data/elements.json (stage M8.3, for the shared periodic table).

Source: pymatgen element data (MIT, S-034): atomic number, symbol and English name for Z = 1 to 103.
Layout positions and group categories are computed in src/lib/chem/periodic.ts from the table layout only.
Pass --date YYYY-MM-DD to reproduce a file exactly.
"""
import argparse
import datetime
import json
import pathlib
from importlib.metadata import version

from pymatgen.core import Element

OUT = pathlib.Path(__file__).resolve().parents[2] / "src" / "data" / "elements.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()
    names = {}
    for z in range(1, 104):
        e = Element.from_Z(z)
        assert e.Z == z
        names[e.symbol] = e.long_name
    meta = {"source": f"pymatgen {version('pymatgen')} (S-034)", "generated": args.date,
            "generator": "scripts/data/build_elements.py", "count": len(names)}
    lines = ["{", '  "_meta": ' + json.dumps(meta) + ",", '  "names": {']
    items = list(names.items())
    for i, (s, n) in enumerate(items):
        lines.append(f"    {json.dumps(s)}: {json.dumps(n)}" + ("," if i < len(items) - 1 else ""))
    lines += ["  }", "}"]
    OUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT} ({len(names)} elements)")


if __name__ == "__main__":
    main()
