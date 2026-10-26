import test from 'node:test';
import { chromium } from 'playwright';
import { browserSuite } from './browser-fixture.js';
test('Playwright detecta fallos reales de carga en una web controlada', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try { await browserSuite(browser); } finally { await browser.close(); }
});
