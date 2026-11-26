#!/usr/bin/env python
"""Golden data for the optics and dielectric readers and derived quantities (milestone M15.5).

Independent code path (never a copy of the TypeScript logic):
  * A SYNTHETIC dielectric function (a sum of Lorentz oscillators, made up, not a calculation) on a 0 to 12 eV grid,
    different for xx, yy and zz, with small off-diagonal parts.
  * It is written as two VASP 6 `<dielectricfunction>` blocks ("density-density", then "current-current" scaled by
    1.1, so a reader that takes the wrong block fails) in a minimal vasprun.xml, and read back with pymatgen's own
    `Vasprun._parse_diel` (S-034). The goldens are computed from what pymatgen read.
  * Derived quantities with numpy from the S-042 formulas ("Quantities derived by 711"):
      |eps| = sqrt(e1^2 + e2^2), n = sqrt((|eps| + e1)/2), k = sqrt((|eps| - e1)/2), alpha = 2 omega k / c (cm^-1),
      R = ((n-1)^2 + k^2)/((n+1)^2 + k^2), L = e2/(e1^2 + e2^2), sigma = omega eps0 e2 (S/m), omega = E/hbar.
    Per component xx, yy, zz and for the average eps = (xx + yy + zz)/3 (the average is taken of eps, then the
    quantities derived, as pymatgen's optical_absorption_coeff does). alpha is cross-checked against pymatgen's
    `optical_absorption_coeff` formula (a second, independent route) inside this script.
  * Constants: CODATA 2018 (S-031). h, e and c are exact; eps0 is the 2018 value. scipy ships CODATA 2022, whose eps0
    differs by 7e-10 relative; the script asserts that bound and stores the 2018 value used.
  * A synthetic LEPSILON OUTCAR (eps without and with local fields, the ionic contribution, Born charges) read back
    with pymatgen `Outcar.read_lepsilon` and `read_lepsilon_ionic`. Two Born-charge sets: one obeying the acoustic
    sum rule within 0.03, one breaking it by 0.3.

Output: tests/reference/optics_reference.json and tests/reference/optics/{vasprun_dielectric.xml,OUTCAR_lepsilon_*}
Run:    python scripts/reference/gen_optics_reference.py
"""
import importlib.metadata
import json
import math
import pathlib
import warnings

import numpy as np
import scipy.constants as sc
from lxml import etree
from pymatgen.io.vasp.outputs import Outcar, Vasprun

warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "reference" / "optics_reference.json"
FIX = ROOT / "tests" / "reference" / "optics"

H = 6.62607015e-34  # J s, exact (S-031)
E_CHARGE = 1.602176634e-19  # C, exact
C_LIGHT = 299792458.0  # m/s, exact
EPS0_2018 = 8.8541878128e-12  # F/m, CODATA 2018 (S-031)
HBAR = H / (2 * math.pi)
assert abs(sc.epsilon_0 - EPS0_2018) / EPS0_2018 < 1e-9
assert sc.h == H and sc.e == E_CHARGE and sc.c == C_LIGHT

COMPONENTS = ["xx", "yy", "zz", "xy", "yz", "zx"]
ENERGIES = np.linspace(0.0, 12.0, 49)  # eV, includes E = 0


def lorentz(e, oscillators):
    eps = np.ones_like(e, dtype=complex)
    for f, e0, gamma in oscillators:
        eps += f * e0**2 / (e0**2 - e**2 - 1j * gamma * e)
    return eps


def synthetic_eps():
    diag = {
        "xx": [(4.0, 3.2, 0.4), (2.0, 6.5, 0.9)],
        "yy": [(3.5, 3.6, 0.5), (2.5, 7.0, 1.1)],
        "zz": [(5.0, 2.9, 0.3), (1.5, 8.0, 1.3)],
    }
    out = {c: lorentz(ENERGIES, o) for c, o in diag.items()}
    for c, scale in (("xy", 0.05), ("yz", -0.03), ("zx", 0.02)):
        out[c] = scale * (lorentz(ENERGIES, [(1.0, 4.0, 0.6)]) - 1.0)
    return out


