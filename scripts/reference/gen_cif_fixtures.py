#!/usr/bin/env python
"""Golden CIF fixtures for the CIF parser (stage M5.1).

pymatgen's CifWriter (an implementation independent of the TypeScript parser) writes each structure
twice: symmetrized (space-group setting with symmetry operations) and in P1. Edge-case variants are
derived by plain text edits that are described in `expected.json`, so a builder never writes crystal
files from memory.

Output: tests/reference/cif/*.cif and tests/reference/cif/expected.json
Run:    python scripts/reference/gen_cif_fixtures.py   (after gen_kpaths.py, whose fixtures it reuses)
"""
import json
import pathlib
import re
import sys
import warnings

from pymatgen.io.cif import CifWriter
from pymatgen.symmetry.analyzer import SpacegroupAnalyzer

warnings.filterwarnings("ignore")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from gen_kpaths import FIXTURES  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "cif"
NAMES = [
    "rocksalt_NaCl", "diamond_Si", "hcp_Mg", "graphite_hex", "rutile_TiO2_tetragonal_P",
    "pnma_perovskite_like", "rhombohedral_alpha_Al2O3", "monoclinic_P21c_ZrO2_like", "triclinic_P1bar",
]


def describe(struct):
    sga = SpacegroupAnalyzer(struct, symprec=1e-3)
    conv = sga.get_conventional_standard_structure()
    return {
        "spacegroup_number": sga.get_space_group_number(),
        "spacegroup_symbol": sga.get_space_group_symbol(),
        "reduced_formula": struct.composition.reduced_formula,
        "n_atoms_input_cell": len(struct),
        "n_atoms_conventional": len(conv),
        "lattice_abc": [round(x, 6) for x in struct.lattice.abc],
        "lattice_angles": [round(x, 6) for x in struct.lattice.angles],
        "volume": round(struct.volume, 6),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    expected = {"_meta": {
        "generator": "scripts/reference/gen_cif_fixtures.py",
        "writer": "pymatgen.io.cif.CifWriter",
        "note": "Symmetrized files must expand to n_atoms_input_cell sites; P1 files list them all. "
                "Compare lattice parameters to 1e-4 and atom counts exactly.",
    }, "files": {}}
    for name in NAMES:
        st = FIXTURES[name]
        meta = describe(st)
        sym = str(CifWriter(st, symprec=1e-3))
        p1 = str(CifWriter(st))
        (OUT / f"{name}.sym.cif").write_text(sym)
        (OUT / f"{name}.p1.cif").write_text(p1)
        expected["files"][f"{name}.sym.cif"] = {**meta, "kind": "symmetrized", "accept": True}
        expected["files"][f"{name}.p1.cif"] = {**meta, "kind": "P1", "accept": True}

    base = (OUT / "rocksalt_NaCl.sym.cif").read_text()
    meta = expected["files"]["rocksalt_NaCl.sym.cif"]

    # Variant 1: standard uncertainties in parentheses on cell lengths and coordinates.
    unc = re.sub(r"(_cell_length_[abc]\s+)(\d+\.\d+)", r"\g<1>\g<2>(3)", base)
    (OUT / "edge_uncertainties.cif").write_text(unc)
    expected["files"]["edge_uncertainties.cif"] = {**meta, "kind": "edit: '(3)' appended to cell lengths", "accept": True}

    # Variant 2: the older symmetry tag name.
    old = base.replace("_symmetry_equiv_pos_as_xyz", "_space_group_symop_operation_xyz") \
        if "_symmetry_equiv_pos_as_xyz" in base else base.replace("_space_group_symop_operation_xyz", "_symmetry_equiv_pos_as_xyz")
    (OUT / "edge_alternate_symop_tag.cif").write_text(old)
    expected["files"]["edge_alternate_symop_tag.cif"] = {**meta, "kind": "edit: symmetry-operation loop tag renamed to the other accepted name", "accept": True}

    # Variant 3: partial occupancy must be rejected with an explanation (VASP needs ordered sites).
    part = re.sub(r"(\n\s*Na\s+Na\d*\s+\d+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+)1(\s*\n)", r"\g<1>0.5\g<2>", base, count=1)
    assert part != base, "partial-occupancy edit did not apply; check the CifWriter layout"
    (OUT / "edge_partial_occupancy.cif").write_text(part)
    expected["files"]["edge_partial_occupancy.cif"] = {"kind": "edit: first Na occupancy set to 0.5", "accept": False,
                                                       "reason": "partial occupancy (disorder) cannot be written as a VASP POSCAR"}

    # Variant 4: two data blocks in one file; the parser must list both and let the user choose.
    two = base + "\n" + (OUT / "hcp_Mg.sym.cif").read_text()
    (OUT / "edge_two_blocks.cif").write_text(two)
    expected["files"]["edge_two_blocks.cif"] = {"kind": "concatenation of rocksalt_NaCl.sym.cif and hcp_Mg.sym.cif",
                                                "accept": True, "n_blocks": 2,
                                                "blocks": [meta, expected["files"]["hcp_Mg.sym.cif"]]}

    (OUT / "expected.json").write_text(json.dumps(expected, indent=1) + "\n")
    for k, v in expected["files"].items():
        print(f"{k:38s} accept={v['accept']!s:5s} SG={v.get('spacegroup_number', '-')} n={v.get('n_atoms_input_cell', '-')}")


if __name__ == "__main__":
    main()
