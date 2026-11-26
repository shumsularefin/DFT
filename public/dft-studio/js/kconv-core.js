/* K-point convergence core (from vasp_k_point_convergence_kit.html, unchanged logic). Exposes window.KConv. */
window.KConv = (() => {
'use strict';
//PURE-START
const TPL = "#!/usr/bin/env python3\n\"\"\"\nVASP k-point convergence test (Gamma-centered meshes, static single points).\n\nEach mesh is converged with a stage ladder (default EDIFF 1e-4 -> 1e-6 -> 1e-8). Every stage restarts from the\nWAVECAR of the previous stage, CONTCAR is copied to POSCAR in between (geometry stays fixed because NSW = 0),\nand each stage is repeated (up to --tries) until \"EDIFF is reached\". The first stage of every mesh\nstarts from the CHGCAR of the previous mesh, which keeps the magnetic state and saves SCF steps.\n\nPut this script next to POSCAR, INCAR and POTCAR and run it in the background:\n\n    nohup python3 -u kpoint_convergence.py --cmd \"mpirun -np 12 vasp\" > kconv.log 2>&1 &\n\n(do NOT put nohup/& inside --cmd; the script itself is what runs in the background)\n\nFor every mesh it\n  * creates KPOINT_Convergence/<mesh>/ with POSCAR, POTCAR, a patched INCAR and KPOINTS\n  * runs VASP there (finished folders with unchanged inputs are skipped -> safe to restart)\n  * reads from OUTCAR: E(sigma->0), TOTEN, irreducible k-points, max force, pressure,\n    net magnetization, wall time, electronic-convergence flag\nand finally writes a table, CSV, summary text and a 6-panel plot.\n\nUseful options\n  --Lmax 45            only run the series up to L = 45 A (add denser meshes later by rerunning)\n  --meshes 4x3x3 6x5x4 custom meshes instead of the built-in series\n  --tol 1.0 0.1        tolerances in meV/atom (default: 1.0 and 0.1)\n  --analyze-only       do not run VASP, just rebuild table/plot from finished runs\n  --dry-run            create the folders and print what would be run\n  --ediff 1e-4 1e-6 1e-8  the EDIFF ladder (last value is the production accuracy)\n  --tries 2 3 5        maximum VASP runs per EDIFF stage (one number per stage, default 2 3 5)\n  --no-seed            do not start a mesh from the previous mesh's CHGCAR\n  --keep-wave          keep WAVECAR/CHGCAR after each mesh (large files)\n\"\"\"\n\nimport argparse\nimport csv\nimport hashlib\nimport json\nimport math\nimport re\nimport shutil\nimport subprocess\nimport sys\nimport time\nfrom pathlib import Path\n\n# (L in Angstrom, mesh) for the 5.302 x 6.242 x 7.296 A cell: N_i = max(1, int(L/a_i + 0.5))\nSERIES = [\n    (10, (2, 2, 1)),\n    (15, (3, 2, 2)),\n    (20, (4, 3, 3)),   # your current baseline\n    (25, (5, 4, 3)),\n    (30, (6, 5, 4)),\n    (35, (7, 6, 5)),\n    (40, (8, 6, 5)),\n    (45, (8, 7, 6)),\n    (50, (9, 8, 7)),\n    (60, (11, 10, 8)),\n]\n\n# Tags forced in every INCAR copy so that all runs are clean single points\nBASE_OVERRIDES = {\"NSW\": \"0\", \"IBRION\": \"-1\", \"LWAVE\": \".TRUE.\", \"LCHARG\": \".TRUE.\"}\n\nFINISHED_MARK = \"General timing and accounting informations for this job\"\nEDIFF_MARK = \"aborting loop because EDIFF is reached\"\n\nRE_ENERGY = re.compile(r\"energy\\s+without entropy=\\s*(-?\\d+\\.\\d+)\\s+energy\\(sigma->0\\)\\s*=\\s*(-?\\d+\\.\\d+)\")\nRE_TOTEN = re.compile(r\"free\\s+energy\\s+TOTEN\\s*=\\s*(-?\\d+\\.\\d+)\\s*eV\")\nRE_NKPTS = re.compile(r\"NKPTS\\s*=\\s*(\\d+)\")\nRE_TIME = re.compile(r\"Elapsed time \\(sec\\):\\s*([\\d.]+)\")\nRE_PRESS = re.compile(r\"external pressure =\\s*(-?\\d+\\.\\d+)\\s*kB\")\nRE_ITER = re.compile(r\"Iteration\\s+\\d+\\(\\s*(\\d+)\\)\")\nRE_MAG = re.compile(r\"number of electron\\s+[\\d.]+\\s+magnetization\\s+(-?\\d+\\.\\d+)\")\n\n\n# ----------------------------------------------------------------------------- helpers\ndef parse_mesh(text):\n    parts = text.lower().replace(\",\", \"x\").split(\"x\")\n    if len(parts) != 3:\n        raise argparse.ArgumentTypeError(f\"Bad mesh '{text}', use e.g. 4x3x3\")\n    return tuple(int(p) for p in parts)\n\n\ndef mesh_name(mesh):\n    return \"x\".join(str(n) for n in mesh)\n\n\ndef read_poscar(path):\n    lines = Path(path).read_text().splitlines()\n    scale = float(lines[1].split()[0])\n    vecs = [[float(x) * scale for x in lines[i].split()[:3]] for i in (2, 3, 4)]\n    lengths = [math.sqrt(sum(c * c for c in v)) for v in vecs]\n    natoms = None\n    for idx in (5, 6):\n        tokens = lines[idx].split()\n        if tokens and all(t.isdigit() for t in tokens):\n            natoms = sum(int(t) for t in tokens)\n            break\n    if natoms is None:\n        raise ValueError(\"Could not read atom counts from POSCAR\")\n    return natoms, lengths\n\n\ndef incar_tag(text, tag):\n    for line in text.splitlines():\n        s = line.split(\"#\")[0].split(\"!\")[0].strip()\n        if \"=\" in s and s.split(\"=\")[0].strip().upper() == tag:\n            return s.split(\"=\")[1].split()[0]\n    return None\n\n\ndef patch_incar(text, overrides):\n    out = []\n    for line in text.splitlines():\n        st = line.split(\"#\")[0].split(\"!\")[0].strip()\n        key = st.split(\"=\")[0].strip().upper() if \"=\" in st else None\n        out.append(\"# (overridden below) \" + line if key in overrides else line)\n    out += [\"\", \"# ---- added by kpoint_convergence.py ----\"]\n    out += [f\"{k} = {v}\" for k, v in overrides.items()]\n    return \"\\n\".join(out) + \"\\n\"\n\n\ndef write_kpoints(path, mesh):\n    Path(path).write_text(\"Gamma-centered mesh\\n0\\nGamma\\n{} {} {}\\n0 0 0\\n\".format(*mesh))\n\n\ndef inputs_hash(incar_text, poscar_path, mesh, extra):\n    h = hashlib.sha1()\n    h.update(incar_text.encode())\n    h.update(Path(poscar_path).read_bytes())\n    h.update((mesh_name(mesh) + extra).encode())\n    return h.hexdigest()\n\n\ndef read_done(folder):\n    f = folder / \".done\"\n    if not f.exists():\n        return None\n    try:\n        return json.loads(f.read_text())\n    except ValueError:\n        return None\n\n\ndef is_finished(folder, expected_hash):\n    d = read_done(folder)\n    return bool(d and d.get(\"hash\") == expected_hash)\n\n\ndef run_vasp(folder, cmd):\n    with open(folder / \"vasp.out\", \"a\") as out:\n        return subprocess.run(cmd, shell=True, cwd=folder, stdout=out, stderr=subprocess.STDOUT).returncode\n\n\ndef converge_mesh(folder, mesh, args, incar_raw, seed_chgcar, h):\n    \"\"\"Run the EDIFF ladder in `folder`. Returns the .done dictionary.\"\"\"\n    (folder / \"vasp.out\").write_text(\"\")\n    for junk in (\"WAVECAR\", \"CHGCAR\", \"OUTCAR\"):\n        if (folder / junk).exists():\n            (folder / junk).unlink()\n    if seed_chgcar and Path(seed_chgcar).exists():\n        shutil.copy(seed_chgcar, folder / \"CHGCAR\")\n    t0, runs, ok = time.time(), 0, False\n    for si, ed in enumerate(args.ediff):\n        last = si == len(args.ediff) - 1\n        tries = args.tries[si]\n        for attempt in range(tries):\n            has_wave = (folder / \"WAVECAR\").exists()\n            has_chg = (folder / \"CHGCAR\").exists()\n            if has_wave:\n                start = {\"ISTART\": \"1\", \"ICHARG\": \"0\"}\n            elif has_chg:\n                start = {\"ISTART\": \"0\", \"ICHARG\": \"1\"}\n            else:\n                start = {\"ISTART\": \"0\", \"ICHARG\": \"2\"}\n            ov = dict(BASE_OVERRIDES, EDIFF=f\"{ed:.0e}\", **start)\n            (folder / \"INCAR\").write_text(patch_incar(incar_raw, ov))\n            write_kpoints(folder / \"KPOINTS\", mesh)\n            print(f\"        stage {si + 1}/{len(args.ediff)} EDIFF={ed:.0e} try {attempt + 1}/{tries} \"\n                  f\"(ISTART={start['ISTART']}, ICHARG={start['ICHARG']})\", flush=True)\n            code = run_vasp(folder, args.cmd)\n            runs += 1\n            res = parse_outcar(folder)\n            reached = bool(res and res[\"ediff_ok\"] and res[\"finished\"])\n            if (folder / \"CONTCAR\").exists() and (folder / \"CONTCAR\").stat().st_size > 0 and args.copy_contcar:\n                shutil.copy(folder / \"CONTCAR\", folder / \"POSCAR\")\n            print(f\"        -> exit {code}, SCF steps {res['scf_steps'] if res else '?'}, \"\n                  f\"EDIFF reached: {reached}\", flush=True)\n            if reached:\n                break\n        if not reached:\n            print(f\"        WARNING: EDIFF={ed:.0e} not reached after {tries} tries\", flush=True)\n        if last:\n            ok = reached\n    done = {\"hash\": h, \"converged\": ok, \"runs\": runs, \"wall_s\": time.time() - t0}\n    if not args.keep_wave and (folder / \"WAVECAR\").exists():\n        (folder / \"WAVECAR\").unlink()\n    (folder / \".done\").write_text(json.dumps(done))\n    return done\n\n\ndef last_max_force(lines):\n    idx = None\n    for i in range(len(lines) - 1, -1, -1):\n        if \"TOTAL-FORCE\" in lines[i]:\n            idx = i\n            break\n    if idx is None:\n        return float(\"nan\")\n    fmax = 0.0\n    for ln in lines[idx + 2:]:\n        if ln.strip().startswith(\"---\"):\n            break\n        p = ln.split()\n        if len(p) >= 6:\n            try:\n                fx, fy, fz = (float(x) for x in p[3:6])\n            except ValueError:\n                continue\n            fmax = max(fmax, math.sqrt(fx * fx + fy * fy + fz * fz))\n    return fmax\n\n\ndef parse_outcar(folder):\n    outcar = folder / \"OUTCAR\"\n    if not outcar.exists():\n        return None\n    text = outcar.read_text(errors=\"ignore\")\n    en = RE_ENERGY.findall(text)\n    if not en:\n        return None\n    toten = RE_TOTEN.findall(text)\n    nk, tm = RE_NKPTS.search(text), RE_TIME.search(text)\n    pr, mg, it = RE_PRESS.findall(text), RE_MAG.findall(text), RE_ITER.findall(text)\n    return {\n        \"e_noentropy\": float(en[-1][0]),\n        \"e_sigma0\": float(en[-1][1]),\n        \"toten\": float(toten[-1]) if toten else float(\"nan\"),\n        \"nkpts_irr\": int(nk.group(1)) if nk else 0,\n        \"time_s\": float(tm.group(1)) if tm else float(\"nan\"),\n        \"fmax\": last_max_force(text.splitlines()),\n        \"pressure\": float(pr[-1]) if pr else float(\"nan\"),\n        \"mag\": float(mg[-1]) if mg else float(\"nan\"),\n        \"scf_steps\": int(it[-1]) if it else 0,\n        \"finished\": FINISHED_MARK in text,\n        \"ediff_ok\": EDIFF_MARK in text,\n    }\n\n\n# ----------------------------------------------------------------------------- analysis\ndef analyze(entries, base, natoms, lengths, tols):\n    rows = []\n    for label, mesh in entries:\n        d = parse_outcar(base / mesh_name(mesh))\n        if d is None:\n            print(f\"  [skip] no energy found for {mesh_name(mesh)}\")\n            continue\n        dn = read_done(base / mesh_name(mesh)) or {}\n        d[\"runs\"] = dn.get(\"runs\", 1)\n        if \"wall_s\" in dn:\n            d[\"time_s\"] = dn[\"wall_s\"]\n        d.update(label=label, mesh=mesh, grid_points=mesh[0] * mesh[1] * mesh[2])\n        d[\"kpra\"] = d[\"grid_points\"] * natoms                      # k-points per reciprocal atom\n        d[\"rmin\"] = min(n * a for n, a in zip(mesh, lengths))      # min real-space superlattice distance\n        rows.append(d)\n    if not rows:\n        return rows, {}\n    rows.sort(key=lambda r: r[\"grid_points\"])\n    good = [r for r in rows if r[\"ediff_ok\"] and r[\"finished\"]]\n    ref = good[-1] if good else rows[-1]\n    prev = None\n    for r in rows:\n        r[\"e_per_atom\"] = r[\"e_sigma0\"] / natoms\n        r[\"d_prev\"] = float(\"nan\") if prev is None else abs(r[\"e_sigma0\"] - prev[\"e_sigma0\"]) / natoms * 1000\n        r[\"d_ref\"] = abs(r[\"e_sigma0\"] - ref[\"e_sigma0\"]) / natoms * 1000\n        r[\"dF_ref\"] = abs(r[\"fmax\"] - ref[\"fmax\"]) * 1000          # meV/A\n        prev = r\n\n    verdict = {}\n    for tol in tols:\n        found_ref = found_succ = None\n        g = good\n        for i in range(len(g) - 2):                                 # need >= 2 denser converged meshes\n            if found_ref is None and all(g[j][\"d_ref\"] <= tol for j in range(i, len(g))):\n                found_ref = g[i]\n            if found_succ is None and all(\n                    abs(g[j][\"e_sigma0\"] - g[j - 1][\"e_sigma0\"]) / natoms * 1000 <= tol for j in range(i + 1, len(g))):\n                found_succ = g[i]\n        verdict[tol] = (found_ref, found_succ)\n    return rows, verdict\n\n\ndef tag(r):\n    return f\"{r['label']} ({mesh_name(r['mesh'])})\" if r[\"label\"] else mesh_name(r[\"mesh\"])\n\n\ndef format_table(rows, tols):\n    h = (f\"{'Mesh':<9}{'L(A)':>5}{'Nirr':>6}{'kpts/atom':>10}{'E(s->0)/atom eV':>17}\"\n         f\"{'dE_prev':>9}{'dE_dens':>9}{'Fmax meV/A':>11}{'P kB':>8}{'M muB':>8}{'t(min)':>8}{'Runs':>5}{'SCF':>5}  Notes\")\n    lines = [\"\", h, \"-\" * len(h)]\n    for r in rows:\n        notes = []\n        if not r[\"finished\"]:\n            notes.append(\"NOT FINISHED\")\n        if not r[\"ediff_ok\"]:\n            notes.append(\"UNCONVERGED SCF (excluded)\")\n        if r[\"d_ref\"] <= min(tols):\n            notes.append(f\"<= {min(tols)}\")\n        elif r[\"d_ref\"] <= max(tols):\n            notes.append(f\"<= {max(tols)}\")\n        dp = \"-\" if math.isnan(r[\"d_prev\"]) else f\"{r['d_prev']:.3f}\"\n        lines.append(\n            f\"{mesh_name(r['mesh']):<9}{(r['label'] or ''):>5}{r['nkpts_irr']:>6}{r['kpra']:>10}\"\n            f\"{r['e_per_atom']:>17.6f}{dp:>9}{r['d_ref']:>9.3f}{r['fmax'] * 1000:>11.2f}\"\n            f\"{r['pressure']:>8.2f}{r['mag']:>8.3f}{r['time_s'] / 60:>8.1f}{r['runs']:>5}{r['scf_steps']:>5}  {', '.join(notes)}\")\n    lines += [\"\", \"dE_prev = |E - E(previous mesh)|, dE_dens = |E - E(densest mesh)|, both in meV/atom\",\n              \"Fmax = largest force on any atom, P = external pressure, M = net magnetization\",\n              \"Runs = number of VASP runs used for the mesh, SCF = electronic steps in the final run, t = total wall time\"]\n    return \"\\n\".join(lines)\n\n\ndef format_verdict(verdict, rows):\n    out = [\"\"]\n    for tol, (a, b) in verdict.items():\n        out.append(f\"Tolerance {tol} meV/atom:\")\n        out.append(\"  vs densest mesh (and all denser ones, >=2 denser meshes): \"\n                   + (tag(a) if a else \"not reached - add denser meshes\"))\n        out.append(\"  successive differences stay below tol from this mesh on: \"\n                   + (tag(b) if b else \"not reached - add denser meshes\"))\n    out.append(\"\")\n    out.append(\"Caution: the densest mesh is the reference, so it is not itself proven converged. \"\n               \"Trust a result only if energies stay flat over at least two denser meshes.\")\n    bad = [mesh_name(r[\"mesh\"]) for r in rows if not r[\"finished\"] or not r[\"ediff_ok\"]]\n    if bad:\n        out.append(\"WARNING: unfinished / electronically unconverged runs: \" + \", \".join(bad))\n    return \"\\n\".join(out)\n\n\ndef save_csv(rows, path):\n    cols = [\"label\", \"mesh\", \"grid_points\", \"nkpts_irr\", \"kpra\", \"rmin\", \"e_sigma0\", \"e_noentropy\", \"toten\",\n            \"e_per_atom\", \"d_prev\", \"d_ref\", \"fmax\", \"dF_ref\", \"pressure\", \"mag\", \"time_s\", \"runs\", \"scf_steps\", \"finished\", \"ediff_ok\"]\n    with open(path, \"w\", newline=\"\") as f:\n        w = csv.writer(f)\n        w.writerow([\"L_A\", \"mesh\", \"grid_points_BZ\", \"irreducible_kpoints\", \"kpoints_per_atom\", \"rmin_A\",\n                    \"E_sigma0_eV\", \"E_noentropy_eV\", \"TOTEN_eV\", \"E_per_atom_eV\", \"dE_prev_meV_atom\",\n                    \"dE_densest_meV_atom\", \"Fmax_eV_A\", \"dFmax_vs_densest_meV_A\", \"pressure_kB\",\n                    \"net_mag_muB\", \"total_time_s\", \"vasp_runs\", \"scf_steps_last_run\", \"finished\", \"EDIFF_reached\"])\n        for r in rows:\n            w.writerow([r[c] if c != \"mesh\" else mesh_name(r[\"mesh\"]) for c in cols])\n\n\ndef save_plot(rows, tols, path):\n    try:\n        import matplotlib\n        matplotlib.use(\"Agg\")\n        import matplotlib.pyplot as plt\n    except ImportError:\n        print(\"matplotlib not installed -> no plot (pip install matplotlib)\")\n        return\n    x = list(range(len(rows)))\n    labels = [(f\"L={r['label']}\\n\" if r[\"label\"] else \"\") + mesh_name(r[\"mesh\"]) for r in rows]\n    fig, ax = plt.subplots(2, 3, figsize=(16, 8))\n\n    def style(a, ylabel, title):\n        a.set_xticks(x)\n        a.set_xticklabels(labels, rotation=60, fontsize=7)\n        a.set_ylabel(ylabel)\n        a.set_title(title)\n        a.grid(alpha=0.3)\n\n    ax[0, 0].plot(x, [r[\"e_per_atom\"] for r in rows], \"o-\")\n    style(ax[0, 0], \"E(sigma->0) per atom (eV)\", \"Total energy\")\n\n    ax[0, 1].semilogy(x, [max(r[\"d_ref\"], 1e-4) for r in rows], \"o-\", label=\"vs densest mesh\")\n    ax[0, 1].semilogy(x[1:], [max(r[\"d_prev\"], 1e-4) for r in rows[1:]], \"s--\", label=\"vs previous mesh\")\n    for tol, c in zip(tols, (\"red\", \"darkorange\", \"purple\")):\n        ax[0, 1].axhline(tol, color=c, ls=\":\", label=f\"{tol} meV/atom\")\n    ax[0, 1].legend(fontsize=7)\n    style(ax[0, 1], \"|dE| (meV/atom)\", \"Energy convergence\")\n\n    ax[0, 2].plot(x, [r[\"fmax\"] * 1000 for r in rows], \"o-\", color=\"green\")\n    style(ax[0, 2], \"max |F| (meV/A)\", \"Largest force (should be flat)\")\n\n    ax[1, 0].plot(x, [r[\"pressure\"] for r in rows], \"o-\", color=\"brown\")\n    style(ax[1, 0], \"external pressure (kB)\", \"Pressure / stress\")\n\n    ax[1, 1].plot(x, [r[\"mag\"] for r in rows], \"o-\", color=\"teal\")\n    style(ax[1, 1], \"net magnetization (muB/cell)\", \"Magnetic order (AFM -> ~0)\")\n\n    ax[1, 2].bar(x, [r[\"time_s\"] / 60 for r in rows], color=\"lightgray\")\n    style(ax[1, 2], \"wall time (min)\", \"Cost\")\n    b = ax[1, 2].twinx()\n    b.plot(x, [r[\"nkpts_irr\"] for r in rows], \"ko-\", ms=4)\n    b.set_ylabel(\"irreducible k-points\")\n\n    fig.tight_layout()\n    fig.savefig(path, dpi=200)\n    print(f\"Plot saved: {path}\")\n\n\n# ----------------------------------------------------------------------------- main\ndef main():\n    ap = argparse.ArgumentParser(description=\"VASP k-point convergence test\")\n    ap.add_argument(\"--cmd\", default=\"mpirun -np 12 vasp\", help='VASP command (default \"mpirun -np 12 vasp\")')\n    ap.add_argument(\"--src\", default=\".\", help=\"folder with POSCAR, INCAR, POTCAR\")\n    ap.add_argument(\"--out\", default=\"KPOINT_Convergence\")\n    ap.add_argument(\"--tol\", nargs=\"+\", type=float, default=[1.0, 0.1], help=\"tolerances, meV/atom\")\n    ap.add_argument(\"--Lmax\", type=float, help=\"skip built-in series entries with L above this\")\n    ap.add_argument(\"--meshes\", nargs=\"+\", type=parse_mesh, help=\"custom meshes, e.g. 2x2x1 4x3x3\")\n    ap.add_argument(\"--analyze-only\", action=\"store_true\")\n    ap.add_argument(\"--dry-run\", action=\"store_true\")\n    ap.set_defaults(copy_contcar=True)\n    ap.add_argument(\"--ediff\", nargs=\"+\", type=float, default=[1e-4, 1e-6, 1e-8], help=\"EDIFF ladder\")\n    ap.add_argument(\"--tries\", nargs=\"+\", type=int, default=[2, 3, 5],\n                    help=\"maximum VASP runs allowed per EDIFF stage, one number per stage (a single number applies \"\n                         \"to all); a stage stops as soon as EDIFF is reached\")\n    ap.add_argument(\"--no-seed\", action=\"store_true\", help=\"do not seed a mesh from the previous CHGCAR\")\n    ap.add_argument(\"--keep-wave\", action=\"store_true\", help=\"keep WAVECAR/CHGCAR of every mesh\")\n    ap.add_argument(\"--no-copy-contcar\", dest=\"copy_contcar\", action=\"store_false\", help=\"skip CONTCAR -> POSCAR\")\n    args = ap.parse_args()\n    if len(args.tries) == 1:\n        args.tries = args.tries * len(args.ediff)\n    if len(args.tries) != len(args.ediff):\n        sys.exit(f\"--tries needs {len(args.ediff)} numbers (one per EDIFF stage) or a single number\")\n\n    src, base = Path(args.src).resolve(), Path(args.out).resolve()\n    needed = [\"POSCAR\"] if args.analyze_only else [\"POSCAR\", \"INCAR\", \"POTCAR\"]\n    for n in needed:\n        if not (src / n).exists():\n            sys.exit(f\"Missing {n} in {src}\")\n\n    natoms, lengths = read_poscar(src / \"POSCAR\")\n    if args.meshes:\n        entries = [(None, m) for m in args.meshes]\n    else:\n        entries = [(L, m) for L, m in SERIES if args.Lmax is None or L <= args.Lmax]\n    print(f\"Atoms: {natoms} | lattice lengths: \" + \", \".join(f\"{a:.3f}\" for a in lengths) + \" A\")\n    print(\"Meshes: \" + \", \".join(mesh_name(m) for _, m in entries))\n    base.mkdir(exist_ok=True)\n\n    if not args.analyze_only:\n        incar_raw = (src / \"INCAR\").read_text()\n        kpar, ncore = incar_tag(incar_raw, \"KPAR\"), incar_tag(incar_raw, \"NCORE\")\n        mnp = re.search(r\"-np\\s+(\\d+)\", args.cmd)\n        if kpar and ncore and mnp and int(mnp.group(1)) % (int(kpar) * int(ncore)) != 0:\n            print(f\"WARNING: MPI ranks ({mnp.group(1)}) not divisible by KPAR*NCORE = {int(kpar) * int(ncore)}\")\n        print(\"EDIFF ladder: \" + \" -> \".join(f\"{e:.0e}\" for e in args.ediff))\n\n        prev_chg, older_chg = None, None\n        for _, mesh in entries:\n            folder = base / mesh_name(mesh)\n            folder.mkdir(exist_ok=True)\n            extra = \"|\" + \",\".join(f\"{e:.0e}\" for e in args.ediff) + f\"|{','.join(map(str, args.tries))}|{args.no_seed}\"\n            h = inputs_hash(incar_raw + str(sorted(BASE_OVERRIDES.items())), src / \"POSCAR\", mesh, extra)\n            if is_finished(folder, h):\n                print(f\"[done]  {mesh_name(mesh)} finished earlier with identical inputs, skipping\")\n                prev_chg = folder / \"CHGCAR\" if (folder / \"CHGCAR\").exists() else prev_chg\n                continue\n            shutil.copy(src / \"POSCAR\", folder / \"POSCAR\")\n            shutil.copy(src / \"POTCAR\", folder / \"POTCAR\")\n            if args.dry_run:\n                (folder / \"INCAR\").write_text(patch_incar(incar_raw, dict(BASE_OVERRIDES, EDIFF=f\"{args.ediff[0]:.0e}\")))\n                write_kpoints(folder / \"KPOINTS\", mesh)\n                print(f\"[dry]   {mesh_name(mesh)} prepared in {folder}\")\n                continue\n            print(f\"[run]   {mesh_name(mesh)} ...\", flush=True)\n            done = converge_mesh(folder, mesh, args, incar_raw, None if args.no_seed else prev_chg, h)\n            print(f\"        mesh {mesh_name(mesh)}: {'CONVERGED' if done['converged'] else 'NOT CONVERGED'} \"\n                  f\"after {done['runs']} run(s), {done['wall_s'] / 60:.1f} min\", flush=True)\n            if older_chg and not args.keep_wave and Path(older_chg).exists():\n                Path(older_chg).unlink()\n            older_chg, prev_chg = prev_chg, (folder / \"CHGCAR\" if (folder / \"CHGCAR\").exists() else prev_chg)\n        if args.dry_run:\n            return\n\n    rows, verdict = analyze(entries, base, natoms, lengths, args.tol)\n    if not rows:\n        sys.exit(\"No results found.\")\n    report = format_table(rows, args.tol) + \"\\n\" + format_verdict(verdict, rows)\n    print(report)\n    (base / \"kpoint_convergence_summary.txt\").write_text(report + \"\\n\")\n    save_csv(rows, base / \"kpoint_convergence.csv\")\n    print(f\"\\nSaved: {base / 'kpoint_convergence.csv'} and kpoint_convergence_summary.txt\")\n    save_plot(rows, args.tol, base / \"kpoint_convergence.png\")\n\n\nif __name__ == \"__main__\":\n    main()\n";

const REMOVE_TAGS = [
  "NSW", "IBRION", "ISIF", "EDIFFG", "POTIM", "NFREE",
  "LORBIT", "NEDOS", "LOPTICS", "LELF", "LVTOT", "LVHAR", "LAECHG",
  "LWAVE", "LCHARG", "ISTART", "ICHARG", "EDIFF", "EMIN", "EMAX",
  "LEPSILON", "LCALCEPS", "LPEAD", "ICHAIN", "IMAGES"
];

const REMOVE_SET = new Set(REMOVE_TAGS);

const TRANSITION_METALS = new Set([
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
  "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd",
  "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au"
]);

function normalizeNewlines(text) {
  return String(text || "").replace(/\r\n?/g, "\n");
}

function splitComment(line) {
  const idx = line.search(/[#!]/);
  if (idx === -1) return { code: line, comment: "" };
  return { code: line.slice(0, idx), comment: line.slice(idx) };
}

function parseIncar(text) {
  const tags = {};
  for (const rawLine of normalizeNewlines(text).split("\n")) {
    const { code } = splitComment(rawLine);
    for (const stmt of code.split(";")) {
      const s = stmt.trim();
      const eq = s.indexOf("=");
      if (eq > 0) {
        const key = s.slice(0, eq).trim().toUpperCase();
        const val = s.slice(eq + 1).trim();
        if (key) tags[key] = val;
      }
    }
  }
  return tags;
}

function cleanIncar(text) {
  const removed = [];
  const out = [];
  for (const rawLine of normalizeNewlines(text).split("\n")) {
    const { code, comment } = splitComment(rawLine);
    if (!code.trim()) {
      out.push(rawLine);
      continue;
    }
    if (!code.includes(";")) {
      const s = code.trim();
      const eq = s.indexOf("=");
      const key = eq > 0 ? s.slice(0, eq).trim().toUpperCase() : null;
      if (key && REMOVE_SET.has(key)) {
        removed.push(rawLine.trim());
      } else {
        out.push(rawLine);
      }
    } else {
      const keptStmts = [];
      for (const part of code.split(";")) {
        const s = part.trim();
        if (!s) continue;
        const eq = s.indexOf("=");
        const key = eq > 0 ? s.slice(0, eq).trim().toUpperCase() : null;
        if (key && REMOVE_SET.has(key)) {
          removed.push(s);
        } else {
          keptStmts.push(s);
        }
      }
      if (keptStmts.length > 0) {
        out.push(keptStmts.join("; ") + (comment ? " " + comment : ""));
      } else if (comment.trim()) {
        out.push(comment);
      }
    }
  }
  const cleaned = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned ? cleaned + "\n" : "", removed };
}

function cleanElementSymbol(token) {
  const base = String(token || "").split("/")[0].split("_")[0];
  const m = base.match(/^[A-Za-z]{1,2}/);
  if (!m) return base;
  return m[0][0].toUpperCase() + m[0].slice(1).toLowerCase();
}

function cellVolume(vecs) {
  const [a, b, c] = vecs;
  const cx = b[1] * c[2] - b[2] * c[1];
  const cy = b[2] * c[0] - b[0] * c[2];
  const cz = b[0] * c[1] - b[1] * c[0];
  return Math.abs(a[0] * cx + a[1] * cy + a[2] * cz);
}

function parsePoscar(text) {
  const lines = normalizeNewlines(text).split("\n");
  if (lines.length < 7) throw new Error("POSCAR has too few lines");
  const scale = parseFloat((lines[1] || "").trim().split(/\s+/)[0]);
  if (!Number.isFinite(scale) || scale === 0) {
    throw new Error("Invalid POSCAR scale factor");
  }
  const factor = Math.abs(scale);
  const vecs = [];
  for (const idx of [2, 3, 4]) {
    const parts = (lines[idx] || "").trim().split(/\s+/).slice(0, 3).map(Number);
    if (parts.length < 3 || parts.some(v => !Number.isFinite(v))) {
      throw new Error(`Invalid lattice vector on line ${idx + 1}`);
    }
    vecs.push(parts.map(c => c * factor));
  }
  const len = vecs.map(v => Math.hypot(v[0], v[1], v[2]));
  if (len.some(a => a <= 0)) throw new Error("Zero-length lattice vector in POSCAR");

  let counts = null;
  let rawElements = null;
  for (const idx of [5, 6]) {
    const tokens = (lines[idx] || "").trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 0 && tokens.every(t => /^\d+$/.test(t))) {
      counts = tokens.map(Number);
      if (idx === 6) {
        rawElements = (lines[5] || "").trim().split(/\s+/).filter(Boolean);
      }
      break;
    }
  }
  if (!counts) throw new Error("Could not read atom counts from POSCAR");
  const elements = rawElements ? rawElements.map(cleanElementSymbol) : null;
  return {
    scale,
    len,
    volume: cellVolume(vecs),
    counts,
    nat: counts.reduce((a, b) => a + b, 0),
    rawElements,
    elements,
    negScale: scale < 0
  };
}

function parseKpoints(text) {
  const lines = normalizeNewlines(text).split("\n").map(s => s.trim());
  if (lines.length < 4) return null;
  if (!/^[gm]/i.test(lines[2])) return null;
  const parts = lines[3].split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const mesh = parts.slice(0, 3).map(Number);
  if (mesh.some(x => !Number.isInteger(x) || x <= 0)) return null;
  return {
    type: /^g/i.test(lines[2]) ? "Gamma" : "Monkhorst-Pack",
    mesh
  };
}

function meshFor(L, len) {
  return len.map(a => Math.max(1, Math.floor(L / a + 0.5)));
}

function meshName(mesh) {
  return mesh.join("x");
}

function parseCustomMeshes(customStr) {
  const valid = [];
  const invalid = [];
  const tokens = String(customStr || "").trim().split(/[\s,;]+/).filter(Boolean);
  for (const tok of tokens) {
    const m = tok.match(/^(\d+)[xX](\d+)[xX](\d+)$/);
    if (!m) {
      invalid.push(tok);
      continue;
    }
    const nums = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (nums.some(n => !Number.isInteger(n) || n <= 0)) {
      invalid.push(tok);
    } else {
      valid.push(nums);
    }
  }
  return { valid, invalid };
}

function buildSeries(lMin, lMax, step, len, customInput) {
  const seen = new Set();
  const items = [];
  if (Number.isFinite(lMin) && Number.isFinite(lMax) && Number.isFinite(step) && step > 0 && lMax >= lMin) {
    const maxSteps = 500;
    for (let i = 0; i <= maxSteps; i++) {
      const L = Number((lMin + i * step).toPrecision(10));
      if (L > lMax + 1e-9) break;
      const m = meshFor(L, len);
      const key = meshName(m);
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ L, m });
      }
    }
  }
  let valid = [];
  let invalid = [];
  if (Array.isArray(customInput)) {
    valid = customInput;
  } else {
    const parsed = parseCustomMeshes(customInput);
    valid = parsed.valid;
    invalid = parsed.invalid;
  }
  for (const m of valid) {
    const key = meshName(m);
    if (!seen.has(key)) {
      seen.add(key);
      items.push({ L: null, m });
    }
  }
  return { items, invalidCustom: invalid };
}

