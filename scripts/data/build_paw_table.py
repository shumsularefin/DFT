#!/usr/bin/env python
"""Recommended PBE PAW potential NAMES per element, from the VASP wiki (S-019, page "Choosing pseudopotentials").

Only metadata is copied: element symbol, recommended potential name (e.g. Ti_sv) and the number of valence
electrons the wiki lists. No POTCAR content, ENMAX values or checksums are copied or hosted (CLAUDE.md).
The table read is the first one in section "Recommended PAW potentials": "Standard potentials (PBE, potpaw.64)".
The page revision id (oldid) printed in the page is recorded in the output, so a refresh shows in the diff.
The wiki answers 403 to urllib and to index.php?oldid= URLs from builder sessions, so fetch the page with curl:
    curl -sL https://www.vasp.at/wiki/Choosing_pseudopotentials -o page.html

Output: src/data/paw-recommended.json
Run:    python scripts/data/build_paw_table.py --html page.html [--date YYYY-MM-DD]
"""
import argparse
import datetime
import html
import json
import pathlib
import re

OUT = pathlib.Path(__file__).resolve().parents[2] / "src" / "data" / "paw-recommended.json"
URL = "https://www.vasp.at/wiki/Choosing_pseudopotentials"


def cells(row):
    return [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[dh].*?</t[dh]>", row, flags=re.S)]


def parse(page):
    start = page.find('id="Recommended_PAW_potentials"')
    if start < 0:
        raise SystemExit("section Recommended_PAW_potentials not found")
    table = re.search(r"<table.*?</table>", page[start:], flags=re.S).group(0)
    rows = [cells(r) for r in re.findall(r"<tr.*?</tr>", table, flags=re.S)]
    if not rows[0] or "Standard potentials (PBE, potpaw.64)" not in rows[0][0]:
        raise SystemExit(f"unexpected first table: {rows[0]}")
    if rows[1][:3] != ["Element", "Potential", "Number of valence electrons"]:
        raise SystemExit(f"unexpected header: {rows[1]}")
    out = {}
    for r in rows[2:]:
        if len(r) < 3 or not r[1]:
            continue
        el, pot, val = r[0], r[1], r[2]
        if not re.fullmatch(r"[A-Z][a-z]?", el):
            raise SystemExit(f"bad element cell: {r}")
        out[el] = {"potential": pot, "valence": float(val) if "." in val else int(val)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", required=True, help="saved copy of the page (fetched with curl, see above)")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    a = ap.parse_args()
    page = pathlib.Path(a.html).read_text(encoding="utf8")
    oldid = re.search(r"oldid=(\d+)", page)
    table = parse(page)
    data = {
        "_meta": {
            "generator": "scripts/data/build_paw_table.py",
            "source": "S-019",
            "page": "Choosing pseudopotentials, section Recommended PAW potentials, table Standard potentials (PBE, potpaw.64)",
            "url": URL,
            "oldid": int(oldid.group(1)) if oldid else None,
            "read": a.date,
            "note": "Names and valence counts only. No POTCAR content is hosted; users need their own licensed POTCAR library.",
        },
        "elements": table,
    }
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=True) + "\n")
    print(f"wrote {OUT.name}: {len(table)} elements")


if __name__ == "__main__":
    main()
