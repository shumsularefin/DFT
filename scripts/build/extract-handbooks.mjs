#!/usr/bin/env node
// Extracts structured data from the author's two handbooks (S-041, S-042) into scripts/__generated__/.
// Run: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/build/extract-handbooks.mjs
// Output is deterministic (no timestamps), so re-running gives identical files. Fails loudly if the handbooks change shape.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (n) => pathToFileURL(resolve(root, 'docs', 'source-material', n)).href;
const outDir = resolve(root, 'scripts', '__generated__');

const EXPECT = {
  field: { OUT: 16, INP: 4, TAGS: 24, TROUBLE: 22, RECIPES: 7 },
  dictRows: 53,
  errorRows: 20,
  incarBlocks: 15,
  incar: 11,
  fragment: 2,
  phonopy: 2,
  protocolSteps: 5,
};

function fail(msg) {
  console.error(`extract-handbooks: ${msg}`);
  process.exit(1);
}

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
});
try {
  const page = await browser.newPage();

  // ---- Field Handbook: data constants -------------------------------------------------------------------
  await page.goto(src('VASP_Field_Handbook.html'));
  const field = await page.evaluate(() => ({ OUT, INP, TAGS, TROUBLE, RECIPES }));
  // TROUBLE is grouped by phase: count items, not groups.
  const counts = {
    OUT: field.OUT.length,
    INP: field.INP.length,
    TAGS: field.TAGS.length,
    TROUBLE: field.TROUBLE.reduce((n, g) => n + g.items.length, 0),
    RECIPES: field.RECIPES.length,
  };
  for (const [k, v] of Object.entries(EXPECT.field)) {
    if (counts[k] !== v) fail(`Field Handbook ${k}: expected ${v}, found ${counts[k]}`);
  }
  const fixedCount = (arr) => arr.reduce((n, e) => n + (e.fixed ? e.fixed.length : 0), 0);
  field.counts = counts;
  field.fixedCounts = {
    OUT: fixedCount(field.OUT),
    INP: fixedCount(field.INP),
    TAGS: fixedCount(field.TAGS),
    TROUBLE: fixedCount(field.TROUBLE.flatMap((g) => g.items)),
    RECIPES: fixedCount(field.RECIPES),
  };

  // ---- Workflow Handbook ---------------------------------------------------------------------------------
  await page.goto(src('VASP_Workflow_Handbook.html'));
  const wf = await page.evaluate(() => {
    const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    const dictionary = [...document.querySelectorAll('#dicttab tbody tr')].map((tr) => {
      const c = tr.children;
      const cat = c[0].querySelector('.cat');
      return {
        tags: [...c[0].querySelectorAll('code')].map((x) => x.textContent.trim()),
        categories: txt(cat).split(' ').filter(Boolean),
        controls: txt(c[1]),
        typical: txt(c[2]),
        why: txt(c[3]),
      };
    });
    const errors = [...document.querySelectorAll('#errtab tbody tr')].map((tr) => ({
      message: txt(tr.children[0]),
      cause: txt(tr.children[1]),
      fix: txt(tr.children[2]),
    }));
    const incarBlocks = [...document.querySelectorAll('figure.file')]
      .filter((f) => f.querySelector('pre.incar'))
      .map((f) => {
        const cap = f.querySelector('figcaption');
        const strong = txt(cap.querySelector('strong'));
        const detail = txt(cap).replace(/Copy$/, '').trim();
        return {
          name: strong,
          caption: detail,
          section: f.closest('section')?.id ?? null,
          text: f.querySelector('pre.incar').textContent.replace(/\s+$/, ''),
        };
      });
    const protocol = [...document.querySelectorAll('#yours .audit article')].map((a) => ({
      step: Number(txt(a.querySelector('.st'))),
      title: txt(a.querySelector('h3')),
      yours: txt(a.querySelector('.yours')),
      notes: [...a.querySelectorAll('li')].map((li) => ({
        pill: txt(li.querySelector('.pill')),
        text: txt(li)
          .replace(txt(li.querySelector('.pill')), '')
          .trim(),
      })),
    }));
    const tables = [];
    for (const id of ['files', 'restart', 'vaspkit']) {
      const sec = document.getElementById(id);
      let heading = '';
      for (const el of sec.querySelectorAll('h3, h4, table')) {
        if (el.tagName === 'TABLE') {
          const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => txt(c)));
          tables.push({ section: id, heading, headers: rows[0], rows: rows.slice(1) });
        } else heading = txt(el);
      }
    }
    return { dictionary, errors, incarBlocks, protocol, tables };
  });

  const classify = (b) =>
    /^(band|mesh)\.conf$/.test(b.name)
      ? 'phonopy-config'
      : /^MAGMOM$/.test(b.name) || /\+U block/.test(b.caption)
        ? 'fragment'
        : 'incar';
  wf.incarBlocks = wf.incarBlocks.map((b) => ({ ...b, kind: classify(b) }));
  const kinds = (k) => wf.incarBlocks.filter((b) => b.kind === k).length;
  if (wf.dictionary.length !== EXPECT.dictRows)
    fail(`dictionary rows: expected ${EXPECT.dictRows}, found ${wf.dictionary.length}`);
  if (wf.errors.length !== EXPECT.errorRows)
    fail(`error rows: expected ${EXPECT.errorRows}, found ${wf.errors.length}`);
  if (wf.incarBlocks.length !== EXPECT.incarBlocks)
    fail(`pre.incar blocks: expected ${EXPECT.incarBlocks}, found ${wf.incarBlocks.length}`);
  if (
    kinds('incar') !== EXPECT.incar ||
    kinds('fragment') !== EXPECT.fragment ||
    kinds('phonopy-config') !== EXPECT.phonopy
  ) {
    fail(
      `block classes: incar ${kinds('incar')}, fragment ${kinds('fragment')}, phonopy ${kinds('phonopy-config')}`,
    );
  }
  if (wf.protocol.length !== EXPECT.protocolSteps)
    fail(`protocol steps: expected ${EXPECT.protocolSteps}, found ${wf.protocol.length}`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'field-handbook.json'), JSON.stringify(field, null, 1) + '\n');
  writeFileSync(resolve(outDir, 'workflow-handbook.json'), JSON.stringify(wf, null, 1) + '\n');
  console.log(
    'extract-handbooks: ok',
    JSON.stringify({
      ...counts,
      dict: wf.dictionary.length,
      errors: wf.errors.length,
      blocks: wf.incarBlocks.length,
    }),
  );
} finally {
  await browser.close();
}
