#!/usr/bin/env python
"""Generate golden k-path data for the TypeScript tests.

Two independent reference implementations:
  * seekpath 2.x  : HPKOT convention (Hinuma et al., Comput. Mater. Sci. 128, 140 (2017)).
                    This is what VASPKIT task 303 follows, per the author's Workflow Handbook.
  * pymatgen      : Setyawan-Curtarolo convention (Comput. Mater. Sci. 49, 299 (2010)),
                    HighSymmKpath(path_type="setyawan_curtarolo").

Output: tests/reference/kpaths.json
Run:    python scripts/reference/gen_kpaths.py
All structures are illustrative test fixtures, not claims about real materials.
"""
import json
import math
import pathlib
import warnings

import numpy as np
import seekpath
from pymatgen.core import Lattice, Structure
from pymatgen.symmetry.analyzer import SpacegroupAnalyzer
from pymatgen.symmetry.bandstructure import HighSymmKpath

warnings.filterwarnings("ignore")
OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "kpaths.json"
SYMPREC = 1e-3


def S(sg, lat, species, coords):
    return Structure.from_spacegroup(sg, lat, species, coords)


FIXTURES = {
    "fcc_Cu": S("Fm-3m", Lattice.cubic(3.61), ["Cu"], [[0, 0, 0]]),
    "bcc_Fe": S("Im-3m", Lattice.cubic(2.87), ["Fe"], [[0, 0, 0]]),
    "sc_Po_like": S("Pm-3m", Lattice.cubic(3.35), ["Po"], [[0, 0, 0]]),
    "hcp_Mg": S("P6_3/mmc", Lattice.hexagonal(3.21, 5.21), ["Mg"], [[1 / 3, 2 / 3, 0.25]]),
    "rocksalt_NaCl": S("Fm-3m", Lattice.cubic(5.64), ["Na", "Cl"], [[0, 0, 0], [0.5, 0.5, 0.5]]),
    "cubic_perovskite_SrTiO3": S(
        "Pm-3m", Lattice.cubic(3.905), ["Sr", "Ti", "O"], [[0, 0, 0], [0.5, 0.5, 0.5], [0.5, 0.5, 0]]
    ),
    "rutile_TiO2_tetragonal_P": S(
        "P4_2/mnm", Lattice.tetragonal(4.594, 2.959), ["Ti", "O"], [[0, 0, 0], [0.305, 0.305, 0]]
    ),
    # Body-centred tetragonal test cell in I4_1/amd. pymatgen's setting doubles the sites relative to
    # real anatase, so it is NOT anatase; it is only a valid tI test case.
    "bct_I41amd_test": S(
        "I4_1/amd", Lattice.tetragonal(3.785, 9.514), ["Ti", "O"], [[0, 0.75, 0.125], [0, 0.25, 0.0826]]
    ),
    # Pnma perovskite-like test cell (A, B, O1, O2). Parameters are illustrative only.
    "pnma_perovskite_like": S(
        "Pnma",
        Lattice.orthorhombic(5.54, 7.66, 5.38),
        ["Nd", "Cu", "O", "O"],
        [[0.04, 0.25, 0.99], [0, 0, 0.5], [0.48, 0.25, 0.08], [0.28, 0.03, 0.72]],
    ),
    "cmcm_orthorhombic_C": S(
        "Cmcm", Lattice.orthorhombic(3.2, 10.0, 3.8), ["Mo", "S"], [[0, 0.1, 0.25], [0, 0.35, 0.25]]
    ),
    "fmmm_orthorhombic_F": S("Fmmm", Lattice.orthorhombic(3.0, 4.5, 6.2), ["Ge"], [[0, 0, 0]]),
    "immm_orthorhombic_I": S("Immm", Lattice.orthorhombic(3.3, 4.1, 5.7), ["Ge"], [[0, 0, 0]]),
    "monoclinic_P21c_ZrO2_like": S(
        "P2_1/c",
        Lattice.monoclinic(5.15, 5.21, 5.31, 99.2),
        ["Zr", "O", "O"],
        [[0.275, 0.040, 0.208], [0.070, 0.332, 0.345], [0.450, 0.758, 0.480]],
    ),
    "monoclinic_C2m": S("C2/m", Lattice.monoclinic(9.0, 3.1, 5.6, 104.0), ["Si", "O"], [[0.1, 0, 0.2], [0.3, 0, 0.6]]),
    "triclinic_P1bar": S(
        "P-1", Lattice.from_parameters(4.1, 5.3, 6.2, 82.0, 95.0, 101.0), ["Ca", "Si", "O"],
        [[0.1, 0.2, 0.3], [0.6, 0.7, 0.1], [0.3, 0.4, 0.8]],
    ),
    "rhombohedral_Bi_like": S("R-3m", Lattice.hexagonal(4.55, 11.86), ["Bi"], [[0, 0, 0.234]]),
    "rhombohedral_alpha_Al2O3": S(
        "R-3c", Lattice.hexagonal(4.76, 12.99), ["Al", "O"], [[0, 0, 0.352], [0.306, 0, 0.25]]
    ),
    # Bernal graphite: C on 2b (0,0,1/4) and 2c (1/3,2/3,1/4).
    "graphite_hex": S("P6_3/mmc", Lattice.hexagonal(2.46, 6.71), ["C", "C"], [[0, 0, 0.25], [1 / 3, 2 / 3, 0.25]]),
    "diamond_Si": S("Fd-3m", Lattice.cubic(5.43), ["Si"], [[0, 0, 0]]),
}

