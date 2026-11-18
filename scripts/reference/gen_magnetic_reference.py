#!/usr/bin/env python
"""Golden data for collinear magnetic orderings and supercells (milestone M13.1).

Independent code path (never a copy of the TypeScript logic):
  * Supercells are built with pymatgen's own `Structure.make_supercell`.
  * Neighbours come from pymatgen's own `Structure.get_neighbors` (periodic images included).
  * Minimal and common commensurate supercells are found by BRUTE FORCE over every integer 3x3 matrix with
    entries in [-2, 2] and positive determinant (numpy, vectorized), not by a Hermite-normal-form search.
  * Spin signs come from a Cartesian wave vector Q written down here from the definitions, with the pseudocubic
    axes of each fixture typed in from its known geometry (not detected): s_j = cos(Q . (r_j - r_0)).
      FM: Q = 0. A-type (axis c): ferromagnetic planes stacked antiferromagnetically, Q = pi c* .
      C-type (axis c): antiferromagnetic in the plane, ferromagnetic chains along c, Q = pi (a* + b*).
      G-type: every nearest neighbour antiparallel, Q = pi (a* + b* + c*).
      (E. O. Wollan, W. C. Koehler, Phys. Rev. 100, 545 (1955), S-058; a*, b*, c* are the duals of the
      pseudocubic axes, so Q . (n_a a + n_b b + n_c c) = pi (p . n).)
      Rock-salt type II: ferromagnetic (111) planes of the fcc cation sublattice stacked antiferromagnetically,
      Q = (pi / a) (1, 1, 1) with a the cubic lattice constant.
  * Symmetry-distinct collinear configurations: brute force over all 2^N up/down assignments, classes formed by
    spglib's symmetry operations of the parent structure acting as permutations of the magnetic sites, plus the
    global spin flip.

Neighbour shell: every magnetic neighbour within (1 + 0.1) times the shortest magnetic-magnetic distance
(the same stated tolerance as the library; it is a convention, not science).

Fixtures are `cubic_perovskite_SrTiO3`, `pnma_perovskite_like` and `rocksalt_NaCl` from tests/reference/kpaths.json,
with the B site or the cation as the magnetic site. They are illustrative test cells, not claims about real materials.

Output: tests/reference/magnetic_reference.json
Run:    python scripts/reference/gen_magnetic_reference.py
"""
import importlib.metadata
import itertools
import json
import math
import pathlib

import numpy as np
import spglib
from pymatgen.core import Lattice, Structure

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "reference" / "magnetic_reference.json"
KPATHS = ROOT / "tests" / "reference" / "kpaths.json"
SHELL_TOL = 0.1
SYMPREC = 1e-4


def load(name):
    d = json.loads(KPATHS.read_text())["structures"][name]["input"]
    return Structure(Lattice(d["lattice_rows"]), d["atomic_numbers"], d["frac_coords"])


def all_matrices():
    """Every integer 3x3 matrix with entries in [-2, 2] and det > 0, as an (n, 3, 3) array, with determinants."""
    vals = np.arange(-2, 3)
    rows = np.array(list(itertools.product(vals, repeat=3)))  # 125 rows
    n = len(rows)
    i, j, k = np.meshgrid(np.arange(n), np.arange(n), np.arange(n), indexing="ij")
    mats = np.stack([rows[i.ravel()], rows[j.ravel()], rows[k.ravel()]], axis=1)
    det = np.rint(np.linalg.det(mats.astype(float))).astype(int)
    keep = det > 0
    return mats[keep], det[keep]


MATS, DETS = all_matrices()


def minimal_matrix(kvecs):
    """Smallest det(M) over all brute-force matrices with k . (row of M) integer for every row and every k, and the
    first such matrix in the enumeration order (any one will do: the pattern is evaluated, not compared by shape)."""
    ok = np.ones(len(MATS), dtype=bool)
    for k in kvecs:
        ph = MATS @ np.array(k, dtype=float)  # (n, 3)
        ok &= np.all(np.abs(ph - np.rint(ph)) < 1e-9, axis=1)
    d = int(DETS[ok].min())
    first = MATS[ok & (DETS == d)][0]
    return d, first.tolist()


def minimal_det(kvecs):
    return minimal_matrix(kvecs)[0]


