/* DFT Studio <-> DFT Handbook integration (D-100). Loaded last, after the Studio scripts.
 * Uses window.SiteBridge (src/components/studio/bridge.ts): the site's verified readers, structure checks,
 * clean-up operations, INCAR rules and tool hand-offs. Nothing here computes science of its own.
 */
(() => {
  'use strict';
  const B = window.SiteBridge;
  const V = window.VESTA;
  const T = window.StudioKit;
  if (!B || !V || !T) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const embed = !!window.STUDIO_EMBED;
  const name = () => (V.getStructure() && V.getStructure().name) || 'structure';

  // ---------------------------------------------------------------- handbook templates in the structure menu
  const og = $('site-templates');
  if (og) og.innerHTML = B.templates.map((t) => `<option value="site:${esc(t.id)}">${esc(t.label)}</option>`).join('');

  // ---------------------------------------------------------------- incoming hand-off from a site tool
  const inc = B.takeIncoming();
  if (inc) {
    V.loadText(inc.poscar, 'POSCAR', inc.label);
    if (inc.magmom) {
      const vals = [];
      inc.magmom.trim().split(/\s+/).forEach((tok) => {
        const m = /^(\d+)\*(.+)$/.exec(tok);
        if (m) for (let i = 0; i < Number(m[1]); i++) vals.push(Number(m[2]));
        else vals.push(Number(tok));
      });
      if (V.setMomentsByIndex(vals)) V.log('MAGMOM from the hand-off applied to the atoms', 'accent');
    }
    V.log(`Opened "${inc.label}" from the site (${inc.from})`, 'accent');
  }

  // ---------------------------------------------------------------- structure checks B001 to B012
  let issues = [];
  let lastPoscar = '';
  function runChecks() {
    const p = V.getPOSCAR();
    if (p === lastPoscar) return;
    lastPoscar = p;
    try { issues = B.check(p); } catch (e) { issues = []; }
    const err = issues.filter((i) => i.severity === 'error').length;
    const warn = issues.filter((i) => i.severity === 'warning').length;
    const c = $('site-checks-count');
    if (c) {
      c.textContent = String(err + warn);
      const btn = $('btn-site-checks');
      btn.classList.toggle('checks-err', err > 0);
      btn.classList.toggle('checks-warn', err === 0 && warn > 0);
      btn.setAttribute('aria-label', `Structure checks: ${err} error${err === 1 ? '' : 's'}, ${warn} warning${warn === 1 ? '' : 's'}`);
    }
    const sum = $('checks-summary');
    if (sum) sum.textContent = issues.length ? `${err} error, ${warn} warning, ${issues.length - err - warn} info` : 'all clear';
    const list = $('checks-list');
    if (!list) return;
    if (!issues.length) { list.innerHTML = '<li class="check-ok">No problems found by B001 to B012.</li>'; return; }
    list.innerHTML = issues.map((i, k) => `
      <li class="check-item sev-${i.severity}">
        <div class="check-head"><b class="font-mono-code">${esc(i.code)}</b> <span>${esc(i.title)}</span>
          ${i.heuristic ? '<span class="heur-badge">Heuristic</span>' : ''}</div>
        <p>${esc(i.why)}</p>
        <div class="check-actions">
          ${i.atoms.length ? `<button type="button" class="v-btn py-0.5 px-2 text-[10.5px]" data-show="${k}">Show atoms</button>` : ''}
          ${i.fixes.map((f, j) => `<button type="button" class="v-btn py-0.5 px-2 text-[10.5px]" data-fix="${k}:${j}">${esc(f)}</button>`).join('')}
          <span class="check-src">Source ${esc(i.sources.join(', '))}</span>
        </div>
      </li>`).join('');
    list.querySelectorAll('[data-fix]').forEach((b) => {
      b.onclick = () => {
        const [k, j] = b.dataset.fix.split(':').map(Number);
        const out = B.applyFix(V.getPOSCAR(), k, j);
        if (out) { V.applyPOSCAR(out, `Applied fix: ${b.textContent}`); V.toast(b.textContent); }
      };
    });
    list.querySelectorAll('[data-show]').forEach((b) => {
      b.onclick = () => V.selectAtoms(V.poscarToAtomIndex(issues[Number(b.dataset.show)].atoms));
    });
  }
  V.onChange(runChecks);
  setTimeout(runChecks, 50);
  const chk = $('btn-site-checks');
  if (chk) chk.onclick = () => {
    const rw = $('right-workbench');
    if (rw && rw.classList.contains('hidden')) $('btn-toggle-right').click();
    V.openRightTab('checks');
  };

  // ---------------------------------------------------------------- clean-up operations (site ops.ts)
  const opStatus = $('ops-status');
  [['op-wrap', 'wrap'], ['op-merge', 'merge'], ['op-relax', 'relax']].forEach(([id, op]) => {
    const b = $(id);
    if (!b) return;
    b.onclick = () => {
      try {
        const r = B.op(op, V.getPOSCAR());
        if (r.changed) V.applyPOSCAR(r.poscar, r.description);
        if (opStatus) opStatus.textContent = [r.description, ...r.notes].join(' ');
        V.toast(r.changed ? r.description : 'Nothing to change');
      } catch (e) { if (opStatus) opStatus.textContent = `Could not run: ${e.message}`; }
    };
  });

  // ---------------------------------------------------------------- periodic table picker
  const grid = $('pt-grid');
  if (grid) {
    grid.innerHTML = B.elements.map((e) => `<button type="button" class="pt-cell" style="grid-row:${e.row};grid-column:${e.col}" data-el="${e.symbol}" title="${esc(e.name)} (Z = ${e.Z})" aria-label="${e.symbol}, ${esc(e.name)}">${e.symbol}</button>`).join('');
    grid.onclick = (ev) => {
      const b = ev.target.closest('[data-el]');
      if (!b) return;
      const el = b.dataset.el;
      grid.querySelectorAll('.pt-cell').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      $('pt-picked').textContent = el;
      ['add-el', 'edit-el-input'].forEach((id) => { const i = $(id); if (i) i.value = el; });
      V.toast(`${el} picked: use Atoms > Add or Edit`);
    };
  }

  // ---------------------------------------------------------------- export gate (errors need a reason)
  window.StudioExportGate = (poscar, download) => {
    const g = B.gate(poscar);
    if (g.allowed) { download(poscar); return; }
    const dlg = $('gate-modal');
    $('gate-list').innerHTML = g.blocking.map((b) => `<li>${esc(b)}</li>`).join('');
    $('gate-reason').value = '';
    dlg.classList.remove('hidden'); dlg.classList.add('flex');
    $('gate-reason').focus();
    $('gate-ok').onclick = () => {
      const r = B.gate(poscar, $('gate-reason').value);
      if (!r.allowed) { $('gate-reason').focus(); return; }
      dlg.classList.add('hidden'); dlg.classList.remove('flex');
      download(r.poscar);
    };
  };
  const gateClose = () => { const d = $('gate-modal'); d.classList.add('hidden'); d.classList.remove('flex'); };
  document.querySelectorAll('[data-close="gate-modal"]').forEach((b) => { b.onclick = gateClose; });

  // ---------------------------------------------------------------- send to a site tool
  const menu = $('send-site-menu');
  const sendBtn = $('btn-send-site');
  function closeMenu() { menu.classList.add('hidden'); sendBtn.setAttribute('aria-expanded', 'false'); }
  if (menu && sendBtn) {
    const items = B.tools.map((t) => `<button type="button" role="menuitem" class="send-item" data-tool="${t.id}"><b>${esc(t.label)}</b><span>${esc(t.why)}</span></button>`);
    if (embed) items.push('<a role="menuitem" class="send-item" href="/dft-studio/" target="_top"><b>Open DFT Studio full screen</b><span>The same structure, without the page around it.</span></a>');
    menu.innerHTML = items.join('');
    sendBtn.onclick = (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('hidden') === false;
      sendBtn.setAttribute('aria-expanded', String(open));
      if (open) { const f = menu.querySelector('[role="menuitem"]'); if (f) f.focus(); }
    };
    menu.onclick = (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b) return;
      if (embed && b.tagName === 'A') return;
      const mm = V.hasMagnetism() ? V.getMAGMOM().replace(/^\s*MAGMOM\s*=\s*/i, '') : undefined;
      if (!B.sendTo(b.dataset.tool, V.getPOSCAR(), name(), mm)) V.toast('Browser storage is unavailable, so the hand-off could not be made.');
    };
    menu.onkeydown = (e) => {
      const its = [...menu.querySelectorAll('[role="menuitem"]')];
      const i = its.indexOf(document.activeElement);
      if (e.key === 'Escape') { closeMenu(); sendBtn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); its[(i + 1) % its.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); its[(i - 1 + its.length) % its.length].focus(); }
    };
    document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== sendBtn) closeMenu(); });
  }
  // In the builder frame the full-screen link should keep the structure: hand it over first.
  if (embed && menu) {
    menu.addEventListener('click', (e) => {
      const a = e.target.closest('a[href="/dft-studio/"]');
      if (!a) return;
      try { sessionStorage.setItem('dft:studio-carry', V.getPOSCAR()); } catch (err) { /* storage off: open the default */ }
    }, true);
  }
  if (!embed) {
    try {
      const carry = sessionStorage.getItem('dft:studio-carry');
      if (carry) { sessionStorage.removeItem('dft:studio-carry'); if (!inc) V.loadText(carry, 'POSCAR', 'Structure from the builder'); }
    } catch (err) { /* storage off */ }
  }

  // ---------------------------------------------------------------- workflow steps link to the verified site tools
  const card = (title, html) => `<div class="sp-card site-card"><div class="sp-card-title">${esc(title)}</div>${html}</div>`;
  const link = (url, label, why) => `<a class="site-link" href="${url}" target="_top"><b>${esc(label)}</b><span>${esc(why)}</span></a>`;
  const toolBtn = (id, label, why) => `<button type="button" class="site-link" data-send="${id}"><b>${esc(label)}</b><span>${esc(why)}</span></button>`;
  function bindSend(root) {
    root.querySelectorAll('[data-send]').forEach((b) => {
      b.onclick = () => {
        const mm = V.hasMagnetism() ? V.getMAGMOM().replace(/^\s*MAGMOM\s*=\s*/i, '') : undefined;
        B.sendTo(b.dataset.send, V.getPOSCAR(), name(), mm);
      };
    });
  }
  function wrap(stage, extra) {
    const orig = T.stageRenderers[stage];
    if (!orig) return;
    T.stageRenderers[stage] = (body) => {
      orig(body);
      const div = document.createElement('div');
      div.innerHTML = extra();
      body.appendChild(div);
      bindSend(div);
      if (stage === 'kconv') bindKconv(div);
    };
  }
  const tool = (id) => B.tools.find((t) => t.id === id);

  wrap('incar', () => {
    let rows = [];
    try { rows = B.validateIncar(T.getIncar(), V.getPOSCAR(), T.maxEnmax() || undefined); } catch (e) { rows = []; }
    const list = rows.length
      ? `<ul class="checks-list">${rows.map((r) => `<li class="check-item sev-${r.severity === 'warn' ? 'warning' : r.severity}"><div class="check-head"><b class="font-mono-code">${esc(r.rule)}</b> <span>${esc(r.title)}</span></div><p>${esc(r.why)}</p></li>`).join('')}</ul>`
      : '<p class="sp-note">No problems found by the site rules.</p>';
    return card('Handbook validation rules (V001 and up)', `<p class="sp-note">The handbook's INCAR engine checked this INCAR against the structure: each rule is sourced and unit tested. Studio presets are VASPKIT-style starting points; these rules are the cross-check.</p>${list}<div class="site-links">${toolBtn('input-builder', 'Continue in the Input Builder', tool('input-builder').why)}</div>`);
  });
  wrap('kpoints', () => card('Verified k-path', `<p class="sp-note">Studio's built-in paths are quick look-ups. The handbook k-path tool computes HPKOT or Setyawan-Curtarolo paths with golden tests on 39 structures and shows the exact Brillouin zone.</p><div class="site-links">${toolBtn('kpath', 'Open this structure in the k-path tool', tool('kpath').why)}${link('/handbook/', 'Why the mesh and path matter', 'Handbook modules on k-points and band structures.')}</div>`));
  wrap('kconv', () => card('Plot the series on the site', `<p class="sp-note">After the run, load kpoint_convergence.csv above, then send the rows to the convergence plotter for the energy and pressure plots with a threshold you choose.</p><div class="site-links"><button type="button" class="site-link" id="kc-send-plot"><b>Send results to the convergence plotter</b><span>Needs the CSV loaded above.</span></button>${link('/tools/convergence/', 'Open the convergence plotter', 'Drop OSZICAR or OUTCAR files from any series.')}</div><p id="kc-send-st" class="sp-note" role="status"></p>`));
  function bindKconv(root) {
    const b = root.querySelector('#kc-send-plot');
    if (!b) return;
    b.onclick = () => {
      const st = root.querySelector('#kc-send-st');
      const f = T.kconvCsv && T.kconvCsv();
      if (!f) { st.textContent = 'Load kpoint_convergence.csv first (Results card above).'; return; }
      let rows;
      try { rows = T.kconvParse(f.text); } catch (e) { st.textContent = e.message; return; }
      const nat = V.getStructure().atoms.length;
      const csv = ['label,energy,natoms,pressure', ...rows.filter((r) => Number.isFinite(r.E_per_atom_eV)).map((r) => {
        const m = String(r.mesh).replace(/[^0-9x]/gi, 'x').replace(/x+/g, 'x');
        return `kpt_${m},${(r.E_per_atom_eV * nat).toFixed(8)},${nat},${Number.isFinite(r.pressure_kB) ? r.pressure_kB : ''}`;
      })].join('\n');
      if (!B.sendSeries(csv, `k-point series of ${name()}`)) st.textContent = 'Browser storage is unavailable.';
    };
  }
  wrap('bundle', () => card('Before you submit', `<p class="sp-note">The Input Builder adds sourced job-script templates, a share link and the full rule check; the planner estimates the cost.</p><div class="site-links">${toolBtn('input-builder', 'Build the inputs in the Input Builder', tool('input-builder').why)}${toolBtn('planner', 'Estimate cost in the planner', tool('planner').why)}${toolBtn('magnetic', 'Enumerate magnetic orderings', tool('magnetic').why)}</div>`));
  wrap('analyze', () => card('Verified analysis on the site', `<p class="sp-note">Studio's analyzers are quick looks, not yet checked against golden references (marked Heuristic). The tools below read the same files with parsers tested against pymatgen or numpy.</p><div class="site-links">${B.analyzers.map((a) => link(a.url, a.label, a.why)).join('')}</div>`));

  // Label Studio's own analyzers honestly.
  const origAnalyze = T.stageRenderers.analyze;
  if (origAnalyze) {
    T.stageRenderers.analyze = (body) => {
      origAnalyze(body);
      const head = body.querySelector('.sp-card-title');
      if (head && !head.querySelector('.heur-badge')) head.insertAdjacentHTML('beforeend', ' <span class="heur-badge">Heuristic</span>');
    };
  }
  window.dispatchEvent(new Event('studio-site-linked'));

  // ---------------------------------------------------------------- one main landmark at every step
  // On the Analyze step (and every step on narrow screens) the 3D viewer's <main> is hidden, so the step pane
  // becomes the page's main region; otherwise it is a labelled region beside the viewer.
  const pane = $('stage-pane');
  const center = $('center-main');
  if (pane && center) {
    const syncMain = () => {
      const viewerHidden = getComputedStyle(center).display === 'none';
      pane.setAttribute('role', viewerHidden ? 'main' : 'region');
      pane.setAttribute('aria-label', 'Workflow step');
    };
    new MutationObserver(syncMain).observe(document.body, { attributes: true, attributeFilter: ['data-stage'] });
    window.addEventListener('resize', syncMain);
    syncMain();
  }

  // ---------------------------------------------------------------- accessible names for form controls
  // Many Studio controls sit under a visible caption that is not a <label>. Give each unnamed control the
  // caption a sighted user reads (its title, placeholder, or the caption text just before it in its group).
  const captionFor = (el) => {
    const t = el.getAttribute('title') || el.getAttribute('placeholder');
    if (t) return t;
    for (let node = el, depth = 0; node && depth < 3; node = node.parentElement, depth++) {
      for (let prev = node.previousElementSibling; prev; prev = prev.previousElementSibling) {
        if (prev.matches('input,select,textarea,button')) continue;
        const txt = (prev.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt && txt.length <= 60 && !prev.querySelector('input,select,textarea')) return txt;
      }
    }
    return '';
  };
  const nameControls = (root) => {
    root.querySelectorAll('input:not([type=hidden]),select,textarea').forEach((el) => {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.labels && el.labels.length)) return;
      const c = captionFor(el);
      if (c) el.setAttribute('aria-label', c);
    });
  };
  nameControls(document);
  let namePending = false;
  new MutationObserver(() => {
    if (namePending) return;
    namePending = true;
    queueMicrotask(() => { namePending = false; nameControls(document); });
  }).observe(document.body, { childList: true, subtree: true });
})();
