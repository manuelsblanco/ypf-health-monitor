import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardFixture } from './dashboard-data.js';
import { summarizeReport } from '../src/metrics.js';
test('fixture de pruebas coherente y con fallos controlados', () => {
  const { latest, history } = createDashboardFixture(new Date('2026-10-26T12:00:00Z'));
  assert.equal(latest.mode, 'test'); assert.equal(history.length, 42);
  assert.ok(history.every(r => r.mode === 'test' && r.metrics));
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
test('no usa el tiempo de una pantalla bloqueada como latencia real del sitio', () => {
  const metrics = summarizeReport({ results: [{ url: 'https://example.test/', observationStatus: 'blocked', data: { domContentLoadedMs: 100 }, checks: [] }] });
  assert.equal(metrics.averageDomContentLoadedMs, null);
});