def array_block(tag, eps, part, fmt="{:12.6f}"):
    lines = [f"   <{tag}>", "    <array>", '     <dimension dim="1">gridpoints</dimension>', "     <field>energy</field>"]
    lines += [f"     <field>{c}</field>" for c in COMPONENTS]
    lines.append("     <set>")
    for i, e in enumerate(ENERGIES):
        vals = [getattr(eps[c][i], part) for c in COMPONENTS]
        lines.append("      <r>" + "".join(fmt.format(v) for v in [e, *vals]) + " </r>")
    lines += ["     </set>", "    </array>", f"   </{tag}>"]
    return lines


def vasprun_text(eps):
    scaled = {c: v * 1.1 for c, v in eps.items()}
    body = []
    for comment, data in (("density-density", eps), ("current-current", scaled)):
        body.append(f'  <dielectricfunction comment="{comment}">')
        body += array_block("imag", data, "imag") + array_block("real", data, "real")
        body.append("  </dielectricfunction>")
    head = ['<?xml version="1.0" encoding="ISO-8859-1"?>', "<modeling>", " <generator>",
            '  <i name="program" type="string">vasp </i>', '  <i name="version" type="string">6.4.2  </i>',
            " </generator>", " <calculation>"]
    return "\n".join(head + body + [" </calculation>", "</modeling>"]) + "\n"


def derived(e_ev, e1, e2):
    mod = np.sqrt(e1**2 + e2**2)
    n = np.sqrt((mod + e1) / 2)
    k = np.sqrt((mod - e1) / 2)
    omega = e_ev * E_CHARGE / HBAR  # rad/s
    alpha = 2 * omega * k / C_LIGHT / 100.0  # 1/m -> 1/cm
    refl = ((n - 1) ** 2 + k**2) / ((n + 1) ** 2 + k**2)
    loss = e2 / (e1**2 + e2**2)
    sigma = omega * EPS0_2018 * e2  # S/m
    return {"abs_eps": mod, "n": n, "k": k, "alpha_cm": alpha, "R": refl, "L": loss, "sigma_S_m": sigma}


def pymatgen_alpha(e_ev, e1, e2):
    """pymatgen Vasprun.optical_absorption_coeff formula, written out: tau sqrt(|eps| - e1) sqrt(2) / hc * E."""
    hc = sc.h * sc.c / sc.e * 100  # eV cm
    return np.array([math.tau * math.sqrt(math.sqrt(r * r + i * i) - r) * math.sqrt(2) / hc * f
                     for f, r, i in zip(e_ev, e1, e2)])


def tensor_block(title, m):
    lines = [f" {title}", " " + "-" * 54]
    lines += ["  " + "".join(f"{v:12.5f}" for v in row) for row in m]
    lines.append(" " + "-" * 54)
    return lines


def born_block(zs):
    lines = [" BORN EFFECTIVE CHARGES (in e, cummulative output)", " " + "-" * 81]
    for i, z in enumerate(zs, 1):
        lines.append(f" ion {i:4d}")
        for r, row in enumerate(z, 1):
            lines.append(f"    {r}" + "".join(f"{v:12.5f}" for v in row))
    lines.append(" " + "-" * 81)
    return lines


def outcar_text(eps_nolf, eps_inf, eps_ion, zs):
    head = [" vasp.6.4.2 18Apr23 (build Jan 01 2024) complex",
            "   number of dos      NEDOS =    301   number of ions     NIONS =      2",
            "   k-points           NKPTS =     20   k-points in BZ     NKDIM =     20   number of bands    NBANDS=     16",
            " total plane-waves  NPLWV =  32768", "   ISPIN  =      1    spin polarized calculation?",
            "   IBRION =      8    ionic relax: 0-MD 1-quasi-New 2-CG", "   LEPSILON =      T", ""]
    body = (tensor_block("MACROSCOPIC STATIC DIELECTRIC TENSOR (excluding local field effects)", eps_nolf) + [""]
            + tensor_block("MACROSCOPIC STATIC DIELECTRIC TENSOR (including local field effects in DFT)", eps_inf)
            + [""] + born_block(zs) + [""]
            + tensor_block("MACROSCOPIC STATIC DIELECTRIC TENSOR IONIC CONTRIBUTION", eps_ion))
    return "\n".join(head + body + ["", " General timing and accounting informations for this job:", ""]) + "\n"


