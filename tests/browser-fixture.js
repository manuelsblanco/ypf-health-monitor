import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from '../src/monitor.js';
export async function browserSuite(browser) {
  const outputDir = await mkdtemp(join(tmpdir(), 'ypf-health-test-'));
  const config = { timeoutMs: 10000, settleMs: 100, slowPageMs: 10000, resourceHosts: ['fixture.test'], ignoreUrlPatterns: [], crawl: { maxScrollSteps: 3, maxScrollMs: 1000, safeInteractions: [] } };
  const target = { id: 'fixture', name: 'YPF fixture', url: 'https://fixture.test/', titlePattern: 'YPF', minimumTextLength: 10, minimumLoadedStylesheets: 1, requiredSelectors: ['main'] };
  const run = async mode => {
    const wrapped = { newContext: async options => {
      const context = await browser.newContext(options);
      await context.route('https://fixture.test/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/style.css' && mode === 'css-redirect') return route.fulfill({ status: 302, headers: { location: '/error.html' } });
        if (path === '/error.html') return route.fulfill({ contentType: 'text/html', body: '<h1>Página no disponible</h1>' });
        if (path === '/style.css' && mode === 'css-html') return route.fulfill({ contentType: 'text/html', body: '<h1>Página de error en lugar de CSS</h1>' });
        if (path === '/style.css') return route.fulfill({ contentType: 'text/css', body: 'body { margin: 0; background: #fff; }' });
        if (path === '/image.svg') return route.fulfill({ status: mode === 'image-broken' ? 404 : 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>' });
        if (path === '/app.js') return route.fulfill({ contentType: 'application/javascript', body: `setTimeout(() => { const a = document.createElement('a'); a.href='/dynamic'; a.textContent='Enlace dinámico'; document.querySelector('main').append(a); }, 20); ${mode === 'js-error' ? 'throw new Error("Fixture JS failure");' : ''}` });
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>YPF test</title><link rel="stylesheet" href="/style.css"><main><h1>Contenido principal YPF de prueba</h1><img src="/image.svg"><script src="/app.js"></script></main>' });
      });
      return context;
    } };
    return inspect(wrapped, target, 'desktop', config, outputDir);
  };
  try {
    const good = await run('healthy'); assert.equal(good.status, 'healthy', JSON.stringify(good));
    assert.ok(good.data.links.includes('https://fixture.test/dynamic'));
    assert.ok(good.screenshot); assert.ok(good.trace);
    assert.ok(good.data.loadedImageResources.includes('https://fixture.test/image.svg'));
    const css = await run('css-redirect'); assert.equal(css.status, 'failed'); assert.ok(css.data.resourceErrors.some(e => e.type === 'stylesheet' && e.method === 'GET' && e.redirectChain.length === 2 && e.redirectChain[0].status === 302));
    const cssHtml = await run('css-html'); assert.equal(cssHtml.status, 'failed'); assert.ok(cssHtml.data.resourceErrors.some(e => e.response?.mime.includes('text/html') && e.response.status === 200));
    const img = await run('image-broken'); assert.equal(img.status, 'degraded'); assert.ok(img.data.resourceErrors.some(e => e.type === 'image' && e.status === 404));
    const js = await run('js-error'); assert.equal(js.status, 'degraded'); assert.ok(js.data.pageErrors.length); assert.ok(js.data.pageErrorDetails[0].stack.includes('Fixture JS failure')); assert.ok(js.data.environment.browser);
    return { passed: 5, checks: ['Página saludable y enlace dinámico', 'CSS redirigido a página de error', 'HTML recibido en lugar de CSS', 'Imagen 404', 'Excepción JavaScript'], reports: { healthy: good.status, css: css.status, image: img.status, javascript: js.status } };
  } finally { await rm(outputDir, { recursive: true, force: true }); }
}
