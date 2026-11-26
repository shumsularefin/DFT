/* DFT Studio step 7: Analyze. Post-processing of VASP outputs (from VASPKIT Studio), all in the browser.
 * Results are kept in state and redrawn, so switching steps or toggling the theme does not lose them.
 */
(() => {
  'use strict';
  const T = window.StudioKit;
  const { S, V, $, esc, helpBtn, readFileText, plot, downloadText } = T;

  const A = { out: {}, eos: '18.0 -10.52\n19.0 -10.74\n20.0 -10.81\n21.0 -10.76\n22.0 -10.63', cij: '165 64 64 0 0 0\n64 165 64 0 0 0\n64 64 165 0 0 0\n0 0 0 79 0 0\n0 0 0 0 79 0\n0 0 0 0 0 79', freqs: '3200, 1450, 820, 410, 180', temp: 298.15, barrier: 0.75, mdEl: 'Li', mdDt: 1.0, phDim: '2 2 2', ef: '' };
  const TABS = [['elec', 'Electronic'], ['phonon', 'Phonons'], ['mech', 'EOS and elastic'], ['thermo', 'Thermochemistry'], ['md', 'Molecular dynamics'], ['struct', 'Relaxed structure']];

  const badge = (t, cls = '') => `<span class="sp-badge ${cls}">${t}</span>`;
  function setOut(key, info, plots = []) { A.out[key] = { info, plots }; drawOut(key); }
  function drawOut(key) {
    const box = $('res-' + key);
    const o = A.out[key];
    if (!box || !o) return;
    box.innerHTML = `<div class="sp-row wrap">${o.info}</div>` + o.plots.map((p, i) => `<div id="pl-${key}-${i}" class="sp-plot ${p.tall ? 'tall' : ''}"></div>`).join('');
    o.plots.forEach((p, i) => plot(`pl-${key}-${i}`, p.traces, p.layout));
  }
  function err(key, e) { setOut(key, `<span class="sp-note warn">${esc(e.message || e)}</span>`); }
  function onFile(id, key, fn) {
    const inp = $(id);
    if (!inp) return;
    inp.onchange = async () => {
      const f = await readFileText(inp);
      inp.value = '';
      if (!f) return;
      try { await fn(f.text, f.name); } catch (e) { console.error(e); err(key, e); }
    };
  }
  async function wasm(key, msg) {
    setOut(key, `<span class="sp-note">${esc(msg)} The first use downloads the Python runtime (about 30 MB).</span>`);
    await window.WasmEngine.ensureReady(T.updateWasmPill);
  }
  const upBtn = (id, label, primary) => `<label class="v-btn ${primary ? 'v-btn-primary' : ''} cursor-pointer">${label}<input id="${id}" type="file" class="hidden"/></label>`;

  // ------------------------------------------------------------- parsers
  function parseDoscar(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const hdr = lines[5].trim().split(/\s+/).map(Number);
    const nedos = hdr[2], ef = hdr[3];
    if (!Number.isFinite(nedos) || !Number.isFinite(ef)) throw new Error('Not a DOSCAR (line 6 should be EMAX EMIN NEDOS EFERMI weight)');
    const rows = lines.slice(6, 6 + nedos).map((l) => l.trim().split(/\s+/).map(Number));
    const spin = rows[0].length >= 5;
    return { ef, spin, e: rows.map((r) => r[0] - ef), up: rows.map((r) => r[1]), dn: spin ? rows.map((r) => r[2]) : null };
  }
  function parseEigenval(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const ispin = Number(lines[0].trim().split(/\s+/)[3]) || 1;
    const [nelect, nkpts, nbands] = lines[5].trim().split(/\s+/).map(Number);
    if (!nkpts || !nbands) throw new Error('Not an EIGENVAL file');
    let i = 6;
    const kpts = [], E = [[], []], occ = [[], []];
    for (let k = 0; k < nkpts; k++) {
      while (i < lines.length && !lines[i].trim()) i++;
      kpts.push(lines[i].trim().split(/\s+/).slice(0, 3).map(Number)); i++;
      const eu = [], ed = [], ou = [], od = [];
      for (let b = 0; b < nbands; b++, i++) {
        const p = lines[i].trim().split(/\s+/).map(Number);
        if (ispin === 2) { eu.push(p[1]); ed.push(p[2]); ou.push(p[3]); od.push(p[4]); } else { eu.push(p[1]); ou.push(p.length > 2 ? p[2] : NaN); }
      }
      E[0].push(eu); occ[0].push(ou); if (ispin === 2) { E[1].push(ed); occ[1].push(od); }
    }
    return { ispin, nelect, nkpts, nbands, kpts, E, occ };
  }
  function bandGap(eig) {
    let vbm = -Infinity, cbm = Infinity, vk = 0, ck = 0, haveOcc = false;
    for (let s = 0; s < eig.ispin; s++) eig.E[s].forEach((row, k) => row.forEach((e, b) => {
      const o = eig.occ[s][k][b];
      if (!Number.isFinite(o)) return;
      haveOcc = true;
      if (o > 0.5 && e > vbm) { vbm = e; vk = k; }
      if (o <= 0.5 && e < cbm) { cbm = e; ck = k; }
    }));
    if (!haveOcc || !Number.isFinite(vbm) || !Number.isFinite(cbm)) return null;
    return { vbm, cbm, gap: Math.max(0, cbm - vbm), direct: vk === ck, vk, ck };
  }
  function kDistances(kpts) {
    const R = V().getReciprocal();
    const d = [0], breaks = [];
    for (let i = 1; i < kpts.length; i++) {
      const df = [0, 1, 2].map((j) => kpts[i][j] - kpts[i - 1][j]);
      const c = [0, 1, 2].map((j) => df[0] * R[0][j] + df[1] * R[1][j] + df[2] * R[2][j]);
      const step = Math.hypot(...c);
      if (step < 1e-8) breaks.push(d[d.length - 1]);
      d.push(d[d.length - 1] + step);
    }
    return { d, breaks };
  }
  function fitEos(pairs) {
    const Vv = pairs.map((p) => p[0]), E = pairs.map((p) => p[1]);
    const deg = pairs.length >= 5 ? 3 : 2;
    const x = Vv.map((v) => Math.pow(v, -2 / 3));
    const n = deg + 1;
    const M = Array.from({ length: n }, () => Array(n + 1).fill(0));
    x.forEach((xi, i) => { for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) M[r][c] += xi ** (r + c); M[r][n] += xi ** r * E[i]; } });
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const a = M.map((row, i) => row[n] / row[i]);
    const Ef = (v) => a.reduce((s, ai, i) => s + ai * Math.pow(v, -2 * i / 3), 0);
    // minimum on a fine grid, then refine
    const lo = Math.min(...Vv) * 0.9, hi = Math.max(...Vv) * 1.1;
    let v0 = lo, best = Infinity;
    for (let i = 0; i <= 4000; i++) { const v = lo + (hi - lo) * i / 4000; const e = Ef(v); if (e < best) { best = e; v0 = v; } }
    const h = v0 * 1e-3;
    const d2 = (Ef(v0 + h) - 2 * Ef(v0) + Ef(v0 - h)) / (h * h);
    const d3 = (Ef(v0 + 2 * h) - 2 * Ef(v0 + h) + 2 * Ef(v0 - h) - Ef(v0 - 2 * h)) / (2 * h ** 3);
    const B0 = v0 * d2 * 160.21766;
    const B0p = deg === 3 ? -1 - (v0 * d3) / d2 : 4;
    const rms = Math.sqrt(Vv.reduce((s, v, i) => s + (Ef(v) - E[i]) ** 2, 0) / Vv.length);
    const inRange = v0 > Math.min(...Vv) && v0 < Math.max(...Vv);
    return { deg, Ef, v0, e0: Ef(v0), B0, B0p, rms, inRange, Vv, E };
  }

  // ------------------------------------------------------------- tabs
  const R = {};
  R.elec = () => `
    <div class="sp-card"><div class="sp-card-title">Density of states (DOSCAR) ${helpBtn('DOSCAR', 'Total DOS from DOSCAR, shifted so E_F = 0. Spin-polarized runs show spin down as negative values. Projected DOS needs LORBIT = 11 and is not parsed here.')}</div>
      <div class="sp-row wrap">${upBtn('an-dos', 'Open DOSCAR', true)}</div><div id="res-dos"></div></div>
    <div class="sp-card"><div class="sp-card-title">Band structure and gap (EIGENVAL) ${helpBtn('EIGENVAL', 'Bands from a line-mode run (step 4, band path). The k-axis uses the reciprocal lattice of the structure currently in the viewer, so load the same structure first. The gap comes from the occupations in EIGENVAL: highest occupied (occupation above 0.5) and lowest empty level.')}</div>
      <div class="sp-row wrap">${upBtn('an-eig', 'Open EIGENVAL', true)}<label class="sp-inline">E_F (eV, optional) <input id="an-ef" class="v-input w-24 font-mono-code" value="${esc(A.ef)}" placeholder="from DOSCAR"/></label></div><div id="res-eig"></div></div>
    <div class="sp-card"><div class="sp-card-title">Energy convergence (OSZICAR or OUTCAR)</div>
      <div class="sp-row wrap">${upBtn('an-osz', 'Open OSZICAR / OUTCAR')}</div><div id="res-osz"></div></div>
    <div class="sp-card"><div class="sp-card-title">Planar average (LOCPOT or CHGCAR, WebAssembly) ${helpBtn('Planar average', 'Average of the volumetric data over the a-b plane, along c. For LOCPOT of a slab, the flat vacuum region gives the vacuum level; work function = vacuum level - E_F. Large files take a while in the browser.')}</div>
      <div class="sp-row wrap">${upBtn('an-vol', 'Open LOCPOT / CHGCAR')}</div><div id="res-vol"></div></div>`;
  R.phonon = () => {
    const dim = A.phDim.trim().split(/\s+/).join(' ');
    return `
    <div class="sp-card"><div class="sp-card-title">1. Displacements with phonopy (finite differences) ${helpBtn('Phonon workflow', 'Phonopy writes the displaced supercells; VASP computes the forces; phonopy collects them in FORCE_SETS. Use a well-relaxed structure (tight EDIFFG) and a supercell of at least about 10 A in every direction.')}</div>
      <label class="sp-inline">Supercell DIM <input id="an-phdim" class="v-input w-24 font-mono-code" value="${esc(A.phDim)}"/></label>
      <pre class="code-area sp-pre">phonopy -d --dim="${esc(dim)}" -c POSCAR      # writes SPOSCAR and POSCAR-001, POSCAR-002, ...
for f in POSCAR-0*; do d=disp-\${f#POSCAR-}; mkdir -p $d; cp $f $d/POSCAR; cp INCAR KPOINTS POTCAR $d/; done
# run VASP in every disp-XXX folder (static forces, INCAR below)
phonopy -f disp-*/vasprun.xml                 # writes FORCE_SETS</pre>
      <div class="sp-row wrap"><button id="an-ph-pos" class="v-btn">Download unit cell POSCAR</button><button id="an-ph-inc" class="v-btn">Download force INCAR</button></div>
      <div class="sp-note">KPOINTS for the supercell: scale the converged unit-cell mesh down by DIM in each direction.</div></div>
    <div class="sp-card"><div class="sp-card-title">2. Dispersion and thermal properties (WebAssembly phonopy)</div>
      <div class="sp-row wrap">${upBtn('an-fs', 'Open FORCE_SETS', true)}<span class="text-mut text-[10.5px]">Uses the structure in the viewer as the unit cell and DIM above.</span></div>
      <div id="res-ph"></div></div>`;
  };
  R.mech = () => `
    <div class="sp-card"><div class="sp-card-title">Equation of state (Birch-Murnaghan) ${helpBtn('EOS fit', 'Fit of E(V) as a polynomial in V^(-2/3). With 5 or more points this is the 3rd-order Birch-Murnaghan form and gives B0 and B0\'. With 3 or 4 points it is the 2nd-order form (B0\' fixed to 4). Use volumes spread about +-5 % around the minimum.')}</div>
      <label class="sp-field"><span>Volume (A^3) and energy (eV), one pair per line</span><textarea id="an-eos" class="code-area w-full" rows="5">${esc(A.eos)}</textarea></label>
      <div class="sp-row wrap"><button id="an-eos-fit" class="v-btn v-btn-primary">Fit EOS</button><label class="v-btn cursor-pointer">Read E-V from OSZICAR files<input id="an-eos-files" type="file" multiple class="hidden"/></label></div>
      <div id="res-eos"></div></div>
    <div class="sp-card"><div class="sp-card-title">Elastic constants (Voigt-Reuss-Hill, WebAssembly) ${helpBtn('Elastic moduli', 'Paste the 6 x 6 stiffness matrix C_ij in GPa (VASP IBRION = 6, ISIF = 3 prints it in kBar in OUTCAR as TOTAL ELASTIC MODULI: divide by 10). The ductility label uses Pugh\'s ratio B/G > 1.75, a rule of thumb.')}</div>
      <textarea id="an-cij" class="code-area w-full" rows="6">${esc(A.cij)}</textarea>
      <div class="sp-row"><button id="an-cij-go" class="v-btn v-btn-primary">Compute moduli</button></div>
      <div id="res-cij"></div></div>`;
  R.thermo = () => `
    <div class="sp-card"><div class="sp-card-title">ZPE, Gibbs correction and half-life ${helpBtn('Thermochemistry', 'Harmonic-oscillator treatment of adsorbate vibrations (IBRION = 5, the real frequencies in cm-1). Modes below 50 cm-1 are raised to 50 cm-1, a common choice for loose modes. Half-life uses the Eyring equation with the barrier you give. These are standard approximations, not a full partition function.')}</div>
      <label class="sp-field"><span>Frequencies (cm-1)</span><textarea id="an-fr" class="code-area w-full" rows="2">${esc(A.freqs)}</textarea></label>
      <div class="sp-grid2"><label class="sp-field"><span>Temperature (K)</span><input id="an-t" type="number" class="v-input" value="${A.temp}"/></label>
        <label class="sp-field"><span>Barrier dG (eV)</span><input id="an-ea" type="number" step="0.05" class="v-input" value="${A.barrier}"/></label></div>
      <div class="sp-row wrap"><button id="an-th-go" class="v-btn v-btn-primary">Compute</button><label class="v-btn cursor-pointer">Read frequencies from OUTCAR<input id="an-th-outcar" type="file" class="hidden"/></label></div>
      <div id="res-th"></div></div>`;
  R.md = () => `
    <div class="sp-card"><div class="sp-card-title">Mean-square displacement and diffusion (XDATCAR, WebAssembly) ${helpBtn('MSD', 'Positions are unwrapped across periodic boundaries; D = slope / 6 of the MSD in the diffusive regime. Use a long, equilibrated trajectory; short runs give rough estimates.')}</div>
      <div class="sp-row wrap"><label class="sp-inline">Element <input id="an-md-el" class="v-input w-16" value="${esc(A.mdEl)}"/></label>
        <label class="sp-inline">POTIM (fs) <input id="an-md-dt" type="number" step="0.5" class="v-input w-20" value="${A.mdDt}"/></label>${upBtn('an-md', 'Open XDATCAR', true)}</div>
      <div id="res-md"></div></div>`;
  R.struct = () => `
    <div class="sp-card"><div class="sp-card-title">Load a relaxed CONTCAR into the viewer</div>
      <div class="sp-note">Loads CONTCAR (or any POSCAR / CIF) into step 1, so the next calculation (DOS, bands, phonons) starts from the relaxed cell. The full structural report is in Structure &gt; Symmetry.</div>
      <div class="sp-row wrap">${upBtn('an-contcar', 'Open CONTCAR', true)}<button id="an-report" class="v-btn">Open symmetry report</button></div>
      <div id="res-ct"></div></div>`;

  function render(body) {
    const tab = TABS.some((t) => t[0] === S.analyzeTab) ? S.analyzeTab : 'elec';
    body.innerHTML = `<div class="seg wrap" style="margin-bottom:10px">${TABS.map(([id, l]) => `<button class="${tab === id ? 'on' : ''}" data-atab="${id}">${l}</button>`).join('')}</div>${R[tab]()}`;
    body.querySelectorAll('[data-atab]').forEach((b) => { b.onclick = () => { S.analyzeTab = b.dataset.atab; T.rerenderBody(); }; });
    bind[tab]();
    Object.keys(A.out).forEach(drawOut);
  }

  const bind = {};
  bind.elec = () => {
    $('an-ef').onchange = (e) => { A.ef = e.target.value.trim(); };
    onFile('an-dos', 'dos', (text) => {
      const d = parseDoscar(text);
      A.ef = String(d.ef); $('an-ef').value = A.ef;
      const tr = [{ x: d.e, y: d.up, mode: 'lines', name: d.spin ? 'spin up' : 'total', line: { width: 1.4 } }];
      if (d.spin) tr.push({ x: d.e, y: d.dn.map((v) => -v), mode: 'lines', name: 'spin down', line: { width: 1.4 } });
      setOut('dos', badge(`E_F = ${d.ef.toFixed(4)} eV`, 'ok') + badge(d.spin ? 'spin-polarized' : 'non-spin-polarized'), [{ traces: tr, layout: { title: { text: 'Total DOS', font: { size: 12 } }, xaxis: { title: 'E - E_F (eV)', range: [-8, 6] }, yaxis: { title: 'states/eV' } } }]);
    });
    onFile('an-eig', 'eig', (text) => {
      const g = parseEigenval(text);
      const gap = bandGap(g);
      const ef = A.ef !== '' && Number.isFinite(Number(A.ef)) ? Number(A.ef) : gap && gap.gap > 0.01 ? gap.vbm : null;
      const shift = ef ?? 0;
      const { d, breaks } = kDistances(g.kpts);
      const tr = [];
      for (let s = 0; s < g.ispin; s++) for (let b = 0; b < g.nbands; b++) tr.push({ x: d, y: g.E[s].map((row) => row[b] - shift), mode: 'lines', showlegend: false, line: { width: 1.2, color: s ? '#ef4444' : '#3b82f6' } });
      const shapes = breaks.map((x) => ({ type: 'line', x0: x, x1: x, yref: 'paper', y0: 0, y1: 1, line: { width: 1, dash: 'dot', color: '#9ca3af' } }));
      const info = badge(`${g.nkpts} k-points, ${g.nbands} bands, ${g.nelect} electrons${g.ispin === 2 ? ', spin-polarized' : ''}`)
        + (gap ? badge(gap.gap > 0.01 ? `Gap ${gap.gap.toFixed(3)} eV (${gap.direct ? 'direct' : 'indirect'})` : 'Metallic (no gap)', gap.gap > 0.01 ? 'ok' : 'warn') : badge('No occupations: gap not computed', 'warn'))
        + badge(ef === null ? 'Energies not shifted (give E_F)' : `Zero = ${A.ef !== '' ? 'E_F' : 'VBM'} (${shift.toFixed(3)} eV)`);
      setOut('eig', info, [{ tall: true, traces: tr, layout: { shapes, title: { text: 'Band structure', font: { size: 12 } }, xaxis: { title: 'k-path (1/A)', showticklabels: false }, yaxis: { title: 'E (eV)', range: [-6, 6] } } }]);
    });
    onFile('an-osz', 'osz', (text, name) => {
      let ys = [...text.matchAll(/\bF=\s*([-+0-9.Ee]+)/g)].map((m) => Number(m[1]));
      let what = 'F (OSZICAR)';
      if (!ys.length) { ys = [...text.matchAll(/free\s+energy\s+TOTEN\s*=\s*([-+0-9.Ee]+)/g)].map((m) => Number(m[1])); what = 'TOTEN (OUTCAR)'; }
      if (!ys.length) throw new Error(`No energies found in ${name}`);
      const last = ys[ys.length - 1], dl = ys.length > 1 ? Math.abs(last - ys[ys.length - 2]) * 1000 : NaN;
      setOut('osz', badge(`${ys.length} ionic steps`) + badge(`Final ${what}: ${last.toFixed(6)} eV`, 'ok') + (Number.isFinite(dl) ? badge(`Last change ${dl.toFixed(3)} meV`) : ''),
        [{ traces: [{ x: ys.map((_, i) => i + 1), y: ys, mode: 'lines+markers', name: what }], layout: { title: { text: 'Energy per ionic step', font: { size: 12 } }, xaxis: { title: 'ionic step' }, yaxis: { title: 'eV' } } }]);
    });
    onFile('an-vol', 'vol', async (text) => {
      await wasm('vol', 'Computing the planar average in the browser...');
      const r = await window.WasmEngine.planarAvg(text, 2);
      setOut('vol', badge(`Grid ${r.grid.join(' x ')}`) + badge(`Maximum (vacuum level for LOCPOT) = ${r.vacuum_level}`, 'ok'),
        [{ traces: [{ x: r.coords_a, y: r.planar_avg, mode: 'lines', name: 'planar average' }], layout: { title: { text: 'Planar average along c', font: { size: 12 } }, xaxis: { title: 'z (A)' } } }]);
    });
  };
  bind.phonon = () => {
    $('an-phdim').onchange = (e) => { A.phDim = e.target.value; T.rerenderBody(); };
    $('an-ph-pos').onclick = () => downloadText('POSCAR', V().getPOSCAR());
    $('an-ph-inc').onclick = () => {
      const base = T.getIncar().split('\n').filter((l) => !/^\s*(NSW|IBRION|ISIF|EDIFFG|POTIM|EDIFF|LWAVE|LCHARG|ISYM|PREC|ADDGRID|LREAL)\s*=/i.test(l));
      downloadText('INCAR', base.join('\n').trimEnd() + '\n\n# phonopy finite-displacement forces\nIBRION = -1\nNSW    = 0\nEDIFF  = 1E-8\nPREC   = Accurate\nADDGRID = .TRUE.\nLREAL  = .FALSE.\nISYM   = 0\nLWAVE  = .FALSE.\nLCHARG = .FALSE.\n');
    };
    onFile('an-fs', 'ph', async (text) => {
      const dim = A.phDim.trim().split(/\s+/).map(Number);
      if (dim.length !== 3 || dim.some((n) => !(n >= 1))) throw new Error('DIM must be three positive integers, for example 2 2 2');
      await wasm('ph', 'Building force constants and dispersion with phonopy in the browser...');
      const r = await window.WasmEngine.phonopyCompute(V().getPOSCAR(), text, dim);
      const bands = r.band_distances.flatMap((dist, bi) => { const f = r.band_frequencies[bi]; const nm = (f[0] || []).length; return Array.from({ length: nm }, (_, m) => ({ x: dist, y: f.map((row) => row[m]), mode: 'lines', showlegend: false, line: { width: 1.2, color: '#0891b2' } })); });
      setOut('ph', badge(r.stable ? 'No imaginary modes' : 'Imaginary modes present', r.stable ? 'ok' : 'warn') + badge(`min frequency ${r.min_freq_thz} THz`) + '<span class="sp-note">q-path from SeekPath for this cell. Small negative values near Gamma are often numerical noise.</span>', [
        { tall: true, traces: bands, layout: { title: { text: 'Phonon dispersion', font: { size: 12 } }, xaxis: { title: 'q-path', showticklabels: false }, yaxis: { title: 'Frequency (THz)' } } },
        { traces: [{ x: r.dos_freq, y: r.dos_val, mode: 'lines', name: 'phonon DOS' }], layout: { title: { text: 'Phonon DOS', font: { size: 12 } }, xaxis: { title: 'THz' } } },
        { traces: [{ x: r.t_k, y: r.free_e, mode: 'lines', name: 'F (kJ/mol)' }, { x: r.t_k, y: r.entropy, mode: 'lines', name: 'S (J/K/mol)' }, { x: r.t_k, y: r.cv, mode: 'lines', name: 'Cv (J/K/mol)' }], layout: { title: { text: 'Thermal properties', font: { size: 12 } }, xaxis: { title: 'T (K)' } } },
      ]);
    });
  };
  bind.mech = () => {
    const runEos = () => {
      A.eos = $('an-eos').value;
      const pairs = A.eos.trim().split(/\n/).map((l) => l.trim().split(/[\s,]+/).map(Number)).filter((p) => p.length >= 2 && p.every(Number.isFinite));
      if (pairs.length < 3) { err('eos', 'Need at least 3 volume-energy pairs.'); return; }
      const f = fitEos(pairs);
      const lo = Math.min(...f.Vv) * 0.97, hi = Math.max(...f.Vv) * 1.03;
      const vf = Array.from({ length: 80 }, (_, i) => lo + (hi - lo) * i / 79);
      setOut('eos', badge(`V0 = ${f.v0.toFixed(3)} A^3`, 'ok') + badge(`E0 = ${f.e0.toFixed(5)} eV`) + badge(`B0 = ${f.B0.toFixed(1)} GPa`, 'ok') + badge(`B0' = ${f.B0p.toFixed(2)}${f.deg === 2 ? ' (fixed)' : ''}`) + badge(`${f.deg === 3 ? '3rd' : '2nd'}-order BM, rms ${(f.rms * 1000).toFixed(2)} meV`)
        + (f.inRange ? '' : badge('Minimum outside the data range: add volumes', 'warn')),
        [{ traces: [{ x: f.Vv, y: f.E, mode: 'markers', name: 'DFT' }, { x: vf, y: vf.map(f.Ef), mode: 'lines', name: 'BM fit' }], layout: { title: { text: 'E(V)', font: { size: 12 } }, xaxis: { title: 'V (A^3)' }, yaxis: { title: 'E (eV)' } } }]);
    };
    $('an-eos-fit').onclick = runEos;
    $('an-eos-files').onchange = async (e) => {
      // pairs volume from OUTCAR "volume of cell" and energy from F= / TOTEN in each file
      const files = [...e.target.files];
      const pairs = [];
      for (const f of files) {
        const t = await f.text();
        const vol = [...t.matchAll(/volume of cell\s*:\s*([0-9.]+)/g)].map((m) => Number(m[1])).pop();
        const en = [...t.matchAll(/free\s+energy\s+TOTEN\s*=\s*([-+0-9.Ee]+)/g)].map((m) => Number(m[1])).pop();
        if (vol && Number.isFinite(en)) pairs.push([vol, en]);
      }
      e.target.value = '';
      if (!pairs.length) { err('eos', 'No "volume of cell" and TOTEN found. Select one OUTCAR per volume.'); return; }
      pairs.sort((a, b) => a[0] - b[0]);
      $('an-eos').value = pairs.map((p) => `${p[0].toFixed(4)} ${p[1].toFixed(6)}`).join('\n');
      runEos();
    };
    $('an-cij-go').onclick = async () => {
      A.cij = $('an-cij').value;
      try {
        const mat = A.cij.trim().split(/\n/).map((r) => r.trim().split(/[\s,]+/).map(Number));
        if (mat.length !== 6 || mat.some((r) => r.length !== 6 || r.some((x) => !Number.isFinite(x)))) throw new Error('Need a 6 x 6 matrix of numbers.');
        await wasm('cij', 'Computing Voigt-Reuss-Hill moduli in the browser...');
        const r = await window.WasmEngine.elastic(mat);
        setOut('cij', badge(`Bulk K = ${r.bulk_gpa} GPa`, 'ok') + badge(`Shear G = ${r.shear_gpa} GPa`) + badge(`Young E = ${r.youngs_gpa} GPa`) + badge(`Poisson = ${r.poisson}`) + badge(`${r.ductile_or_brittle} (Pugh ratio)`));
      } catch (e) { err('cij', e); }
    };
  };
  bind.thermo = () => {
    const run = () => {
      A.freqs = $('an-fr').value; A.temp = Number($('an-t').value) || 298.15; A.barrier = Number($('an-ea').value) || 0;
      const fr = A.freqs.split(/[\s,]+/).filter(Boolean).map(Number).filter((f) => f > 0);
      if (!fr.length) { err('th', 'Enter at least one real frequency.'); return; }
      const Tk = A.temp, hc = 4.1356677e-15 * 2.99792458e10, kB = 8.617333e-5, h = 4.1356677e-15;
      let zpe = 0, hv = 0, ts = 0;
      fr.forEach((f) => { const e = hc * Math.max(f, 50), x = e / (kB * Tk); zpe += 0.5 * e; if (x < 500) { hv += e / (Math.exp(x) - 1); ts += kB * Tk * (x / (Math.exp(x) - 1) - Math.log(1 - Math.exp(-x))); } });
      const k = (kB * Tk / h) * Math.exp(-A.barrier / (kB * Tk));
      setOut('th', badge(`ZPE = ${zpe.toFixed(4)} eV`, 'ok') + badge(`Int. Cv dT = ${hv.toFixed(4)} eV`) + badge(`-TS = ${(-ts).toFixed(4)} eV`) + badge(`G correction = ${(zpe + hv - ts).toFixed(4)} eV`, 'ok') + badge(`k = ${k.toExponential(2)} 1/s, half-life = ${(Math.LN2 / k).toExponential(2)} s`));
    };
    $('an-th-go').onclick = run;
    onFile('an-th-outcar', 'th', (text) => {
      // OUTCAR prints the mode list twice (before and after mass weighting): key by mode number.
      const real = new Map(), imag = new Set();
      [...text.matchAll(/^\s*(\d+)\s+f\s+=.*?([0-9.]+)\s+cm-1/gm)].forEach((m) => real.set(m[1], Number(m[2])));
      [...text.matchAll(/^\s*(\d+)\s+f\/i=/gm)].forEach((m) => imag.add(m[1]));
      const fr = [...real.values()], im = imag.size;
      if (!fr.length) throw new Error('No real frequencies (lines with "f  =") found in this OUTCAR.');
      $('an-fr').value = fr.join(', ');
      run();
      if (im) A.out.th.info += badge(`${im} imaginary mode(s) ignored`, 'warn'), drawOut('th');
    });
  };
  bind.md = () => {
    onFile('an-md', 'md', async (text) => {
      A.mdEl = $('an-md-el').value.trim() || 'Li'; A.mdDt = Number($('an-md-dt').value) || 1;
      await wasm('md', 'Unwrapping the trajectory in the browser...');
      const r = await window.WasmEngine.aimdXdatcar(text, A.mdEl, A.mdDt);
      setOut('md', badge(`${r.num_frames} frames`) + badge(`D(${esc(A.mdEl)}) = ${r.diffusion_coeff_cm2_s} cm^2/s`, 'ok'),
        [{ traces: [{ x: r.times_ps, y: r.msd_a2, mode: 'lines', name: 'MSD' }], layout: { title: { text: `MSD of ${A.mdEl}`, font: { size: 12 } }, xaxis: { title: 't (ps)' }, yaxis: { title: 'MSD (A^2)' } } }]);
    });
  };
  bind.struct = () => {
    onFile('an-contcar', 'ct', (text, name) => {
      V().loadText(text, name || 'CONTCAR');
      setOut('ct', badge(`Loaded ${esc(name)} into Structure`, 'ok'));
      T.go('structure');
    });
    $('an-report').onclick = () => T.go('structure', { tab: 'symmetry' });
  };

  T.stageRenderers.analyze = render;
})();
