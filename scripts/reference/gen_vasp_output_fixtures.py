#!/usr/bin/env python
"""Format-validated VASP output fixtures for the parsers (stages M4.1 and M7.5).

These are synthetic files (made-up numbers, NOT results of any calculation). What makes them
useful as golden data is that an independent implementation, pymatgen, either wrote them (CHGCAR)
or parsed them back (EIGENVAL, OSZICAR, XDATCAR), and the expected values stored in expected.json
come from pymatgen's reading, not from the TypeScript code. DOSCAR has no standalone pymatgen reader,
so it is written from the documented layout and marked unvalidated until real author files exist (Q-008).

Output: tests/reference/vasp-outputs/*  and  tests/reference/vasp-outputs/expected.json
"""
import json
import math
import pathlib
import warnings

import numpy as np
from pymatgen.core import Lattice, Structure
from pymatgen.io.vasp import Poscar
from pymatgen.io.vasp.outputs import Chgcar, Eigenval, Oszicar, Xdatcar

warnings.filterwarnings("ignore")
OUT = pathlib.Path(__file__).resolve().parents[2] / "tests" / "reference" / "vasp-outputs"


def chgcar_fixture(expected):
    # Orthorhombic cell and a non-cubic grid so that axis-order mistakes fail the test.
    lat = Lattice.orthorhombic(5.0, 5.0, 6.0)
    st = Structure(lat, ["H"], [[0.5, 0.5, 0.5]])
    nx, ny, nz = 20, 20, 24
    s, n_el = 0.8, 2.0
    fx, fy, fz = np.meshgrid(np.arange(nx) / nx, np.arange(ny) / ny, np.arange(nz) / nz, indexing="ij")
    cart = np.stack([fx * 5.0, fy * 5.0, fz * 6.0], axis=-1)
    r2 = np.sum((cart - np.array([2.5, 2.5, 3.0])) ** 2, axis=-1)
    rho = n_el / (math.pi ** 1.5 * s**3) * np.exp(-r2 / s**2)  # electrons per Angstrom^3
    vol = st.volume
    total = rho * vol  # CHGCAR stores rho * V_cell
    for spin in (False, True):
        data = {"total": total}
        if spin:
            data["diff"] = 0.5 * total  # magnetization density (rho_up - rho_down) * V, illustrative
        name = "CHGCAR_spin" if spin else "CHGCAR"
        Chgcar(Poscar(st), data).write_file(str(OUT / name))
        back = Chgcar.from_file(str(OUT / name))
        tot = back.data["total"]
        expected[name] = {
            "writer": "pymatgen Chgcar.write_file, read back with Chgcar.from_file",
            "grid": [nx, ny, nz],
            "cell_volume_A3": vol,
            "ispin": 2 if spin else 1,
            "value_order": "VASP writes x fastest, then y, then z (Fortran order); pymatgen's array is [ix][iy][iz]",
            "samples_raw_rho_times_V": {f"{i},{j},{k}": float(tot[i, j, k]) for (i, j, k) in [(0, 0, 0), (10, 10, 12), (11, 9, 13), (3, 17, 5), (19, 0, 23)]},
            "electrons_from_grid_sum_over_N": float(tot.sum() / (nx * ny * nz)),
            "max_density_e_per_A3": float(tot.max() / vol),
            "analytic_density": "Gaussian, 2 electrons, width 0.8 Angstrom, centred at (2.5, 2.5, 3.0) Angstrom",
        }
        if spin:
            expected[name]["magnetization_from_grid_sum_over_N"] = float(back.data["diff"].sum() / (nx * ny * nz))


