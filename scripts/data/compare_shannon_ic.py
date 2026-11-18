#!/usr/bin/env python
"""Compare src/data/shannon-radii.json with the Imperial College online Shannon database.

The database (http://abulafia.mt.ic.ac.uk/shannon/radius.php, all elements on one page) states that all its
data are taken from Shannon, Acta Cryst. A32, 751 (1976). It is a second transcription of S-001, not the
original paper, and pymatgen's table may have been built from it, so agreement is evidence of a faithful
copy, not a fully independent check (Q-002).

Usage (stdlib only; the saved HTML page is read, nothing is fetched here):
    curl -sS http://abulafia.mt.ic.ac.uk/shannon/radius.php -o ic.html
    python -I scripts/data/compare_shannon_ic.py ic.html
Prints per-element counts and every difference.
"""
import collections, html.parser, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10,
         "XI": 11, "XII": 12, "XIII": 13, "XIV": 14}
SPIN = {"": None, "High Spin": "HS", "Low Spin": "LS"}


class Table(html.parser.HTMLParser):
    """Collects table rows as lists of (text, rowspan)."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.rows, self.row, self.cell, self.span = [], None, None, 1

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell, self.span = "", int(dict(attrs).get("rowspan", "1"))

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append((self.cell.replace("&nbsp", "").strip(), self.span))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell += data


def parse(path):
    p = Table()
    p.feed(pathlib.Path(path).read_text(encoding="utf-8", errors="replace"))
    out, carry = [], [None] * 7  # [text, remaining rows] per column
    for raw in p.rows:
        cells, it = [], iter(raw)
        for c in range(7):
            if carry[c] and carry[c][1] > 0:
                cells.append(carry[c][0])
                carry[c][1] -= 1
                continue
            try:
                text, span = next(it)
            except StopIteration:
                break
            cells.append(text)
            carry[c] = [text, span - 1]
        if len(cells) < 6:
            continue
        el, ox, cn_key, spin, crystal, ionic = cells[:6]
        try:
            crystal, ionic, ox = float(crystal), float(ionic), int(ox)
        except ValueError:
            continue  # header rows
        base = cn_key.rstrip("SQPY") if cn_key.endswith(("SQ", "PY")) else cn_key
        geom = cn_key[len(base):] or None
        out.append({"el": el, "ox": ox, "cn": ROMAN[base], "geometry": geom, "spin": SPIN[spin],
                    "ionic": ionic, "crystal": crystal})
    return out


def key(e):
    return (e["el"], e["ox"], e["cn"], e["geometry"], e["spin"])


def main():
    ic = parse(sys.argv[1])
    ours = json.loads((ROOT / "src/data/shannon-radii.json").read_text())["entries"]
    a, b = {key(e): e for e in ours if e["ox"] is not None}, {key(e): e for e in ic}
    print(f"bundled: {len(ours)} entries, {len({e['el'] for e in ours})} elements;"
          f" IC: {len(ic)} rows, {len({e['el'] for e in ic})} elements")
    ca, cb = collections.Counter(e["el"] for e in ours), collections.Counter(e["el"] for e in ic)
    diff_counts = {el: (ca[el], cb[el]) for el in sorted(set(ca) | set(cb)) if ca[el] != cb[el]}
    print("elements whose entry counts differ (bundled, IC):", diff_counts or "none")
    print("only in bundled:", sorted(set(a) - set(b), key=str) or "none")
    print("only in IC:", [(k, b[k]["ionic"], b[k]["crystal"]) for k in sorted(set(b) - set(a), key=str)] or "none")
    print("ox-less bundled entries:", [(e["el"], e["cn"], e["ionic"], e["crystal"]) for e in ours if e["ox"] is None])
    vals = [(k, (a[k]["ionic"], a[k]["crystal"]), (b[k]["ionic"], b[k]["crystal"])) for k in sorted(set(a) & set(b), key=str)
            if abs(a[k]["ionic"] - b[k]["ionic"]) > 1e-9 or abs(a[k]["crystal"] - b[k]["crystal"]) > 1e-9]
    print(f"shared keys: {len(set(a) & set(b))}; value differences:", vals or "none")


if __name__ == "__main__":
    main()
