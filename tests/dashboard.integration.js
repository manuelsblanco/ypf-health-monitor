import test from 'node:test';
import { chromium } from 'playwright';
import { prepareDashboardFixture } from './prepare-dashboard.js';
import { dashboardSuite } from './dashboard-fixture.js';
test('dashboard: gráficos, filtros, histórico y exportación en escritorio y móvil', { timeout: 60000 }, async () => {
  const fixture = await prepareDashboardFixture();
  const browser = await chromium.launch({ headless: true });
  try { await dashboardSuite(browser, fixture.root); } finally { await browser.close(); await fixture.cleanup(); }
});
