#!/usr/bin/env python
"""Golden data for the Perovskite Tolerance Factor Explorer (milestone M8).

Sources:
  * Shannon ionic radii: pymatgen's bundled table (MIT-licensed code; data from
    R. D. Shannon, Acta Cryst. A32, 751 (1976)). Before using, this script asserts that every
    "anchor" radius agrees with a textbook value written down from memory. A mismatch aborts generation.
    Caveat: several anchors were written after the same pymatgen values had been displayed, so this is
    a consistency check, not an independent verification (docs/OPEN_QUESTIONS.md Q-002).
  * Formulas, implemented here independently of the TypeScript code:
      Goldschmidt t = (rA + rX) / (sqrt(2) (rB + rX))
      octahedral factor mu = rB / rX
      Bartel tau = rX/rB - nA * (nA - (rA/rB) / ln(rA/rB)); perovskite predicted if tau < 4.18
        (C. J. Bartel et al., Sci. Adv. 5, eaav0693 (2019)).

STATUS OF THE tau FORMULA: written from memory; the paper could not be fetched when this file
was created (arxiv.org / PMC unreachable from the sandbox). docs/OPEN_QUESTIONS.md Q-003 requires
confirming the equation, the 4.18 threshold and the radius convention against the paper
before milestone M8.2 is accepted.

Output: tests/reference/perovskite_reference.json
"""
import json
import math
import pathlib

from pymatgen.core import Element

OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "perovskite_reference.json"
ROMAN = {4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X", 11: "XI", 12: "XII"}

# (symbol, oxidation state, CN, spin or "", recalled Shannon *ionic* radius in Angstrom)
ANCHORS = [
    ("Sr", 2, 12, "", 1.44), ("Ba", 2, 12, "", 1.61), ("Ca", 2, 12, "", 1.34),
    ("La", 3, 12, "", 1.36), ("Nd", 3, 12, "", 1.27), ("Nd", 3, 9, "", 1.163), ("Nd", 3, 8, "", 1.109),
    ("Y", 3, 9, "", 1.075), ("Lu", 3, 9, "", 1.032), ("Cs", 1, 12, "", 1.88), ("Rb", 1, 12, "", 1.72),
    ("K", 1, 12, "", 1.64), ("Na", 1, 12, "", 1.39), ("Pb", 2, 12, "", 1.49), ("Pb", 2, 6, "", 1.19),
    ("Ti", 4, 6, "", 0.605), ("Zr", 4, 6, "", 0.72), ("Al", 3, 6, "", 0.535), ("Mg", 2, 6, "", 0.72),
    ("Nb", 5, 6, "", 0.64), ("Mn", 3, 6, "High Spin", 0.645), ("Fe", 3, 6, "High Spin", 0.645),
    ("Fe", 3, 6, "Low Spin", 0.55), ("Co", 3, 6, "Low Spin", 0.545), ("Co", 3, 6, "High Spin", 0.61),
    ("Ni", 3, 6, "Low Spin", 0.56), ("Ni", 3, 6, "High Spin", 0.60), ("Cu", 3, 6, "Low Spin", 0.54),
    ("Cu", 2, 6, "", 0.73), ("O", -2, 6, "", 1.40), ("F", -1, 6, "", 1.33), ("Cl", -1, 6, "", 1.81),
    ("Br", -1, 6, "", 1.96), ("I", -1, 6, "", 2.20),
]


def radius(sym, ox, cn, spin="", kind="ionic_radius"):
    table = Element(sym).data["Shannon radii"][str(ox)]
    return table[ROMAN[cn]][spin][kind]


def factors(rA, rB, rX, nA):
    t = (rA + rX) / (math.sqrt(2) * (rB + rX))
    mu = rB / rX
    ratio = rA / rB
    tau = None if math.isclose(ratio, 1.0) else rX / rB - nA * (nA - ratio / math.log(ratio))
    return t, mu, tau


def ion(sym, ox, cn, spin=""):
    return {"symbol": sym, "oxidation": ox, "cn": cn, "spin": spin, "r_ionic": radius(sym, ox, cn, spin)}


def compound(name, A, B, X):
    rA, rB, rX = A["r_ionic"], B["r_ionic"], X["r_ionic"]
    t, mu, tau = factors(rA, rB, rX, A["oxidation"])
    charge = A["oxidation"] + B["oxidation"] + 3 * X["oxidation"]
    return {
        "formula": name, "A": A, "B": B, "X": X,
        "charge_balance_sum": charge,
        "t": round(t, 6), "mu": round(mu, 6),
        "tau": None if tau is None else round(tau, 6),
        "tau_predicts_perovskite": None if tau is None else tau < 4.18,
    }


def main():
    # 1) Anchor cross-check against recalled Shannon values.
    anchors_out = []
    for sym, ox, cn, spin, recalled in ANCHORS:
        got = radius(sym, ox, cn, spin)
        assert abs(got - recalled) < 5e-4, f"Shannon mismatch {sym}{ox:+d} CN{cn} {spin}: pymatgen {got} vs recalled {recalled}"
        anchors_out.append({"symbol": sym, "oxidation": ox, "cn": cn, "spin": spin,
                            "ionic": got, "crystal": radius(sym, ox, cn, spin, "crystal_radius")})

    O = lambda: ion("O", -2, 6)
    comps = [
        compound("SrTiO3", ion("Sr", 2, 12), ion("Ti", 4, 6), O()),
        compound("BaTiO3", ion("Ba", 2, 12), ion("Ti", 4, 6), O()),
        compound("CaTiO3", ion("Ca", 2, 12), ion("Ti", 4, 6), O()),
        compound("SrZrO3", ion("Sr", 2, 12), ion("Zr", 4, 6), O()),
        compound("BaZrO3", ion("Ba", 2, 12), ion("Zr", 4, 6), O()),
        compound("LaAlO3", ion("La", 3, 12), ion("Al", 3, 6), O()),
        compound("LaMnO3_HS", ion("La", 3, 12), ion("Mn", 3, 6, "High Spin"), O()),
        compound("LaNiO3_LS", ion("La", 3, 12), ion("Ni", 3, 6, "Low Spin"), O()),
        compound("LaCuO3_Cu3+LS", ion("La", 3, 12), ion("Cu", 3, 6, "Low Spin"), O()),
        compound("NdCuO3_Cu3+LS", ion("Nd", 3, 12), ion("Cu", 3, 6, "Low Spin"), O()),
        compound("NdCuO3_Cu3+LS_A_CN9", ion("Nd", 3, 9), ion("Cu", 3, 6, "Low Spin"), O()),
        compound("KNbO3", ion("K", 1, 12), ion("Nb", 5, 6), O()),
        compound("NaNbO3", ion("Na", 1, 12), ion("Nb", 5, 6), O()),
        compound("CsPbCl3", ion("Cs", 1, 12), ion("Pb", 2, 6), ion("Cl", -1, 6)),
        compound("CsPbBr3", ion("Cs", 1, 12), ion("Pb", 2, 6), ion("Br", -1, 6)),
        compound("CsPbI3", ion("Cs", 1, 12), ion("Pb", 2, 6), ion("I", -1, 6)),
    ]
    for c in comps:
        assert c["charge_balance_sum"] == 0, c["formula"]

    # 2) Lanthanide family sweep for RCuO3 (B = Cu3+ low spin CN6, X = O2- CN6) under CN policies.
    ln = ["La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu"]
    rB, rX = radius("Cu", 3, 6, "Low Spin"), radius("O", -2, 6)
    sweep = {"B": "Cu3+ LS CN6", "rB": rB, "X": "O2- CN6", "rX": rX, "policies": {}}
    for label, cn in (("CN12_only_missing_is_null", 12), ("CN9_all", 9), ("CN8_all", 8)):
        rows = []
        for sym in ln:
            try:
                rA = radius(sym, 3, cn)
            except KeyError:
                rows.append({"R": sym, "cn": cn, "rA": None, "t": None, "mu": round(rB / rX, 6), "tau": None})
                continue
            t, mu, tau = factors(rA, rB, rX, 3)
            rows.append({"R": sym, "cn": cn, "rA": rA, "t": round(t, 6), "mu": round(mu, 6), "tau": round(tau, 6)})
        sweep["policies"][label] = rows

    # 3) Which lanthanides have which CN (documents the CN12 gap).
    coverage = {s: sorted(Element(s).data["Shannon radii"]["3"].keys(), key=lambda r: list(ROMAN.values()).index(r)
                          if r in ROMAN.values() else 99) for s in ln + ["Y"]}

    doc = {
        "_meta": {
            "generator": "scripts/reference/gen_perovskite_reference.py",
            "radii_source": "pymatgen periodic_table.json (Shannon 1976 data); anchors are a consistency check only, not independent (Q-002)",
            "tau_status": "FORMULA FROM MEMORY, UNCONFIRMED AGAINST PAPER (see docs/OPEN_QUESTIONS.md Q-003)",
            "radius_kind": "Shannon effective IONIC radius (not crystal radius)",
        },
        "anchor_radii": anchors_out,
        "compounds": comps,
        "rcuo3_family_sweep": sweep,
        "ln3plus_shannon_cn_coverage": coverage,
    }
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    for c in comps:
        print(f"{c['formula']:24s} t={c['t']:.4f} mu={c['mu']:.4f} tau={c['tau']}")
    print("CN12 available for:", [s for s, v in coverage.items() if "XII" in v])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
