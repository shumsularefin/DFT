/* DFT Studio: guided VASP workflow on top of the VESTA-Web viewer.
 * Steps: 1 Structure (VESTA) > 2 POTCAR > 3 INCAR > 4 KPOINTS > 5 k-Convergence > 6 Run bundle > 7 Analyze.
 * The structure always lives in VESTA (window.VESTA); every step reads it live.
 * Exposes window.Studio (public API) and window.StudioKit (helpers for the other step modules).
 */
(() => {
  'use strict';
  const D = window.StudioData;
  const V = () => window.VESTA;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------------------
  // On-demand data loaders (script injection works from file:// and from a web host)
  // ---------------------------------------------------------------------------
  const crystalCache = {}, crystalWait = {};
  window.__CRYSTAL_LOAD = (rel, text) => {
    crystalCache[rel] = text;
    (crystalWait[rel] || []).forEach((cb) => cb(text));
    delete crystalWait[rel];
  };
  function loadCrystalText(rel) {
    if (crystalCache[rel]) return Promise.resolve(crystalCache[rel]);
    return new Promise((resolve, reject) => {
      (crystalWait[rel] = crystalWait[rel] || []).push(resolve);
      const s = document.createElement('script');
      s.src = `data/crystals/${rel}.js`;
      s.onerror = () => reject(new Error(`Could not load crystal ${rel}`));
      document.head.appendChild(s);
    });
  }

  // Optional lab-local POTCAR library (data/potcars/<functional>/<variant>.js). Never committed to git.
  const ppCache = {}, ppWait = {};
  window.__POTCAR_LOAD = (key, text) => {
    ppCache[key] = text;
    (ppWait[key] || []).forEach((cb) => cb(text));
    delete ppWait[key];
  };
  function loadPotcarText(func, variant) {
    const key = `${func}/${variant}`;
    if (ppCache[key]) return Promise.resolve(ppCache[key]);
    return new Promise((resolve, reject) => {
      (ppWait[key] = ppWait[key] || []).push(resolve);
      const s = document.createElement('script');
      s.src = `data/potcars/${func}/${variant}.js`;
      s.onerror = () => reject(new Error(`POTCAR ${key} is not in the local library`));
      document.head.appendChild(s);
    });
  }
  function probeLocalLibrary() {
    // Only lab installs that copy the licensed library into data/potcars/ set this flag (data/pp_local.js).
    if (window.PP_LOCAL_LIBRARY !== true) { S.ppLibrary = false; return; }
    const t = setTimeout(() => { if (S.ppLibrary === null) S.ppLibrary = false; }, 4000);
    loadPotcarText('PAW_PBE_64', 'O').then(() => { S.ppLibrary = true; clearTimeout(t); renderStepbar(); if (S.stage === 'potcar' || S.stage === 'inputs') renderStage(); })
      .catch(() => { if (S.ppLibrary !== true) S.ppLibrary = false; clearTimeout(t); });
  }

  // POTCAR library loaded in the browser: a VASP_PP_PATH folder, a zip of it, single POTCAR files,
  // or the data/potcars/*.js files. Kept in IndexedDB so it survives reloads on this computer.
  const PP_DB = 'dft-studio-potcar', PP_STORE = 'potcar';
  function ppDb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(PP_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(PP_STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function ppSave(entries) {
    try {
      const db = await ppDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(PP_STORE, 'readwrite');
        entries.forEach(([k, v]) => tx.objectStore(PP_STORE).put(v, k));
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    } catch (e) { console.warn('POTCAR library not saved for next visit:', e); }
  }
  async function ppRestore() {
    try {
      const db = await ppDb();
      const keys = await new Promise((resolve, reject) => {
        const r = db.transaction(PP_STORE).objectStore(PP_STORE).getAllKeys();
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      if (!keys.length) return 0;
      const vals = await new Promise((resolve, reject) => {
        const r = db.transaction(PP_STORE).objectStore(PP_STORE).getAll();
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      keys.forEach((k, i) => { ppCache[k] = vals[i]; });
      return keys.length;
    } catch (e) { return 0; }
  }
  async function ppClear() {
    Object.keys(ppCache).forEach((k) => delete ppCache[k]);
    try {
      const db = await ppDb();
      db.transaction(PP_STORE, 'readwrite').objectStore(PP_STORE).clear();
    } catch (e) { /* nothing stored */ }
  }
  function ppFuncFromDir(dir) {
    if (!dir) return null;
    const d = dir.toLowerCase();
    for (const [func, lib] of Object.entries(D.PP_LIB_DIRS)) {
      if (d === lib.toLowerCase() || d === func.toLowerCase()) return func;
    }
    return null;
  }
  function ppKeyFor(path, text) {
    const parts = path.split(/[\\/]/).filter(Boolean);
    const titel = (text.match(/TITEL\s*=\s*(\S+)\s+(\S+)/) || []);
    const variant = parts.length >= 2 ? parts[parts.length - 2] : (titel[2] || null);
    if (!variant) return null;
    let func = null;
    for (let i = parts.length - 3; i >= 0 && !func; i--) func = ppFuncFromDir(parts[i]);
    if (!func) func = S.potFunc;
    return `${func}/${variant}`;
  }
  function ppParseJs(text) {
    const m = text.match(/__POTCAR_LOAD\(\s*"([^"]+)"\s*,\s*("(?:[^"\\]|\\.)*")\s*\)/s);
    if (!m) return null;
    try { return [m[1], JSON.parse(m[2])]; } catch (e) { return null; }
  }
  async function importPotcarFiles(files) {
    const found = [];
    const take = (path, text) => {
      const base = path.split(/[\\/]/).pop();
      if (/\.js$/i.test(base)) { const kv = ppParseJs(text); if (kv) found.push(kv); return; }
      if (!/^POTCAR$/i.test(base) || !/End of Dataset/.test(text)) return;
      const key = ppKeyFor(path, text);
      if (key) found.push([key, text]);
    };
    for (const f of files) {
      const path = f.webkitRelativePath || f.name;
      if (/\.zip$/i.test(f.name)) {
        if (!window.JSZip) { V().toast('Zip support is still loading. Try again in a moment.'); continue; }
        const zip = await window.JSZip.loadAsync(f);
        const entries = Object.values(zip.files).filter((z) => !z.dir && /(^|\/)(POTCAR|[^/]+\.js)$/i.test(z.name));
        for (const z of entries) take(z.name, await z.async('string'));
      } else if (/(^|[\\/])POTCAR$/i.test(path) || /\.js$/i.test(f.name) || f.size < 3e6) {
        take(path, await f.text());
      }
    }
    if (!found.length) { V().toast('No POTCAR files found. Pick your POTCAR folder (for example potpaw_PBE.64) or a zip of it.'); return; }
    found.forEach(([k, v]) => { ppCache[k] = v; });
    S.ppLibrary = true;
    await ppSave(found);
    V().toast(`POTCAR library loaded: ${found.length} POTCAR file${found.length === 1 ? '' : 's'}.`);
    renderStepbar(); renderStage();
  }
  function ppMissing() {
    return elements().map((el) => `${S.potFunc}/${S.potSel[el] || el}`).filter((k) => !ppCache[k]);
  }
  function pickPotcarLibrary(folder) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    if (folder) inp.webkitdirectory = true; else inp.accept = '.zip,.js,*';
    inp.onchange = () => { if (inp.files.length) importPotcarFiles(Array.from(inp.files)).catch((e) => V().toast(`Could not read the POTCAR files: ${e.message}`)); };
    inp.click();
  }

  function downloadText(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    downloadBlob(filename, blob);
  }
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function copyText(text, label) {
    const done = () => V().toast(`Copied ${label}`);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      ta.remove();
    }
  }
  function readFileText(input) {
    return new Promise((resolve) => {
      const f = input.files && input.files[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ name: f.name, text: String(r.result || '') });
      r.readAsText(f);
    });
  }
  // The workspace root carries the step (data-stage) and the --st-* colours; document.body when run standalone.
  function stageRoot() { return document.querySelector('.studio-root') || document.body; }
  function cssVar(name) { return getComputedStyle(stageRoot()).getPropertyValue(name).trim(); }
  function plotLayout(extra = {}) {
    const fg = cssVar('--st-text-secondary') || '#4b5563', bg = cssVar('--st-bg-card') || '#fff', grid = cssVar('--st-border-subtle') || '#e5e7eb';
    return Object.assign({
      paper_bgcolor: bg, plot_bgcolor: bg, font: { color: fg, family: 'IBM Plex Sans, sans-serif', size: 11 },
      margin: { t: 34, r: 14, b: 42, l: 54 },
      xaxis: { gridcolor: grid, zerolinecolor: grid }, yaxis: { gridcolor: grid, zerolinecolor: grid },
      legend: { orientation: 'h', y: -0.2 },
    }, extra, {
      xaxis: Object.assign({ gridcolor: grid, zerolinecolor: grid }, extra.xaxis || {}),
      yaxis: Object.assign({ gridcolor: grid, zerolinecolor: grid }, extra.yaxis || {}),
    });
  }
  function plot(div, traces, layout) {
    if (!window.Plotly) { const el = typeof div === 'string' ? $(div) : div; if (el) el.innerHTML = '<div class="sp-note">Plotting library unavailable offline.</div>'; return; }
    Plotly.newPlot(div, traces, plotLayout(layout), { responsive: true, displaylogo: false });
  }

  // '?' help popover
  const helpRegistry = {};
  let helpSeq = 0;
  function helpBtn(title, body) {
    const id = 'h' + (++helpSeq);
    helpRegistry[id] = { title, body };
    return `<button type="button" class="sp-help" data-help="${id}" title="Explain ${esc(title)}" aria-label="Explain ${esc(title)}">?</button>`;
  }
  function showHelp(title, body) {
    $('help-title').textContent = title;
    const b = $('help-body');
    if (typeof body === 'string') b.innerHTML = `<p>${esc(body)}</p>`;
    else b.innerHTML = `${body.meaning ? `<div><b>Meaning</b><p>${esc(body.meaning)}</p></div>` : ''}${body.when ? `<div><b>When to use</b><p>${esc(body.when)}</p></div>` : ''}${body.pre ? `<pre class="code-area">${esc(body.pre)}</pre>` : ''}`;
    openModal('help-modal');
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-help]');
    if (b) { e.preventDefault(); e.stopPropagation(); const h = helpRegistry[b.dataset.help]; if (h) showHelp(h.title, h.body); }
  });
  function openModal(id) { const m = $(id); m.classList.remove('hidden'); m.classList.add('flex'); }
  function closeModal(id) { const m = $(id); m.classList.add('hidden'); m.classList.remove('flex'); }

  // ---------------------------------------------------------------------------
  // Workflow state
  // ---------------------------------------------------------------------------
  const STEPS = [
    { id: 'structure', n: 1, label: 'Structure', sub: 'Build, inspect, magnetize' },
    { id: 'potcar', n: 2, label: 'POTCAR', sub: 'Pseudopotentials and ENMAX' },
    { id: 'kconv', n: 3, label: 'k-point test', sub: 'Optional convergence driver', optional: true },
    { id: 'inputs', n: 4, label: 'Input files', sub: 'INCAR, KPOINTS and job script in the Input Builder' },
    { id: 'analyze', n: 5, label: 'Analyze', sub: 'Plots and post-processing', optional: true },
  ];
  const S = {
    stage: 'structure',
    visited: new Set(['structure']),
    ppLibrary: null,
    potFunc: 'PAW_PBE_64',
    potSel: {},
    task: 'relax',
    kmesh: null,
    analyzeTab: 'elec',
  };

  // ---------------------------------------------------------------------------
  // POTCAR
  // ---------------------------------------------------------------------------
  function ppIndex() { return window.PP_INDEX || {}; }
  function elements() { return V().getSpecies().map((x) => x.el); }
  function variantsFor(el) { return (ppIndex()[S.potFunc] || {})[el] || []; }
  function ensurePotSelection() {
    elements().forEach((el) => {
      const vars = variantsFor(el);
      if (!S.potSel[el] || !vars.some((v) => v.variant === S.potSel[el])) {
        const prefs = D.RECOMMENDED_PREFS[el] || [el];
        S.potSel[el] = prefs.find((p) => vars.some((v) => v.variant === p)) || (vars[0] && vars[0].variant) || el;
      }
    });
  }
  function selectedPP(el) { return variantsFor(el).find((v) => v.variant === S.potSel[el]); }
  function maxEnmax() {
    let m = 0;
    elements().forEach((el) => { const p = selectedPP(el); if (p && p.enmax) m = Math.max(m, p.enmax); });
    return m;
  }
  function recommendedEncut() { const m = maxEnmax(); return m > 0 ? Math.ceil((1.3 * m) / 10) * 10 : 520; }
  function nelect() {
    let n = 0, ok = true;
    V().getSpecies().forEach(({ el, count }) => { const p = selectedPP(el); if (p && p.zval) n += p.zval * count; else ok = false; });
    return ok ? n : null;
  }
  function makePotcarScript() {
    const lib = D.PP_LIB_DIRS[S.potFunc] || 'potpaw_PBE.64';
    const vars = elements().map((el) => S.potSel[el] || el);
    return `#!/bin/bash
# make_potcar.sh: build POTCAR from your own licensed VASP pseudopotential library.
# POTCAR files are licensed by VASP Software GmbH and are never shipped with the Material Builder.
#   export VASP_PP_PATH=/path/to/your/pp/library   (the folder that contains ${lib}/)
#   bash make_potcar.sh
# Species order (must match POSCAR line 6): ${elements().join(' ')}
set -e
PP_ROOT="\${VASP_PP_PATH:?Set VASP_PP_PATH to your VASP pseudopotential folder}"
LIB="\${POTCAR_LIB:-${lib}}"
rm -f POTCAR
for v in ${vars.join(' ')}; do
  f="$PP_ROOT/$LIB/$v/POTCAR"
  [ -f "$f" ] || { echo "Missing $f" >&2; exit 1; }
  cat "$f" >> POTCAR
done
echo "POTCAR written:"; grep TITEL POTCAR
`;
  }
  async function realPotcar() {
    const texts = await Promise.all(elements().map((el) => loadPotcarText(S.potFunc, S.potSel[el] || el)));
    return texts.join('');
  }

  // ---------------------------------------------------------------------------
  // INCAR, KPOINTS and the job script are the Input Builder's (D-108)
  // ---------------------------------------------------------------------------
  // The Builder keeps what only it knows (the structure, the spins, the POTCAR choices, whether the cell is a slab or a
  // molecule, a mesh from the k-point test) and hands all of it to the Input Builder, so nothing is typed twice.
  function looks2D() {
    const st = V().getStructure();
    if (!st || !st.atoms.length) return false;
    const c = Math.hypot(...st.lattice[2]);
    const zs = st.atoms.map((a) => a.frac[2]);
    const span = Math.max(...zs) - Math.min(...zs);
    return c > 12 && (1 - span) * c > 8;
  }
  function systemHint() {
    const root = document.getElementById('studio-root');
    if (root && root.dataset.mode === 'molecule') return 'molecule';
    return looks2D() ? 'slab' : undefined;
  }
  function magmomText() { return V().hasMagnetism() ? V().getMAGMOM().replace(/^\s*MAGMOM\s*=\s*/i, '') : undefined; }
  // The test INCAR of the k-point convergence step: the Input Builder's convergence preset (S-042), ENCUT from ENMAX.
  function baseIncar() {
    const B = window.SiteBridge;
    if (!B || !B.presetIncar) return '';
    const me = maxEnmax();
    return B.presetIncar('convergence', me > 0 ? me : undefined, V().getMagMode() === 'noncollinear' ? undefined : magmomText());
  }
  function kmeshText() {
    const m = S.kmesh;
    return m ? `Mesh chosen in the Material Builder k-point test\n0\nGamma\n  ${m.join('  ')}\n  0  0  0\n` : undefined;
  }

  // ---------------------------------------------------------------------------
  // Checks the Builder can make before the hand-off (the INCAR and KPOINTS checks run in the Input Builder)
  // ---------------------------------------------------------------------------
  function checks() {
    const out = [];
    const add = (level, msg, stage) => out.push({ level, msg, stage });
    const ppMissing = elements().filter((el) => !selectedPP(el));
    if (ppMissing.length) add('warn', `No POTCAR entry in ${S.potFunc} for: ${ppMissing.join(', ')}.`, 'potcar');
    if (S.ppLibrary !== true) add('info', 'No POTCAR library loaded yet. Load it in the POTCAR step to download POTCAR here; otherwise make_potcar.sh builds it on your cluster.', 'potcar');
    const sys = systemHint();
    if (sys === 'slab') add('info', 'The cell has more than 8 A of vacuum along c, so it is handed over as a slab: the Input Builder then checks ISIF, the k-mesh (one k-point along the vacuum) and the dipole correction.', 'inputs');
    if (sys === 'molecule') add('info', 'Molecule mode: the Input Builder is told this is an isolated molecule in a box, so it checks for a cell relaxation (ISIF = 3) that would shrink the box.', 'inputs');
    if (V().getMagMode() === 'noncollinear') add('info', 'Non-collinear moments go over as three numbers per atom with LNONCOLLINEAR. Choose the Spin-orbit coupling task for SOC; the job script then uses vasp_ncl.', 'inputs');
    return out;
  }

  // ---------------------------------------------------------------------------
  // Stepper and layout
  // ---------------------------------------------------------------------------
  function stepDone(id) {
    if (id === 'structure') return !!V().getStructure();
    return S.visited.has(id);
  }
  function renderStepbar() {
    const bar = $('stepbar-steps');
    const idx = STEPS.findIndex((s) => s.id === S.stage);
    bar.innerHTML = STEPS.map((s) => {
      const done = stepDone(s.id) && s.id !== S.stage;
      return `<button type="button" class="step-chip ${s.id === S.stage ? 'active' : ''} ${done ? 'done' : ''}" data-stage="${s.id}" title="${esc(s.sub)}">
        <span class="step-num">${done ? '&#10003;' : s.n}</span><span class="step-label">${esc(s.label)}${s.optional ? '<i>opt</i>' : ''}</span></button>`;
    }).join('<span class="step-sep" aria-hidden="true"></span>');
    bar.querySelectorAll('[data-stage]').forEach((b) => { b.onclick = () => go(b.dataset.stage); });
    const next = STEPS[idx + 1];
    const prev = STEPS[idx - 1];
    $('btn-step-prev').disabled = !prev;
    $('btn-step-prev').onclick = () => prev && go(prev.id);
    $('btn-step-next').innerHTML = next ? `Next: ${esc(next.label)} <span aria-hidden="true">&rarr;</span>` : 'Back to Structure';
    $('btn-step-next').onclick = () => go(next ? next.id : 'structure');
    const warns = checks().filter((c) => c.level === 'warn').length;
    const pill = $('check-pill');
    pill.textContent = warns ? `${warns} check${warns > 1 ? 's' : ''} to review` : 'All checks pass';
    pill.className = 'check-pill ' + (warns ? 'warn' : 'ok');
    const st = V().getStructure();
    $('status-formula').textContent = st ? `${st.name} | ${st.atoms.length} atoms` : '';
  }
  function go(stage, opts = {}) {
    if (!STEPS.some((s) => s.id === stage)) return;
    S.stage = stage;
    S.visited.add(stage);
    if (stage === 'potcar' || stage === 'inputs') ensurePotSelection();
    stageRoot().dataset.stage = stage;
    if (opts.tab && stage === 'structure') V().openRightTab(opts.tab);
    if (opts.tab && stage === 'analyze') S.analyzeTab = opts.tab;
    renderStepbar();
    renderStage();
    V().resize();
    window.dispatchEvent(new Event('resize'));
    if (opts.library) openLibrary();
  }

  const stageRenderers = {};
  function renderStage() {
    const pane = $('stage-pane');
    if (S.stage === 'structure') { pane.innerHTML = ''; return; }
    const r = stageRenderers[S.stage];
    const step = STEPS.find((s) => s.id === S.stage);
    const head = `<div class="sp-head"><div><div class="sp-kicker">Step ${step.n} of ${STEPS.length}${step.optional ? ' | optional' : ''}</div><h2>${esc(step.label)}</h2><p>${esc(step.sub)}</p></div></div>`;
    pane.innerHTML = head + '<div id="sp-body" class="sp-body"></div>';
    if (r) r($('sp-body'));
    pane.scrollTop = 0;
  }
  function rerenderBody() {
    const r = stageRenderers[S.stage];
    const body = $('sp-body');
    if (r && body) { const y = $('stage-pane').scrollTop; r(body); $('stage-pane').scrollTop = y; }
    renderStepbar();
  }
  function filePreview(name, text, extra = '') {
    return `<div class="sp-file"><div class="sp-file-head"><span class="font-mono-code">${esc(name)}</span><span class="sp-row">${extra}
      <button class="v-btn py-0.5 px-2 text-[10.5px]" data-copy="${esc(name)}">Copy</button>
      <button class="v-btn v-btn-primary py-0.5 px-2 text-[10.5px]" data-dl="${esc(name)}">Download</button></span></div>
      <textarea class="code-area w-full" rows="12" readonly data-file="${esc(name)}" aria-label="${esc(name)} file contents">${esc(text)}</textarea></div>`;
  }
  function bindFileButtons(root, getter) {
    root.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => copyText(getter(b.dataset.copy), b.dataset.copy); });
    root.querySelectorAll('[data-dl]').forEach((b) => { b.onclick = () => downloadText(b.dataset.dl, getter(b.dataset.dl)); });
  }
  function checkList(stage) {
    const list = checks().filter((c) => !stage || c.stage === stage);
    if (!list.length) return '';
    return `<div class="sp-checks">${list.map((c) => `<div class="sp-check ${c.level}"><span>${c.level === 'warn' ? '!' : 'i'}</span><div>${esc(c.msg)}</div></div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------------------
  // Step 2: POTCAR
  // ---------------------------------------------------------------------------
  stageRenderers.potcar = (body) => {
    ensurePotSelection();
    const idx = ppIndex();
    const funcs = Object.keys(idx);
    const species = V().getSpecies();
    const ne = nelect();
    body.innerHTML = `
      <div class="sp-card">
        <div class="sp-card-title">Pseudopotential library ${helpBtn('Which library?', { meaning: 'PAW_PBE_64 is the current recommended PAW set for PBE (VASP 6.x). Use the LDA sets only with an LDA functional and keep one library for every species.', when: 'Pick PAW_PBE_64 unless your project protocol says otherwise.' })}</div>
        <select id="pp-func" class="v-input w-full" aria-label="POTCAR functional set">${funcs.map((f) => `<option value="${f}" ${f === S.potFunc ? 'selected' : ''}>${f} (${Object.keys(idx[f]).length} elements)</option>`).join('')}</select>
        <div class="sp-stats">
          <div><span>Species (POSCAR order)</span><b class="font-mono-code">${esc(species.map((s) => s.el).join(' '))}</b></div>
          <div><span>max(ENMAX)</span><b class="font-mono-code">${maxEnmax() ? maxEnmax().toFixed(1) + ' eV' : '-'}</b></div>
          <div><span>Recommended ENCUT (1.3 x)</span><b class="font-mono-code text-blue-500">${recommendedEncut()} eV</b></div>
          <div><span>Valence electrons NELECT</span><b class="font-mono-code">${ne !== null ? +ne.toFixed(2) : '-'}</b></div>
        </div>
      </div>
      <div class="sp-card" id="pp-gen-card">
        <div class="sp-card-title">Generate POTCAR</div>
        <div class="sp-note">${S.ppLibrary === true
          ? `POTCAR library ready${Object.keys(ppCache).length ? ` (${Object.keys(ppCache).length} files loaded in this browser)` : ''}. ${(() => { const m = ppMissing(); return m.length && Object.keys(ppCache).length ? `Not loaded yet: ${esc(m.join(', '))} (they are fetched from data/potcars if present).` : 'Download POTCAR, or include it in the run bundle.'; })()}`
          : 'Load your POTCAR library once (your VASP_PP_PATH folder such as potpaw_PBE.64, a zip of it, or single POTCAR files). It stays in this browser and is reused on every visit.'}</div>
        <div class="sp-row" style="flex-wrap:wrap;gap:6px;margin-top:6px">
          <button class="v-btn primary py-1 px-3" id="pp-dl-real" ${S.ppLibrary === true ? '' : 'disabled'}>Download POTCAR</button>
          <button class="v-btn py-1 px-3" id="pp-load-dir">Load POTCAR folder</button>
          <button class="v-btn py-1 px-3" id="pp-load-zip">Load zip / files</button>
          ${Object.keys(ppCache).length ? '<button class="v-btn py-1 px-3" id="pp-clear">Forget loaded library</button>' : ''}
        </div>
      </div>
      ${species.map(({ el, count }) => {
        const vars = variantsFor(el);
        const rec = (D.RECOMMENDED_PREFS[el] || [el]).find((p) => vars.some((v) => v.variant === p)) || (vars[0] && vars[0].variant);
        return `<div class="sp-card">
          <div class="sp-card-title"><span>${esc(el)} <span class="text-mut font-normal">x${count}</span></span><span class="sp-badge">Recommended: ${esc(rec || 'n/a')}</span></div>
          ${vars.length ? `<div class="pp-grid">${vars.map((v) => {
            const suf = Object.keys(D.SUFFIX_GUIDE).find((k) => k !== 'standard' && v.variant.includes(k)) || 'standard';
            const g = D.SUFFIX_GUIDE[suf];
            const on = S.potSel[el] === v.variant;
            return `<div class="pp-opt ${on ? 'sel' : ''}" data-pe="${esc(el)}" data-pv="${esc(v.variant)}">
              <div class="sp-row" style="justify-content:space-between"><button type="button" class="pp-pick font-mono-code" aria-pressed="${on}" aria-label="Use ${esc(v.variant)} for ${esc(el)}">${esc(v.variant)}</button>${helpBtn(`${v.variant}: ${g.label}`, { meaning: g.meaning, when: g.when, pre: v.header_preview || v.titel })}</div>
              <div class="text-mut text-[10.5px]">${esc(g.label)}</div>
              <div class="text-mut text-[10.5px] font-mono-code">ZVAL ${v.zval ?? '?'} | ENMAX ${v.enmax ?? '?'} eV</div></div>`;
          }).join('')}</div>` : `<div class="sp-note warn">No ${esc(el)} entry in ${esc(S.potFunc)}.</div>`}
        </div>`;
      }).join('')}
      ${checkList('potcar')}
      ${filePreview('make_potcar.sh', makePotcarScript(), '')}
    `;
    $('pp-func').onchange = (e) => { S.potFunc = e.target.value; ensurePotSelection(); rerenderBody(); };
    body.querySelectorAll('[data-pv]').forEach((c) => {
      const pick = () => { S.potSel[c.dataset.pe] = c.dataset.pv; rerenderBody(); };
      c.onclick = (e) => { if (!e.target.closest('[data-help]')) pick(); };
    });
    bindFileButtons(body, () => makePotcarScript());
    const real = $('pp-dl-real');
    if (real) real.onclick = async () => { try { downloadText('POTCAR', await realPotcar()); } catch (e) { V().toast(`${e.message}. Load the folder that contains it.`); } };
    $('pp-load-dir').onclick = () => pickPotcarLibrary(true);
    $('pp-load-zip').onclick = () => pickPotcarLibrary(false);
    const clr = $('pp-clear');
    if (clr) clr.onclick = async () => { await ppClear(); S.ppLibrary = null; probeLocalLibrary(); rerenderBody(); };
  };

  // ---------------------------------------------------------------------------
  // Step 4: Input files, made in the Input Builder (D-108)
  // ---------------------------------------------------------------------------
  stageRenderers.inputs = (body) => {
    ensurePotSelection();
    const st = V().getStructure();
    const tasks = (window.SiteBridge && window.SiteBridge.tasks) || [];
    if (!tasks.some((t) => t.id === S.task)) S.task = tasks.length ? tasks[0].id : 'relax';
    const mm = magmomText();
    const me = maxEnmax();
    const sys = systemHint();
    const rows = [
      ['structure', '', 'Structure', st ? `${st.name}, ${st.atoms.length} atoms` : 'none yet'],
      ['potcar', '', 'POTCAR', `${S.potFunc}: ${elements().map((el) => S.potSel[el] || el).join(' ')}`],
      ['potcar', '', 'Largest ENMAX', me ? `${me.toFixed(1)} eV, so ENCUT is filled in` : 'not known (load a POTCAR library or type ENMAX there)'],
      ['structure', 'magnetic', 'MAGMOM', mm ? mm : 'none (set spins in Structure > Magnetic)'],
      ['structure', '', 'System', sys === 'slab' ? 'slab (vacuum along c)' : sys === 'molecule' ? 'molecule in a box' : 'bulk crystal'],
      ['kconv', '', 'k-mesh', S.kmesh ? `${S.kmesh.join(' x ')} from the k-point test` : 'chosen in the Input Builder (or run the optional k-point test)'],
    ];
    body.innerHTML = `
      <div class="sp-card">
        <div class="sp-card-title">Make INCAR, KPOINTS and the job script ${helpBtn('Why the Input Builder?', 'The Input Builder is the one place on the site that writes VASP inputs. It opens with this structure and everything listed here already filled in, checks the INCAR with the sourced validation rules, and writes the job script and a zip.')}</div>
        <label class="sp-field"><span>What do you want to calculate?</span><select id="in-task" class="v-input">${tasks.map((t) => `<option value="${esc(t.id)}" ${S.task === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select></label>
        <div class="sp-summary" style="margin-top:8px">
          ${rows.map(([stage, tab, l, v]) => `<button class="sp-sum-row" data-goto="${stage}" data-tab="${tab}"><span>${esc(l)}</span><b>${esc(v)}</b><i>edit</i></button>`).join('')}
        </div>
        <div class="sp-row wrap" style="margin-top:10px">
          <button id="in-send" class="v-btn v-btn-primary">Open in the Input Builder</button>
          ${S.ppLibrary === true ? '<button id="in-potcar" class="v-btn">Download POTCAR</button>' : ''}
        </div>
        <div class="sp-note">Everything above travels with the structure. POTCAR stays here: ${S.ppLibrary === true ? 'download it with the button above and put it next to the other files.' : 'load your library in step 2 to download it, or run make_potcar.sh on your cluster.'}</div>
      </div>
      ${checkList()}
    `;
    $('in-task').onchange = (e) => { S.task = e.target.value; };
    body.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => go(b.dataset.goto, b.dataset.tab ? { tab: b.dataset.tab } : {}); });
    $('in-send').onclick = () => { S.visited.add('inputs'); sendSite('input-builder', { task: S.task }); };
    const pot = $('in-potcar');
    if (pot) pot.onclick = async () => { try { downloadText('POTCAR', await realPotcar()); } catch (e) { V().toast(`${e.message}. Load the folder that contains it.`); } };
  };

  // ---------------------------------------------------------------------------
  // Sample library (350 VASPKIT / COD structures)
  // ---------------------------------------------------------------------------
  function openLibrary() {
    const list = window.CRYSTALS_INDEX || [];
    const cats = [...new Set(list.map((c) => c.category))];
    $('lib-cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
    $('lib-q').value = '';
    renderLibrary();
    openModal('lib-modal');
    $('lib-q').focus();
  }
  function renderLibrary() {
    const list = window.CRYSTALS_INDEX || [];
    const q = $('lib-q').value.trim().toLowerCase(), cat = $('lib-cat').value;
    const hits = list.filter((c) => (!cat || c.category === cat) && (!q || c.name.toLowerCase().includes(q) || c.category.includes(q)));
    $('lib-count').textContent = `${hits.length} of ${list.length}`;
    $('lib-list').innerHTML = hits.slice(0, 400).map((c) => `<button class="lib-row" data-path="${esc(c.path)}"><span class="font-mono-code">${esc(c.name)}</span><span class="text-mut">${esc(c.category)}</span></button>`).join('');
    $('lib-list').querySelectorAll('[data-path]').forEach((b) => {
      b.onclick = async () => {
        try {
          const text = await loadCrystalText(b.dataset.path);
          closeModal('lib-modal');
          const file = b.dataset.path.split('/').pop();
          V().loadText(text, file, file.replace(/\.(cif|vasp)$/i, ''));
          if (S.stage !== 'structure') go('structure');
        } catch (e) { V().toast(e.message); }
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Tool finder ("Find a tool"; the site keeps Ctrl+K for its own palette): every VASPKIT menu group, every step, every viewer tab
  // ---------------------------------------------------------------------------
  const COMMANDS = [
    ...STEPS.map((s) => ({ code: String(s.n), name: `Step ${s.n}: ${s.label}`, cat: s.sub, target: { stage: s.id } })),
    ...D.CATALOG.flatMap((g) => g.items.map(([code, name, target]) => ({ code, name, cat: g.cat, target }))),
    { code: '-', name: 'Make INCAR, KPOINTS and the job script (Input Builder)', cat: 'Run', target: { stage: 'inputs' } },
    { code: '-', name: 'Full structural report (CONTCAR)', cat: 'Structure', target: { stage: 'structure', tab: 'symmetry' } },
  ];
  let cmdSel = 0;
  function openCmd() { $('cmd-input').value = ''; cmdSel = 0; renderCmd(); openModal('cmd-modal'); $('cmd-input').focus(); }
  function cmdHits() {
    const q = $('cmd-input').value.trim().toLowerCase();
    return COMMANDS.filter((c) => !q || `${c.code} ${c.name} ${c.cat}`.toLowerCase().includes(q)).slice(0, 14);
  }
  // A target with send opens the structure in a site tool (k-path, Magnetic, Input Builder); others are Builder steps.
  // What the Builder knows travels with the structure (D-108): the largest ENMAX and the POTCAR variants in POSCAR order,
  // whether the cell is a slab or a molecule, and a mesh chosen in the k-point test.
  function potcarHandoff() {
    ensurePotSelection();
    const enmax = maxEnmax();
    return {
      enmax: enmax > 0 ? enmax : undefined,
      potcar: elements().map((el) => S.potSel[el] || el).join(' '),
      system: systemHint(),
      kpoints: kmeshText(),
    };
  }
  function sendSite(tool, more) {
    const B = window.SiteBridge;
    if (!B) return;
    const extra = Object.assign(potcarHandoff(), more || {});
    if (!B.sendTo(tool, V().getPOSCAR(), (V().getStructure() && V().getStructure().name) || 'structure', magmomText(), extra)) V().toast('Browser storage is unavailable, so the hand-off could not be made.');
  }
  function runCmd(c) { closeModal('cmd-modal'); if (c.target.send) { sendSite(c.target.send, c.target.task ? { task: c.target.task } : undefined); return; } go(c.target.stage, c.target); }
  function renderCmd() {
    const hits = cmdHits();
    cmdSel = Math.min(cmdSel, Math.max(0, hits.length - 1));
    $('cmd-results').innerHTML = hits.map((c, i) => `<button class="cmd-row ${i === cmdSel ? 'sel' : ''}" data-i="${i}"><span><span class="cmd-code font-mono-code">${esc(c.code)}</span>${esc(c.name)}</span><span class="text-mut">${esc(c.cat)}</span></button>`).join('') || '<div class="sp-note">No match.</div>';
    $('cmd-results').querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => runCmd(hits[Number(b.dataset.i)]); });
  }

  function updateWasmPill(msg, st) {
    const p = $('wasm-pill');
    if (!p) return;
    p.textContent = st === 'ready' ? 'Python: ready' : st === 'error' ? 'Python: error' : 'Python: loading';
    p.title = msg;
    p.className = 'wasm-pill ' + (st || '');
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    if (!window.VESTA) { console.error('VESTA bridge missing'); return; }
    stageRoot().dataset.stage = 'structure';
    ensurePotSelection();
    V().onChange(() => {
      ensurePotSelection();
      renderStepbar();
      if (S.stage !== 'structure') rerenderBody();
    });
    ['btn-toggle-left', 'btn-toggle-right'].forEach((id) => {
      const b = $(id);
      if (b) b.addEventListener('click', (e) => { if (S.stage !== 'structure') { e.stopImmediatePropagation(); go('structure'); } }, true);
    });
    $('btn-library').onclick = openLibrary;
    $('lib-q').oninput = renderLibrary;
    $('lib-cat').onchange = renderLibrary;
    $('btn-cmd').onclick = openCmd;
    $('cmd-input').oninput = () => { cmdSel = 0; renderCmd(); };
    $('cmd-input').onkeydown = (e) => {
      const hits = cmdHits();
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = Math.min(hits.length - 1, cmdSel + 1); renderCmd(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = Math.max(0, cmdSel - 1); renderCmd(); }
      if (e.key === 'Enter' && hits[cmdSel]) runCmd(hits[cmdSel]);
    };
    document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closeModal(b.dataset.close); });
    ['cmd-modal', 'lib-modal', 'help-modal'].forEach((id) => { $(id).addEventListener('click', (e) => { if (e.target.id === id) closeModal(id); }); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') ['cmd-modal', 'lib-modal', 'help-modal'].forEach(closeModal);
    });
    $('wasm-pill').onclick = () => window.WasmEngine.ensureReady(updateWasmPill).catch((e) => V().toast(e.message));
    $('btn-guide').onclick = () => showHelp('How the Material Builder works', { meaning: 'Work left to right along the steps at the top. 1 Structure: load a sample, the 350-crystal library, or your own POSCAR or CIF; build supercells, slabs and defects; set spins in the Magnetic tab. 2 POTCAR: pick variants; the largest ENMAX sets ENCUT later. 3 (optional) k-point test: a driver script that runs a mesh series. 4 Input files: the Input Builder opens with the structure, spins, POTCAR choices and mesh filled in, and writes INCAR, KPOINTS and the job script. 5 Analyze: plot DOS, bands, EOS, phonons and MD from your outputs.', when: 'Band paths come from the k-path tool and FM or AFM orderings from the Magnetic tool: the Symmetry and Magnetic tabs send the structure there. Use Find a tool in the toolbar to jump to any VASPKIT function by number or name.' });
    ppRestore().then((n) => {
      if (n) { S.ppLibrary = true; renderStepbar(); if (S.stage === 'potcar' || S.stage === 'inputs') renderStage(); }
      else probeLocalLibrary();
    });
    renderStepbar();
    V().refresh();
  }

  window.Studio = { go, setMesh: (m) => { S.kmesh = m.slice(); } };
  window.StudioKit = { importPotcarFiles, maxEnmax, potcarHandoff, sendSite, S, V, $, esc, helpBtn, filePreview, bindFileButtons, downloadText, downloadBlob, readFileText, plot, plotLayout, baseIncar, go, rerenderBody, renderStepbar, stageRenderers, updateWasmPill, copyText, elements };
  setTimeout(init, 0);
})();
