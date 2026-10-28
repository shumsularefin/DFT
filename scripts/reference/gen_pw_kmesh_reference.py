#!/usr/bin/env python
"""Golden data for plane-wave counting (ENCUT lab) and k-meshes (k-point lab, KPOINTS builder).

Output: tests/reference/pw_kmesh_reference.json

Contents
  * hbar^2/2m_e in eV*Angstrom^2 from CODATA via scipy.constants (and the value 3.80998 VASP uses).
  * Exact plane-wave counts at Gamma: #{G : (hbar^2/2m) |G|^2 <= ENCUT}, G = integer combinations of
    reciprocal vectors WITH the 2*pi factor, compared to the continuum estimate V k_c^3 / (6 pi^2).
  * Monkhorst-Pack and Gamma-centred mesh coordinates for small meshes (formulas of Monkhorst & Pack,
    Phys. Rev. B 13, 5188 (1976)).
  * Irreducible k-point counts from spglib for fcc Cu (primitive cell).
  * Whether each mesh is mapped onto itself by the point group (hcp Mg, fcc Cu, sc, bcc Fe): evidence for Q-017.
  * KSPACING -> mesh under three candidate rounding rules, to be settled by the calibration runs in
    docs/OPEN_QUESTIONS.md Q-004 (the VASP wiki could not be fetched when this was written).
"""
import itertools
import json
import math
import pathlib

import numpy as np
import spglib
from scipy import constants as C

OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "pw_kmesh_reference.json"
HB2_2M = (C.hbar**2 / (2 * C.m_e)) / C.e * 1e20  # eV * Angstrom^2


def recip(A):
    return 2 * math.pi * np.linalg.inv(np.array(A, float)).T


def n_pw(A, encut):
    B = recip(A)
    kc = math.sqrt(encut / HB2_2M)
    # Rigorous bound for any (even skewed) basis: G = sum n_i b_i and a_j . b_i = 2 pi delta_ij,
    # so n_i = G . a_i / (2 pi) and |n_i| <= kc |a_i| / (2 pi).
    lens = np.linalg.norm(np.array(A, float), axis=1)
    nmax = [int(math.floor(kc * L / (2 * math.pi))) + 1 for L in lens]
    count = 0
    for n in itertools.product(*(range(-m, m + 1) for m in nmax)):
        g = np.array(n) @ B
        if HB2_2M * (g @ g) <= encut + 1e-12:
            count += 1
    vol = abs(np.linalg.det(np.array(A, float)))
    return count, vol * kc**3 / (6 * math.pi**2), kc


def mp_coords(q, gamma_centred):
    if gamma_centred:
        return [round(i / q if i / q <= 0.5 else i / q - 1, 12) for i in range(q)]
    return [round((2 * r - q - 1) / (2 * q), 12) for r in range(1, q + 1)]


def irreducible(lattice, positions, numbers, mesh, shift):
    mapping, grid = spglib.get_ir_reciprocal_mesh(
        mesh, (lattice, positions, numbers), is_shift=shift, symprec=1e-5
    )
    return int(len(set(mapping.tolist())))


def mesh_points(n, gamma_centred):
    ks = [i / n for i in range(n)] if gamma_centred else [(2 * r - n - 1) / (2 * n) for r in range(1, n + 1)]
    return np.array([[x, y, z] for x in ks for y in ks for z in ks])


def mesh_is_symmetric(lattice, positions, numbers, n, gamma_centred):
    """True if the whole mesh maps onto itself under the crystal's point group (reciprocal action)."""
    ds = spglib.get_symmetry_dataset((lattice, positions, numbers), symprec=1e-5)
    pts = mesh_points(n, gamma_centred)
    key = lambda v: tuple(np.round(np.asarray(v) % 1.0, 6) % 1.0)
    have = {key(v) for v in pts}
    for rot in ds.rotations:
        rk = np.linalg.inv(rot).T
        if any(key(rk @ v) not in have for v in pts):
            return False
    return True


