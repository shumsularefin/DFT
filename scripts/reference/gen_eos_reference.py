#!/usr/bin/env python
"""Golden data for the equation-of-state fit (milestone M13.6).

Independent code path (never a copy of the TypeScript logic):
  * Synthetic E(V) points are generated from FIXED parameters with the energy forms of pymatgen's
    `BirchMurnaghan` (third order, F. Birch, Phys. Rev. 71, 809 (1947), S-061) and `Murnaghan`
    (F. D. Murnaghan, PNAS 30, 244 (1944), S-062), evaluated through pymatgen's own `_func`.
  * Every data set is fitted twice: with pymatgen's `EOS(eos_name=...)` (parabola start, scipy `leastsq`) and with
    scipy `curve_fit` directly (Levenberg-Marquardt, S-068) from the same parabola start, tightened tolerances.
    `curve_fit` also gives the standard errors sqrt(diag(pcov)), with pcov scaled by the residual variance.
  * Noise is seeded (numpy default_rng(SEED)) and stored with the points, so the TypeScript test fits the very same
    numbers.
  * The unit constant 1 eV/Angstrom^3 in GPa comes from scipy.constants (e * 1e30 / 1e9).

The parameter sets are illustrative test values, not claims about any real material.

Output: tests/reference/eos_reference.json
Run:    python scripts/reference/gen_eos_reference.py
"""
import importlib.metadata
import json
import pathlib
import warnings

import numpy as np
import scipy.constants as sc
from pymatgen.analysis.eos import EOS, BirchMurnaghan, Murnaghan
from scipy.optimize import curve_fit

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "tests" / "reference" / "eos_reference.json"
SEED = 20261119

# name: (E0 eV, V0 A^3, B0 eV/A^3, B0')
PARAMS = {
    "set_a": (-3.72, 11.95, 0.87, 4.8),
    "set_b": (-10.85, 40.9, 0.61, 4.2),
    "set_c": (-35.2, 64.0, 1.30, 3.9),
}
FORMS = {"birch_murnaghan": BirchMurnaghan, "murnaghan": Murnaghan}


def energies(form, vols, p):
    e0, v0, b0, b1 = p
    # pymatgen's parameter order is (e0, b0, b1, v0)
    return np.asarray(FORMS[form]([1.0, 2.0], [0.0, 0.0])._func(np.asarray(vols), (e0, b0, b1, v0)), float)


def fit_pymatgen(form, vols, ens):
    eos = EOS(eos_name=form).fit(list(vols), list(ens))
    return {"e0": float(eos.e0), "v0": float(eos.v0), "b0": float(eos.b0), "b1": float(eos.b1), "b0_GPa": float(eos.b0_GPa)}


def fit_scipy(form, vols, ens):
    a, b, c = np.polyfit(vols, ens, 2)
    v0 = -b / (2 * a)
    guess = (a * v0 * v0 + b * v0 + c, v0, 2 * a * v0, 4.0)

    def f(v, e0, v0, b0, b1):
        return energies(form, v, (e0, v0, b0, b1))

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # zero residuals on noise-free data make pcov degenerate; recorded as is
        p, cov = curve_fit(f, vols, ens, p0=guess, method="lm", xtol=1e-14, ftol=1e-14, gtol=1e-14, maxfev=100000)
    res = ens - f(np.asarray(vols), *p)
    return {
        "guess": {"e0": guess[0], "v0": guess[1], "b0": guess[2], "b1": guess[3]},
        "e0": float(p[0]), "v0": float(p[1]), "b0": float(p[2]), "b1": float(p[3]),
        # Non-finite (no degrees of freedom left) is stored as null.
        "stderr": {k: (float(s) if np.isfinite(s) else None) for k, s in zip(["e0", "v0", "b0", "b1"], np.sqrt(np.diag(cov)))},
        "rms_residual": float(np.sqrt(np.mean(res**2))),
    }


def case(name, form, p, fractions, noise_ev=0.0, rng=None):
    vols = [p[1] * f for f in fractions]
    ens = energies(form, vols, p)
    if noise_ev:
        ens = ens + rng.normal(0.0, noise_ev, len(vols))
    out = {
        "name": name,
        "form": form,
        "generating": {"e0": p[0], "v0": p[1], "b0": p[2], "b1": p[3]},
        "noise_ev": noise_ev,
        "volumes": [float(v) for v in vols],
        "energies": [float(e) for e in ens],
    }
    try:
        out["pymatgen"] = fit_pymatgen(form, vols, ens)
    except Exception as exc:  # noqa: BLE001 - recorded, the TS side must also refuse or warn
        out["pymatgen_error"] = f"{type(exc).__name__}: {exc}"
    try:
        out["scipy"] = fit_scipy(form, vols, ens)
    except Exception as exc:  # noqa: BLE001
        out["scipy_error"] = f"{type(exc).__name__}: {exc}"
    return out


def main():
    rng = np.random.default_rng(SEED)
    default = list(np.linspace(0.94, 1.06, 7))
    wide = list(np.linspace(0.90, 1.10, 11))
    cases = []
    for name, p in PARAMS.items():
        for form in FORMS:
            cases.append(case(f"{name}_{form}_clean", form, p, default))
            cases.append(case(f"{name}_{form}_clean_wide", form, p, wide))
            cases.append(case(f"{name}_{form}_noisy", form, p, wide, noise_ev=2e-3, rng=rng))
    # Bad-sampling fixtures (Birch-Murnaghan, set_a). The TypeScript warnings must fire on these.
    p = PARAMS["set_a"]
    bad = [
        case("bad_minimum_outside", "birch_murnaghan", p, list(np.linspace(0.80, 0.95, 7))),
        case("bad_four_points", "birch_murnaghan", p, [0.94, 0.98, 1.02, 1.06]),
        case("bad_asymmetric", "birch_murnaghan", p, [0.90, 0.92, 0.94, 0.96, 0.98, 1.0, 1.02]),
        case("bad_large_residuals", "birch_murnaghan", p, wide, noise_ev=0.03, rng=rng),
    ]
    ev_a3_gpa = sc.e * 1e30 / 1e9
    data = {
        "_meta": {
            "generator": "scripts/reference/gen_eos_reference.py",
            "versions": {k: importlib.metadata.version(k) for k in ["pymatgen", "numpy", "scipy"]},
            "seed": SEED,
            "parameter_order": "e0 (eV), v0 (A^3), b0 (eV/A^3), b1 (dimensionless B0')",
            "note": "Synthetic, illustrative parameter sets; not data for any real material.",
        },
        "ev_per_a3_in_gpa": ev_a3_gpa,
        "cases": cases,
        "bad": bad,
    }
    OUT.write_text(json.dumps(data, indent=1) + "\n")
    print(f"wrote {OUT} ({len(cases)} cases, {len(bad)} bad fixtures), 1 eV/A^3 = {ev_a3_gpa} GPa")


if __name__ == "__main__":
    main()
