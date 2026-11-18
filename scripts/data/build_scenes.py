#!/usr/bin/env python3
"""Write src/data/scene-structures.json and src/data/scenes/*.json (M12.2).

Crystal cells are copied from tests/reference/kpaths.json (made by scripts/reference/gen_kpaths.py). Those fixtures are
"illustrative cells", so every scene made from them carries the badge `illustrative`. The magnetic presets are a toy 2x2x2
simple-cubic cell with hand-set signs (M13.1 replaces them with generated orderings) and carry the badge `toy-model`.
Run: python3 scripts/data/build_scenes.py
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
gold = json.loads((root / "tests/reference/kpaths.json").read_text())["structures"]
Z = {6: "C", 8: "O", 11: "Na", 12: "Mg", 14: "Si", 17: "Cl", 22: "Ti", 26: "Fe", 29: "Cu", 38: "Sr", 25: "Mn"}


def from_gold(key):
    g = gold[key]["input"]
    return {
        "lattice": g["lattice_rows"],
        "species": [Z[n] for n in g["atomic_numbers"]],
        "frac": g["frac_coords"],
    }


structures = {
    "sc": {"lattice": gold["sc_Po_like"]["input"]["lattice_rows"], "species": ["Po"], "frac": [[0, 0, 0]]},
    "bcc": from_gold("bcc_Fe"),
    "fcc": from_gold("fcc_Cu"),
    "hcp": from_gold("hcp_Mg"),
    "rocksalt": from_gold("rocksalt_NaCl"),
    "perovskite": from_gold("cubic_perovskite_SrTiO3"),
    "diamond": from_gold("diamond_Si"),
    "graphite": from_gold("graphite_hex"),
}
a = 3.61
structures["fcc-primitive"] = {
    "lattice": [[0, a / 2, a / 2], [a / 2, 0, a / 2], [a / 2, a / 2, 0]],
    "species": ["Cu"],
    "frac": [[0, 0, 0]],
}
# toy magnetic cell: 2x2x2 simple cubic, a = 2 x 2.9 A (illustrative number)
b = 2.9
sites = [[i / 2, j / 2, k / 2] for i in range(2) for j in range(2) for k in range(2)]
structures["cubic-2x2x2"] = {"lattice": [[2 * b, 0, 0], [0, 2 * b, 0], [0, 0, 2 * b]], "species": ["Mn"] * 8, "frac": sites}


def sign(kind, f):
    i, j, k = (int(round(2 * x)) for x in f)
    return {"fm": 1, "a": 1 if k % 2 == 0 else -1, "c": 1 if (i + j) % 2 == 0 else -1, "g": 1 if (i + j + k) % 2 == 0 else -1}[kind]


def preset(id, alt, structure, caption, badge="illustrative", **kw):
    d = {"id": id, "badge": badge, "alt": alt, "caption": caption, "structure": {"ref": structure}}
    d.update(kw)
    return d


presets = [
    preset("sc", "Simple cubic cell: one atom at each of the eight corners of a cube, shown with the cell edges.", "sc",
           "Simple cubic: one lattice point per cell.", camera="iso"),
    preset("bcc", "Body-centred cubic cell: an atom at each corner of a cube and one in its centre.", "bcc",
           "Body-centred cubic: the conventional cell holds 2 atoms.", camera="iso", show={"bonds": True}),
    preset("fcc", "Face-centred cubic cell: an atom at each corner and in the middle of each face of a cube.", "fcc",
           "Face-centred cubic: the conventional cell holds 4 atoms, the picture shows 14 because boundary atoms are drawn on every face.",
           camera="iso", show={"bonds": True}),
    preset("hcp", "Hexagonal close-packed cell: a rhombic prism with two atoms in layers one half of c apart.", "hcp",
           "Hexagonal close-packed: two atoms per cell, the second layer sits over the hollows of the first.",
           camera={"azimuth": 20, "elevation": 25}, repeat=[2, 2, 1], show={"bonds": True}),
    preset("rocksalt", "Rock-salt structure: sodium and chlorine atoms alternate on a cubic grid, each with six neighbours of the other kind.",
           "rocksalt", "Rock salt (NaCl): every atom has six neighbours of the other element, drawn as an octahedron around Na.",
           camera="iso", show={"polyhedra": {"centre": ["Na"], "ligand": ["Cl"], "cutoffA": 3.0}}),
    preset("perovskite-octahedra", "Cubic perovskite SrTiO3: a titanium atom at the cell centre inside an octahedron of six oxygen atoms, strontium at the corners.",
           "perovskite", "Cubic perovskite SrTiO3: the TiO6 octahedron is the building block that tilts and distorts in real perovskites.",
           camera="iso", show={"bonds": False},
           steps=[
               {"title": "The cell", "text": "One strontium, one titanium and three oxygen atoms in a cubic cell."},
               {"title": "Six oxygens around titanium", "text": "Join the six nearest oxygen atoms and a cage appears.",
                "show": {"polyhedra": {"centre": ["Ti"], "ligand": ["O"], "cutoffA": 2.3}}, "highlight": [1]},
               {"title": "Look down the c axis", "text": "From above the octahedron is a square; tilts in real perovskites show up here.",
                "show": {"polyhedra": {"centre": ["Ti"], "ligand": ["O"], "cutoffA": 2.3}}, "camera": "c"},
           ]),
    preset("diamond", "Diamond cubic cell: each atom bonded to four neighbours at the corners of a tetrahedron.", "diamond",
           "Diamond structure (Si cell): every atom has four bonded neighbours.", camera="iso", show={"bonds": True}),
    preset("graphite", "Graphite: hexagonal layers of carbon atoms stacked along c, bonded within a layer.", "graphite",
           "Graphite: strong bonds inside each layer, weak stacking between layers. Bonds shown are the in-cell ones only.",
           camera={"azimuth": 15, "elevation": 30}, repeat=[2, 2, 1], show={"bonds": True}),
]
for kind, name, text in [
    ("fm", "fm-cubic", "ferromagnetic: every moment points up"),
    ("a", "afm-a", "A-type antiferromagnetic: layers along c alternate up and down"),
    ("c", "afm-c", "C-type antiferromagnetic: neighbours in a layer alternate, layers stack the same way"),
    ("g", "afm-g", "G-type antiferromagnetic: every neighbour is opposite"),
]:
    spins = [sign(kind, f) for f in sites]
    presets.append(
        preset(name, f"Eight atoms in a 2 by 2 by 2 cubic cell, {text}. Up arrows have a solid head and a plus sign, down arrows an open head and a minus sign.",
               "cubic-2x2x2", f"Toy model, hand-set signs: {text}. Moments are drawn as unit arrows, not computed values.",
               badge="toy-model", spins=spins, camera={"azimuth": 30, "elevation": 22}, show={"bonds": False}))
presets.append(
    preset("miller-111-fcc", "Face-centred cubic cell with the (111) plane drawn as a triangle through the three cube corners next to the origin.",
           "fcc", "The (111) plane of fcc: the most densely packed plane.", camera="iso",
           planes=[{"hkl": [1, 1, 1]}], vectors=[{"space": "real", "index": 0}, {"space": "real", "index": 1}, {"space": "real", "index": 2}]))
presets.append(
    preset("reciprocal-fcc", "Primitive fcc cell with its three real-space lattice vectors a, b, c and the three reciprocal vectors a*, b*, c*.",
           "fcc-primitive", "Real and reciprocal lattice vectors of fcc. The reciprocal vectors are scaled to fit the picture; only directions and relative lengths are meaningful.",
           camera="iso", vectors=[{"space": "real", "index": i} for i in range(3)] + [{"space": "reciprocal", "index": i} for i in range(3)]))

(root / "src/data").mkdir(exist_ok=True)
(root / "src/data/scene-structures.json").write_text(json.dumps(structures, indent=1) + "\n")
out = root / "src/data/scenes"
out.mkdir(exist_ok=True)
for p in presets:
    (out / f"{p['id']}.json").write_text(json.dumps(p, indent=1) + "\n")
print(len(presets), "presets,", len(structures), "structures")
