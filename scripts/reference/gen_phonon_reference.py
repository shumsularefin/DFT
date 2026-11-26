#!/usr/bin/env python
"""Golden data for the Gamma-point phonon reader and the unit conversions (milestone M15.6).

Independent code path (never a copy of the TypeScript logic):
  * Unit factors from scipy.constants (CODATA), not from the TypeScript constants file.
  * Two synthetic OUTCARs (IBRION = 5 layout) with the mode-line layout shown on the VASP wiki page
    "Phonons from finite differences" (S-019, oldid 36045). Frequencies are chosen in THz here and the other columns
    are computed with the scipy factors. The files are read back with ASE `Vasp.read_vib_freq` (ASE splits on
    whitespace and looks for the token "f/i=", so the imaginary lines are written that way), and the read-back meV
    values must match what was written.
  * `stable`: two atoms, three near-zero acoustic modes (one printed as a tiny f/i, numerical noise in the sense of
    S-042) and three real optical modes. `unstable`: the same with one optical mode imaginary.

The frequencies are illustrative test values, not results for a real material.

Output: tests/reference/phonon_reference.json and tests/reference/phonon/OUTCAR_*
Run:    python scripts/reference/gen_phonon_reference.py
"""
import importlib.metadata
import json
import math
import pathlib

import scipy.constants as C
from ase.calculators.vasp import Vasp

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "reference" / "phonon_reference.json"
FIX = ROOT / "tests" / "reference" / "phonon"

FACTORS = {
    "kbar_to_gpa": 1e3 * C.bar / C.giga,
    "ev_per_a3_to_gpa": C.e / C.angstrom**3 / C.giga,
    "thz_to_cm1": C.tera / (C.c * 100),
    "thz_to_mev": C.h * C.tera / C.e * 1e3,
    "cm1_to_mev": C.h * C.c * 100 / C.e * 1e3,
    "ry_to_ev": C.physical_constants["Rydberg constant times hc in eV"][0],
    "hartree_to_ev": C.physical_constants["Hartree energy in eV"][0],
    "ev_per_atom_to_kj_mol": C.e * C.N_A / 1e3,
    "ev_per_a_to_nn": C.e / C.angstrom / C.nano,
}

# (THz, imaginary) per mode, in the order VASP prints (highest real first, imaginary last).
CASES = {
    "stable": [(15.2, False), (15.2, False), (11.7, False), (0.021, False), (0.013, False), (0.034, True)],
    "unstable": [(15.2, False), (11.7, False), (0.021, False), (0.013, False), (0.034, True), (2.85, True)],
}
POSITIONS = [(0.0, 0.0, 0.0), (1.3575, 1.3575, 1.3575)]


def mode_line(k, thz, imag):
    tag = "f/i=" if imag else "f  ="
    return (
        f"{k:4d} {tag}{thz:12.6f} THz {thz * 2 * math.pi:12.6f} 2PiTHz"
        f"{thz * FACTORS['thz_to_cm1']:12.6f} cm-1 {thz * FACTORS['thz_to_mev']:12.6f} meV"
    )


def outcar(modes):
    head = [
        " vasp.6.4.2 18Apr23 (build Jan 01 2024) complex",
        "   number of dos      NEDOS =    301   number of ions     NIONS =      2",
        "   IBRION =      5    ionic relax: 0-MD 1-quasi-New 2-CG",
        "",
        " Eigenvectors and eigenvalues of the dynamical matrix",
        " ----------------------------------------------------",
        "",
        "",
    ]
    body = []
    for k, (thz, imag) in enumerate(modes, start=1):
        body.append(mode_line(k, thz, imag))
        body.append("             X         Y         Z           dx          dy          dz")
        for a, (x, y, z) in enumerate(POSITIONS):
            d = 0.707107 if (k + a) % 2 else -0.707107
            body.append(f"  {x:12.6f}{y:10.6f}{z:10.6f}  {0.0:11.6f} {0.0:11.6f} {d:11.6f}")
        body.append("")
    return "\n".join(head + body + ["", " General timing and accounting informations for this job:", ""]) + "\n"


def main():
    FIX.mkdir(parents=True, exist_ok=True)
    out = {
        "_meta": {
            "generator": "scripts/reference/gen_phonon_reference.py",
            "scipy": importlib.metadata.version("scipy"),
            "ase": importlib.metadata.version("ase"),
            "note": "Illustrative frequencies, not a calculation. Factors from scipy.constants (CODATA).",
        },
        "factors": FACTORS,
        "outcar_fixtures": {},
    }
    for name, modes in CASES.items():
        path = FIX / f"OUTCAR_phonon_{name}"
        path.write_text(outcar(modes))
        real, imag = Vasp(directory=str(FIX)).read_vib_freq(lines=path.read_text().splitlines())
        want_real = [round(t * FACTORS["thz_to_mev"], 6) for t, i in modes if not i]
        want_imag = [round(t * FACTORS["thz_to_mev"], 6) for t, i in modes if i]
        assert [round(x, 6) for x in real] == want_real, (name, real)
        assert [round(x, 6) for x in imag] == want_imag, (name, imag)
        out["outcar_fixtures"][name] = {
            "file": f"phonon/OUTCAR_phonon_{name}",
            "modes": [
                {
                    "index": k,
                    "imaginary": i,
                    "thz": round(t, 6),
                    "cm1": round(t * FACTORS["thz_to_cm1"], 6),
                    "meV": round(t * FACTORS["thz_to_mev"], 6),
                }
                for k, (t, i) in enumerate(modes, start=1)
            ],
            "ase_real_meV": real,
            "ase_imaginary_meV": imag,
        }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} and {len(CASES)} OUTCAR fixtures")


if __name__ == "__main__":
    main()
