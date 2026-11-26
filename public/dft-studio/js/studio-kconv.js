/* DFT Studio step 5: k-point convergence test.
 * Uses the unchanged logic of the k-point convergence kit (window.KConv) and feeds it the live structure
 * (POSCAR from the 3D model) and the INCAR from step 3. Reads the kpoint_convergence.csv back and turns the
 * converged mesh into KPOINTS with one click.
 */
(() => {
  'use strict';
  const K = window.KConv;
  const T = window.StudioKit;
  const { S, V, $, esc, helpBtn, filePreview, bindFileButtons, readFileText, plot } = T;

  const C = {
    preset: '10,50', lMin: 10, lMax: 50, step: 5, custom: '', cmd: 'mpirun -np 12 vasp',
    tol: '1.0 0.1', ediff: '1e-4 1e-6 1e-8', tries: '2 3 5',
    unchecked: new Set(), poscarUpload: null, incarUpload: null, tab: 'kpoint_convergence.py', csv: null,
  };

  function sources() {
    const poscarText = C.poscarUpload ? C.poscarUpload.text : V().getPOSCAR();
    const incarText = C.incarUpload ? C.incarUpload.text : T.getIncar();
    let poscar = null, perr = null;
    try { poscar = K.parsePoscar(poscarText); } catch (e) { perr = e.message; }
    return { poscarText, incarText, poscar, perr };
  }

  function compute() {
    const src = sources();
    if (!src.poscar) return { src, err: src.perr || 'POSCAR could not be read' };
    const series = K.buildSeries(Number(C.lMin), Number(C.lMax), Number(C.step), src.poscar.len, C.custom);
    const all = series.items;
    const meshes = all.filter((x) => !C.unchecked.has(K.meshName(x.m)));
    const tol = K.parseNumberList(C.tol), ed = K.parseNumberList(C.ediff), tr = K.parsePositiveIntList(C.tries);
    const cleaned = K.cleanIncar(src.incarText);
    const incarTags = K.parseIncar(src.incarText);
    const w = K.collectWarnings({
      poscar: src.poscar, incarTags, cmd: C.cmd, meshes, ediff: ed.nums, tries: tr.nums,
      invalidCustom: series.invalidCustom, invalidTol: tol.invalid, invalidEdiff: ed.invalid, invalidTries: tr.invalid,
    });
    if (S.kpt.mode === 'line') w.infos.push('KPOINTS (step 4) is in band-path mode: the convergence test always writes its own Gamma-centred meshes.');
    if (/ICHARG\s*=\s*11/.test(src.incarText)) w.warnings.push('INCAR is a non-SCF (ICHARG = 11) run: use an SCF preset (for example ST or MG) in step 3 for the convergence test.');
    const opts = { meshes, cmd: C.cmd.trim() || 'mpirun -np 12 vasp', tol: tol.nums.length ? tol.nums : [1, 0.1], ed: ed.nums.length ? ed.nums : [1e-4, 1e-6, 1e-8], tr: tr.nums.length ? tr.nums : [2, 3, 5] };
    let script = K.buildScript(opts);
    const cellNote = src.poscar.len.map((x) => x.toFixed(3)).join(' x ');
    script = script.replace(/# \(L in Angstrom, mesh\) for the [^\n]*/, `# (L in Angstrom, mesh) for the ${cellNote} A cell: N_i = max(1, int(L/a_i + 0.5))`);
    const readme = K.buildReadme(Object.assign({}, opts, { nat: src.poscar.nat, len: src.poscar.len }));
    return { src, all, meshes, script, incar: cleaned.text, removed: cleaned.removed, readme, warnings: w.warnings, infos: w.infos };
  }

  function outputs() {
    if (!S.visited.has('kconv')) return null;
    const r = compute();
    if (r.err || !r.meshes.length) return null;
    return { meshes: r.meshes, script: r.script, incar: r.incar, readme: r.readme, poscarText: r.src.poscarText };
  }

  // ----------------------------------------------------------------- CSV results reader
  function parseCsv(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    if (lines.length < 2) throw new Error('CSV has no data rows');
    const head = lines[0].split(',').map((h) => h.trim());
    const need = ['mesh', 'E_per_atom_eV', 'dE_densest_meV_atom'];
    need.forEach((n) => { if (!head.includes(n)) throw new Error(`Not a kpoint_convergence.csv (missing column ${n})`); });
    return lines.slice(1).map((l) => {
      const cells = l.split(',');
      const o = {};
      head.forEach((h, i) => { o[h] = cells[i] === undefined ? '' : cells[i].trim(); });
      ['grid_points_BZ', 'irreducible_kpoints', 'E_per_atom_eV', 'dE_prev_meV_atom', 'dE_densest_meV_atom', 'Fmax_eV_A', 'pressure_kB', 'net_mag_muB', 'total_time_s'].forEach((k) => { o[k] = Number(o[k]); });
      o.ok = /true/i.test(o.finished || 'True') && /true/i.test(o.EDIFF_reached || 'True');
      return o;
    }).sort((a, b) => a.grid_points_BZ - b.grid_points_BZ);
  }
  function verdicts(rows, tols) {
    const good = rows.filter((r) => r.ok);
    return tols.map((tol) => {
      let pick = null;
      for (let i = 0; i < good.length - 2; i++) {
        if (good.slice(i).every((r) => r.dE_densest_meV_atom <= tol)) { pick = good[i]; break; }
      }
      return { tol, pick };
    });
  }

  function render(body) {
    const r = compute();
    if (r.err) { body.innerHTML = `<div class="sp-note warn">${esc(r.err)}</div>`; return; }
    const p = r.src.poscar;
    const tols = K.parseNumberList(C.tol).nums;
    const file = { 'kpoint_convergence.py': r.script, INCAR: r.incar, 'README.md': r.readme, POSCAR: r.src.poscarText };
    if (!file[C.tab]) C.tab = 'kpoint_convergence.py';
    body.innerHTML = `
      <div class="sp-card">
        <div class="sp-card-title">What this step does ${helpBtn('k-point convergence test', { meaning: 'A Gamma-centred mesh series is built from a real-space length L: N_i = max(1, floor(L / a_i + 0.5)). A Python driver runs one static VASP calculation per mesh with an EDIFF ladder, restarts from the previous charge density, and writes a table, a CSV and a plot.', when: 'Run it once per material (and again if you change the cell shape a lot, the smearing, or go from insulator to metal). Load the CSV back here to pick the mesh.' })}</div>
        <div class="sp-note">Inputs come from steps 1 to 3: <b>${esc(V().getStructure().name)}</b>, ${p.nat} atoms, a, b, c = ${p.len.map((x) => x.toFixed(3)).join(', ')} A, and the INCAR of step 3 with relaxation and output tags removed. You can override either file below.</div>
        <div class="sp-row wrap">
          <label class="v-btn cursor-pointer">Override POSCAR<input id="kc-up-pos" type="file" class="hidden"/></label>
          <label class="v-btn cursor-pointer">Override INCAR<input id="kc-up-inc" type="file" class="hidden"/></label>
          ${C.poscarUpload ? `<span class="sp-badge">POSCAR: ${esc(C.poscarUpload.name)} <button class="sp-link" id="kc-clr-pos">reset</button></span>` : ''}
          ${C.incarUpload ? `<span class="sp-badge">INCAR: ${esc(C.incarUpload.name)} <button class="sp-link" id="kc-clr-inc">reset</button></span>` : ''}
        </div>
      </div>
      <div class="sp-card">
        <div class="sp-card-title">Mesh series</div>
        <div class="sp-grid3">
          <label class="sp-field" style="grid-column:1/-1"><span>Material type</span><select id="kc-preset" class="v-input">
            ${[['10,50', 'Unknown (L = 10 to 50 A)'], ['10,40', 'Insulator or semiconductor (10 to 40 A)'], ['20,60', 'Metal or small gap (20 to 60 A)']].map(([v, l]) => `<option value="${v}" ${C.preset === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="sp-field"><span>L min (A)</span><input id="kc-lmin" type="number" class="v-input font-mono-code" value="${C.lMin}"/></label>
          <label class="sp-field"><span>L max (A)</span><input id="kc-lmax" type="number" class="v-input font-mono-code" value="${C.lMax}"/></label>
          <label class="sp-field"><span>Step (A)</span><input id="kc-step" type="number" class="v-input font-mono-code" value="${C.step}"/></label>
          <label class="sp-field" style="grid-column:1/-1"><span>Extra meshes (e.g. 4x4x2 12x12x6)</span><input id="kc-custom" class="v-input font-mono-code" value="${esc(C.custom)}"/></label>
        </div>
        <div class="kc-table-wrap"><table class="kc-table"><thead><tr><th></th><th>Mesh</th><th>L (A)</th><th>Grid points</th><th>kpts x atoms</th><th></th></tr></thead><tbody>
          ${r.all.map((x) => { const n = K.meshName(x.m); const g = x.m[0] * x.m[1] * x.m[2]; return `<tr><td><input type="checkbox" data-mesh="${n}" ${C.unchecked.has(n) ? '' : 'checked'}/></td><td class="font-mono-code">${n}</td><td>${x.L === null ? 'custom' : x.L}</td><td>${g}</td><td>${g * p.nat}</td><td><button class="sp-link" data-use="${n}">use in KPOINTS</button></td></tr>`; }).join('')}
        </tbody></table></div>
      </div>
      <div class="sp-card">
        <div class="sp-card-title">Run settings</div>
        <div class="sp-grid2">
          <label class="sp-field" style="grid-column:1/-1"><span>VASP command (no nohup or &amp;)</span><input id="kc-cmd" class="v-input font-mono-code" value="${esc(C.cmd)}"/></label>
          <label class="sp-field"><span>Tolerances (meV/atom)</span><input id="kc-tol" class="v-input font-mono-code" value="${esc(C.tol)}"/></label>
          <label class="sp-field"><span>EDIFF ladder</span><input id="kc-ed" class="v-input font-mono-code" value="${esc(C.ediff)}"/></label>
          <label class="sp-field"><span>Max runs per stage</span><input id="kc-tr" class="v-input font-mono-code" value="${esc(C.tries)}"/></label>
        </div>
        <pre class="code-area sp-pre">nohup python3 -u kpoint_convergence.py --cmd "${esc(C.cmd)}" &gt; kconv.log 2&gt;&amp;1 &amp;</pre>
      </div>
      ${r.warnings.length || r.infos.length ? `<div class="sp-checks">${r.warnings.map((w) => `<div class="sp-check warn"><span>!</span><div>${esc(w)}</div></div>`).join('')}${r.infos.map((w) => `<div class="sp-check info"><span>i</span><div>${esc(w)}</div></div>`).join('')}</div>` : ''}
      ${r.removed.length ? `<div class="sp-note">Removed from the test INCAR: <span class="font-mono-code">${esc(r.removed.join(', '))}</span> (the script sets NSW, IBRION, EDIFF, ISTART, ICHARG itself).</div>` : ''}
      <div class="sp-card">
        <div class="sp-row" style="justify-content:space-between"><div class="seg">${Object.keys(file).map((n) => `<button class="${C.tab === n ? 'on' : ''}" data-kctab="${n}">${n}</button>`).join('')}</div>
          <button id="kc-to-bundle" class="v-btn v-btn-primary">Add to run bundle</button></div>
        ${filePreview(C.tab, file[C.tab])}
      </div>
      <div class="sp-card">
        <div class="sp-card-title">Results: load kpoint_convergence.csv ${helpBtn('Reading the results', 'The converged mesh is the coarsest mesh whose energy stays within the tolerance of the densest mesh for itself and every denser mesh, with at least two denser electronically converged meshes. The densest mesh is the reference, so it is not itself proven converged.')}</div>
        <label class="v-btn cursor-pointer w-fit">Open CSV<input id="kc-csv" type="file" accept=".csv,text/csv" class="hidden"/></label>
        <div id="kc-res"></div>
      </div>`;

    const num = (id, key) => { $(id).onchange = (e) => { C[key] = Number(e.target.value); T.rerenderBody(); }; };
    const str = (id, key) => { $(id).onchange = (e) => { C[key] = e.target.value; T.rerenderBody(); }; };
    $('kc-preset').onchange = (e) => { C.preset = e.target.value; const [a, b] = C.preset.split(',').map(Number); C.lMin = a; C.lMax = b; C.unchecked.clear(); T.rerenderBody(); };
    num('kc-lmin', 'lMin'); num('kc-lmax', 'lMax'); num('kc-step', 'step');
    str('kc-custom', 'custom'); str('kc-cmd', 'cmd'); str('kc-tol', 'tol'); str('kc-ed', 'ediff'); str('kc-tr', 'tries');
    body.querySelectorAll('[data-mesh]').forEach((c) => { c.onchange = () => { if (c.checked) C.unchecked.delete(c.dataset.mesh); else C.unchecked.add(c.dataset.mesh); T.rerenderBody(); }; });
    body.querySelectorAll('[data-use]').forEach((b) => { b.onclick = () => useMesh(b.dataset.use); });
    body.querySelectorAll('[data-kctab]').forEach((b) => { b.onclick = () => { C.tab = b.dataset.kctab; T.rerenderBody(); }; });
    bindFileButtons(body, (n) => file[n]);
    $('kc-up-pos').onchange = async (e) => { C.poscarUpload = await readFileText(e.target); T.rerenderBody(); };
    $('kc-up-inc').onchange = async (e) => { C.incarUpload = await readFileText(e.target); T.rerenderBody(); };
    const cp = $('kc-clr-pos'); if (cp) cp.onclick = () => { C.poscarUpload = null; T.rerenderBody(); };
    const ci = $('kc-clr-inc'); if (ci) ci.onclick = () => { C.incarUpload = null; T.rerenderBody(); };
    $('kc-to-bundle').onclick = () => T.go('bundle');
    $('kc-csv').onchange = async (e) => { const f = await readFileText(e.target); if (f) { C.csv = f; showResults(tols); } };
    if (C.csv) showResults(tols);
  }

  function useMesh(name) {
    const m = name.split('x').map(Number);
    window.Studio.setMesh(m);
    S.kpt.scheme = 'Gamma';
    V().toast(`KPOINTS set to ${name} (Gamma)`);
    T.renderStepbar();
  }

  function showResults(tols) {
    const box = $('kc-res');
    let rows;
    try { rows = parseCsv(C.csv.text); } catch (e) { box.innerHTML = `<div class="sp-note warn">${esc(e.message)}</div>`; return; }
    const v = verdicts(rows, tols.length ? tols : [1, 0.1]);
    const bad = rows.filter((r) => !r.ok).map((r) => r.mesh);
    box.innerHTML = `
      <div class="sp-checks">${v.map(({ tol, pick }) => `<div class="sp-check ${pick ? 'ok' : 'warn'}"><span>${pick ? '&#10003;' : '!'}</span><div>${tol} meV/atom: ${pick ? `<b class="font-mono-code">${esc(pick.mesh)}</b> (${pick.irreducible_kpoints || '?'} irreducible k-points) <button class="sp-link" data-use="${esc(pick.mesh)}">use in KPOINTS</button>` : 'not reached: add denser meshes'}</div></div>`).join('')}
        ${bad.length ? `<div class="sp-check warn"><span>!</span><div>Unfinished or electronically unconverged runs, excluded: ${esc(bad.join(', '))}</div></div>` : ''}</div>
      <div id="kc-plot-e" class="sp-plot"></div><div id="kc-plot-d" class="sp-plot"></div>`;
    box.querySelectorAll('[data-use]').forEach((b) => { b.onclick = () => useMesh(b.dataset.use); });
    const x = rows.map((r) => r.mesh);
    plot('kc-plot-e', [{ x, y: rows.map((r) => r.E_per_atom_eV), mode: 'lines+markers', name: 'E(sigma->0)/atom' }], { title: { text: 'Energy per atom (eV)', font: { size: 12 } }, xaxis: { type: 'category' } });
    const tr = [
      { x, y: rows.map((r) => Math.max(r.dE_densest_meV_atom, 1e-4)), mode: 'lines+markers', name: 'vs densest' },
      { x: x.slice(1), y: rows.slice(1).map((r) => Math.max(r.dE_prev_meV_atom, 1e-4)), mode: 'lines+markers', name: 'vs previous', line: { dash: 'dash' } },
    ];
    (tols.length ? tols : [1, 0.1]).forEach((t) => tr.push({ x: [x[0], x[x.length - 1]], y: [t, t], mode: 'lines', name: `${t} meV/atom`, line: { dash: 'dot', width: 1 } }));
    plot('kc-plot-d', tr, { title: { text: '|dE| (meV/atom)', font: { size: 12 } }, xaxis: { type: 'category' }, yaxis: { type: 'log' } });
  }

  T.stageRenderers.kconv = render;
  window.StudioKConv = { outputs, parseCsv, verdicts };
})();
