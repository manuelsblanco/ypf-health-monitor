import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from '../src/monitor.js';
import { crawl } from '../src/crawl.js';
const brokenBrowser = { newContext: async () => { throw new Error('No se pudo crear contexto Chromium'); } };
const target = { id: 'test', name: 'Test', url: 'https://example.test/', viewports: ['desktop'] };
test('error técnico de contexto se registra como comprobación incompleta', async () => {
  const result = await inspect(brokenBrowser, target, 'desktop', {}, '/tmp');
  assert.equal(result.status, 'failed'); assert.match(result.executionError, /Chromium/);
  assert.equal(result.checks[0].id, 'monitor'); assert.equal(result.screenshot, null);
});
test('después de un error técnico aislado se siguen revisando páginas conocidas', async () => {
  const config = { targets: [target], crawl: { strategy: 'bfs', allowedHosts: ['example.test'], excludePatterns: [], queryParameters: [], maxPages: 10, maxDepth: 3, maxDurationMs: 1000, maxDiscoveredUrls: 30, discoveredPage: {}, checkExternalLinks: false } };
  const result = await crawl({ browser: {}, config, outputDir: '/tmp', inspect: async (browser, current, viewport) => {
    if (current.url.endsWith('/a')) return inspect(brokenBrowser, current, viewport, {}, '/tmp');
    return { url: current.url, viewport, status: 'healthy', data: { links: current.url === target.url ? ['https://example.test/a', 'https://example.test/b'] : [] } };
  } });
  assert.equal(result.results.length, 3);
  assert.ok(result.results.some(r => r.url.endsWith('/a') && r.executionError));
  assert.ok(result.results.some(r => r.url.endsWith('/b') && r.status === 'healthy'));
});