def k_of(Q, lattice_rows):
    """Reduced wave vector of Q relative to the cell rows, folded into [0, 1)."""
    k = np.array(lattice_rows) @ Q / (2 * math.pi)
    k = np.round(k - np.floor(k + 1e-9), 12)
    k[np.abs(k) < 1e-9] = 0.0
    return [float(x) for x in k]


def dual(axes):
    """Rows of the dual basis: dual[i] . axes[j] = delta_ij."""
    return np.linalg.inv(np.array(axes, dtype=float)).T


def q_named(kind, axes):
    a_s, b_s, c_s = dual(axes)
    return {
        "FM": np.zeros(3),
        "A": math.pi * c_s,
        "C": math.pi * (a_s + b_s),
        "G": math.pi * (a_s + b_s + c_s),
    }[kind]


def signs_in(struct, mag_el, Q):
    idx = [i for i, s in enumerate(struct) if s.specie.symbol == mag_el]
    r0 = struct[idx[0]].coords
    out = {}
    for i in idx:
        c = math.cos(float(np.dot(Q, struct[i].coords - r0)))
        assert abs(abs(c) - 1) < 1e-6, f"sign not +-1 at site {i}: {c}"
        out[i] = 1 if c > 0 else -1
    return idx, out


def bond_stats(struct, mag_el, signs):
    idx = list(signs)
    dmin = min(
        n.nn_distance
        for i in idx
        for n in struct.get_neighbors(struct[i], 8.0)
        if n.specie.symbol == mag_el and n.nn_distance > 1e-6
    )
    cut = dmin * (1 + SHELL_TOL)
    per_site = []
    for i in idx:
        par = anti = 0
        for n in struct.get_neighbors(struct[i], cut + 1e-6):
            if n.specie.symbol != mag_el or n.nn_distance < 1e-6:
                continue
            if signs[n.index] == signs[i]:
                par += 1
            else:
                anti += 1
        per_site.append([par, anti])
    return dmin, sorted(per_site)


def diag_dims(k):
    return [2 if abs(x - 0.5) < 1e-9 else 1 for x in k]


def ordering_case(base, mag_el, axes, kind, Q=None):
    Q = q_named(kind, axes) if Q is None else Q
    k = k_of(Q, base.lattice.matrix)
    det, mat = minimal_matrix([k])
    dims = diag_dims(k)
    return {
        "k_parent": k,
        "minimal_det": det,
        "diagonal_dims": dims,
        # both cells are built with pymatgen's make_supercell and the pattern is evaluated there
        "minimal_cell": evaluate_cell(base, mag_el, Q, mat),
        "diagonal_cell": evaluate_cell(base, mag_el, Q, dims),
    }


def evaluate_cell(base, mag_el, Q, scaling):
    sc = base.copy()
    sc.make_supercell(scaling)
    _, signs = signs_in(sc, mag_el, Q)
    dmin, per_site = bond_stats(sc, mag_el, signs)
    return {
        "n_atoms": len(sc),
        "n_magnetic": len(signs),
        "n_up": sum(1 for s in signs.values() if s > 0),
        "n_down": sum(1 for s in signs.values() if s < 0),
        "net_moment_unit": sum(signs.values()),
        "nn_distance": dmin,
        "nn_parallel_antiparallel_per_site": per_site,
    }


def spglib_perms(struct, mag_idx):
    cell = (struct.lattice.matrix, struct.frac_coords, [s.specie.Z for s in struct])
    sym = spglib.get_symmetry(cell, symprec=SYMPREC)
    frac = struct.frac_coords
    perms = []
    for R, t in zip(sym["rotations"], sym["translations"]):
        p = []
        for i in mag_idx:
            x = R @ frac[i] + t
            hit = [j for j in mag_idx if np.all(np.abs((x - frac[j]) - np.rint(x - frac[j])) < 1e-3)]
            assert len(hit) == 1
            p.append(mag_idx.index(hit[0]))
        perms.append(p)
    return perms, len(sym["rotations"])


