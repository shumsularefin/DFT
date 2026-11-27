import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

// Material Builder workspace (DFT Studio code, D-103, hosted natively since D-105): boots in the site shell under
// the production headers from firebase.json (no iframe), follows the site theme, is axe clean on every step,
// runs the site's structure checks, and hands structures and results to and from the site tools.
const fb = JSON.parse(readFileSync('firebase.json', 'utf8')) as {
  hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] };
};
const header = (source: string, key: string) =>
  fb.hosting.headers.find((h) => h.source === source)!.headers.find((h) => h.key === key)!.value;
const STUDIO_CSP = header('/builder{,/,/index.html}', 'Content-Security-Policy');
const SITE_CSP = header('!/builder{,/,/index.html}', 'Content-Security-Policy');

/** Serve every page with the CSP Firebase sends in production (the local server sends none). */
async function withProductionCsp(page: Page) {
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.resourceType() !== 'document') return route.continue();
    const resp = await route.fetch();
    const path = new URL(req.url()).pathname;
    const csp = path === '/builder/' ? STUDIO_CSP : SITE_CSP;
    await route.fulfill({ response: resp, headers: { ...resp.headers(), 'content-security-policy': csp } });
  });
}

type StudioWindow = Window & {
  VESTA: { getStructure(): { name: string; atoms: unknown[] }; loadText(t: string, n?: string): void };
  StudioKit: { go(stage: string): void };
  SiteBridge: { sendSeries(csv: string, label: string): boolean };
};

