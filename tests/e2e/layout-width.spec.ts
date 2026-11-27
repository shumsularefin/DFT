// D-126: text inside a card runs to the card's own margin, the right rail never draws one card over another, the
// previous and next buttons stand out from the text, and a Workflow step has the handbook's stage beside its text.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const WIDE = { width: 1650, height: 900 };

/** Every handbook topic and Workflow step whose text has a Markdown table, as its URL. */
function pagesWithTables(): string[] {
  const urls: string[] = [];
  const walk = (dir: string, base: string, prefix: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full, base, prefix);
      else if (e.name.endsWith('.mdx') && /^\|/m.test(readFileSync(full, 'utf8')))
        urls.push(`${prefix}${relative(base, full).replace(/\.mdx$/, '')}/`);
    }
  };
  for (const [dir, prefix] of [
    ['src/content/handbook', '/handbook/'],
    ['src/content/workflow', '/workflow/'],
  ] as const)
    walk(dir, dir, prefix);
  return urls.sort();
}
const PAGES = [
  '/workflow/prepare-inputs/',
  '/workflow/phonons/',
  '/handbook/06-vasp-files/incar/',
  '/handbook/12-properties/phonons/',
];

/** Paragraphs and lists that sit straight in a card, with how far each stops short of the card's content box. */
async function shortfalls(page: Page) {
  return page.evaluate(() => {
    const out: { text: string; short: number }[] = [];
    for (const card of document.querySelectorAll<HTMLElement>('main .card')) {
      const cs = getComputedStyle(card);
      const inner = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      for (const el of card.querySelectorAll<HTMLElement>(':scope > p, :scope > ul, :scope > ol')) {
        if (el.offsetParent === null) continue;
        out.push({
          text: (el.textContent ?? '').trim().slice(0, 40),
          short: inner - el.getBoundingClientRect().width,
        });
      }
    }
    return out;
  });
}

/** Words in table cells (outside code) that the browser split over two lines, and tables wider than their card. */
async function brokenCells(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const table of document.querySelectorAll<HTMLElement>('main .prose table')) {
      if (table.offsetParent === null) continue;
      const card = table.closest<HTMLElement>('.card');
      if (card && table.getBoundingClientRect().right > card.getBoundingClientRect().right + 1)
        out.push(`table wider than its card: ${(table.textContent ?? '').trim().slice(0, 30)}`);
      const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.parentElement?.closest('code')) continue;
        const text = n.textContent ?? '';
        for (const m of text.matchAll(/[^\s\-\u2013/]+/g)) {
          const range = document.createRange();
          range.setStart(n, m.index);
          range.setEnd(n, m.index + m[0].length);
          const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
          if (tops.size > 1) out.push(m[0]);
        }
      }
    }
    return out;
  });
}

test.describe('text width and rails', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only (D-105)');

  for (const url of pagesWithTables())
    test(`${url}: table cells keep each word on one line`, async ({ page }) => {
      await page.setViewportSize(WIDE);
      await page.goto(url);
      await expect(page.locator('main .prose')).toBeVisible();
      const broken = await brokenCells(page);
      expect(broken, broken.slice(0, 8).join(', ')).toEqual([]);
    });

  for (const url of PAGES)
    test(`${url}: paragraphs and lists fill their card`, async ({ page }) => {
      await page.setViewportSize(WIDE);
      await page.goto(url);
      const rows = await shortfalls(page);
      expect(rows.length).toBeGreaterThan(3);
      const short = rows.filter((r) => r.short > 2);
      expect(short, JSON.stringify(short.slice(0, 5))).toEqual([]);
    });

  for (const url of PAGES)
    test(`${url}: rail cards and their entries do not overlap`, async ({ page }) => {
      await page.setViewportSize(WIDE);
      await page.goto(url);
      const overlaps = await page.evaluate(() => {
        const hit = (a: DOMRect, b: DOMRect) =>
          a.left < b.right - 0.5 &&
          b.left < a.right - 0.5 &&
          a.top < b.bottom - 0.5 &&
          b.top < a.bottom - 0.5;
        const found: string[] = [];
        const cards = [...document.querySelectorAll<HTMLElement>('.hb-rail .card')].filter(
          (c) => c.offsetParent,
        );
        cards.forEach((a, i) =>
          cards.slice(i + 1).forEach((b) => {
            if (hit(a.getBoundingClientRect(), b.getBoundingClientRect()))
              found.push(`${a.className} / ${b.className}`);
          }),
        );
        const items = [...document.querySelectorAll<HTMLElement>('.hb-aside li')].filter(
          (l) => l.offsetParent,
        );
        items.forEach((a, i) =>
          items.slice(i + 1).forEach((b) => {
            if (hit(a.getBoundingClientRect(), b.getBoundingClientRect()))
              found.push(`${a.textContent?.trim()} / ${b.textContent?.trim()}`);
          }),
        );
        return found;
      });
      expect(overlaps).toEqual([]);
    });

  test('previous and next are filled buttons: next in the accent colour, set off from the text', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    for (const url of ['/handbook/06-vasp-files/incar/', '/workflow/relaxation/']) {
      await page.goto(url);
      const nav = page.locator('nav.prev-next');
      const look = await nav.evaluate((n) => {
        const next = n.querySelector<HTMLElement>('a[rel="next"]')!;
        const prev = n.querySelector<HTMLElement>('a[rel="prev"]')!;
        const probe = document.createElement('span');
        probe.style.color = 'var(--accent)';
        document.body.append(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return {
          next: getComputedStyle(next).backgroundColor,
          prev: getComputedStyle(prev).backgroundColor,
          page: getComputedStyle(document.body).backgroundColor,
          accent,
          rule: getComputedStyle(n).borderTopStyle,
        };
      });
      expect(look.next).toBe(look.accent);
      expect(look.prev).not.toBe(look.page);
      expect(look.prev).not.toBe('rgba(0, 0, 0, 0)');
      expect(look.rule).toBe('solid');
    }
  });
});

test.describe('workflow stage', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only (D-105)');

  for (const url of ['/workflow/', '/workflow/relaxation/', '/workflow/band-structure/'])
    test(`${url}: the 3D stage sits beside the text`, async ({ page }) => {
      await page.setViewportSize(WIDE);
      await page.goto(url);
      const stage = page.locator('[data-stage]');
      await expect(stage).toHaveCount(1);
      await expect(stage).toBeVisible();
      const text = (await page.locator('.topic-text').boundingBox())!;
      const box = (await stage.boundingBox())!;
      expect(box.x).toBeGreaterThan(text.x + text.width - 1);
      await expect(stage.locator('.stage-state').first()).toBeVisible();
    });
});
