import test from 'node:test';
import { chromium } from 'playwright';
import { dashboardSuite } from './dashboard-fixture.js';
test('dashboard demo: gráficos, filtros, histórico y exportación en escritorio y móvil', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try { await dashboardSuite(browser); } finally { await browser.close(); }
});
