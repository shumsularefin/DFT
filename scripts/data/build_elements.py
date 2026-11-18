#!/usr/bin/env python
"""Element data for the chemistry engine (M10.1): src/data/elements.json, Z = 1 to 103.

Sources (method of scripts/reference/gen_element_reference.py):
  * name, mass, period, group, block, category flags, Pauling electronegativity, van der Waals radius:
    pymatgen (S-034, pinned in scripts/reference/requirements.txt).
  * covalent radius: Cordero et al. 2008 (S-021) as transcribed in ASE 3.29.0 (S-052). ASE fills elements
    Cordero does not cover with a placeholder (`ase.data.missing`); those are exported as null, never 2.0.
  * oxidation-state shares: SMACT 4.0.2 ICSD 2024 counts (S-051), read from src/data/oxidation-states.json
    (built by scripts/data/build_oxidation.py); share = count / sum over non-zero states.
Missing values are null. Run: python scripts/data/build_elements.py [--date YYYY-MM-DD]
"""
import argparse, datetime, importlib.metadata, inspect, json, math, pathlib, re, warnings

import ase.data
from ase.data import covalent_radii
from pymatgen.core import Element

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "data" / "elements.json"


def placeholder_z():
    """Atomic numbers whose covalent radius ASE writes as the `missing` placeholder (read from ASE's source,
    because the placeholder value 2.0 is also a real Cordero value, for example Pa)."""
    src = inspect.getsource(ase.data)
    body = src[src.index("covalent_radii = np.array(["):]
    body = body[: body.index("])")]
    entries = [ln.split("#")[0].strip().rstrip(",") for ln in body.splitlines()[1:]]
    entries = [x for x in entries if x]
    assert len(entries) == len(covalent_radii), (len(entries), len(covalent_radii))
    return {z for z, x in enumerate(entries) if x == "missing"}


def category(e):
    # Order matters: the first matching flag wins.
    for flag, name in (("is_noble_gas", "noble-gas"), ("is_halogen", "halogen"), ("is_alkali", "alkali-metal"),
                       ("is_alkaline", "alkaline-earth-metal"), ("is_lanthanoid", "lanthanide"),
                       ("is_actinoid", "actinide"), ("is_transition_metal", "transition-metal"),
                       ("is_post_transition_metal", "post-transition-metal"), ("is_metalloid", "metalloid")):
        if getattr(e, flag):
            return name
    return "metal" if e.is_metal else "nonmetal"


def num(x):
    if x is None:
        return None
    x = float(x)
    return None if math.isnan(x) else x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()
    ox = json.loads((ROOT / "src/data/oxidation-states.json").read_text())
    missing_z = placeholder_z()
    rows = []
    for z in range(1, 104):
        e = Element.from_Z(z)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            x = num(e.X)
        cov = None if z in missing_z else float(covalent_radii[z])
        counts = {int(k): v for k, v in ox["counts"].get(e.symbol, {}).items() if int(k) != 0}
        tot = sum(counts.values())
        shares = {str(k): round(v / tot, 4) for k, v in sorted(counts.items(), key=lambda kv: -kv[1])} if tot else {}
        rows.append({
            "Z": z, "symbol": e.symbol, "name": e.long_name, "mass": float(e.atomic_mass),
            "period": e.row, "group": e.group, "block": e.block, "category": category(e), "metal": bool(e.is_metal),
            "pauling": x, "vdw": num(e.data.get("Van der waals radius")), "covalent": cov, "oxShares": shares,
        })
    meta = {
        "generator": "scripts/data/build_elements.py", "generated": args.date, "elements": len(rows),
        "sources": {"pymatgen": importlib.metadata.version("pymatgen"), "ase": importlib.metadata.version("ase"),
                    "smact_counts": "src/data/oxidation-states.json (SMACT " + ox["_meta"]["smact"] + ")"},
        "source_ids": {"name_mass_period_group_block_category_pauling_vdw": "S-034", "covalent": "S-021 via S-052",
                       "oxShares": "S-051"},
        "units": {"mass": "u", "vdw": "angstrom", "covalent": "angstrom"},
        "notes": "covalent is null where Cordero 2008 has no value (ASE placeholder); pauling null where pymatgen has none; oxShares exclude state 0",
    }
    lines = ["{", f' "_meta": {json.dumps(meta)},', ' "elements": [']
    lines += [f"  {json.dumps(r)}," for r in rows]
    lines[-1] = lines[-1].rstrip(",")
    lines += [" ]", "}"]
    OUT.write_text("\n".join(lines) + "\n")
    print("wrote", OUT, len(rows))


if __name__ == "__main__":
    main()