# Fixtures chosen (by search) so that every HPKOT extended Bravais lattice (29) and every
# non-degenerate Setyawan-Curtarolo variant (20 of 23; ORCF3, MCLC2, MCLC4 are measure-zero
# boundary cases) appears at least once. Atoms sit on general positions where needed so that
# the intended (lower) space group survives symmetry detection. Not real materials.
VARIANT_FIXTURES = {
    "v_cP1_P2_13": S("P2_13", Lattice.cubic(5.0), ["Si"], [[0.1, 0.1, 0.1]]),
    "v_cF1_F23": S("F23", Lattice.cubic(7.0), ["Si", "Ge"], [[0.11, 0.23, 0.37], [0, 0, 0]]),
    "v_tI1_c_lt_a": S("I4/mmm", Lattice.tetragonal(4.0, 3.0), ["Ge"], [[0, 0, 0]]),
    "v_tI2_c_gt_a": S("I4/mmm", Lattice.tetragonal(3.0, 4.0), ["Ge"], [[0, 0, 0]]),
    "v_oF2_Fdd2": S("Fdd2", Lattice.orthorhombic(6.0, 5.0, 2.0), ["Si", "Ge"], [[0.11, 0.23, 0.37], [0, 0, 0]]),
    "v_oF3_Fmmm": S("Fmmm", Lattice.orthorhombic(4.0, 5.0, 3.5), ["Ge"], [[0, 0, 0]]),
    "v_oI2_Ima2": S("Ima2", Lattice.orthorhombic(6.0, 4.0, 3.0), ["Si", "Ge"], [[0.25, 0.1, 0.1], [0, 0, 0.4]]),
    "v_oI3_Imm2": S("Imm2", Lattice.orthorhombic(6.0, 4.0, 3.0), ["Si", "Ge"], [[0, 0, 0.1], [0, 0.5, 0.4]]),
    "v_oC2_Cmcm": S("Cmcm", Lattice.orthorhombic(10.0, 3.2, 3.8), ["Mo", "S"], [[0, 0.1, 0.25], [0, 0.35, 0.25]]),
    "v_oA1_Amm2": S("Amm2", Lattice.orthorhombic(3.0, 4.0, 6.0), ["Si", "Ge"], [[0, 0, 0.1], [0.5, 0.3, 0.4]]),
    "v_oA2_Amm2": S("Amm2", Lattice.orthorhombic(3.0, 6.0, 4.0), ["Si", "Ge"], [[0, 0, 0.1], [0.5, 0.3, 0.4]]),
    "v_hP1_P-3": S("P-3", Lattice.hexagonal(5.0, 4.0), ["Si", "Ge"], [[0.13, 0.37, 0.21], [0, 0, 0.4]]),
    "v_hR1_rhl1": S("R-3m", Lattice.hexagonal(4.0, 8.0), ["Bi"], [[0, 0, 0]]),
    "v_hR2_rhl2": S("R-3m", Lattice.hexagonal(4.0, 3.0), ["Bi"], [[0, 0, 0]]),
    "v_mC1_mclc1": S("C2/m", Lattice.monoclinic(5.0, 3.0, 3.0, 95.0), ["Ge"], [[0.1, 0, 0.2]]),
    "v_mC2_mclc3": S("C2/m", Lattice.monoclinic(3.0, 5.0, 3.0, 95.0), ["Ge"], [[0.1, 0, 0.2]]),
    "v_mC3_mclc5": S("C2/m", Lattice.monoclinic(3.0, 3.0, 3.0, 95.0), ["Ge"], [[0.1, 0, 0.2]]),
    "v_aP2_tria": S("P-1", Lattice.from_parameters(4.0, 5.0, 6.0, 60, 60, 60), ["Ge"], [[0.1, 0.2, 0.3]]),
    "v_aP2_trib": S("P-1", Lattice.from_parameters(4.0, 5.0, 6.0, 60, 85, 60), ["Ge"], [[0.1, 0.2, 0.3]]),
    "v_aP3_trib": S("P-1", Lattice.from_parameters(4.0, 5.0, 6.0, 60, 60, 75), ["Ge"], [[0.1, 0.2, 0.3]]),
}
ALL_HPKOT = {"aP2", "aP3", "cF1", "cF2", "cI1", "cP1", "cP2", "hP1", "hP2", "hR1", "hR2", "mC1", "mC2", "mC3", "mP1",
             "oA1", "oA2", "oC1", "oC2", "oF1", "oF2", "oF3", "oI1", "oI2", "oI3", "oP1", "tI1", "tI2", "tP1"}
