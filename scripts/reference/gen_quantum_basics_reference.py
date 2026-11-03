#!/usr/bin/env python
"""Golden data for Module 2 (constants, particle in a box, hydrogen orbitals).

Output: tests/reference/quantum_basics_reference.json

Contents
  * Constants from scipy.constants: hbar^2/2m_e in eV*Angstrom^2, Bohr radius in Angstrom, Rydberg energy in eV,
    h in eV*s. NOTE: scipy 1.18 ships CODATA 2022; the site cites CODATA 2018 (S-031). The two differ by less than
    1e-8 relative for these quantities, far below the test tolerance.
  * Box: E_n(L) in eV from the formula n^2 pi^2 (hbar^2/2m)/L^2 and psi_n(x) values from sqrt(2/L) sin(n pi x/L),
    each normalisation checked here by scipy.integrate.quad.
  * Hydrogen radial functions R_nl(r) (r in Bohr radii, R in a0^-3/2) for n <= 4 from the closed form with
    scipy.special.eval_genlaguerre, normalisation and <r> checked here by scipy.integrate.quad.
  * Real spherical harmonics for l <= 3 at fixed directions from scipy.special.sph_harm_y, combined into the real
    (Condon-Shortley phase removed) basis ordered m = -l..l. Orthonormality is asserted here by quadrature.
"""
import json
import math
import pathlib

import numpy as np
from scipy import constants as C
from scipy import integrate, special

OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "quantum_basics_reference.json"

HB2_2M = (C.hbar**2 / (2 * C.m_e)) / C.e * 1e20  # eV Angstrom^2
A0_ANG = C.physical_constants["Bohr radius"][0] * 1e10
RY_EV = C.physical_constants["Rydberg constant times hc in eV"][0]
H_EV_S = C.h / C.e


def box_energy(n, L):
    return n * n * math.pi**2 * HB2_2M / L**2


def box_psi(n, L, x):
    return math.sqrt(2 / L) * math.sin(n * math.pi * x / L)


def radial(n, l, r):
    rho = 2 * r / n
    norm = math.sqrt((2 / n) ** 3 * math.factorial(n - l - 1) / (2 * n * math.factorial(n + l)))
    return norm * math.exp(-rho / 2) * rho**l * special.eval_genlaguerre(n - l - 1, 2 * l + 1, rho)


def real_ylm(l, m, theta, phi):
    if m == 0:
        return float(special.sph_harm_y(l, 0, theta, phi).real)
    y = special.sph_harm_y(l, abs(m), theta, phi)
    if m > 0:
        return float(math.sqrt(2) * (-1) ** m * y.real)
    return float(math.sqrt(2) * (-1) ** m * y.imag)


def main():
    out = {
        "_meta": {
            "generator": "scripts/reference/gen_quantum_basics_reference.py",
            "scipy": __import__("scipy").__version__,
            "codata": "scipy.constants of this version (CODATA 2022); the site cites CODATA 2018, difference < 1e-8 relative",
            "radial_units": "r in Bohr radii, R_nl in a0^-3/2",
            "ylm_convention": "real harmonics, m = -l..l, sqrt(2)(-1)^m Re/Im Y_l^|m| so that p_x, p_y, p_z, d_z2 ... have positive Cartesian coefficients",
        },
        "constants": {
            "hbar2_over_2m_eV_A2": HB2_2M,
            "bohr_radius_A": A0_ANG,
            "rydberg_energy_eV": RY_EV,
            "h_eV_s": H_EV_S,
        },
    }

    # Box
    box = {"energies": [], "psi": []}
    for L in (0.5, 1.0, 5.0, 10.0):
        for n in range(1, 7):
            box["energies"].append({"L": L, "n": n, "E_eV": box_energy(n, L)})
    for L, n in ((5.0, 1), (5.0, 3), (2.0, 2), (10.0, 6)):
        norm, _ = integrate.quad(lambda x: box_psi(n, L, x) ** 2, 0, L, epsabs=1e-13)
        assert abs(norm - 1) < 1e-10, norm
        for f in (0.1, 0.25, 0.5, 0.77):
            box["psi"].append({"L": L, "n": n, "x": f * L, "psi": box_psi(n, L, f * L)})
    out["box"] = box

    # Hydrogen radial
    rgrid = [0.1, 0.5, 1.0, 2.0, 3.0, 5.0, 8.0, 12.0, 20.0]
    rad = []
    for n in range(1, 5):
        for l in range(n):
            norm, _ = integrate.quad(lambda r: radial(n, l, r) ** 2 * r * r, 0, 200 * n, limit=400, epsabs=1e-13)
            assert abs(norm - 1) < 1e-10, (n, l, norm)
            mean_r, _ = integrate.quad(lambda r: radial(n, l, r) ** 2 * r**3, 0, 200 * n, limit=400, epsabs=1e-13)
            assert abs(mean_r - 0.5 * (3 * n * n - l * (l + 1))) < 1e-8, (n, l, mean_r)
            rad.append({"n": n, "l": l, "r": rgrid, "R": [radial(n, l, r) for r in rgrid], "mean_r": mean_r})
    out["radial"] = rad

    # Real spherical harmonics at fixed directions
    dirs = [(0.3, 0.2), (0.9, 1.7), (1.3, 3.0), (1.9, 4.4), (2.4, 5.6), (math.pi / 2, 0.0), (0.6, 2.2)]
    ylm = []
    for l in range(4):
        for m in range(-l, l + 1):
            ylm.append(
                {"l": l, "m": m, "dirs": dirs, "Y": [real_ylm(l, m, t, p) for t, p in dirs]}
            )
    # orthonormality on a tensor-product grid (Gauss-Legendre in cos theta, uniform in phi)
    xs, ws = np.polynomial.legendre.leggauss(24)
    thetas = np.arccos(xs)
    phis = np.linspace(0, 2 * math.pi, 48, endpoint=False)
    basis = [(l, m) for l in range(4) for m in range(-l, l + 1)]
    vals = {}
    for l, m in basis:
        vals[(l, m)] = np.array([[real_ylm(l, m, t, p) for p in phis] for t in thetas])
    w2 = np.outer(ws, np.full(len(phis), 2 * math.pi / len(phis)))
    for a in basis:
        for b in basis:
            s = float(np.sum(vals[a] * vals[b] * w2))
            assert abs(s - (1.0 if a == b else 0.0)) < 1e-10, (a, b, s)
    out["ylm"] = ylm

    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