def eigenval_fixture(expected):
    rng = np.random.default_rng(7)
    kpts = [[0, 0, 0, 0.125], [0.25, 0, 0, 0.5], [0.5, 0.5, 0, 0.375]]
    nb, nelect, nions = 4, 8, 2
    for ispin in (1, 2):
        lines = [f"    {nions}    {nions}    1    {ispin}",
                 "  0.1600000E+02  0.3850000E-09  0.3850000E-09  0.3850000E-09  0.5000000E-15",
                 "  1.000000000000000E-004", "  CAR", " synthetic fixture",
                 f"    {nelect}    {len(kpts)}    {nb}"]
        for k in kpts:
            lines.append("")
            lines.append(f"  {k[0]:.7E}  {k[1]:.7E}  {k[2]:.7E}  {k[3]:.7E}")
            e = np.sort(rng.uniform(-8, 6, nb))
            for b in range(nb):
                occ = 1.0 if e[b] < 0 else 0.0
                if ispin == 1:
                    lines.append(f"    {b + 1}     {e[b]:12.6f}   {occ:9.6f}")
                else:
                    e2 = e[b] + 0.3
                    occ2 = 1.0 if e2 < 0 else 0.0
                    lines.append(f"    {b + 1}     {e[b]:12.6f}  {e2:12.6f}   {occ:9.6f}   {occ2:9.6f}")
        name = f"EIGENVAL_ispin{ispin}"
        (OUT / name).write_text("\n".join(lines) + "\n")
        ev = Eigenval(str(OUT / name))
        # shape per spin: [nkpt][nbands][2] = (energy, occupation)
        eig = {str(spin): np.asarray(arr).round(8).tolist() for spin, arr in ev.eigenvalues.items()}
        expected[name] = {"reader": "pymatgen Eigenval", "ispin": ev.ispin, "nkpt": ev.nkpt, "nbands": ev.nbands,
                          "kpoints": [list(map(float, k)) for k in ev.kpoints],
                          "kpoint_weights": [float(w) for w in ev.kpoints_weights],
                          "eigenvalues_and_occupations_by_spin": eig}


def oszicar_fixture(expected):
    text = "\n".join([
        "       N       E                     dE             d eps       ncg     rms          rms(c)",
        "DAV:   1    -0.123456789012E+02   -0.12346E+02   -0.45678E+02   560   0.123E+02",
        "DAV:   2    -0.234567890123E+02   -0.11111E+02   -0.12345E+01   600   0.456E+00",
        "RMM:   3    -0.234590000000E+02   -0.22100E-02   -0.34567E-03   580   0.789E-01    0.123E+00",
        "   1 F= -.23459000E+02 E0= -.23458500E+02  d E =-.234590E+02  mag=     2.0000",
        "DAV:   1    -0.234600000000E+02   -0.10000E-02   -0.20000E-03   560   0.100E-01",
        "RMM:   2    -0.234601000000E+02   -0.10000E-03   -0.10000E-04   560   0.500E-02    0.600E-02",
        "   2 F= -.23460100E+02 E0= -.23459600E+02  d E =-.110000E-02  mag=     1.9998",
        "",
    ])
    (OUT / "OSZICAR_relax_spin").write_text(text)
    o = Oszicar(str(OUT / "OSZICAR_relax_spin"))
    expected["OSZICAR_relax_spin"] = {"reader": "pymatgen Oszicar",
                                      "ionic_steps": [{k: float(v) for k, v in step.items() if isinstance(v, (int, float))} for step in o.ionic_steps],
                                      "n_electronic_steps_per_ionic": [len(e) for e in o.electronic_steps]}


def xdatcar_fixture(expected):
    lines = ["Si2 relaxation (synthetic)", "           1",
             "     5.430000    0.000000    0.000000", "     0.000000    5.430000    0.000000",
             "     0.000000    0.000000    5.430000", "   Si", "     2"]
    frames = [[[0.0, 0.0, 0.0], [0.25, 0.25, 0.25]], [[0.0, 0.0, 0.01], [0.25, 0.26, 0.25]], [[0.0, 0.0, 0.005], [0.25, 0.255, 0.25]]]
    for i, fr in enumerate(frames, 1):
        lines.append(f"Direct configuration=     {i}")
        lines += [f"  {x:.8f}  {y:.8f}  {z:.8f}" for x, y, z in fr]
    (OUT / "XDATCAR").write_text("\n".join(lines) + "\n")
    x = Xdatcar(str(OUT / "XDATCAR"))
    expected["XDATCAR"] = {"reader": "pymatgen Xdatcar", "n_frames": len(x.structures),
                           "frac_coords": [s.frac_coords.round(10).tolist() for s in x.structures],
                           "species": [str(sp) for sp in x.structures[0].species]}


