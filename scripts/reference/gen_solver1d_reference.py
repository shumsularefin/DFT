#!/usr/bin/env python
"""Golden data for the 1D finite-difference solver (module 3).

Output: tests/reference/solver1d_reference.json

Independent library: scipy.linalg.eigh_tridiagonal on the same finite-difference matrix the site builds.
Case: harmonic oscillator V = k x^2 / 2, k = 10 eV/A^2, x in [-6, 6] Angstrom, 1200 interior points; lowest 6
eigenvalues, plus hbar^2/2m from scipy.constants (CODATA 2022 in scipy 1.18; the site cites CODATA 2018, the
difference is below 1e-8 relative) and the analytic oscillator energies (n + 1/2) sqrt(2 (hbar^2/2m) k).
"""
import json
import pathlib

import numpy as np
from scipy import constants as C
from scipy.linalg import eigh_tridiagonal

OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "solver1d_reference.json"
c = (C.hbar**2 / (2 * C.m_e)) / C.e * 1e20
N, xmin, xmax, k = 1200, -6.0, 6.0, 10.0
h = (xmax - xmin) / (N + 1)
x = xmin + h * np.arange(1, N + 1)
d = 2 * c / h**2 + 0.5 * k * x**2
e = np.full(N - 1, -c / h**2)
w = eigh_tridiagonal(d, e, select="i", select_range=(0, 5))[0]
analytic = [(n + 0.5) * np.sqrt(2 * c * k) for n in range(6)]
OUT.write_text(json.dumps({
    "_meta": {"hbar2_over_2m": c, "N": N, "xmin": xmin, "xmax": xmax, "k": k,
              "note": "scipy.linalg.eigh_tridiagonal on the finite-difference matrix; analytic = (n+1/2) sqrt(2 c k)"},
    "fd_eigenvalues": w.tolist(), "analytic": analytic}, indent=2) + "\n")
print(w, analytic)
