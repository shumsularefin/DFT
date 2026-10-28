#!/usr/bin/env python
"""Generate golden first-Brillouin-zone geometry for the TypeScript tests.

Independent method: scipy.spatial.Voronoi (Qhull) on a block of reciprocal
lattice points. The TypeScript implementation must NOT use this method
(it uses half-space clipping), so agreement is a real cross-check.

Output: tests/reference/bz_geometry.json
Run:    python scripts/reference/gen_bz_geometry.py
"""
import itertools
import json
import math
import pathlib

import numpy as np
from scipy.spatial import ConvexHull, Voronoi

OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "bz_geometry.json"
TWO_PI = 2.0 * math.pi


def hex_lattice(a, c):
    return [[a, 0, 0], [-a / 2, a * math.sqrt(3) / 2, 0], [0, 0, c]]


def from_params(a, b, c, alpha, beta, gamma):
    al, be, ga = (math.radians(x) for x in (alpha, beta, gamma))
    cx = c * math.cos(be)
    cy = c * (math.cos(al) - math.cos(be) * math.cos(ga)) / math.sin(ga)
    cz = math.sqrt(max(c * c - cx * cx - cy * cy, 0.0))
    return [[a, 0, 0], [b * math.cos(ga), b * math.sin(ga), 0], [cx, cy, cz]]


# Lattices are given as rows = direct lattice vectors, Angstrom.
LATTICES = {
    "sc": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    "fcc_primitive": [[0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]],
    "bcc_primitive": [[-0.5, 0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, -0.5]],
    "hex_ideal": hex_lattice(1.0, 1.633),
    "hex_tall": hex_lattice(1.0, 2.7),
    "tetragonal": [[1, 0, 0], [0, 1, 0], [0, 0, 1.4]],
    "bct_primitive": [[-0.5, 0.5, 0.7], [0.5, -0.5, 0.7], [0.5, 0.5, -0.7]],
    "orthorhombic": [[1.0, 0, 0], [0, 1.3, 0], [0, 0, 1.7]],
    "rhombohedral": from_params(1, 1, 1, 70, 70, 70),
    "monoclinic": from_params(1.0, 1.2, 1.5, 90, 100, 90),
    "triclinic": from_params(1.0, 1.15, 1.35, 78, 84, 71),
    # Same fcc lattice with a3 replaced by a3 + 3*a1 + 5*a2 (unimodular, so same lattice, non-reduced basis).
    "fcc_skewed_basis": [[0, 0.5, 0.5], [0.5, 0, 0.5], [3.0, 2.0, 4.0]],
}


def analyse(direct):
    """Return golden WS-cell data of the reciprocal lattice of `direct`.

    The block of reciprocal points grows until the Voronoi cell of the origin is
    bounded and its volume equals (2*pi)^3 / V (a skewed basis needs a wider block).
    """
    vcell = abs(np.linalg.det(np.array(direct, dtype=float)))
    for nrange in range(3, 13):
        try:
            return _analyse(direct, nrange)
        except AssertionError as exc:
            if "volume" not in str(exc) and "unbounded" not in str(exc):
                raise
    raise RuntimeError(f"no converged Voronoi block for lattice with V={vcell}")


def _analyse(direct, nrange):
    A = np.array(direct, dtype=float)
    B = TWO_PI * np.linalg.inv(A).T  # rows are b1, b2, b3
    pts, n0 = [], None
    for n in itertools.product(range(-nrange, nrange + 1), repeat=3):
        if n == (0, 0, 0):
            n0 = len(pts)
        pts.append(np.array(n) @ B)
    pts = np.array(pts)
    vor = Voronoi(pts)
    region = vor.regions[vor.point_region[n0]]
    assert -1 not in region, "unbounded"

    # Merge numerically duplicate Voronoi vertices (degenerate vertices appear several times).
    uniq = []

    def vid(coord):
        for i, v in enumerate(uniq):
            if np.allclose(v, coord, atol=1e-9):
                return i
        uniq.append(np.array(coord))
        return len(uniq) - 1

    for i in region:
        vid(vor.vertices[i])

    face_sets, face_planes = [], []
    for (p, q), rv in zip(vor.ridge_points, vor.ridge_vertices):
        if n0 in (p, q):
            other = q if p == n0 else p
            ids = sorted({vid(vor.vertices[i]) for i in rv})
            if len(ids) >= 3:
                face_sets.append(ids)
                face_planes.append(pts[other] / 2.0)  # the face lies in the plane through G/2
    verts = np.array(uniq)
    edges = set()
    for f1, f2 in itertools.combinations(range(len(face_sets)), 2):
        common = set(face_sets[f1]) & set(face_sets[f2])
        if len(common) == 2:
            edges.add(tuple(sorted(common)))

    volume = ConvexHull(verts).volume
    vcell = abs(np.linalg.det(A))
    assert math.isclose(volume, TWO_PI**3 / vcell, rel_tol=1e-9), f"volume {volume} vs {TWO_PI**3 / vcell}"
    nv, ne, nf = len(verts), len(edges), len(face_sets)
    assert nv - ne + nf == 2, "Euler characteristic violated"
    order = np.lexsort((verts[:, 2].round(9), verts[:, 1].round(9), verts[:, 0].round(9)))
    return {
        "direct_lattice_rows": [[float(x) for x in row] for row in A],
        "reciprocal_lattice_rows_with_2pi": [[float(x) for x in row] for row in B],
        "cell_volume": float(vcell),
        "bz_volume": float(volume),
        "bz_volume_expected_(2pi)^3_over_V": float(TWO_PI**3 / vcell),
        "n_vertices": nv,
        "n_edges": ne,
        "n_faces": nf,
        "face_plane_points_G_over_2_sorted": sorted(
            [[round(float(x), 9) for x in n] for n in face_planes]
        ),
        "vertices_sorted": [[round(float(x), 9) for x in verts[i]] for i in order],
    }


def main():
    data = {
        "_meta": {
            "generator": "scripts/reference/gen_bz_geometry.py",
            "method": "scipy.spatial.Voronoi of a growing block of reciprocal lattice points, accepted when BZ volume equals (2*pi)^3/V",
            "units": "1/Angstrom, includes the 2*pi factor",
            "known_counts_check": {
                "sc": [8, 12, 6],
                "fcc": [24, 36, 14],
                "bcc": [14, 24, 12],
                "hex": [12, 18, 8],
                "format": "[vertices, edges, faces]",
            },
        },
        "lattices": {},
    }
    for name, lat in LATTICES.items():
        data["lattices"][name] = analyse(lat)
    # Assert the textbook counts that the SPEC requires.
    L = data["lattices"]
    counts = lambda k: [L[k]["n_vertices"], L[k]["n_edges"], L[k]["n_faces"]]
    assert counts("sc") == [8, 12, 6]
    assert counts("fcc_primitive") == [24, 36, 14]
    assert counts("fcc_skewed_basis") == [24, 36, 14]
    assert counts("bcc_primitive") == [14, 24, 12]
    assert counts("hex_ideal") == [12, 18, 8]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1) + "\n")
    for k in L:
        print(f"{k:18s} V={L[k]['n_vertices']:3d} E={L[k]['n_edges']:3d} F={L[k]['n_faces']:3d}")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
