#!/usr/bin/env python
"""Export pymatgen's Shannon radii table to src/data/shannon-radii.json.

Source: S-001 (R. D. Shannon, Acta Cryst. A32, 751-767, 1976) as bundled in pymatgen (S-034, MIT).
Every entry of pymatgen's table is exported; nothing is added, interpolated or dropped. Licence status
and completeness against the original table: docs/OPEN_QUESTIONS.md Q-002.

Run with the pinned virtualenv (scripts/reference/requirements.txt):
    python scripts/data/build_shannon.py [--date YYYY-MM-DD]
The output is identical for the same pymatgen version and --date (default: today).
"""
import argparse, datetime, importlib.metadata, json, pathlib, re
from pymatgen.core.periodic_table import Element

OUT = pathlib.Path(__file__).resolve().parents[2] / "src" / "data" / "shannon-radii.json"
ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10,
         "XI": 11, "XII": 12, "XIII": 13, "XIV": 14}
SPIN = {"": None, "High Spin": "HS", "Low Spin": "LS"}
GEOM_ORDER = {None: 0, "SQ": 1, "PY": 2}
SPIN_ORDER = {None: 0, "HS": 1, "LS": 2}


def parse_cn(key: str):
    m = re.fullmatch(r"([IVX]+)(SQ|PY)?", key)
    if not m or m.group(1) not in ROMAN:
        raise SystemExit(f"unknown coordination key {key!r}")
    return ROMAN[m.group(1)], m.group(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()
    entries = []
    for el in Element:
        table = el.data.get("Shannon radii")
        if not table:
            continue
        for ox_key, by_cn in table.items():
            # pymatgen 2026.10.24 has one entry with an empty oxidation key (Eu, CN VII). It is exported with
            # ox = null and listed in _meta.anomalies; the lookup never assigns it an oxidation state (Q-002).
            ox = int(ox_key) if ox_key != "" else None
            for cn_key, by_spin in by_cn.items():
                cn, geometry = parse_cn(cn_key)
                for spin_key, r in by_spin.items():
                    if spin_key not in SPIN:
                        raise SystemExit(f"unknown spin label {spin_key!r} for {el.symbol}{ox_key} {cn_key}")
                    entries.append({"el": el.symbol, "ox": ox, "cn": cn, "geometry": geometry,
                                    "spin": SPIN[spin_key], "ionic": float(r["ionic_radius"]),
                                    "crystal": float(r["crystal_radius"]), "_z": el.Z})
    entries.sort(key=lambda e: (e["_z"], e["ox"] is None, e["ox"] or 0, e["cn"], GEOM_ORDER[e["geometry"]], SPIN_ORDER[e["spin"]]))
    for e in entries:
        del e["_z"]
    keys = {(e["el"], e["ox"], e["cn"], e["geometry"], e["spin"]) for e in entries}
    assert len(keys) == len(entries), "duplicate entry keys"
    meta = {
        "source": "S-001",
        "via": "S-034",
        "pymatgen": importlib.metadata.version("pymatgen"),
        "generator": "scripts/data/build_shannon.py",
        "generated": args.date,
        "entries": len(entries),
        "elements": len({e["el"] for e in entries}),
        "unit": "angstrom",
        "anomalies": [
            {"el": e["el"], "cn": e["cn"], "issue": "oxidation state missing in pymatgen's table; not assigned (Q-002)"}
            for e in entries if e["ox"] is None
        ],
        "licence": "Numbers are Shannon's published data via pymatgen (MIT). Whether bundling needs more than attribution is open: Q-002",
        "completeness": "Not compared row by row with the 1976 table: Q-002",
    }
    lines = ["{", f' "_meta": {json.dumps(meta)},', ' "entries": [']
    lines += [f"  {json.dumps(e)}," for e in entries]
    lines[-1] = lines[-1].rstrip(",")
    lines += [" ]", "}"]
    OUT.write_text("\n".join(lines) + "\n")
    print("wrote", OUT, meta["entries"], "entries,", meta["elements"], "elements")


if __name__ == "__main__":
    main()