def main():
    fcc_prim = lambda a: [[0, a / 2, a / 2], [a / 2, 0, a / 2], [a / 2, a / 2, 0]]
    cells = {
        "fcc_Cu_a3.61_primitive": fcc_prim(3.61),
        "Si_a5.43_primitive": fcc_prim(5.43),
        "sc_a4.0": [[4, 0, 0], [0, 4, 0], [0, 0, 4]],
        "hex_a3.0_c5.0": [[3.0, 0, 0], [-1.5, 3.0 * math.sqrt(3) / 2, 0], [0, 0, 5.0]],
    }
    pw = []
    for name, A in cells.items():
        for encut in (100, 200, 300, 400, 520):
            n, est, kc = n_pw(A, encut)
            pw.append({"cell": name, "lattice_rows": A, "encut_eV": encut, "G_cut_1_per_A": kc,
                       "n_pw_exact": n, "n_pw_continuum_estimate": est})

    meshes = {}
    for q in (1, 2, 3, 4, 5, 6):
        meshes[str(q)] = {
            "monkhorst_pack": mp_coords(q, False),
            "gamma_centred": mp_coords(q, True),
        }

    cu = (fcc_prim(3.61), [[0, 0, 0]], [29])
    ir = []
    for q in (2, 4, 6, 8, 10, 12):
        ir.append({"system": "fcc_Cu_primitive", "mesh": [q, q, q],
                   "gamma_centred_irreducible": irreducible(*cu, [q, q, q], [0, 0, 0]),
                   "shifted_irreducible": irreducible(*cu, [q, q, q], [1, 1, 1])})
    # NOTE spglib's is_shift=1 shifts by half a grid step: that equals the Monkhorst-Pack
    # arrangement only for even q; for odd q MP already contains Gamma.

    # KSPACING candidates (units: 1/Angstrom, includes 2*pi).
    kcases = []
    for name, A in (("fcc_Cu_a3.61_primitive", fcc_prim(3.61)), ("hex_a3.0_c5.0", cells["hex_a3.0_c5.0"]),
                    ("Si_a5.43_primitive", fcc_prim(5.43))):
        b = np.linalg.norm(recip(A), axis=1)
        for ks in (0.15, 0.2, 0.28, 0.3, 0.30145, 0.5):
            ratio = b / ks
            kcases.append({
                "cell": name, "kspacing": ks, "reciprocal_lengths_with_2pi": b.tolist(), "ratio": ratio.tolist(),
                "mesh_rule_ceil": [max(1, math.ceil(r - 1e-12)) for r in ratio],
                "mesh_rule_round_half_up": [max(1, int(r + 0.5)) for r in ratio],
                "mesh_rule_int_plus_0p999": [max(1, int(r + 0.999)) for r in ratio],
            })

    hexa = [[3.21, 0, 0], [-3.21 / 2, 3.21 * math.sqrt(3) / 2, 0], [0, 0, 5.21]]
    sym_systems = {
        "hcp_Mg_P6_3/mmc": (hexa, [[1 / 3, 2 / 3, 0.25], [2 / 3, 1 / 3, 0.75]], [12, 12]),
        "fcc_Cu_primitive": (fcc_prim(3.61), [[0, 0, 0]], [29]),
        "sc_a4.0": ([[4, 0, 0], [0, 4, 0], [0, 0, 4]], [[0, 0, 0]], [1]),
        "bcc_Fe_primitive": ([[-1.435, 1.435, 1.435], [1.435, -1.435, 1.435], [1.435, 1.435, -1.435]], [[0, 0, 0]], [26]),
    }
    mesh_symmetry = []
    for name, (lat, pos, nums) in sym_systems.items():
        for q in (2, 3, 4, 5, 6, 8):
            mesh_symmetry.append({
                "system": name, "n": q,
                "gamma_centred_symmetric": bool(mesh_is_symmetric(lat, pos, nums, q, True)),
                "monkhorst_pack_symmetric": bool(mesh_is_symmetric(lat, pos, nums, q, False)),
                "monkhorst_pack_contains_gamma": q % 2 == 1,
            })

    doc = {
        "_meta": {
            "generator": "scripts/reference/gen_pw_kmesh_reference.py",
            "hbar2_over_2m_eV_A2_from_scipy_constants": HB2_2M,
            "scipy_constants_codata": "see scipy.constants version in requirements.txt",
            "note_vasp_constant": "VASP uses 3.80998 eV*A^2 (RYTOEV*AUTOA^2). Tests should accept either to 1e-4.",
            "open_question": "KSPACING rounding rule is NOT settled: see docs/OPEN_QUESTIONS.md Q-004",
        },
        "plane_wave_counts": pw,
        "mp_and_gamma_coordinates": meshes,
        "irreducible_counts_spglib": ir,
        "mesh_point_group_symmetry": mesh_symmetry,
        "mesh_symmetry_note": "A mesh is symmetric if the point group maps the whole mesh onto itself. Even Monkhorst-Pack meshes are shifted off Gamma; on hexagonal lattices they are NOT symmetric (the author handbook says odd, which is a slip: see docs/OPEN_QUESTIONS.md Q-017).",
        "kspacing_candidates": kcases,
    }
    OUT.write_text(json.dumps(doc, indent=1, default=float) + "\n")
    print("hbar^2/2m =", HB2_2M)
    for r in pw[:5]:
        print(r["cell"], r["encut_eV"], r["n_pw_exact"], round(r["n_pw_continuum_estimate"], 1))
    print(ir)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