ALL_SC = {"cubic", "fcc", "bcc", "tet", "bctet1", "bctet2", "orc", "orcf1", "orcf2", "orci", "orcc", "hex",
          "rhl1", "rhl2", "mcl", "mclc1", "mclc3", "mclc5", "tria", "trib"}

# Record which Setyawan-Curtarolo branch pymatgen takes (its class does not store the variant name).
import pymatgen.symmetry.kpath as _kp  # noqa: E402

_LAST_SC = {"variant": None}
for _name in sorted(ALL_SC | {"orcf3", "mclc2", "mclc4"}):
    _orig = getattr(_kp.KPathSetyawanCurtarolo, _name)

    def _wrap(self, *a, _o=_orig, _n=_name, **k):
        _LAST_SC["variant"] = _n
        return _o(self, *a, **k)

    setattr(_kp.KPathSetyawanCurtarolo, _name, _wrap)


def seekpath_entry(struct):
    cell = (struct.lattice.matrix.tolist(), struct.frac_coords.tolist(), [s.Z for s in struct.species])
    r = seekpath.get_path(cell, with_time_reversal=True, symprec=SYMPREC)
    return {
        "convention": "HPKOT (seekpath)",
        "bravais_lattice": r["bravais_lattice"],
        "bravais_lattice_extended": r["bravais_lattice_extended"],
        "spacegroup_number": r["spacegroup_number"],
        "spacegroup_international": r["spacegroup_international"],
        "path": r["path"],
        "point_coords": r["point_coords"],
        "primitive_lattice_rows": np.array(r["primitive_lattice"]).round(10).tolist(),
        "primitive_positions": np.array(r["primitive_positions"]).round(10).tolist(),
        "primitive_types": r["primitive_types"],
        "conv_lattice_rows": np.array(r["conv_lattice"]).round(10).tolist(),
        "primitive_transformation_matrix": np.array(r["primitive_transformation_matrix"]).round(10).tolist(),
        "inverse_primitive_transformation_matrix": np.array(
            r["inverse_primitive_transformation_matrix"]
        ).round(10).tolist(),
        "reciprocal_primitive_lattice_rows_with_2pi": np.array(r["reciprocal_primitive_lattice"]).round(10).tolist(),
    }