async function openStudio(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    window.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP ${e.violatedDirective} blocked ${e.blockedURI}`),
    );
  });
  await page.goto('/builder/');
  await page.locator('html[data-studio-ready="true"]').waitFor({ timeout: 30_000 });
}

const atoms = (page: Page) =>
  page.evaluate(() => (window as unknown as StudioWindow).VESTA.getStructure().atoms.length);

const TWO_NA = 'two Na\n1.0\n10 0 0\n0 10 0\n0 0 10\nNa\n2\nDirect\n0.2 0.2 0.2\n0.24 0.2 0.2\n';

test.describe('Material Builder workspace (Studio)', () => {
  test('boots under the production CSP with a sized 3D canvas, no errors and no sideways scroll', async ({
    page,
  }) => {
    await withProductionCsp(page);
    const errors: string[] = [];
    await openStudio(page, errors);
    expect(await atoms(page)).toBe(8);
    const size = await page.evaluate(() => {
      const c = document.querySelector('#three-container canvas') as HTMLCanvasElement;
      return [c.width, c.height];
    });
    expect(size[0]).toBeGreaterThan(100);
    expect(size[1]).toBeGreaterThan(100);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
    // Native, not framed (D-105): one page, the site shell around the workspace, one main landmark.
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('main .studio-root #three-container canvas')).toBeVisible();
    // The workspace has no theme switch or home link of its own; the site shell provides them.
    await expect(page.locator('#btn-theme, #site-home')).toHaveCount(0);
  });

  test('follows the site theme: the site toggle changes the panels and the 3D viewer', async ({ page }) => {
    await openStudio(page, []);
    const panelBg = () =>
      page.locator('#right-workbench').evaluate((el) => getComputedStyle(el).backgroundColor);
    const siteSurface = () =>
      page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--surface)';
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
    const viewerDark = () =>
      page.evaluate(() => (window as unknown as { VESTA: { isDark(): boolean } }).VESTA.isDark());
    const before = await panelBg();
    expect(before).toBe(await siteSurface());
    const wasDark = await viewerDark();
    await page.locator('[data-theme-toggle]').first().click();
    await expect.poll(panelBg).not.toBe(before);
    expect(await panelBg()).toBe(await siteSurface());
    await expect.poll(viewerDark).toBe(!wasDark);
    await page.locator('[data-theme-toggle]').first().click();
    await expect.poll(panelBg).toBe(before);
    await expect.poll(viewerDark).toBe(wasDark);
  });

  test('Ctrl+K opens the site palette; the tool finder is the "Find a tool" button', async ({ page }) => {
    await openStudio(page, []);
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    await expect(page.locator('#cmd-modal')).toBeHidden();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Find a tool' }).click();
    await expect(page.locator('#cmd-modal')).toBeVisible();
  });

  for (const theme of ['light', 'dark']) {
    test(`every workflow step and panel tab is axe clean, ${theme} theme`, async ({ page }) => {
      test.setTimeout(240_000); // 7 steps + 10 panel tabs axe runs; CI runners are about 2x slower
      await page.emulateMedia({ colorScheme: 'light' });
      await openStudio(page, []);
      // The site's theme toggle drives the workspace (D-105).
      if (theme === 'dark') await page.locator('[data-theme-toggle]').first().click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? 'light'))
        .toBe(theme);
      for (const stage of ['structure', 'potcar', 'incar', 'kpoints', 'kconv', 'bundle', 'analyze']) {
        await page.evaluate((s) => (window as unknown as StudioWindow).StudioKit.go(s), stage);
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations.map((v) => `${theme} ${stage} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      }
      // Every panel tab of the structure step (the right workbench is a drawer on small screens).
      await page.evaluate(() => (window as unknown as StudioWindow).StudioKit.go('structure'));
      if (!(await page.locator('#right-workbench').isVisible()))
        await page.locator('#btn-toggle-right').click();
      for (const tab of ['supercell', 'catalyst', 'symmetry', 'magnetic', 'atoms', 'vasp', 'checks']) {
        await page.locator(`[data-right-tab="${tab}"]`).click();
        const r = await new AxeBuilder({ page }).include('#right-workbench').analyze();
        expect(r.violations.map((v) => `${theme} right:${tab} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      }
      await page.locator('#btn-toggle-right').click();
      if (!(await page.locator('#left-sidebar').isVisible())) await page.locator('#btn-toggle-left').click();
      for (const tab of ['style', 'objects', 'lattice']) {
        await page.locator(`[data-left-tab="${tab}"]`).click();
        const r = await new AxeBuilder({ page }).include('#left-sidebar').analyze();
        expect(r.violations.map((v) => `${theme} left:${tab} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
      }
      await page.locator('#btn-toggle-left').click();
    });
  }

  test('site structure checks: an overlap shows in the badge, the fix clears it, export needs a reason', async ({
    page,
  }) => {
    await openStudio(page, []);
    await page.evaluate((t) => (window as unknown as StudioWindow).VESTA.loadText(t, 'POSCAR'), TWO_NA);
    await expect(page.locator('#site-checks-count')).toHaveText('1');
    await expect(page.locator('#btn-site-checks')).toHaveAttribute('aria-label', /1 error/);

    // Export is gated: the dialog lists B001 and only proceeds with a reason.
    await page.locator('#btn-export-poscar').click();
    await expect(page.locator('#gate-list')).toContainText('B001');
    await page.locator('#gate-ok').click();
    await expect(page.locator('#gate-modal')).toBeVisible();
    await page.locator('#gate-reason').fill('testing a dimer');
    const download = page.waitForEvent('download');
    await page.locator('#gate-ok').click();
    const file = await (await download).path();
    expect(readFileSync(file, 'utf8').split('\n')[0]).toContain('testing a dimer');

    await page.locator('#btn-site-checks').click();
    await page.locator('[data-fix="0:0"]').click(); // Merge to the midpoint
    await expect(page.locator('#site-checks-count')).toHaveText('0');
    expect(await atoms(page)).toBe(1);
    await page.keyboard.press('Control+z');
    await expect.poll(() => atoms(page)).toBe(2);
  });

  test('a structure handed over by a site tool opens in the workspace, and the workspace sends it on', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('test:sent')) return;
      sessionStorage.setItem('test:sent', '1');
      sessionStorage.setItem(
        'dft:handoff',
        JSON.stringify({
          v: 1,
          kind: 'structure',
          from: 'kpath',
          label: 'Cu fcc test',
          structure: {
            lattice: [
              [0, 1.8, 1.8],
              [1.8, 0, 1.8],
              [1.8, 1.8, 0],
            ],
            species: ['Cu'],
            frac: [[0, 0, 0]],
          },
        }),
      );
    });
    await openStudio(page, []);
    await expect.poll(() => atoms(page)).toBe(1);
    await page.locator('#btn-send-site').click();
    await page.getByRole('menuitem', { name: /Input Builder/ }).click();
    await page.waitForURL('**/tools/input-builder/**');
    // The Input Builder reads the structure Studio sent: one Cu site in the fcc primitive cell.
    const facts = page.locator('.ib-facts');
    await expect(facts).toContainText('Cu');
    await expect(facts.locator('dt:has-text("Atoms") + dd')).toHaveText('1');
  });

  test('k-point convergence rows go to the convergence plotter', async ({ page }) => {
    await openStudio(page, []);
    await page.evaluate(() =>
      (window as unknown as StudioWindow).SiteBridge.sendSeries(
        'label,energy,natoms,pressure\nkpt_4x4x4,-16.0,2,1.5\nkpt_6x6x6,-16.2,2,0.5\nkpt_8x8x8,-16.21,2,0.2\n',
        'k-point convergence',
      ),
    );
    await page.waitForURL('**/tools/convergence/**');
    await expect(page.getByText('Loaded k-point convergence from the Material Builder.')).toBeVisible();
  });
});
