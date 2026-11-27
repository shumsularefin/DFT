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
    loadPotcarText('PAW_PBE_64', 'O').then(() => { S.ppLibrary = true; clearTimeout(t); renderStepbar(); if (S.stage === 'potcar' || S.stage === 'bundle') renderStage(); })
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
    { id: 'potcar', n: 2, label: 'POTCAR', sub: 'Pseudopotentials, ENCUT' },
    { id: 'incar', n: 3, label: 'INCAR', sub: 'Calculation settings' },
    { id: 'kpoints', n: 4, label: 'KPOINTS', sub: 'Mesh or band path' },
    { id: 'kconv', n: 5, label: 'k-Convergence', sub: 'Optional test', optional: true },
    { id: 'bundle', n: 6, label: 'Run bundle', sub: 'Check and download' },
    { id: 'analyze', n: 7, label: 'Analyze', sub: 'Plots and post-processing', optional: true },
  ];
  const S = {
    stage: 'structure',
    visited: new Set(['structure']),
    ppLibrary: null,
    potFunc: 'PAW_PBE_64',
    potSel: {},
    encut: 520, encutAuto: true,
    preset: 'ST',
    ldau: false, uMap: {},
    soc: false, vdw: 0, dipole: false,
    tagEdits: {}, extraTags: '', incarManual: null,
    kpt: { mode: 'spacing', spacing: 0.03, manual: [4, 4, 4], scheme: 'Gamma', force2D: false },
    bundleDone: false,
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
  function syncEncut() { if (S.encutAuto) S.encut = recommendedEncut(); }
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
  // INCAR
  // ---------------------------------------------------------------------------
  function defaultU(el) {
    const d = D.MAGNETIC_DEFAULTS[el];
    if (d) return d.u;
    const info = V().getElementInfo(el);
    return info.defU || 0;
  }
  function uOrbital(el) {
    const d = D.MAGNETIC_DEFAULTS[el];
    if (d) return d.orbital;
    if (D.F_BLOCK.has(el)) return 3;
    if (D.D_BLOCK.has(el)) return 2;
    return -1;
  }
  function needsNoncollinear() { return S.soc || S.preset === 'SO' || V().getMagMode() === 'noncollinear'; }
  function magmomValue() {
    const st = V().getStructure();
    if (!V().hasMagnetism()) return null;
    if (needsNoncollinear() && V().getMagMode() !== 'noncollinear') {
      // SOC with collinear moments in the viewer: write each moment along z.
      const groups = new Map();
      st.atoms.forEach((a) => { if (!groups.has(a.el)) groups.set(a.el, []); groups.get(a.el).push(a); });
      const f = (x) => (Math.abs(x) < 1e-4 ? '0' : String(+x.toFixed(3)));
      return Array.from(groups.values()).map((list) => list.map((a) => `0 0 ${f(a.mag[2])}`).join('  ')).join('   ');
    }
    return V().getMAGMOM().replace(/^MAGMOM\s*=\s*/, '');
  }
  function buildIncarTags() {
    syncEncut();
    const preset = D.INCAR_PRESETS[S.preset] || D.INCAR_PRESETS.ST;
    const tags = Object.assign({}, preset.tags, { ENCUT: S.encut });
    const els = elements();
    const hasF = els.some((e) => D.F_BLOCK.has(e)), hasD = els.some((e) => D.D_BLOCK.has(e));
    if (hasD || hasF) { tags.LASPH = '.TRUE.'; tags.LMAXMIX = hasF ? 6 : 4; }
    const mm = magmomValue();
    if (needsNoncollinear()) {
      tags.LNONCOLLINEAR = '.TRUE.';
      delete tags.ISPIN; delete tags.VOSKOWN;
      if (S.soc || S.preset === 'SO') { tags.LSORBIT = '.TRUE.'; tags.SAXIS = tags.SAXIS || '0 0 1'; }
      if (mm) tags.MAGMOM = mm;
    } else if (mm || ['MG', 'PU'].includes(S.preset)) {
      tags.ISPIN = 2;
      if (mm) tags.MAGMOM = mm;
    }
    if (S.ldau || S.preset === 'PU') {
      const l = [], u = [], j = [];
      els.forEach((el) => {
        const uv = S.uMap[el] ?? defaultU(el), orb = uOrbital(el);
        if (uv > 0 && orb > 0) { l.push(orb); u.push(uv); } else { l.push(-1); u.push(0); }
        j.push(0);
      });
      Object.assign(tags, { LDAU: '.TRUE.', LDAUTYPE: 2, LDAUL: l.join(' '), LDAUU: u.join(' '), LDAUJ: j.join(' '), LDAUPRINT: 1 });
      if (!tags.LMAXMIX) tags.LMAXMIX = l.includes(3) ? 6 : 4;
    }
    if (S.vdw) tags.IVDW = S.vdw;
    if (S.dipole) { tags.LDIPOL = '.TRUE.'; tags.IDIPOL = 3; }
    Object.entries(S.tagEdits).forEach(([k, v]) => { if (v === '' || v === null) delete tags[k]; else tags[k] = v; });
    S.extraTags.split('\n').forEach((line) => {
      const code = line.split(/[#!]/)[0];
      const eq = code.indexOf('=');
      if (eq > 0) { const k = code.slice(0, eq).trim().toUpperCase(), v = code.slice(eq + 1).trim(); if (k) tags[k] = v; }
    });
    return tags;
  }
  function getIncar() {
    if (S.incarManual !== null) return S.incarManual;
    const preset = D.INCAR_PRESETS[S.preset] || D.INCAR_PRESETS.ST;
    const st = V().getStructure();
    const tags = buildIncarTags();
    const lines = [`# Material Builder INCAR: ${preset.name}`, `SYSTEM = ${(st && st.name) || 'VASP_job'}`, ''];
    Object.entries(tags).forEach(([k, v]) => lines.push(`${k.padEnd(13)} = ${String(v)}`));
    return lines.join('\n') + '\n';
  }

  // ---------------------------------------------------------------------------
  // KPOINTS
  // ---------------------------------------------------------------------------
  function recipLengths() { return V().getReciprocal().map((b) => Math.hypot(b[0], b[1], b[2])); } // includes 2 pi
  function looks2D() {
    const st = V().getStructure();
    if (!st) return false;
    const c = Math.hypot(...st.lattice[2]);
    const zs = st.atoms.map((a) => a.frac[2]);
    const span = Math.max(...zs) - Math.min(...zs);
    return c > 12 && (1 - span) * c > 8;
  }
  function currentMesh() {
    let m;
    if (S.kpt.mode === 'manual') m = S.kpt.manual.slice();
    else {
      const sp = Math.max(0.005, Number(S.kpt.spacing) || 0.03);
      m = recipLengths().map((b) => Math.max(1, Math.ceil(b / (2 * Math.PI * sp))));
    }
    if (S.kpt.force2D) m[2] = 1;
    return m;
  }
  function getKpoints() {
    const m = currentMesh();
    const why = S.kpt.mode === 'manual' ? 'explicit mesh' : `k-spacing ${S.kpt.spacing} x 2pi/A`;
    return `Material Builder ${S.kpt.scheme} mesh (${why})\n0\n${S.kpt.scheme}\n  ${m.join('  ')}\n  0  0  0\n`;
  }

  // ---------------------------------------------------------------------------
  // Consistency checks across all steps (shown in the run bundle and the stepper)
  // ---------------------------------------------------------------------------
  function checks() {
    const out = [];
    const add = (level, msg, stage) => out.push({ level, msg, stage });
    const tags = buildIncarTags();
    const st = V().getStructure();
    const nat = st ? st.atoms.length : 0;
    const isTrue = (v) => /^\.?t/i.test(String(v || ''));
    if (S.incarManual !== null) add('info', 'INCAR was edited by hand, so automatic settings are not applied until you regenerate it.', 'incar');
    const ppMissing = elements().filter((el) => !selectedPP(el));
    if (ppMissing.length) add('warn', `No POTCAR entry in ${S.potFunc} for: ${ppMissing.join(', ')}.`, 'potcar');
    const me = maxEnmax();
    if (me && Number(tags.ENCUT) < 1.3 * me - 1) add('warn', `ENCUT = ${tags.ENCUT} eV is below 1.3 x max(ENMAX) = ${Math.round(1.3 * me)} eV. Fine for quick tests, too low for cell relaxations and stresses.`, 'incar');
    if (String(tags.ISPIN) === '2' && !tags.MAGMOM) add('warn', 'ISPIN = 2 without MAGMOM: VASP starts every atom at 1 muB. Set moments in Structure > Magnetic.', 'structure');
    if (tags.MAGMOM && !tags.ISPIN && !isTrue(tags.LNONCOLLINEAR)) add('warn', 'MAGMOM set but ISPIN is not 2.', 'incar');
    if (isTrue(tags.LDAU) && !tags.LMAXMIX) add('warn', 'DFT+U without LMAXMIX.', 'incar');
    if (String(tags.ICHARG) === '11' && elements().some((e) => D.D_BLOCK.has(e) || D.F_BLOCK.has(e)) && !tags.LMAXMIX) add('warn', 'ICHARG = 11 on a d/f system needs LMAXMIX (4 or 6) to reproduce the SCF density.', 'incar');
    if (S.preset === 'BS') add('warn', 'Band-structure preset: the band path KPOINTS (and its standardized POSCAR) comes from the k-path tool.', 'kpoints');
    if (String(tags.ISMEAR) === '-5' && currentMesh().reduce((a, b) => a * b, 1) < 4) add('warn', 'ISMEAR = -5 (tetrahedron) needs at least 4 k-points.', 'kpoints');
    if (String(tags.ISIF) === '3' && looks2D()) add('warn', 'ISIF = 3 on a cell with vacuum will shrink the vacuum. Use ISIF = 2 (or ISIF = 4 with care) for slabs.', 'incar');
    if (looks2D() && currentMesh()[2] > 1) add('info', 'Cell looks like a slab or 2D layer: consider forcing N3 = 1 in KPOINTS.', 'kpoints');
    if (looks2D() && !S.dipole) add('info', 'Slab detected: consider the dipole correction (LDIPOL, IDIPOL = 3) for polar or adsorbate-covered surfaces.', 'incar');
    if (V().isSelective() && !['SR', 'LR', 'NE', 'MD'].includes(S.preset)) add('info', 'POSCAR has selective dynamics but the preset does not move ions.', 'incar');
    if (nat > 40 && String(tags.LREAL).toUpperCase() === '.FALSE.') add('info', `${nat} atoms with LREAL = .FALSE.: LREAL = Auto is usually much faster at this size.`, 'incar');
    const lp = V().getLatticeParams();
    if (S.kpt.scheme === 'Monkhorst-Pack' && Math.abs(lp.gamma - 120) < 1 && currentMesh().slice(0, 2).some((n) => n % 2 === 0)) add('warn', 'Hexagonal cell with an even Monkhorst-Pack mesh breaks the hexagonal symmetry. Use a Gamma-centred mesh.', 'kpoints');
    if (needsNoncollinear()) add('info', 'Non-collinear / SOC run: use the vasp_ncl executable.', 'bundle');
    if (S.ppLibrary !== true) add('info', 'No POTCAR library loaded yet. Load it in the POTCAR step to generate POTCAR here; otherwise make_potcar.sh builds it on your cluster.', 'potcar');
    return out;
  }

  // ---------------------------------------------------------------------------
  // Stepper and layout
  // ---------------------------------------------------------------------------
  function stepDone(id) {
    if (id === 'structure') return !!V().getStructure();
    if (id === 'bundle') return S.bundleDone;
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
    if (stage === 'potcar' || stage === 'incar') ensurePotSelection();
    stageRoot().dataset.stage = stage;
    if (opts.tab && stage === 'structure') V().openRightTab(opts.tab);
    if (opts.tab && stage === 'analyze') S.analyzeTab = opts.tab;
    if (opts.kmode) S.kpt.mode = opts.kmode;
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
  // Step 3: INCAR
  // ---------------------------------------------------------------------------
  stageRenderers.incar = (body) => {
    ensurePotSelection();
    const species = V().getSpecies();
    const tags = buildIncarTags();
    const mm = magmomValue();
    const magMode = V().getMagMode();
    const showU = S.ldau || S.preset === 'PU';
    body.innerHTML = `
      <div class="sp-card">
        <div class="sp-card-title">Calculation type ${helpBtn('Presets', 'Each preset is a VASPKIT-style starting point. Magnetism, DFT+U, SOC, van der Waals and the dipole correction are layered on top, and you can still edit any tag below.')}</div>
        <div class="sp-grid2">
          <label class="sp-field"><span>Preset</span><select id="in-preset" class="v-input">${Object.entries(D.INCAR_PRESETS).map(([id, p]) => `<option value="${id}" ${S.preset === id ? 'selected' : ''}>${id}: ${esc(p.name)}</option>`).join('')}</select></label>
          <label class="sp-field"><span>ENCUT (eV) <label class="sp-inline"><input id="in-encut-auto" type="checkbox" ${S.encutAuto ? 'checked' : ''}/> auto 1.3 x ENMAX</label></span>
            <input id="in-encut" type="number" step="10" class="v-input font-mono-code" value="${S.encut}" ${S.encutAuto ? 'disabled' : ''}/></label>
        </div>
      </div>

      <div class="sp-card">
        <div class="sp-card-title">Magnetism <span class="sp-badge">${mm ? (needsNoncollinear() ? 'non-collinear' : 'collinear, ISPIN = 2') : 'none set'}</span></div>
        <div class="sp-note">Moments come from the 3D model (Structure > Magnetic tab), so INCAR always matches the spins you see. ${mm ? '' : 'No atom carries a moment yet.'}</div>
        ${mm ? `<pre class="code-area sp-pre">MAGMOM = ${esc(mm)}</pre>` : ''}
        <div class="sp-row wrap">
          <button id="in-open-mag" class="v-btn">Edit spins in 3D</button>
          <button id="in-default-mag" class="v-btn">Apply default FM moments</button>
          <span class="text-mut text-[10.5px]">Viewer mode: ${esc(magMode)}</span>
        </div>
        <div class="sp-row wrap" style="margin-top:8px">
          <label class="sp-inline"><input id="in-soc" type="checkbox" ${S.soc ? 'checked' : ''}/> Spin-orbit coupling (LSORBIT)</label>
          <label class="sp-inline"><input id="in-ldau" type="checkbox" ${S.ldau ? 'checked' : ''}/> DFT+U (Dudarev)</label>
          <label class="sp-inline"><input id="in-dipole" type="checkbox" ${S.dipole ? 'checked' : ''}/> Slab dipole correction</label>
          <label class="sp-inline">vdW <select id="in-vdw" class="v-input py-0.5">
            ${[[0, 'none'], [11, 'D3 zero (11)'], [12, 'D3-BJ (12)'], [20, 'TS (20)']].map(([v, l]) => `<option value="${v}" ${Number(S.vdw) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        ${showU ? `<div class="sp-u-grid">${species.map(({ el }) => `<label class="sp-field"><span>U(${esc(el)}) eV ${uOrbital(el) > 0 ? `<i class="text-mut">l=${uOrbital(el)}</i>` : '<i class="text-mut">no d/f</i>'}</span>
          <input data-u="${esc(el)}" type="number" step="0.1" class="v-input font-mono-code" value="${S.uMap[el] ?? defaultU(el)}"/></label>`).join('')}</div>
          <div class="sp-note">Default U values are common literature choices (Dudarev, U_eff = U - J). They are starting points, not universal constants: use the values your project protocol fixes.</div>` : ''}
      </div>

      <div class="sp-card">
        <div class="sp-card-title">Tags <span class="text-mut font-normal">edit a value; clear it to remove the tag</span></div>
        <div class="tag-grid">${Object.entries(tags).map(([k, v]) => `<span class="font-mono-code tag-k">${esc(k)}</span><input class="v-input font-mono-code" data-tk="${esc(k)}" aria-label="INCAR tag ${esc(k)}" value="${esc(v)}"/>${helpBtn(k, D.INCAR_TAGS_HELP[k] || `VASP INCAR tag ${k}. See the VASP wiki.`)}`).join('')}</div>
        <label class="sp-field" style="margin-top:8px"><span>Extra tags (one KEY = value per line)</span><textarea id="in-extra" class="code-area w-full" rows="3" placeholder="KPAR = 4&#10;NCORE = 8">${esc(S.extraTags)}</textarea></label>
      </div>
      ${checkList('incar')}
      ${filePreview('INCAR', getIncar(), S.incarManual !== null ? '<button id="in-regen" class="v-btn py-0.5 px-2 text-[10.5px] text-amber-600">Regenerate (discard hand edits)</button>' : '<button id="in-hand" class="v-btn py-0.5 px-2 text-[10.5px]">Edit by hand</button>')}
    `;
    $('in-preset').onchange = (e) => { S.preset = e.target.value; S.tagEdits = {}; rerenderBody(); };
    $('in-encut-auto').onchange = (e) => { S.encutAuto = e.target.checked; rerenderBody(); };
    $('in-encut').onchange = (e) => { S.encut = Number(e.target.value) || 520; rerenderBody(); };
    $('in-soc').onchange = (e) => { S.soc = e.target.checked; rerenderBody(); };
    $('in-ldau').onchange = (e) => { S.ldau = e.target.checked; rerenderBody(); };
    $('in-dipole').onchange = (e) => { S.dipole = e.target.checked; rerenderBody(); };
    $('in-vdw').onchange = (e) => { S.vdw = Number(e.target.value); rerenderBody(); };
    $('in-open-mag').onclick = () => go('structure', { tab: 'magnetic' });
    $('in-default-mag').onclick = () => {
      const map = {};
      elements().forEach((el) => { const d = D.MAGNETIC_DEFAULTS[el]; if (d) map[el] = d.magmom; });
      if (!Object.keys(map).length) { V().toast('No species with a default moment (3d/4d/5d/4f)'); return; }
      V().setMomentsByElement(map);
      V().toast('Applied default ferromagnetic moments');
    };
    body.querySelectorAll('[data-u]').forEach((i) => { i.onchange = () => { S.uMap[i.dataset.u] = Number(i.value); rerenderBody(); }; });
    body.querySelectorAll('[data-tk]').forEach((i) => { i.onchange = () => { S.tagEdits[i.dataset.tk] = i.value.trim(); rerenderBody(); }; });
    $('in-extra').onchange = (e) => { S.extraTags = e.target.value; rerenderBody(); };
    const ta = body.querySelector('textarea[data-file="INCAR"]');
    const hand = $('in-hand');
    if (hand) hand.onclick = () => { S.incarManual = getIncar(); rerenderBody(); };
    const regen = $('in-regen');
    if (regen) regen.onclick = () => { S.incarManual = null; rerenderBody(); };
    if (S.incarManual !== null) { ta.readOnly = false; ta.oninput = () => { S.incarManual = ta.value; }; ta.onchange = () => renderStepbar(); }
    bindFileButtons(body, () => getIncar());
  };

  // ---------------------------------------------------------------------------
  // Step 4: KPOINTS
  // ---------------------------------------------------------------------------
  stageRenderers.kpoints = (body) => {
    const k = S.kpt;
    const B = recipLengths();
    const m = currentMesh();
    const lp = V().getLatticeParams();
    body.innerHTML = `
      <div class="sp-card">
        <div class="sp-card-title">KPOINTS type</div>
        <div class="seg">${[['spacing', 'Mesh from k-spacing'], ['manual', 'Explicit N1 x N2 x N3']].map(([v, l]) => `<button class="${k.mode === v ? 'on' : ''}" data-kmode="${v}">${l}</button>`).join('')}</div>
      </div>
      <div class="sp-card">
        <div class="sp-grid2">
          ${k.mode === 'spacing' ? `<label class="sp-field"><span>k-spacing (2pi/A) ${helpBtn('k-spacing', 'VASPKIT convention: N_i = max(1, ceil(|b_i| / (2 pi x spacing))), with |b_i| including the 2 pi factor. 0.04 is a quick test, 0.03 is accurate, 0.02 is very accurate. Confirm with the k-convergence test (step 5).')}</span>
            <input id="kp-spc" type="number" step="0.005" min="0.005" class="v-input font-mono-code" value="${k.spacing}"/></label>`
          : `<label class="sp-field"><span>N1 x N2 x N3</span><span class="sp-row">${[0, 1, 2].map((i) => `<input data-kn="${i}" type="number" min="1" class="v-input font-mono-code w-16 text-center" value="${k.manual[i]}"/>`).join('<span>x</span>')}</span></label>`}
          <label class="sp-field"><span>Centring ${helpBtn('Gamma or Monkhorst-Pack', 'Gamma-centred meshes keep the full symmetry of hexagonal cells and always include Gamma. Monkhorst-Pack with even N shifts the grid off Gamma.')}</span>
            <select id="kp-scheme" class="v-input">${['Gamma', 'Monkhorst-Pack'].map((s) => `<option ${k.scheme === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        </div>
        <label class="sp-inline" style="margin-top:8px"><input id="kp-2d" type="checkbox" ${k.force2D ? 'checked' : ''}/> Force N3 = 1 (slab / 2D layer)${looks2D() ? ' <span class="sp-badge">vacuum detected</span>' : ''}</label>
        <div class="sp-stats">
          <div><span>Mesh</span><b class="font-mono-code text-blue-500">${m.join(' x ')}</b></div>
          <div><span>Grid points</span><b class="font-mono-code">${m[0] * m[1] * m[2]}</b></div>
          <div><span>|b1|, |b2|, |b3| (1/A)</span><b class="font-mono-code">${B.map((x) => x.toFixed(3)).join(', ')}</b></div>
          <div><span>a, b, c (A) | gamma</span><b class="font-mono-code">${[lp.a, lp.b, lp.c].map((x) => x.toFixed(3)).join(', ')} | ${lp.gamma.toFixed(1)}</b></div>
        </div>
        <div class="sp-row wrap"><button id="kp-to-conv" class="v-btn">Not sure? Run a k-convergence test (step 5)</button></div>
      </div>
      ${checkList('kpoints')}
      ${filePreview('KPOINTS', getKpoints())}
    `;
    body.querySelectorAll('[data-kmode]').forEach((b) => { b.onclick = () => { S.kpt.mode = b.dataset.kmode; rerenderBody(); }; });
    const spc = $('kp-spc'); if (spc) spc.onchange = () => { S.kpt.spacing = Number(spc.value) || 0.03; rerenderBody(); };
    body.querySelectorAll('[data-kn]').forEach((i) => { i.onchange = () => { S.kpt.manual[Number(i.dataset.kn)] = Math.max(1, parseInt(i.value, 10) || 1); rerenderBody(); }; });
    const sch = $('kp-scheme'); if (sch) sch.onchange = () => { S.kpt.scheme = sch.value; rerenderBody(); };
    const d2 = $('kp-2d'); if (d2) d2.onchange = () => { S.kpt.force2D = d2.checked; rerenderBody(); };
    const tc = $('kp-to-conv'); if (tc) tc.onclick = () => go('kconv');
    const ta = body.querySelector('textarea[data-file="KPOINTS"]');
    bindFileButtons(body, () => ta.value);
  };

  // ---------------------------------------------------------------------------
  // Step 6: Run bundle
  // ---------------------------------------------------------------------------
  const B = { name: 'vasp_job', sched: 'slurm', cores: 32, nodes: 1, walltime: '24:00:00', exe: 'auto', sweep: false, sweepVals: '400 450 500 550 600', kconv: true, potMode: 'real', tab: 'POSCAR' };
  function vaspExe() {
    if (B.exe !== 'auto') return B.exe;
    if (needsNoncollinear()) return 'vasp_ncl';
    if (currentMesh().every((n) => n === 1) && S.kpt.scheme === 'Gamma') return 'vasp_gam';
    return 'vasp_std';
  }
  function jobScript() {
    const run = `mpirun -np ${B.cores * B.nodes} ${vaspExe()} > vasp.out 2>&1`;
    const body = B.sweep
      ? `for d in ENCUT_*/; do\n  (\n    cd "$d" || exit 1\n    [ -f POTCAR ] || bash ../make_potcar.sh || exit 1\n    ${run}\n  )\ndone\n# Summary: last TOTEN of every ENCUT folder\nfor d in ENCUT_*/; do echo "$d $(grep TOTEN "$d"OUTCAR | tail -n 1)"; done`
      : `[ -f POTCAR ] || bash make_potcar.sh || exit 1\n${run}`;
    if (B.sched === 'slurm') return `#!/bin/bash\n#SBATCH -J ${B.name}\n#SBATCH -N ${B.nodes}\n#SBATCH --ntasks-per-node=${B.cores}\n#SBATCH -t ${B.walltime}\n#SBATCH -o slurm.%j.out\n# module load vasp   (adapt to your cluster)\ncd "$SLURM_SUBMIT_DIR"\n${body}\n`;
    if (B.sched === 'pbs') return `#!/bin/bash\n#PBS -N ${B.name}\n#PBS -l nodes=${B.nodes}:ppn=${B.cores}\n#PBS -l walltime=${B.walltime}\n#PBS -j oe\n# module load vasp   (adapt to your cluster)\ncd "$PBS_O_WORKDIR"\n${body}\n`;
    return `#!/bin/bash\n# Local run\n${body}\n`;
  }
  function jobName() { return B.sched === 'slurm' ? 'job.slurm' : B.sched === 'pbs' ? 'job.pbs' : 'run.sh'; }
  function bundleFiles() {
    const f = { POSCAR: V().getPOSCAR(), INCAR: getIncar(), KPOINTS: getKpoints(), 'make_potcar.sh': makePotcarScript() };
    f[jobName()] = jobScript();
    f['README.txt'] = readmeText();
    return f;
  }
  function readmeText() {
    const st = V().getStructure();
    const c = checks();
    return `Material Builder job bundle: ${B.name}
Structure : ${st.name} (${st.atoms.length} atoms)
POTCAR    : ${S.potFunc}: ${elements().map((el) => S.potSel[el]).join(' ')}
INCAR     : ${(D.INCAR_PRESETS[S.preset] || {}).name}, ENCUT = ${buildIncarTags().ENCUT} eV
KPOINTS   : ${currentMesh().join('x') + ' ' + S.kpt.scheme}
Executable: ${vaspExe()}

How to run
1. Copy this folder to the cluster.
2. ${S.ppLibrary === true && B.potMode === 'real' ? 'POTCAR is included.' : 'export VASP_PP_PATH=/path/to/your/pp/library, then bash make_potcar.sh (the job script also does this if POTCAR is missing).'}
3. Submit ${jobName()}.
${B.sweep ? `\nENCUT sweep folders: ${B.sweepVals}. Compare TOTEN per atom; pick the lowest ENCUT within 1 meV/atom of the highest.\n` : ''}${B.kconv ? '\nkpoint_convergence/ holds the k-point convergence test (see its README.md).\n' : ''}
Checks at export
${c.length ? c.map((x) => `- [${x.level}] ${x.msg}`).join('\n') : '- none'}
`;
  }
  stageRenderers.bundle = (body) => {
    const files = bundleFiles();
    if (!files[B.tab]) B.tab = 'POSCAR';
    const c = checks();
    const kc = window.StudioKConv && window.StudioKConv.outputs();
    body.innerHTML = `
      <div class="sp-card">
        <div class="sp-card-title">Pre-flight checks <span class="sp-badge ${c.some((x) => x.level === 'warn') ? 'warn' : 'ok'}">${c.filter((x) => x.level === 'warn').length} warnings</span></div>
        <div class="sp-summary">
          ${[['structure', 'POSCAR', `${V().getStructure().name}, ${V().getStructure().atoms.length} atoms${V().isSelective() ? ', selective dynamics' : ''}`],
             ['potcar', 'POTCAR', `${S.potFunc}: ${elements().map((el) => S.potSel[el]).join(' ')}`],
             ['incar', 'INCAR', `${(D.INCAR_PRESETS[S.preset] || {}).name}, ENCUT ${buildIncarTags().ENCUT} eV`],
             ['kpoints', 'KPOINTS', `${currentMesh().join('x')} ${S.kpt.scheme}`],
             ['kconv', 'k-convergence', kc ? `${kc.meshes.length} meshes ready` : 'not set up (optional)']]
            .map(([st, l, v]) => `<button class="sp-sum-row" data-goto="${st}"><span>${l}</span><b>${esc(v)}</b><i>edit</i></button>`).join('')}
        </div>
        ${c.length ? `<div class="sp-checks">${c.map((x) => `<div class="sp-check ${x.level}"><span>${x.level === 'warn' ? '!' : 'i'}</span><div>${esc(x.msg)}${x.level === 'warn' ? ` <button class="sp-link" data-goto="${x.stage}">fix</button>` : ''}</div></div>`).join('')}</div>` : ''}
      </div>
      <div class="sp-card">
        <div class="sp-card-title">Job settings</div>
        <div class="sp-grid3">
          <label class="sp-field"><span>Job name</span><input id="bn-name" class="v-input" value="${esc(B.name)}"/></label>
          <label class="sp-field"><span>Scheduler</span><select id="bn-sched" class="v-input">${[['slurm', 'Slurm'], ['pbs', 'PBS'], ['local', 'Local shell']].map(([v, l]) => `<option value="${v}" ${B.sched === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="sp-field"><span>Executable</span><select id="bn-exe" class="v-input">${['auto', 'vasp_std', 'vasp_gam', 'vasp_ncl'].map((v) => `<option ${B.exe === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="sp-field"><span>Nodes</span><input id="bn-nodes" type="number" min="1" class="v-input" value="${B.nodes}"/></label>
          <label class="sp-field"><span>Cores per node</span><input id="bn-cores" type="number" min="1" class="v-input" value="${B.cores}"/></label>
          <label class="sp-field"><span>Wall time</span><input id="bn-wall" class="v-input font-mono-code" value="${esc(B.walltime)}"/></label>
        </div>
        <label class="sp-inline"><input id="bn-sweep" type="checkbox" ${B.sweep ? 'checked' : ''}/> ENCUT convergence sweep:</label>
        <input id="bn-sweep-v" class="v-input font-mono-code" aria-label="ENCUT values for the sweep (eV)" value="${esc(B.sweepVals)}" ${B.sweep ? '' : 'disabled'}/>
        <label class="sp-inline" style="margin-top:6px"><input id="bn-kconv" type="checkbox" ${B.kconv && kc ? 'checked' : ''} ${kc ? '' : 'disabled'}/> Include kpoint_convergence/ folder ${kc ? '' : '(set up step 5 first)'}</label>
        <label class="sp-inline" style="margin-top:6px"><input id="bn-realpot" type="checkbox" ${B.potMode === 'real' ? 'checked' : ''} ${S.ppLibrary === true ? '' : 'disabled'}/> Include real POTCAR ${S.ppLibrary === true ? '' : '(load the POTCAR library in step 2 first; make_potcar.sh is used until then)'}</label>
        <div class="sp-row" style="margin-top:10px"><button id="bn-zip" class="v-btn v-btn-primary">Download ${esc(B.name)}.zip</button><span id="bn-st" class="text-[11px] text-mut"></span></div>
      </div>
      <div class="sp-card">
        <div class="seg">${Object.keys(files).map((n) => `<button class="${B.tab === n ? 'on' : ''}" data-btab="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        ${filePreview(B.tab, files[B.tab])}
      </div>`;
    body.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => go(b.dataset.goto); });
    body.querySelectorAll('[data-btab]').forEach((b) => { b.onclick = () => { B.tab = b.dataset.btab; rerenderBody(); }; });
    const bind = (id, key, num) => { $(id).onchange = (e) => { B[key] = num ? Math.max(1, parseInt(e.target.value, 10) || 1) : e.target.value; rerenderBody(); }; };
    bind('bn-name', 'name'); bind('bn-sched', 'sched'); bind('bn-exe', 'exe'); bind('bn-nodes', 'nodes', true); bind('bn-cores', 'cores', true); bind('bn-wall', 'walltime'); bind('bn-sweep-v', 'sweepVals');
    $('bn-sweep').onchange = (e) => { B.sweep = e.target.checked; rerenderBody(); };
    $('bn-kconv').onchange = (e) => { B.kconv = e.target.checked; rerenderBody(); };
    $('bn-realpot').onchange = (e) => { B.potMode = e.target.checked ? 'real' : 'script'; rerenderBody(); };
    bindFileButtons(body, (n) => bundleFiles()[n]);
    $('bn-zip').onclick = async () => {
      if (!window.JSZip) { V().toast('JSZip could not load (offline?)'); return; }
      const st = $('bn-st');
      st.textContent = 'Packing...';
      try {
        const zip = new JSZip();
        const root = zip.folder(B.name);
        const f = bundleFiles();
        let potcar = null;
        if (B.potMode === 'real' && S.ppLibrary === true) potcar = await realPotcar();
        const put = (dir, extraIncar) => {
          dir.file('POSCAR', f.POSCAR);
          dir.file('INCAR', extraIncar || f.INCAR);
          dir.file('KPOINTS', f.KPOINTS);
          if (potcar) dir.file('POTCAR', potcar);
        };
        if (B.sweep) {
          B.sweepVals.split(/[\s,]+/).filter(Boolean).forEach((ec) => {
            const inc = /^\s*ENCUT\s*=.*$/m.test(f.INCAR) ? f.INCAR.replace(/^\s*ENCUT\s*=.*$/m, `ENCUT         = ${ec}`) : f.INCAR + `ENCUT = ${ec}\n`;
            put(root.folder(`ENCUT_${ec}`), inc);
          });
        } else put(root);
        root.file('make_potcar.sh', f['make_potcar.sh'], { unixPermissions: '755' });
        root.file(jobName(), f[jobName()], { unixPermissions: '755' });
        root.file('README.txt', f['README.txt']);
        if (B.kconv && kc) {
          const kd = root.folder('kpoint_convergence');
          kd.file('kpoint_convergence.py', kc.script, { unixPermissions: '755' });
          kd.file('INCAR', kc.incar);
          kd.file('README.md', kc.readme);
          kd.file('POSCAR', kc.poscarText);
          kd.file('make_potcar.sh', f['make_potcar.sh'], { unixPermissions: '755' });
          if (potcar) kd.file('POTCAR', potcar);
        }
        const blob = await zip.generateAsync({ type: 'blob', platform: 'UNIX' });
        downloadBlob(`${B.name}.zip`, blob);
        S.bundleDone = true;
        st.textContent = `Downloaded ${B.name}.zip`;
        renderStepbar();
      } catch (e) { st.textContent = 'Failed: ' + e.message; }
    };
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
    { code: '-', name: 'Download run bundle (.zip)', cat: 'Run', target: { stage: 'bundle' } },
    { code: '-', name: 'Full structural report (CONTCAR)', cat: 'Structure', target: { stage: 'structure', tab: 'symmetry' } },
  ];
  let cmdSel = 0;
  function openCmd() { $('cmd-input').value = ''; cmdSel = 0; renderCmd(); openModal('cmd-modal'); $('cmd-input').focus(); }
  function cmdHits() {
    const q = $('cmd-input').value.trim().toLowerCase();
    return COMMANDS.filter((c) => !q || `${c.code} ${c.name} ${c.cat}`.toLowerCase().includes(q)).slice(0, 14);
  }
  // A target with send opens the structure in a site tool (k-path, Magnetic, Input Builder); others are Builder steps.
  function sendSite(tool) {
    const B = window.SiteBridge;
    if (!B) return;
    const mm = V().hasMagnetism() ? V().getMAGMOM().replace(/^\s*MAGMOM\s*=\s*/i, '') : undefined;
    if (!B.sendTo(tool, V().getPOSCAR(), (V().getStructure() && V().getStructure().name) || 'structure', mm)) V().toast('Browser storage is unavailable, so the hand-off could not be made.');
  }
  function runCmd(c) { closeModal('cmd-modal'); if (c.target.send) { sendSite(c.target.send); return; } go(c.target.stage, c.target); }
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
    $('btn-guide').onclick = () => showHelp('How the Material Builder works', { meaning: 'Work left to right along the steps at the top. 1 Structure: load a sample, the 350-crystal library, or your own POSCAR/CIF; build supercells, slabs and defects; set spins in the Magnetic tab. 2 POTCAR: pick variants, ENCUT follows. 3 INCAR: choose a preset, add magnetism, DFT+U, SOC. 4 KPOINTS: mesh or band path. 5 (optional) k-point convergence test. 6 Run bundle: checks plus a ready-to-submit .zip. 7 Analyze: plot DOS, bands, EOS, phonons and MD.', when: 'Every step reads the live 3D structure, so going back and editing the structure updates all files. Use Find a tool in the toolbar to jump to any VASPKIT function by number or name.' });
    ppRestore().then((n) => {
      if (n) { S.ppLibrary = true; renderStepbar(); if (S.stage === 'potcar' || S.stage === 'bundle') renderStage(); }
      else probeLocalLibrary();
    });
    renderStepbar();
    V().refresh();
  }

  window.Studio = { getIncar, getKpoints, go, setMesh: (m) => { S.kpt.mode = 'manual'; S.kpt.manual = m.slice(); S.visited.add('kpoints'); } };
  window.StudioKit = { importPotcarFiles, maxEnmax, S, V, $, esc, helpBtn, filePreview, bindFileButtons, downloadText, downloadBlob, readFileText, plot, plotLayout, getIncar, getKpoints, currentMesh, go, rerenderBody, renderStepbar, stageRenderers, updateWasmPill, copyText, elements };
  setTimeout(init, 0);
})();