def main():
    FIX.mkdir(parents=True, exist_ok=True)
    eps = synthetic_eps()
    vr_path = FIX / "vasprun_dielectric.xml"
    vr_path.write_text(vasprun_text(eps))
    blocks = etree.parse(str(vr_path)).getroot().iter("dielectricfunction")
    parsed = {b.attrib["comment"]: Vasprun._parse_diel(b) for b in blocks}
    energies, real, imag = (np.array(x, float) for x in parsed["density-density"])
    assert np.allclose(energies, ENERGIES)

    out = {
        "_meta": {
            "generator": "scripts/reference/gen_optics_reference.py",
            "pymatgen": importlib.metadata.version("pymatgen"),
            "pymatgen_core": importlib.metadata.version("pymatgen-core"),
            "numpy": np.__version__,
            "constants": {"h_J_s": H, "e_C": E_CHARGE, "c_m_s": C_LIGHT, "eps0_F_m": EPS0_2018, "codata": "2018"},
            "note": "Synthetic Lorentz-oscillator dielectric function and made-up LEPSILON values; not a calculation.",
        },
        "vasprun": {
            "file": "optics/vasprun_dielectric.xml",
            "components": COMPONENTS,
            "blocks": list(parsed.keys()),
            "energies_eV": energies.tolist(),
            "eps1": {c: real[:, i].tolist() for i, c in enumerate(COMPONENTS)},
            "eps2": {c: imag[:, i].tolist() for i, c in enumerate(COMPONENTS)},
            "current_current_eps2_xx": np.array(parsed["current-current"][2], float)[:, 0].tolist(),
        },
        "derived": {},
    }
    series = {c: (real[:, i], imag[:, i]) for i, c in enumerate(COMPONENTS[:3])}
    series["average"] = (real[:, :3].mean(axis=1), imag[:, :3].mean(axis=1))
    for name, (e1, e2) in series.items():
        d = derived(energies, e1, e2)
        out["derived"][name] = {k: v.tolist() for k, v in d.items()}
    alpha_pmg = pymatgen_alpha(energies, *series["average"])
    assert np.allclose(alpha_pmg, out["derived"]["average"]["alpha_cm"], rtol=1e-9, atol=1e-6)

    eps_inf = np.array([[6.06914, 0.01230, -0.00410], [0.01230, 6.31277, 0.00205], [-0.00410, 0.00205, 5.87731]])
    eps_ion = np.array([[12.4410, 0.0, 0.0], [0.0, 13.0525, 0.0], [0.0, 0.0, 11.8873]])
    z1 = np.array([[2.55389, 0.01200, -0.00300], [0.01500, 2.61022, 0.00400], [-0.00200, 0.00300, 2.48750]])
    cases = {"sum_ok": -z1 + np.array([[0.02, 0, 0], [0, -0.03, 0], [0, 0, 0.01]]),
             "sum_broken": -z1 + np.array([[0.30, 0, 0], [0, 0, 0], [0, 0, 0]])}
    out["outcar"] = {}
    for name, z2 in cases.items():
        path = FIX / f"OUTCAR_lepsilon_{name}"
        path.write_text(outcar_text(eps_inf * 0.9, eps_inf, eps_ion, [z1, z2]))
        oc = Outcar(str(path))
        oc.read_lepsilon()
        oc.read_lepsilon_ionic()
        born = np.array(oc.born, float)
        total = born.sum(axis=0)
        out["outcar"][name] = {
            "file": f"optics/OUTCAR_lepsilon_{name}",
            "eps_inf": np.array(oc.dielectric_tensor, float).tolist(),
            "eps_ion": np.array(oc.dielectric_ionic_tensor, float).tolist(),
            "eps_static": (np.array(oc.dielectric_tensor, float) + np.array(oc.dielectric_ionic_tensor, float)).tolist(),
            "born": born.tolist(),
            "born_sum": total.tolist(),
            "born_sum_max_abs": float(np.abs(total).max()),
        }
        assert np.allclose(oc.dielectric_tensor, eps_inf, atol=1e-5), name
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}, 1 vasprun and {len(cases)} OUTCAR fixtures")


if __name__ == "__main__":
    main()
