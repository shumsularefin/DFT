#!/usr/bin/env python
"""Golden data for the 1D self-consistent-field toy lab (stage M7.1).

Model (atomic units: hartree, bohr): two electrons in one spatial orbital (closed shell, restricted
Hartree-Fock) in a soft-Coulomb external potential v_ext(x) = -Z / sqrt(x^2 + 1), interacting through
w(x - x') = 1 / sqrt((x - x')^2 + 1). Kinetic energy by the 3-point finite difference on a uniform grid
with Dirichlet boundaries. For a closed shell of two electrons the exchange potential cancels half the
Hartree potential, so the Fock operator is h0 + v_H / 2, with n = 2 |phi|^2 and v_H(x) = int n(x') w(x - x') dx'.
Energy: E = 2 <phi|h0|phi> + J, J = (1/4) int int n(x) n(x') w(x - x') dx dx'.

Also computed, as an independent variational check: the exact two-electron singlet ground state on the
same grid (sparse diagonalization of the 2D Hamiltonian), which must lie below the Hartree-Fock energy.

Output: tests/reference/scf1d_reference.json
"""
import json
import math
import pathlib

import numpy as np
from scipy.linalg import eigh_tridiagonal
from scipy.sparse import diags, identity, kron
from scipy.sparse.linalg import eigsh

OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "scf1d_reference.json"
HARTREE_EV = 27.211386245988  # CODATA 2018


def grid(L=15.0, M=299):
    h = 2 * L / (M + 1)
    x = -L + h * np.arange(1, M + 1)
    return x, h


def lowest(diag, h):
    off = -0.5 / h**2 * np.ones(len(diag) - 1)
    w, v = eigh_tridiagonal(diag + 1.0 / h**2, off, select="i", select_range=(0, 0))
    phi = v[:, 0] / math.sqrt(h)  # normalized so that sum(phi^2) h = 1
    return w[0], phi


def rhf(Z, L=15.0, M=299, alpha=0.3, tol=1e-12, maxit=2000):
    x, h = grid(L, M)
    vext = -Z / np.sqrt(x**2 + 1.0)
    W = 1.0 / np.sqrt((x[:, None] - x[None, :]) ** 2 + 1.0)
    eps0, phi0 = lowest(vext, h)
    n = 2 * phi0**2
    history = []
    for it in range(1, maxit + 1):
        vH = h * W @ n
        eps, phi = lowest(vext + 0.5 * vH, h)
        n_out = 2 * phi**2
        resid = math.sqrt(h * np.sum((n_out - n) ** 2))
        history.append(resid)
        if resid < tol:
            n = n_out
            break
        n = (1 - alpha) * n + alpha * n_out
    vH = h * W @ n
    eps, phi = lowest(vext + 0.5 * vH, h)
    # <phi|h0|phi> with the same finite-difference operator
    lap = (np.concatenate([phi[1:], [0]]) - 2 * phi + np.concatenate([[0], phi[:-1]])) / h**2
    h0_exp = h * np.sum(phi * (-0.5 * lap + vext * phi))
    J = 0.25 * h * h * n @ W @ n
    E = 2 * h0_exp + J
    return {"Z": Z, "E_HF": E, "orbital_energy": eps, "E_noninteracting": 2 * eps0,
            "J": J, "iterations": it, "final_residual": history[-1], "mixing_alpha": alpha,
            "density_integral": float(h * n.sum())}


def exact_two_electron(Z, L=15.0, M=299):
    x, h = grid(L, M)
    vext = -Z / np.sqrt(x**2 + 1.0)
    T = diags([-0.5 / h**2 * np.ones(M - 1), (1.0 / h**2) * np.ones(M), -0.5 / h**2 * np.ones(M - 1)], [-1, 0, 1])
    h0 = T + diags(vext)
    I = identity(M)
    X1, X2 = np.meshgrid(x, x, indexing="ij")
    H = kron(h0, I) + kron(I, h0) + diags((1.0 / np.sqrt((X1 - X2) ** 2 + 1.0)).ravel())
    w, v = eigsh(H.tocsc(), k=1, sigma=-10.0 * Z, which="LM")
    psi = v[:, 0].reshape(M, M)
    sym = float(np.abs(psi - psi.T).max() / np.abs(psi).max())  # 0 for the (spatially symmetric) singlet
    return float(w[0]), sym


def main():
    res = {"_meta": {
        "generator": "scripts/reference/gen_scf1d_reference.py",
        "units": "hartree and bohr; 1 hartree = 27.211386245988 eV (CODATA 2018, S-031)",
        "grid": "x in (-15, 15) bohr, 299 interior points, spacing 0.1 bohr, Dirichlet boundaries, 3-point Laplacian",
        "model": "restricted Hartree-Fock for 2 electrons, soft-Coulomb external potential and interaction (parameter 1)",
    }, "cases": []}
    for Z in (1.0, 2.0):
        r = rhf(Z)
        Eex, sym = exact_two_electron(Z)
        r["E_exact_two_electron_same_grid"] = Eex
        r["exact_wavefunction_asymmetry"] = sym
        r["E_correlation"] = Eex - r["E_HF"]
        assert Eex < r["E_HF"], "variational principle violated"
        assert abs(r["density_integral"] - 2.0) < 1e-10
        res["cases"].append(r)
        print(f"Z={Z}: E_HF={r['E_HF']:.8f}  E_exact={Eex:.8f}  E_c={Eex - r['E_HF']:.6f}  eps={r['orbital_energy']:.6f}  it={r['iterations']}")
    OUT.write_text(json.dumps(res, indent=1) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