function parseNumberList(str) {
  const tokens = String(str || "").trim().split(/[\s,]+/).filter(Boolean);
  const nums = [];
  const invalid = [];
  for (const tok of tokens) {
    const n = Number(tok);
    if (Number.isFinite(n) && n > 0) nums.push(n);
    else invalid.push(tok);
  }
  return { nums, invalid };
}

function parsePositiveIntList(str) {
  const tokens = String(str || "").trim().split(/[\s,]+/).filter(Boolean);
  const nums = [];
  const invalid = [];
  for (const tok of tokens) {
    if (/^\d+$/.test(tok) && Number(tok) > 0) nums.push(Number(tok));
    else invalid.push(tok);
  }
  return { nums, invalid };
}

function formatEdiff(x) {
  return Number(x).toExponential().replace("+", "");
}

function formatTol(x) {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

function collectWarnings(opts) {
  const warnings = [];
  const infos = [];
  const { poscar, incarTags, cmd, meshes, ediff, tries, invalidCustom, invalidTol, invalidEdiff, invalidTries } = opts;

  if (!meshes || meshes.length === 0) {
    warnings.push("No mesh selected.");
  }
  if (invalidCustom && invalidCustom.length > 0) {
    warnings.push(`Invalid custom mesh(es): ${invalidCustom.join(", ")} (use NxNxN with positive integers, e.g. 4x3x3).`);
  }
  if (invalidTol && invalidTol.length > 0) {
    warnings.push(`Invalid tolerance value(s): ${invalidTol.join(", ")}.`);
  }
  if (invalidEdiff && invalidEdiff.length > 0) {
    warnings.push(`Invalid EDIFF value(s): ${invalidEdiff.join(", ")}.`);
  }
  if (invalidTries && invalidTries.length > 0) {
    warnings.push(`Invalid max runs value(s): ${invalidTries.join(", ")} (must be positive integers).`);
  }
  if (ediff.length === 0) {
    warnings.push("EDIFF ladder cannot be empty.");
  } else if (tries.length !== 1 && tries.length !== ediff.length) {
    warnings.push(`Max runs per stage has ${tries.length} value(s), but EDIFF ladder has ${ediff.length} stage(s) (provide one per stage or a single number).`);
  }
  if (poscar && poscar.negScale) {
    warnings.push("POSCAR scale factor is negative (target cell volume in VASP); lattice lengths shown here are multiplied by |scale|.");
  }
  if (incarTags) {
    const npMatch = String(cmd || "").match(/-np\s+(\d+)/);
    const kpar = parseInt(incarTags.KPAR, 10);
    const ncore = parseInt(incarTags.NCORE, 10);
    if (npMatch && kpar > 0 && ncore > 0) {
      const np = parseInt(npMatch[1], 10);
      if (np % (kpar * ncore) !== 0) {
        warnings.push(`MPI ranks (-np ${np}) are not divisible by KPAR*NCORE = ${kpar * ncore} (KPAR=${kpar}, NCORE=${ncore}).`);
      }
    }
    if (/^2\b/.test(incarTags.ISPIN || "") && !incarTags.MAGMOM) {
      warnings.push("ISPIN = 2 is set in INCAR without MAGMOM.");
    }
    if (incarTags.ISMEAR !== undefined && Number(incarTags.ISMEAR) >= 0 && !incarTags.SIGMA) {
      warnings.push(`ISMEAR = ${incarTags.ISMEAR} is set in INCAR without SIGMA.`);
    }
    const hasLdau = /^\.?t/i.test(incarTags.LDAU || "");
    if (!hasLdau && poscar && poscar.elements) {
      const tms = [...new Set(poscar.elements.filter(el => TRANSITION_METALS.has(el)))];
      if (tms.length > 0) {
        infos.push(`Transition metal (${tms.join(", ")}) present in POSCAR with no LDAU in INCAR (informational only; keep consistent with your production setup).`);
      }
    }
  }
  return { warnings, infos };
}

function buildScript(opts) {
  let s = TPL;
  const rows = opts.meshes
    .map(x => `    (${x.L === null ? "None" : x.L}, (${x.m.join(", ")})),`)
    .join("\n");
  s = s.replace(/SERIES = \[[\s\S]*?\n\]\n/, () => `SERIES = [\n${rows}\n]\n`);
  s = s.replace('default="mpirun -np 12 vasp"', () => "default=" + JSON.stringify(opts.cmd));
  s = s.replace("default=[1.0, 0.1]", () => "default=[" + opts.tol.map(formatTol).join(", ") + "]");
  s = s.replace("default=[1e-4, 1e-6, 1e-8]", () => "default=[" + opts.ed.map(formatEdiff).join(", ") + "]");
  s = s.replace("default=[2, 3, 5]", () => "default=[" + opts.tr.join(", ") + "]");
  return s;
}

function buildReadme(opts) {
  const c = opts.cmd;
  const tolStr = opts.tol.map(formatTol).join(" ");
  const edStr = opts.ed.map(formatEdiff).join(" ");
  const trStr = opts.tr.join(" ");
  const meshSummary = opts.meshes.map(x => meshName(x.m)).join(", ");
  return `# VASP k-point convergence run (${opts.nat} atoms; a, b, c = ${opts.len.map(x => x.toFixed(3)).join(", ")} Å)

Selected meshes: ${meshSummary}

## 1. Prepare one folder
Put these four files in the same folder:
- \`POSCAR\`
- \`INCAR\` (the trimmed INCAR from this kit, named exactly \`INCAR\`)
- \`POTCAR\` (your own local POTCAR)
- \`kpoint_convergence.py\` (customized from this kit)

\`KPOINTS\` is not needed: the script generates a Gamma-centered \`KPOINTS\` file for every mesh.

## 2. Dry run (check setup without running VASP)
    python3 kpoint_convergence.py --dry-run

## 3. Run in the background
    nohup python3 -u kpoint_convergence.py --cmd "${c}" > kconv.log 2>&1 &
    tail -f kconv.log

Press \`Ctrl+C\` to stop watching \`kconv.log\` (the job keeps running).
Never put \`nohup\` or \`&\` inside \`--cmd\`. If the run stops for any reason, rerun the same command: already finished meshes with identical inputs are skipped automatically.

## 4. Options
- \`--Lmax 45\`: run only built-in meshes with L up to 45 Å (add denser meshes later by rerunning without \`--Lmax\`)
- \`--meshes 4x3x3 6x5x4\`: run only the specified meshes
- \`--tol ${tolStr}\`: energy convergence tolerances in meV/atom
- \`--ediff ${edStr}\`: EDIFF stage ladder (last value is the production accuracy)
- \`--tries ${trStr}\`: maximum VASP runs per EDIFF stage (a single number applies to all stages; a stage stops as soon as EDIFF is reached)
- \`--out NAME\`: output directory name (default \`KPOINT_Convergence\`)
- \`--analyze-only\`: do not run VASP; rebuild the summary table, CSV, and plot from finished runs
- \`--keep-wave\`: keep \`WAVECAR\` and \`CHGCAR\` for every mesh (large files)
- \`--no-seed\`: do not seed a mesh from the previous mesh's \`CHGCAR\`

## 5. How to read the outputs
Outputs are written inside \`KPOINT_Convergence/\`:
- \`kpoint_convergence_summary.txt\`: formatted table and convergence verdict per tolerance
- \`kpoint_convergence.csv\`: machine-readable table of all quantities
- \`kpoint_convergence.png\`: 6-panel convergence plot

Key columns:
- \`Nirr\`: irreducible k-points reported by VASP
- \`kpts/atom\`: BZ grid points multiplied by atom count
- \`E(s->0)/atom eV\`: extrapolated energy per atom
- \`dE_prev\` / \`dE_dens\`: energy difference vs previous / densest mesh (meV/atom)
- \`Fmax meV/A\`, \`P kB\`, \`M muB\`: maximum force, external pressure, and net magnetization
- \`Runs\`, \`SCF\`, \`t(min)\`: VASP runs used, SCF steps in the final run, and wall time

Trust a mesh only if energies stay within tolerance over at least two denser meshes (the densest mesh is the reference and is not itself proven converged). Always check that net magnetization remains consistent across meshes and that no mesh is flagged \`UNCONVERGED\` or \`NOT FINISHED\`.

## 6. Common problems
- **Missing INCAR or POTCAR**: verify that \`POSCAR\`, \`INCAR\`, \`POTCAR\`, and \`kpoint_convergence.py\` are in the working directory (or pass \`--src\`).
- **EDIFF not reached after all tries**: raise \`--tries\` for that stage, increase \`NELM\`, tune \`AMIX\`/\`BMIX\`, or switch to \`ALGO = All\`. Unconverged meshes are excluded from the verdict.
- **KPAR / MPI mismatch**: ensure the MPI rank count (\`-np\`) is divisible by \`KPAR * NCORE\`.
- **KPAR larger than irreducible k-points**: on the coarsest meshes, lower \`KPAR\` or accept idle k-point groups.
- **Job dies on logout**: ensure you launched with \`nohup ... &\`, or submit through your cluster scheduler.
- **Disk usage**: \`WAVECAR\` is removed after each mesh and only the previous \`CHGCAR\` is kept for seeding unless \`--keep-wave\` is set.
- **Missing matplotlib**: install it (\`pip install matplotlib\`) and run \`python3 kpoint_convergence.py --analyze-only\` to generate the PNG plot.
- **Jumpy energies**: usually caused by unconverged SCF or a change in magnetic state; check the \`UNCONVERGED\` notes and the \`M muB\` magnetization column.
`;
}
//PURE-END
return { TPL, REMOVE_TAGS, parseIncar, cleanIncar, parsePoscar, parseKpoints, meshFor, meshName, parseCustomMeshes, buildSeries, parseNumberList, parsePositiveIntList, collectWarnings, buildScript, buildReadme, formatTol, formatEdiff };
})();