def enumerate_case(struct, mag_el):
    mag_idx = [i for i, s in enumerate(struct) if s.specie.symbol == mag_el]
    n = len(mag_idx)
    perms, nops = spglib_perms(struct, mag_idx)
    seen = {}
    for bits in itertools.product([1, -1], repeat=n):
        variants = []
        for p in perms:
            img = [0] * n
            for a, b in enumerate(p):
                img[b] = bits[a]
            variants.append(tuple(img))
            variants.append(tuple(-x for x in img))
        canon = max(variants)
        seen.setdefault(canon, set()).add(bits if bits >= tuple(-x for x in bits) else tuple(-x for x in bits))
    mult = sorted(len(v) for v in seen.values())
    assert sum(mult) == 2 ** (n - 1)
    return {"n_magnetic": n, "n_spglib_operations": nops, "n_classes": len(seen), "multiplicities_sorted": mult}


def main():
    sto = load("cubic_perovskite_SrTiO3")
    pnma = load("pnma_perovskite_like")
    nacl = load("rocksalt_NaCl")
    a = 3.905
    cubic_axes = [[a, 0, 0], [0, a, 0], [0, 0, a]]
    # Pnma fixture: Cu on 4b sites; pseudocubic axes are (a + c)/2, (a - c)/2 in the ac plane and b/2 (stacking axis).
    A, B, C = 5.54, 7.66, 5.38
    pnma_axes = [[A / 2, 0, C / 2], [A / 2, 0, -C / 2], [0, B / 2, 0]]

    out = {
        "_meta": {
            "generator": "scripts/reference/gen_magnetic_reference.py",
            "versions": {m: importlib.metadata.version(m) for m in ["pymatgen", "spglib", "numpy"]},
            "method": "pymatgen make_supercell and get_neighbors; brute force over integer matrices with entries in [-2, 2]; "
            "signs cos(Q . (r - r0)) from the definitions; spglib operations for configuration classes",
            "shell_tolerance": SHELL_TOL,
            "symprec": SYMPREC,
            "note": "Illustrative fixtures, not claims about real materials. Neighbour counts are a geometric consequence "
            "of the ordering definitions (S-058).",
        },
        "orderings": {},
        "common_supercell": {},
        "enumeration": {},
    }

    sto_cases = {kind: ordering_case(sto, "Ti", cubic_axes, kind) for kind in ["FM", "A", "C", "G"]}
    out["orderings"]["cubic_perovskite_SrTiO3"] = {"magnetic_element": "Ti", "axis": "c", "cases": sto_cases}
    pnma_cases = {kind: ordering_case(pnma, "Cu", pnma_axes, kind) for kind in ["FM", "A", "C", "G"]}
    out["orderings"]["pnma_perovskite_like"] = {"magnetic_element": "Cu", "axis": "b (long axis)", "cases": pnma_cases}
    q2 = (math.pi / 5.64) * np.array([1.0, 1.0, 1.0])
    rs_cases = {
        "FM": ordering_case(nacl, "Na", cubic_axes, "FM"),
        "RS2": ordering_case(nacl, "Na", None, "RS2", Q=q2),
    }
    out["orderings"]["rocksalt_NaCl"] = {"magnetic_element": "Na", "axis": "[111]", "cases": rs_cases}

    ks = [sto_cases[k]["k_parent"] for k in ["FM", "A", "C", "G"]]
    out["common_supercell"]["cubic_perovskite_SrTiO3"] = {"orderings": ["FM", "A", "C", "G"], "det": minimal_det(ks)}
    ks = [pnma_cases[k]["k_parent"] for k in ["FM", "A", "C", "G"]]
    out["common_supercell"]["pnma_perovskite_like"] = {"orderings": ["FM", "A", "C", "G"], "det": minimal_det(ks)}

    sto222 = sto.copy()
    sto222.make_supercell([2, 2, 2])
    sto112 = sto.copy()
    sto112.make_supercell([1, 1, 2])
    out["enumeration"]["pnma_perovskite_like"] = {"cell": "as given", **enumerate_case(pnma, "Cu")}
    out["enumeration"]["rocksalt_NaCl"] = {"cell": "as given (conventional)", **enumerate_case(nacl, "Na")}
    out["enumeration"]["cubic_perovskite_SrTiO3_112"] = {"cell": "1x1x2", **enumerate_case(sto112, "Ti")}
    out["enumeration"]["cubic_perovskite_SrTiO3_222"] = {"cell": "2x2x2", **enumerate_case(sto222, "Ti")}

    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
