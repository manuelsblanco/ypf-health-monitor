import test from 'node:test';
import assert from 'node:assert/strict';
import { crawl, normalizeUrl } from '../src/crawl.js';
const options = { enabled: true, strategy: 'bfs', allowedHosts: ['example.test'], maxPages: 20, maxDepth: 5,
  maxDurationMs: 30000, maxDiscoveredUrls: 100, queryParameters: ['page'], excludePatterns: ['/logout'], checkExternalLinks: false };
const config = crawlOptions => ({ crawl: { ...options, ...crawlOptions }, targets: [{ id: 'root', url: 'https://example.test/', viewports: ['desktop'] }] });
const graph = { '/': ['/a', '/b', '/a#dup'], '/a': ['/a/child', '/'], '/b': ['/b/child'], '/a/child': [], '/b/child': [] };
const fakeInspect = async (browser, target, viewport) => ({ status: 'healthy', url: target.url, viewport, data: { links: (graph[new URL(target.url).pathname] || []).map(x => new URL(x, target.url).href) } });
const run = cfg => crawl({ browser: {}, config: config(cfg), inspect: fakeInspect, outputDir: '/tmp' });
test('BFS visita primero las páginas vecinas y evita ciclos', async () => {
  const r = await run({}); assert.deepEqual(r.crawl.checkedUrls.map(x => new URL(x).pathname), ['/', '/a', '/b', '/a/child', '/b/child']); assert.equal(r.crawl.complete, true);
});
test('DFS sigue una rama antes de pasar a otra', async () => {
  const r = await run({ strategy: 'dfs' }); assert.deepEqual(r.crawl.checkedUrls.map(x => new URL(x).pathname), ['/', '/b', '/b/child', '/a', '/a/child']);
});
test('límite de páginas deja cobertura parcial explícita', async () => {
  const r = await run({ maxPages: 2 }); assert.equal(r.crawl.checkedPages, 2); assert.equal(r.crawl.complete, false); assert.equal(r.crawl.stopReason, 'page-limit'); assert.ok(r.crawl.unchecked.length);
});
test('límite de profundidad no afirma un recorrido completo', async () => { const r = await run({ maxDepth: 1 }); assert.equal(r.crawl.checkedPages, 3); assert.equal(r.crawl.stopReason, 'depth-limit'); });
test('normaliza fragmentos, tracking y query params; excluye descargas y logout', () => {
  const norm = url => normalizeUrl(url, 'https://example.test/', options);
  assert.equal(norm('/a?utm_source=x&page=2#anchor').url, 'https://example.test/a?page=2');
  assert.equal(norm('javascript:alert(1)').reason, 'protocol');
  assert.equal(norm('/file.pdf').reason, 'download'); assert.equal(norm('/logout').reason, 'excluded');
  assert.equal(norm('https://other.test/').reason, 'external');
});
test('límite de descubrimiento evita crecimiento infinito', async () => { const r = await run({ maxDiscoveredUrls: 2 }); assert.equal(r.crawl.stopReason, 'discovery-limit'); assert.equal(r.crawl.complete, false); });
test('incluye subdominios de YPF sin aceptar dominios parecidos', () => {
  const opts = { ...options, allowedHosts: ['ypf.com'], includeSubdomains: true };
  assert.equal(normalizeUrl('https://inversores.ypf.com/', 'https://www.ypf.com/', opts).reason, undefined);
  assert.equal(normalizeUrl('https://ypf.com.evil.test/', 'https://www.ypf.com/', opts).reason, 'external');
});
