#!/usr/bin/env python
"""Export pymatgen's Shannon radii table to src/data/shannon-radii.json (stage M8.1).

Source: R. D. Shannon, Acta Cryst. A32, 751 (1976) (S-001), as bundled in pymatgen (MIT code, S-034).
Licence and completeness of the compiled copy are open: docs/OPEN_QUESTIONS.md Q-002.
Run in the virtualenv of scripts/reference/requirements.txt:  python scripts/data/build_shannon.py
Entry schema: {el, ox, cn, geometry: null|'SQ'|'PY', spin: null|'HS'|'LS', ionic, crystal}.
The generation date is the only value that changes between runs, so pass --date YYYY-MM-DD to reproduce a file exactly.
"""
import argparse
import datetime
import json
import pathlib
import re

import pymatgen
from pymatgen.core import Element
from importlib.metadata import version

OUT = pathlib.Path(__file__).resolve().parents[2] / "src" / "data" / "shannon-radii.json"
ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10,
         "XI": 11, "XII": 12, "XIII": 13, "XIV": 14}
SPIN = {"": None, "High Spin": "HS", "Low Spin": "LS"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()
    entries = []
    unassigned = []  # rows whose oxidation-state key is blank in pymatgen: kept out of the lookup, never guessed
    for z in range(1, 119):
        try:
            el = Element.from_Z(z)
        except Exception:
            continue
        table = el.data.get("Shannon radii")
        if not table:
            continue
        for ox, cns in table.items():
            for key, spins in cns.items():
                if not re.fullmatch(r"-?\d+", ox):
                    for spin, v in spins.items():
                        unassigned.append({"el": el.symbol, "oxKey": ox, "cnKey": key, "spin": SPIN[spin],
                                           "ionic": v["ionic_radius"], "crystal": v["crystal_radius"]})
                    continue
                m = re.fullmatch(r"([IVX]+?)(SQ|PY)?", key)
                if not m or m.group(1) not in ROMAN:
                    raise SystemExit(f"unexpected coordination key {key!r} for {el.symbol}")
                for spin, v in spins.items():
                    entries.append({
                        "el": el.symbol, "ox": int(ox), "cn": ROMAN[m.group(1)], "geometry": m.group(2),
                        "spin": SPIN[spin], "ionic": v["ionic_radius"], "crystal": v["crystal_radius"],
                    })
    entries.sort(key=lambda e: (Element(e["el"]).Z, e["ox"], e["cn"], e["geometry"] or "", e["spin"] or ""))
    n_el = len({e["el"] for e in entries})
    meta = {
        "source": "R. D. Shannon, Acta Cryst. A32, 751 (1976), S-001, via pymatgen " + version("pymatgen") + " (S-034)",
        "generated": args.date,
        "generator": "scripts/data/build_shannon.py",
        "entries": len(entries) + len(unassigned),
        "assignable": len(entries),
        "unassigned": unassigned,
        "elements": n_el,
        "units": "Angstrom",
        "licence": "Compiled copy of published data; licence and completeness not yet confirmed (docs/OPEN_QUESTIONS.md Q-002)",
    }
    assert len(entries) + len(unassigned) == 492 and n_el == 94, (len(entries), len(unassigned), n_el)
    lines = ['{', '  "_meta": ' + json.dumps(meta) + ',', '  "entries": [']
    lines += ["    " + json.dumps(e) + ("," if i < len(entries) - 1 else "") for i, e in enumerate(entries)]
    lines += ["  ]", "}", ""]
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT} ({len(entries)} assignable + {len(unassigned)} unassigned entries, {n_el} elements)")


if __name__ == "__main__":
    main()
