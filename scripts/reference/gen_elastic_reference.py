#!/usr/bin/env python
"""Golden data for the elastic-tensor reader and analysis (milestone M15.4).

Independent code path (never a copy of the TypeScript logic):
  * Moduli, anisotropy and Debye temperature come from pymatgen `ElasticTensor` (S-034), whose formulas are the
    Voigt, Reuss and Hill averages (S-076), the universal anisotropy index (S-077) and the Anderson Debye
    temperature (S-078). Young's modulus and Poisson's ratio are pymatgen's `y_mod` (Pa, stored here in GPa) and
    `homogeneous_poisson`, both from the Hill averages.
  * The six stiffness eigenvalues come from numpy `eigvalsh` on the 6x6 Voigt matrix (S-072: stable iff all > 0).
  * The compliance matrix is numpy `inv` of the Voigt matrix.
  * Synthetic OUTCAR blocks: the Voigt matrix (11 22 33 23 13 12) is permuted HERE into VASP's printed order
    XX YY ZZ XY YZ ZX (S-042 "ordering trap": VASP entries 4, 5, 6 are Voigt 6, 4, 5), converted to kBar
    (1 GPa = 10 kBar), written in the TOTAL ELASTIC MODULI layout and read back with pymatgen
    `Outcar.read_elastic_tensor` to prove the layout parses. The TypeScript reader must undo the permutation.
    One block uses a NON-symmetric matrix with all 36 entries distinct, so a swapped row/column mapping or a
    transposition fails.

The tensors are illustrative test values with the symmetry pattern of each crystal class, not claims about any real
material. The structures exist only to give pymatgen a density and an atom count for the Debye temperature.

Output: tests/reference/elastic_reference.json and tests/reference/elastic/OUTCAR_*
Run:    python scripts/reference/gen_elastic_reference.py
"""
import importlib.metadata
import json
import pathlib
import warnings

import numpy as np
from pymatgen.core import Lattice, Structure
from pymatgen.core.elasticity.elastic import ElasticTensor
from pymatgen.io.vasp.outputs import Outcar

warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "reference" / "elastic_reference.json"
FIX = ROOT / "tests" / "reference" / "elastic"

# Voigt index (0-based) of each VASP position, DERIVED from the printed component names and pymatgen's own Voigt
# convention (Tensor.from_voigt: reverse_voigt_map [[0,5,4],[5,1,3],[4,3,2]]), not typed in. S-042 states the result
# (XX YY ZZ XY YZ ZX = Voigt 1 2 3 6 4 5); the assert checks that both agree.
VASP_NAMES = ["XX", "YY", "ZZ", "XY", "YZ", "ZX"]
_REVERSE_VOIGT = np.array([[0, 5, 4], [5, 1, 3], [4, 3, 2]])
VASP_TO_VOIGT = [int(_REVERSE_VOIGT["XYZ".index(n[0]), "XYZ".index(n[1])]) for n in VASP_NAMES]
assert VASP_TO_VOIGT == [0, 1, 2, 5, 3, 4], VASP_TO_VOIGT


def _check_against_pymatgen_voigt():
    """A tensor whose (i,j,k,l) entry encodes its indices must come back in pymatgen's .voigt at VASP_TO_VOIGT."""
    from pymatgen.core.tensors import Tensor
    v = np.arange(36, dtype=float).reshape(6, 6)
    v = v + v.T
    t = Tensor.from_voigt(v)
    pairs = [("XYZ".index(n[0]), "XYZ".index(n[1])) for n in VASP_NAMES]
    for a, (i, j) in enumerate(pairs):
        for b, (k, l) in enumerate(pairs):
            assert t[i, j, k, l] == v[VASP_TO_VOIGT[a], VASP_TO_VOIGT[b]]


def sym(upper):
    """Build a symmetric 6x6 from a dict {(i, j): value} with 1-based Voigt indices, i <= j."""
    c = np.zeros((6, 6))
    for (i, j), v in upper.items():
        c[i - 1, j - 1] = v
        c[j - 1, i - 1] = v
    return c


def cubic(c11, c12, c44):
    d = {(1, 1): c11, (2, 2): c11, (3, 3): c11, (1, 2): c12, (1, 3): c12, (2, 3): c12}
    d.update({(4, 4): c44, (5, 5): c44, (6, 6): c44})
    return sym(d)


def hexagonal(c11, c12, c13, c33, c44):
    d = {(1, 1): c11, (2, 2): c11, (3, 3): c33, (1, 2): c12, (1, 3): c13, (2, 3): c13}
    d.update({(4, 4): c44, (5, 5): c44, (6, 6): (c11 - c12) / 2})
    return sym(d)


# GPa. Triclinic: every entry distinct, off-diagonal signs mixed, positive definite.
TRICLINIC = sym(
    {
        (1, 1): 251.0, (1, 2): 103.0, (1, 3): 87.0, (1, 4): -11.0, (1, 5): 6.5, (1, 6): -4.2,
        (2, 2): 219.0, (2, 3): 95.0, (2, 4): 7.3, (2, 5): -9.1, (2, 6): 3.8,
        (3, 3): 233.0, (3, 4): -5.6, (3, 5): 2.9, (3, 6): 8.4,
        (4, 4): 61.0, (4, 5): -3.3, (4, 6): 1.7,
        (5, 5): 72.0, (5, 6): -2.4,
        (6, 6): 58.0,
    }
)