def pmg_sc_entry(struct):
    _LAST_SC["variant"] = None
    kp = HighSymmKpath(struct, symprec=SYMPREC, path_type="setyawan_curtarolo")
    kpath = kp.kpath
    prim = kp.prim
    sga = SpacegroupAnalyzer(struct, symprec=SYMPREC)
    return {
        "convention": "Setyawan-Curtarolo (pymatgen)",
        "sc_variant": _LAST_SC["variant"],
        "lattice_type_pymatgen": sga.get_lattice_type(),
        "spacegroup_number": sga.get_space_group_number(),
        "spacegroup_symbol": sga.get_space_group_symbol(),
        "path": kpath["path"],
        "point_coords": {k: [round(float(x), 10) for x in v] for k, v in kpath["kpoints"].items()},
        "primitive_lattice_rows": np.array(prim.lattice.matrix).round(10).tolist(),
        "reciprocal_primitive_lattice_rows_with_2pi": np.array(prim.lattice.reciprocal_lattice.matrix).round(10).tolist(),
        "conventional_lattice_parameters_abc_angles": [
            round(float(x), 8) for x in kp.conventional.lattice.parameters
        ],
    }


def _json_default(o):
    if hasattr(o, "tolist"):
        return o.tolist()
    return float(o)


def main():
    out = {
        "_meta": {
            "generator": "scripts/reference/gen_kpaths.py",
            "seekpath_version": seekpath.__version__,
            "symprec": SYMPREC,
            "note": (
                "Fixtures are illustrative cells. Coordinates are fractional in the basis of the "
                "REFERENCE RECIPROCAL primitive lattice of the standardized cell; compare with the "
                "TypeScript output only after applying the same standardization."
            ),
        },
        "structures": {},
    }
    for name, st in {**FIXTURES, **VARIANT_FIXTURES}.items():
        entry = {"input": {
            "lattice_rows": np.array(st.lattice.matrix).round(10).tolist(),
            "frac_coords": np.array(st.frac_coords).round(10).tolist(),
            "atomic_numbers": [s.Z for s in st.species],
            "n_atoms": len(st),
        }}
        entry["hpkot"] = seekpath_entry(st)
        try:
            entry["setyawan_curtarolo"] = pmg_sc_entry(st)
        except Exception as exc:  # keep generating; record the failure honestly
            entry["setyawan_curtarolo"] = {"error": f"{type(exc).__name__}: {exc}"}
        out["structures"][name] = entry
        sc = entry["setyawan_curtarolo"]
        print(
            f"{name:30s} hpkot={entry['hpkot']['bravais_lattice_extended']:8s} "
            f"sc={str(sc.get('sc_variant', sc.get('error', '')))[:40]}"
        )
    got_h = {e["hpkot"]["bravais_lattice_extended"] for e in out["structures"].values()}
    got_s = {e["setyawan_curtarolo"].get("sc_variant") for e in out["structures"].values()}
    assert ALL_HPKOT <= got_h, f"missing HPKOT variants: {sorted(ALL_HPKOT - got_h)}"
    assert ALL_SC <= got_s, f"missing SC variants: {sorted(ALL_SC - got_s)}"
    out["_meta"]["coverage"] = {"hpkot_extended_bravais": sorted(got_h), "setyawan_curtarolo_variants": sorted(x for x in got_s if x)}
    # Cross-convention sanity: for fcc the labelled points of both conventions agree.
    h = out["structures"]["fcc_Cu"]["hpkot"]["point_coords"]
    s = out["structures"]["fcc_Cu"]["setyawan_curtarolo"]["point_coords"]
    for lab in ("GAMMA", "X", "L", "W", "K"):
        a = np.array(h[lab]); b = np.array(s["\\Gamma" if lab == "GAMMA" else lab])
        assert np.allclose(a, b, atol=1e-8), (lab, a, b)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, default=_json_default) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
