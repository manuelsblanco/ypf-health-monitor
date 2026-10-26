import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo } from '../src/demo-data.js';
import { summarizeReport } from '../src/metrics.js';
test('demo coherente, etiquetada y con fallos de ejemplo', () => {
  const { latest, history } = createDemo(new Date('2026-10-26T12:00:00Z'));
  assert.equal(latest.mode, 'demo'); assert.equal(history.length, 42);
  assert.ok(history.every(r => r.mode === 'demo' && r.metrics));
  assert.deepEqual([...new Set(history.map(r => r.status))].sort(), ['degraded', 'failed', 'healthy']);
  assert.equal(history.at(-1).id, latest.id);
  assert.equal(history.at(-1).status, latest.status);
  assert.equal(latest.results.length, 2);
  assert.ok(latest.results.every(r => !r.screenshot && !r.trace));
});
test('métricas no duplican el mismo recurso en red y en DOM', () => {
  const result = { url: 'https://example.test/', checks: [], data: { domContentLoadedMs: 100, resourceErrors: [{ type: 'image', url: 'broken.webp' }], brokenImages: ['broken.webp'] } };
  const metrics = summarizeReport({ results: [result] });
  assert.equal(metrics.issues.images, 1); assert.equal(metrics.totalIssues, 1);
  assert.equal(metrics.checkedPages, 1); assert.equal(metrics.averageDomContentLoadedMs, 100);
});
test('sin observación de tiempo no se inventa una latencia de cero', () => {
  assert.equal(summarizeReport({ results: [] }).averageDomContentLoadedMs, null);
});
