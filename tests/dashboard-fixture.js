import assert from 'node:assert/strict';
import { resolve } from 'node:path';
export async function dashboardSuite(browser, root = resolve('public-demo')) {
  const outputs = [];
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route('https://dashboard.test/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (!['/', '/index.html', '/app.js', '/style.css', '/data/latest.json', '/data/history.json'].includes(pathname)) return route.fulfill({ status: 404 });
        await route.fulfill({ path: root + (pathname === '/' ? '/index.html' : pathname) });
      });
      await page.goto('https://dashboard.test/');
      await page.waitForSelector('#kpis .kpi');
      assert.equal(await page.locator('#demo-banner').isVisible(), true);
      assert.equal(await page.locator('#history tr').count(), 42);
      assert.equal(await page.locator('svg.chart').count(), 2);
      assert.equal(await page.locator('.chart-point').count(), 84);
      await page.locator('#timeline button').first().click();
      assert.ok((await page.locator('#selection').innerText()).includes('demo-001'));
      await page.locator('#state-filter').selectOption('failed');
      assert.equal(await page.locator('#no-checks').isVisible(), true);
      await page.locator('#state-filter').selectOption('all');
      assert.equal(await page.locator('#checks .card').count(), 2);
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#export').click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'ypf-health-DEMO.json');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      outputs.push({ width, history: 42, charts: 2, consoleErrors: errors.length, export: download.suggestedFilename() });
    } finally { await context.close(); }
  }
  return outputs;
}
