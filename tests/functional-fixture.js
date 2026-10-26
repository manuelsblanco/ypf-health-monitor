import assert from 'node:assert/strict';
import { runFunctionalChecks } from '../src/functional.js';
export async function functionalSuite(browser) {
  const context = await browser.newContext();
  try {
    await context.route('https://functional.test/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/destination') return route.fulfill({ status: 404, contentType: 'text/html', body: '<title>404</title>' });
      return route.fulfill({ contentType: 'text/html', body: `<button id="menu" aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');document.querySelector('nav').hidden=false">Menu</button><nav hidden>Opciones</nav><button id="broken" aria-expanded="false">Roto</button><button id="slide" data-index="0" onclick="this.dataset.index='1'">Banner</button><a id="primary" href="/destination">Principal</a>` });
    });
    const page = await context.newPage(); await page.goto('https://functional.test/');
    const results = await runFunctionalChecks(page, [
      { id: 'menu', kind: 'menu', selector: '#menu', panel: 'nav' },
      { id: 'broken', kind: 'menu', selector: '#broken', panel: 'nav' },
      { id: 'absent', kind: 'menu', selector: '#absent', panel: 'nav' },
      { id: 'banner', kind: 'carousel', selector: '#slide', stateSelector: '#slide', stateAttribute: 'data-index' },
      { id: 'link', kind: 'link', selector: '#primary', expectedOrigin: 'https://functional.test' },
    ], 'mobile');
    assert.deepEqual(results.map(r => r.status), ['passed', 'failed', 'unverified', 'passed', 'failed']);
    assert.equal(page.url(), 'https://functional.test/');
    return results;
  } finally { await context.close(); }
}
