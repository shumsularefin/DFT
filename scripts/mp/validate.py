"""Validate Screening Studio datasets (M9.1). Same checks as src/lib/mp/validate.ts.

    python scripts/mp/validate.py                       # every dataset under public/data/mp/
    python scripts/mp/validate.py public/data/mp/2026.04.13

Checks: the JSON Schema in scripts/mp/schema.json, value ranges (energy_above_hull >= 0,
band_gap >= 0, nsites >= 1), unique ids, every starter id has a shard entry, file hashes and
sizes, the size budgets, and that sample or mock data say synthetic: true. Exit code 1 on any error.
@source S-044
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mpdata  # noqa: E402


def check_current(root: Path) -> list[dict]:
    p = root / "current.json"
    if not p.is_file():
        return []
    cur = json.loads(p.read_text(encoding="utf-8"))
    errs = mpdata._schema_errors(mpdata.load_schema(), "current", cur, "current.json")
    if not errs and not (root / cur["manifest"]).is_file():
        errs.append({"code": "missing-file", "message": f"current.json points to {cur['manifest']}, which is missing"})
    return errs


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dirs", nargs="*", type=Path, help="dataset folders (default: all under public/data/mp)")
    a = ap.parse_args(argv)
    dirs = a.dirs or sorted(p.parent for p in mpdata.PUBLIC_MP.glob("*/manifest.json"))
    failed = 0
    if not a.dirs:
        errs = check_current(mpdata.PUBLIC_MP)
        for e in errs:
            print(f"public/data/mp/current.json: {e['code']}: {e['message']}")
        failed += bool(errs)
    if not dirs:
        print("validate.py: no dataset found")
        return 1
    for d in dirs:
        errs = mpdata.validate_dir(d)
        if errs:
            failed += 1
            print(f"FAIL {d}")
            for e in errs:
                print(f"  {e['code']}: {e['message']}")
        else:
            man = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
            gz = sum(mpdata.gzip_size((d / f["path"]).read_bytes()) for f in man["files"])
            print(f"OK   {d}: {man['count']} materials, {man['starterCount']} starters, "
                  f"{gz / 1024:.0f} KB gzipped, synthetic: {str(man['synthetic']).lower()}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
