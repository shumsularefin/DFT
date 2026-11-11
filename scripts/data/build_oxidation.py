#!/usr/bin/env python
"""Export oxidation-state counts to src/data/oxidation-states.json (stage M8.2).

Source: SMACT 4.0.2 data file smact/data/oxidation_states_icsd24_counts.json (MIT code; counts of ICSD 2024
entries per element and oxidation state), S-051. Same method as scripts/reference/gen_element_reference.py,
applied to all elements. Only counts above zero for non-zero oxidation states are kept. The classification
(common / known-rare / not-observed) is a convention applied in src/lib/chem/oxidation.ts (D-058).
Licence of the derived statistics: docs/OPEN_QUESTIONS.md Q-012.
Needs network for `pip download smact==4.0.2 --no-deps` (PyPI). Pass --date YYYY-MM-DD to reproduce exactly.
"""
import argparse
import datetime
import json
import pathlib
import subprocess
import sys
import tempfile
import zipfile
from collections import defaultdict

OUT = pathlib.Path(__file__).resolve().parents[2] / "src" / "data" / "oxidation-states.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, "-m", "pip", "download", "smact==4.0.2", "--no-deps", "-q", "-d", tmp], check=True)
        whl = next(pathlib.Path(tmp).glob("smact-*.whl"))
        with zipfile.ZipFile(whl) as z:
            rows = json.loads(z.read("smact/data/oxidation_states_icsd24_counts.json"))
    counts = defaultdict(dict)
    for r in rows:
        if r["results_count"] > 0 and r["oxidation_state"] != 0:
            counts[r["element"]][str(r["oxidation_state"])] = r["results_count"]
    meta = {
        "source": "SMACT 4.0.2 oxidation_states_icsd24_counts.json (ICSD 2024 counts), S-051",
        "generated": args.date,
        "generator": "scripts/data/build_oxidation.py",
        "elements": len(counts),
        "note": "Non-zero oxidation states with count above zero. Licence of the derived statistics: Q-012",
    }
    lines = ["{", '  "_meta": ' + json.dumps(meta) + ",", '  "counts": {']
    items = sorted(counts.items())
    for i, (el, c) in enumerate(items):
        c = dict(sorted(c.items(), key=lambda kv: int(kv[0])))
        lines.append(f"    {json.dumps(el)}: {json.dumps(c)}" + ("," if i < len(items) - 1 else ""))
    lines += ["  }", "}"]
    OUT.write_text("\n".join(lines) + "\n")
    print(f"wrote {OUT} ({len(counts)} elements)")


if __name__ == "__main__":
    main()
