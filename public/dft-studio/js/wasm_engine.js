/* Native Browser WebAssembly (Pyodide) Scientific Compute Engine
 * Runs real spglib, SeekPath, Phonopy, NumPy, and SciPy on the user's own PC CPU/RAM
 * directly inside the browser with zero server or local Python installation.
 */
window.WasmEngine = (() => {
  let pyodide = null;
  let initPromise = null;
  let statusCb = null;

  function setStatus(msg, state = 'loading') {
    if (statusCb) statusCb(msg, state);
  }

  async function ensureReady(onStatus) {
    if (onStatus) statusCb = onStatus;
    if (pyodide) return pyodide;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        if (typeof window.loadPyodide !== 'function') {
          setStatus('Loading WebAssembly runtime (Pyodide)...', 'loading');
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Could not load Pyodide WebAssembly runtime (internet required for first load).'));
            document.head.appendChild(s);
          });
        }

        setStatus('Booting Python WASM on your PC CPU...', 'loading');
        pyodide = await window.loadPyodide();

        setStatus('Loading NumPy, SciPy & micropip in WASM...', 'loading');
        await pyodide.loadPackage(['numpy', 'scipy', 'micropip']);

        setStatus('Installing spglib, seekpath & phonopy WASM wheels...', 'loading');
        await pyodide.runPythonAsync(`
import micropip
for pkg in ['spglib', 'seekpath', 'phonopy']:
    try:
        await micropip.install(pkg)
    except Exception as e:
        print(f"Optional pkg {pkg} note:", e)
`);

        // Define helper Python functions inside WASM
        await pyodide.runPythonAsync(`
import json, io, tempfile
import numpy as np

def _parse_poscar_py(text):
    lines = [l.strip() for l in text.replace('\\r', '').split('\\n')]
    scale = float(lines[1])
    lat = np.array([[float(x) for x in lines[i].split()[:3]] for i in range(2, 5)]) * scale
    idx = 5
    tok5 = lines[idx].split()
    try:
        [int(x) for x in tok5]
        elements = [f"El{k+1}" for k in range(len(tok5))]
    except ValueError:
        elements = tok5
        idx += 1
    counts = [int(x) for x in lines[idx].split()]
    idx += 1
    if lines[idx].lower().startswith('s'):
        idx += 1
    is_cart = lines[idx].lower().startswith(('c', 'k'))
    idx += 1
    total = sum(counts)
    coords = []
    for _ in range(total):
        while idx < len(lines) and not lines[idx]:
            idx += 1
        coords.append([float(x) for x in lines[idx].split()[:3]])
        idx += 1
    coords = np.array(coords)
    if is_cart:
        frac = np.linalg.solve(lat.T, coords.T).T
    else:
        frac = coords
    numbers = []
    Z_MAP = {
        'H':1,'He':2,'Li':3,'Be':4,'B':5,'C':6,'N':7,'O':8,'F':9,'Ne':10,
        'Na':11,'Mg':12,'Al':13,'Si':14,'P':15,'S':16,'Cl':17,'Ar':18,'K':19,'Ca':20,
        'Sc':21,'Ti':22,'V':23,'Cr':24,'Mn':25,'Fe':26,'Co':27,'Ni':28,'Cu':29,'Zn':30,
        'Ga':31,'Ge':32,'As':33,'Se':34,'Br':35,'Kr':36,'Rb':37,'Sr':38,'Y':39,'Zr':40,
        'Nb':41,'Mo':42,'Tc':43,'Ru':44,'Rh':45,'Pd':46,'Ag':47,'Cd':48,'In':49,'Sn':50,
        'Sb':51,'Te':52,'I':53,'Xe':54,'Cs':55,'Ba':56,'La':57,'Ce':58,'Pr':59,'Nd':60,
        'Sm':62,'Eu':63,'Gd':64,'Tb':65,'Dy':66,'Ho':67,'Er':68,'Tm':69,'Yb':70,'Lu':71,
        'Hf':72,'Ta':73,'W':74,'Re':75,'Os':76,'Ir':77,'Pt':78,'Au':79,'Hg':80,'Tl':81,
        'Pb':82,'Bi':83,'Th':90,'U':92
    }
    REV_Z = {v: k for k, v in Z_MAP.items()}
    for el, c in zip(elements, counts):
        numbers.extend([Z_MAP.get(el, 14)] * c)
    return lat, frac, numbers, elements, counts, REV_Z

def _to_poscar_py(lat, frac, numbers, REV_Z, comment="VASPKIT_WASM"):
    # Group by species preserving order
    order = []
    grouped = {}
    for f, z in zip(frac, numbers):
        el = REV_Z.get(int(z), "X")
        if el not in grouped:
            grouped[el] = []
            order.append(el)
        grouped[el].append(f)
    lines = [comment, "1.0"]
    for row in lat:
        lines.append(f"  {row[0]:14.8f}  {row[1]:14.8f}  {row[2]:14.8f}")
    lines.append(" ".join(order))
    lines.append(" ".join(str(len(grouped[el])) for el in order))
    lines.append("Direct")
    for el in order:
        for f in grouped[el]:
            lines.append(f"  {f[0]:12.8f}  {f[1]:12.8f}  {f[2]:12.8f}")
    return "\\n".join(lines) + "\\n"

def wasm_symmetry(poscar_text, symprec=1e-3):
    import spglib
    lat, frac, numbers, elements, counts, REV_Z = _parse_poscar_py(poscar_text)
    cell = (lat, frac, numbers)
    ds = spglib.get_symmetry_dataset(cell, symprec=float(symprec))
    prim = spglib.standardize_cell(cell, to_primitive=True, symprec=float(symprec))
    conv = spglib.standardize_cell(cell, to_primitive=False, symprec=float(symprec))
    sg_num = int(ds.number if hasattr(ds, 'number') else ds['number'])
    intl = str(ds.international if hasattr(ds, 'international') else ds['international'])
    hall = str(ds.hall if hasattr(ds, 'hall') else ds['hall'])
    pg = str(ds.pointgroup if hasattr(ds, 'pointgroup') else ds['pointgroup'])
    wyck = list(ds.wyckoffs if hasattr(ds, 'wyckoffs') else ds['wyckoffs'])
    return json.dumps({
        "spacegroup_number": sg_num,
        "spacegroup_symbol": intl,
        "hall": hall,
        "point_group": pg,
        "wyckoff_letters": wyck,
        "primitive_poscar": _to_poscar_py(prim[0], prim[1], prim[2], REV_Z, f"Primitive_SG_{sg_num}") if prim else poscar_text,
        "conventional_poscar": _to_poscar_py(conv[0], conv[1], conv[2], REV_Z, f"Conventional_SG_{sg_num}") if conv else poscar_text,
    })

def wasm_seekpath(poscar_text, pts_per_seg=30):
    import seekpath
    lat, frac, numbers, elements, counts, REV_Z = _parse_poscar_py(poscar_text)
    sp = seekpath.get_path((lat, frac, numbers))
    pt_coords = sp["point_coords"]
    lines = [f"VASPKIT Studio SeekPath ({sp['bravais_lattice_extended']})", str(int(pts_per_seg)), "Line-Mode", "Reciprocal"]
    for s_lbl, e_lbl in sp["path"]:
        c1, c2 = pt_coords[s_lbl], pt_coords[e_lbl]
        l1 = "\\\\Gamma" if s_lbl == "GAMMA" else s_lbl
        l2 = "\\\\Gamma" if e_lbl == "GAMMA" else e_lbl
        lines.append(f"  {c1[0]:10.6f}  {c1[1]:10.6f}  {c1[2]:10.6f}   ! {l1}")
        lines.append(f"  {c2[0]:10.6f}  {c2[1]:10.6f}  {c2[2]:10.6f}   ! {l2}\\n")
    prim_pos = _to_poscar_py(sp["primitive_lattice"], sp["primitive_positions"], sp["primitive_types"], REV_Z, "SeekPath_Primitive")
    return json.dumps({
        "bravais": sp["bravais_lattice_extended"],
        "spacegroup_number": int(sp["spacegroup_number"]),
        "spacegroup_international": sp["spacegroup_international"],
        "path_string": " → ".join([f"{'Γ' if s=='GAMMA' else s}-{'Γ' if e=='GAMMA' else e}" for s, e in sp["path"]]),
        "kpoints_text": "\\n".join(lines),
        "primitive_poscar": prim_pos,
    })

def wasm_elastic(matrix_6x6_json):
    C = np.array(json.loads(matrix_6x6_json), dtype=float)
    C = 0.5 * (C + C.T)
    S = np.linalg.inv(C)
    Kv = ((C[0,0]+C[1,1]+C[2,2]) + 2*(C[0,1]+C[1,2]+C[0,2])) / 9.0
    Gv = ((C[0,0]+C[1,1]+C[2,2]) - (C[0,1]+C[1,2]+C[0,2]) + 3*(C[3,3]+C[4,4]+C[5,5])) / 15.0
    Kr = 1.0 / ((S[0,0]+S[1,1]+S[2,2]) + 2*(S[0,1]+S[1,2]+S[0,2]))
    Gr = 15.0 / (4*(S[0,0]+S[1,1]+S[2,2]) - 4*(S[0,1]+S[1,2]+S[0,2]) + 3*(S[3,3]+S[4,4]+S[5,5]))
    Kh, Gh = 0.5*(Kv+Kr), 0.5*(Gv+Gr)
    E = (9.0*Kh*Gh)/(3.0*Kh+Gh)
    nu = (3.0*Kh-2.0*Gh)/(2.0*(3.0*Kh+Gh))
    pugh = Kh/Gh
    eigs = np.linalg.eigvalsh(C)
    return json.dumps({
        "bulk_gpa": round(float(Kh), 2),
        "shear_gpa": round(float(Gh), 2),
        "youngs_gpa": round(float(E), 2),
        "poisson": round(float(nu), 4),
        "pugh_ratio": round(float(pugh), 3),
        "ductile_or_brittle": "Ductile (K/G > 1.75)" if pugh > 1.75 else "Brittle (K/G < 1.75)",
        "stable": bool(np.all(eigs > 0)),
    })

def wasm_planar_avg(vol_text, axis=2):
    lines = vol_text.replace('\\r', '').split('\\n')
    scale = float(lines[1].strip())
    lat = np.array([[float(x) for x in lines[i].split()[:3]] for i in range(2, 5)]) * scale
    idx = 5
    tok5 = lines[idx].split()
    try:
        [int(x) for x in tok5]
    except ValueError:
        idx += 1
    counts = [int(x) for x in lines[idx].split()]
    idx += 1
    if lines[idx].strip().lower().startswith('s'):
        idx += 1
    idx += 1 + sum(counts)
    while idx < len(lines) and not lines[idx].strip():
        idx += 1
    ngx, ngy, ngz = [int(x) for x in lines[idx].split()[:3]]
    idx += 1
    vals = []
    total_pts = ngx * ngy * ngz
    while idx < len(lines) and len(vals) < total_pts:
        s = lines[idx].strip()
        if s:
            vals.extend(float(x) for x in s.split())
        idx += 1
    arr = np.array(vals[:total_pts]).reshape((ngz, ngy, ngx)).transpose((2, 1, 0))
    axes_to_avg = tuple(i for i in (0, 1, 2) if i != int(axis))
    prof = arr.mean(axis=axes_to_avg)
    length = float(np.linalg.norm(lat[int(axis)]))
    z_coords = np.linspace(0.0, length, len(prof), endpoint=False)
    return json.dumps({
        "grid": [ngx, ngy, ngz],
        "axis_length_a": round(length, 4),
        "coords_a": [round(float(x), 4) for x in z_coords],
        "planar_avg": [round(float(x), 6) for x in prof],
        "vacuum_level": round(float(np.max(prof)), 5),
    })

def wasm_aimd_xdatcar(xdat_text, element, potim_fs=1.0):
    lines = [l.strip() for l in xdat_text.replace('\\r', '').split('\\n') if l.strip()]
    scale = float(lines[1])
    lat = np.array([[float(x) for x in lines[i].split()[:3]] for i in range(2, 5)]) * scale
    elements = lines[5].split()
    counts = [int(x) for x in lines[6].split()]
    total = sum(counts)
    species = []
    for el, c in zip(elements, counts):
        species.extend([el] * c)
    indices = [i for i, s in enumerate(species) if s == element]
    if not indices:
        raise ValueError(f"Element {element} not found in XDATCAR")
    frames = []
    i = 7
    while i < len(lines):
        if lines[i].lower().startswith('direct'):
            i += 1
            fr = np.array([[float(x) for x in lines[i + k].split()[:3]] for k in range(total)])
            frames.append(fr[indices])
            i += total
        else:
            i += 1
    if len(frames) < 2:
        raise ValueError("Need at least 2 frames in XDATCAR")
    prev = frames[0].copy()
    acc = frames[0].copy()
    unwrapped = [acc @ lat]
    for fr in frames[1:]:
        df = fr - prev
        df -= np.round(df)
        acc += df
        prev = fr
        unwrapped.append(acc @ lat)
    pos = np.array(unwrapped)
    msd = np.mean(np.sum((pos - pos[0:1])**2, axis=2), axis=1)
    times_ps = (np.arange(len(frames)) * float(potim_fs)) / 1000.0
    half = max(1, len(times_ps) // 2)
    slope = float(np.polyfit(times_ps[half:], msd[half:], 1)[0]) if len(times_ps) > 3 else 0.0
    d_cm2_s = max(0.0, slope / 6.0) * 1e-4
    return json.dumps({
        "num_frames": len(frames),
        "times_ps": [round(float(t), 4) for t in times_ps],
        "msd_a2": [round(float(m), 5) for m in msd],
        "diffusion_coeff_cm2_s": float(f"{d_cm2_s:.4e}"),
    })

def wasm_phonopy_compute(poscar_text, force_sets_text, dim_json="[2,2,2]"):
    import seekpath
    from phonopy import Phonopy
    from phonopy.structure.atoms import PhonopyAtoms
    from phonopy.file_IO import parse_FORCE_SETS
    lat, frac, numbers, elements, counts, REV_Z = _parse_poscar_py(poscar_text)
    symbols = [REV_Z.get(int(z), "Si") for z in numbers]
    unitcell = PhonopyAtoms(symbols=symbols, cell=lat, scaled_positions=frac)
    dim = json.loads(dim_json)
    ph = Phonopy(unitcell, supercell_matrix=np.diag(dim))
    with tempfile.NamedTemporaryFile("w", suffix="_FS", delete=False) as tf:
        tf.write(force_sets_text)
        tpath = tf.name
    ph.dataset = parse_FORCE_SETS(filename=tpath)
    ph.produce_force_constants()
    ph.run_mesh([15, 15, 15])
    ph.run_total_dos()
    dos = ph.get_total_dos_dict()
    ph.run_thermal_properties(t_min=0, t_max=1000, t_step=25)
    tp = ph.get_thermal_properties_dict()
    sp = seekpath.get_path((lat, frac, numbers))
    pts = sp["point_coords"]
    paths = [np.linspace(pts[s], pts[e], 31) for s, e in sp["path"]]
    ph.run_band_structure(paths)
    bs = ph.get_band_structure_dict()
    min_f = float(min(np.min(f) for f in bs["frequencies"]))
    return json.dumps({
        "min_freq_thz": round(min_f, 4),
        "stable": min_f > -0.05,
        "band_distances": [d.tolist() for d in bs["distances"]],
        "band_frequencies": [f.tolist() for f in bs["frequencies"]],
        "dos_freq": dos["frequency_points"].tolist(),
        "dos_val": dos["total_dos"].tolist(),
        "t_k": tp["temperatures"].tolist(),
        "free_e": tp["free_energy"].tolist(),
        "entropy": tp["entropy"].tolist(),
        "cv": tp["heat_capacity"].tolist(),
    })
`);

        setStatus('Native WASM Ready (spglib · SeekPath · Phonopy · NumPy)', 'ready');
        return pyodide;
      } catch (err) {
        initPromise = null;
        setStatus(err.message, 'error');
        throw err;
      }
    })();

    return initPromise;
  }

  async function callPy(fnName, ...args) {
    const py = await ensureReady();
    py.globals.set('_wasm_args', args);
    const res = await py.runPythonAsync(`${fnName}(*_wasm_args.to_py())`);
    return JSON.parse(res);
  }

  return {
    ensureReady,
    isReady: () => !!pyodide,
    symmetry: (poscar, symprec = 1e-3) => callPy('wasm_symmetry', poscar, symprec),
    seekpath: (poscar, pts = 30) => callPy('wasm_seekpath', poscar, pts),
    elastic: (mat6) => callPy('wasm_elastic', JSON.stringify(mat6)),
    planarAvg: (volText, axis = 2) => callPy('wasm_planar_avg', volText, axis),
    aimdXdatcar: (xdatText, el, potim = 1.0) => callPy('wasm_aimd_xdatcar', xdatText, el, potim),
    phonopyCompute: (poscar, forceSets, dim = [2, 2, 2]) => callPy('wasm_phonopy_compute', poscar, forceSets, JSON.stringify(dim)),
  };
})();
