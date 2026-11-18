#!/usr/bin/env python
"""Oxidation-state occurrence counts for every element, from SMACT 4.0.2 (S-051).

Source: SMACT's data file smact/data/oxidation_states_icsd24_counts.json (MIT code; counts of ICSD 2024
entries per element and oxidation state). Same method as scripts/reference/gen_element_reference.py:
the wheel is fetched with `pip download smact==4.0.2 --no-deps`, rows with a count of zero are dropped,
and the counts are copied unchanged (state 0, metallic entries, is kept in the file but excluded from
shares by the TypeScript side). Classification thresholds are applied in src/lib/chem/oxidation.ts (D-061).
Licence of the derived statistics: Q-012.

Output: src/data/oxidation-states.json
Run: python scripts/data/build_oxidation.py [--date YYYY-MM-DD]
"""
import argparse, datetime, json, pathlib, subprocess, sys, tempfile, zipfile
from collections import defaultdict

from pymatgen.core import Element

OUT = pathlib.Path(__file__).resolve().parents[2] / "src" / "data" / "oxidation-states.json"
VERSION = "4.0.2"


def smact_rows():
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, "-m", "pip", "download", f"smact=={VERSION}", "--no-deps", "-q", "-d", tmp],
                       check=True)
        whl = next(pathlib.Path(tmp).glob("smact-*.whl"))
        with zipfile.ZipFile(whl) as z:
            return json.loads(z.read("smact/data/oxidation_states_icsd24_counts.json"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    args = ap.parse_args()
    counts = defaultdict(dict)
    for r in smact_rows():
        el, ox, n = r["element"], int(r["oxidation_state"]), int(r["results_count"])
        if n > 0:
            counts[el][ox] = n
    z = {el: Element(el).Z for el in counts}
    elements = {el: {str(k): v for k, v in sorted(counts[el].items())} for el in sorted(counts, key=lambda e: z[e])}
    meta = {
        "source": "S-051",
        "smact": VERSION,
        "file": "smact/data/oxidation_states_icsd24_counts.json",
        "generator": "scripts/data/build_oxidation.py",
        "generated": args.date,
        "elements": len(elements),
        "meaning": "number of ICSD 2024 entries in which the element has that oxidation state; 0 = metallic",
        "licence": "SMACT code is MIT; whether redistributing statistics derived from ICSD needs more than attribution is open: Q-012",
    }
    lines = ["{", f' "_meta": {json.dumps(meta)},', ' "counts": {']
    lines += [f'  "{el}": {json.dumps(c)},' for el, c in elements.items()]
    lines[-1] = lines[-1].rstrip(",")
    lines += [" }", "}"]
    OUT.write_text("\n".join(lines) + "\n")
    print("wrote", OUT, len(elements), "elements")


if __name__ == "__main__":
    main()