def doscar_fixture(expected):
    # Layout (VASP 5.4 / 6.x): line 1 "NIONS NIONS 1 NCDIJ"; lines 2-5 header; line 6
    # "Emax Emin NEDOS Efermi 1.0"; NEDOS lines of total DOS (ISPIN 1: E dos int; ISPIN 2: E up down int_up int_down);
    # then for LORBIT >= 10 one block per ion: header line 6 again, then NEDOS lines.
    # LORBIT = 11, ISPIN = 2 columns per line: E, then for each of s py pz px dxy dyz dz2 dxz dx2 the pair (up, down).
    nions, nedos, efermi = 2, 11, 1.5
    E = np.linspace(-5, 5, nedos)
    up = np.exp(-((E - 0.5) ** 2)); dn = 0.8 * np.exp(-((E + 0.5) ** 2))
    iu = np.cumsum(up) * (E[1] - E[0]); idn = np.cumsum(dn) * (E[1] - E[0])
    hdr = f"  {E.max():.8f}  {E.min():.8f}  {nedos}  {efermi:.8f}  1.00000000"
    lines = [f"   {nions}   {nions}   1   0", "  0.1234567E+02  0.5430000E-09  0.5430000E-09  0.5430000E-09  0.5000000E-15",
             "  1.000000000000000E-004", "  CAR", " synthetic fixture", hdr]
    for i in range(nedos):
        lines.append(f"  {E[i]:.6f}  {up[i]:.4E}  {dn[i]:.4E}  {iu[i]:.4E}  {idn[i]:.4E}")
    proj = []
    for ion in range(nions):
        lines.append(hdr)
        block = []
        for i in range(nedos):
            vals = [(ion + 1) * 0.01 * (o + 1) * up[i] for o in range(9) for _ in (0,)]
            row = []
            for o in range(9):
                row += [vals[o], 0.5 * vals[o]]
            block.append(row)
            lines.append(f"  {E[i]:.6f}  " + "  ".join(f"{v:.4E}" for v in row))
        proj.append(block)
    (OUT / "DOSCAR_ispin2_lorbit11").write_text("\n".join(lines) + "\n")
    expected["DOSCAR_ispin2_lorbit11"] = {
        "validated_by_independent_parser": False,
        "note": "written from the documented layout; confirm with a real DOSCAR from the author (Q-008)",
        "nions": nions, "nedos": nedos, "efermi": efermi, "ispin": 2, "lorbit": 11,
        "orbital_order": ["s", "py", "pz", "px", "dxy", "dyz", "dz2", "dxz", "dx2"],
        "column_layout": "E, then (up, down) for each orbital in orbital_order",
        "energies": [round(float(e), 6) for e in E],
        "total_up": [float(f"{v:.4E}") for v in up],
        "total_down": [float(f"{v:.4E}") for v in dn],
        "ion1_s_up": [float(f"{proj[0][i][0]:.4E}") for i in range(nedos)],
        "ion2_dx2_down": [float(f"{proj[1][i][17]:.4E}") for i in range(nedos)],
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    expected = {"_meta": {"generator": "scripts/reference/gen_vasp_output_fixtures.py",
                          "warning": "SYNTHETIC numbers. These files test parsers only; never show them as results."}}
    chgcar_fixture(expected)
    eigenval_fixture(expected)
    oszicar_fixture(expected)
    xdatcar_fixture(expected)
    doscar_fixture(expected)
    (OUT / "expected.json").write_text(json.dumps(expected, indent=1) + "\n")
    for k, v in expected.items():
        if k != "_meta":
            print(k, {kk: v[kk] for kk in list(v)[:4]})


if __name__ == "__main__":
    main()