CASES = {
    "cubic": {
        "voigt": cubic(168.4, 121.4, 75.4),
        "structure": Structure(Lattice.cubic(3.615), ["Cu"] * 4, [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]]),
    },
    "hexagonal": {
        "voigt": hexagonal(162.4, 92.0, 69.0, 180.7, 46.7),
        "structure": Structure(Lattice.hexagonal(3.21, 5.21), ["Mg", "Mg"], [[1 / 3, 2 / 3, 0.25], [2 / 3, 1 / 3, 0.75]]),
    },
    "triclinic": {
        "voigt": TRICLINIC,
        "structure": Structure(
            Lattice.from_parameters(5.1, 5.6, 6.2, 82.0, 95.0, 101.0),
            ["Si", "O", "O", "Al"],
            [[0.1, 0.2, 0.3], [0.4, 0.15, 0.6], [0.7, 0.55, 0.2], [0.35, 0.8, 0.75]],
        ),
    },
}

# Non-symmetric, all entries distinct: only used to test the reader's permutation, never analysed.
REORDER = np.array([[100.0 + 10 * i + j + 0.25 * (i - j) ** 2 for j in range(1, 7)] for i in range(1, 7)])


def vasp_block(voigt_gpa, title="TOTAL ELASTIC MODULI (kBar)"):
    p = VASP_TO_VOIGT
    kbar = voigt_gpa[np.ix_(p, p)] * 10.0
    names = VASP_NAMES
    lines = [f" {title}", " Direction    " + "".join(f"{n:<12}" for n in names).rstrip(), " " + "-" * 80]
    for n, row in zip(names, kbar):
        lines.append(f" {n}  " + "".join(f"{v:12.4f}" for v in row))
    lines.append(" " + "-" * 80)
    return lines


def outcar_text(voigt_gpa):
    head = [
        " vasp.6.4.2 18Apr23 (build Jan 01 2024) complex",
        " executed on             LinuxIFC date 2026.11.26  12:00:00",
        "   number of dos      NEDOS =    301   number of ions     NIONS =      4",
        "   k-points           NKPTS =     20   k-points in BZ     NKDIM =     20   number of bands    NBANDS=     32",
        " total plane-waves  NPLWV =  32768",
        "   ISPIN  =      1    spin polarized calculation?",
        "   IBRION =      6    ionic relax: 0-MD 1-quasi-New 2-CG",
        "   ISIF   =      3    stress and relaxation",
        "",
    ]
    # A clamped-ion block first, scaled, so a reader that takes the first "ELASTIC MODULI" header is caught.
    clamped = vasp_block(voigt_gpa * 1.1, title="SYMMETRIZED ELASTIC MODULI (kBar)")
    total = vasp_block(voigt_gpa)
    return "\n".join(head + clamped + [""] + total + ["", " General timing and accounting informations for this job:", ""]) + "\n"


def analyse(voigt, st):
    et = ElasticTensor.from_voigt(voigt)
    rho = float(st.density)  # g/cm^3
    return {
        "voigt_GPa": voigt.tolist(),
        "compliance_per_GPa": np.linalg.inv(voigt).tolist(),
        "eigenvalues_GPa": sorted(np.linalg.eigvalsh(voigt).tolist()),
        "k_voigt": float(et.k_voigt),
        "k_reuss": float(et.k_reuss),
        "k_vrh": float(et.k_vrh),
        "g_voigt": float(et.g_voigt),
        "g_reuss": float(et.g_reuss),
        "g_vrh": float(et.g_vrh),
        "y_mod_GPa": float(et.y_mod) / 1e9,
        "homogeneous_poisson": float(et.homogeneous_poisson),
        "universal_anisotropy": float(et.universal_anisotropy),
        "long_v_m_s": float(et.long_v(st)),
        "trans_v_m_s": float(et.trans_v(st)),
        "debye_temperature_K": float(et.debye_temperature(st)),
        "structure": {
            "lattice": st.lattice.matrix.tolist(),
            "species": [str(s.specie) for s in st],
            "frac": st.frac_coords.tolist(),
            "density_g_cm3": rho,
            "volume_A3": float(st.volume),
        },
    }


def main():
    FIX.mkdir(parents=True, exist_ok=True)
    _check_against_pymatgen_voigt()
    out = {
        "_meta": {
            "generator": "scripts/reference/gen_elastic_reference.py",
            "pymatgen": importlib.metadata.version("pymatgen"),
            "pymatgen_core": importlib.metadata.version("pymatgen-core"),
            "numpy": np.__version__,
            "note": "Illustrative tensors with the pattern of each class; not results for any real material.",
        },
        "vasp_to_voigt": VASP_TO_VOIGT,
        "cases": {},
        "outcar_fixtures": {},
    }
    for name, c in CASES.items():
        out["cases"][name] = analyse(c["voigt"], c["structure"])

    for name, voigt in {"triclinic": TRICLINIC, "reorder_nonsymmetric": REORDER}.items():
        text = outcar_text(voigt)
        path = FIX / f"OUTCAR_{name}"
        path.write_text(text)
        oc = Outcar(str(path))
        oc.read_elastic_tensor()
        raw = np.array(oc.data["elastic_tensor"], float)  # VASP order, kBar, as pymatgen reads it
        assert raw.shape == (6, 6), name
        p = VASP_TO_VOIGT
        back = np.zeros((6, 6))
        back[np.ix_(p, p)] = raw / 10.0
        assert np.allclose(back, voigt, atol=1e-4), name
        out["outcar_fixtures"][name] = {
            "file": f"elastic/OUTCAR_{name}",
            "pymatgen_raw_vasp_order_kbar": raw.tolist(),
            "expected_voigt_GPa": voigt.tolist(),
        }

    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} and {len(out['outcar_fixtures'])} OUTCAR fixtures")


if __name__ == "__main__":
    main()
