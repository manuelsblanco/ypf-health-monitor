import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, owned } from '../src/health.js';
import { buildHistory } from '../src/history.js';
const target = { titlePattern: 'YPF', minimumTextLength: 20, minimumLoadedStylesheets: 1 };
const config = { slowPageMs: 12000 };
const good = () => ({ httpStatus: 200, finalUrl: 'https://www.ypf.com/', title: 'YPF', textLength: 100,
  missingSelectors: [], loadedStylesheets: 2, badStyles: [], resourceErrors: [], brokenImages: [], pendingImages: [], pageErrors: [], consoleErrors: [], domContentLoadedMs: 100 });
test('HTTP 200 con recursos completos es saludable', () => assert.equal(assess(good(), target, config).status, 'healthy'));
test('un CSS ausente falla aunque el HTML responda 200', () => assert.equal(assess({ ...good(), badStyles: ['main.css'] }, target, config).status, 'failed'));
test('una redirección a página de error no es éxito', () => assert.equal(assess({ ...good(), finalUrl: 'https://www.ypf.com/error.html' }, target, config).status, 'failed'));
test('imágenes, JS y latencia se reportan como incidencias', () => {
  for (const change of [{ brokenImages: ['x.png'] }, { pageErrors: ['TypeError'] }, { domContentLoadedMs: 20000 }, { pendingImages: ['pending.png'] }, { horizontalOverflow: true }]) assert.equal(assess({ ...good(), ...change }, target, config).status, 'degraded');
});
test('timeout no se transforma en verde', () => assert.equal(assess({ ...good(), navigationError: 'Timeout' }, target, config).status, 'failed'));
test('dominios se comparan exactamente', () => { assert.equal(owned('https://www.ypf.com/file', ['www.ypf.com']), true); assert.equal(owned('https://www.ypf.com.evil.test/', ['www.ypf.com']), false); });
test('historial conserva, deduplica, ordena y expira datos', () => {
  const latest = { id: 'new', timestamp: '2026-10-26T12:00:00Z', status: 'failed', results: [] };
  const previous = [{ ...latest, id: 'old', timestamp: '2025-01-01T00:00:00Z' }, { ...latest, id: 'recent', timestamp: '2026-10-25T12:00:00Z' }, latest];
  const history = buildHistory(previous, latest, { historyDays: 90, maxRuns: 600 });
  assert.deepEqual(history.map(x => x.id), ['recent', 'new']);
  assert.equal(buildHistory(history, latest, { historyDays: 90, maxRuns: 1 }).length, 1);
});

test('soft 404: HTTP 200 con encabezado de error también falla', () => {
  assert.equal(assess({ ...good(), headingSamples: ['Página no encontrada'] }, target, config).status, 'failed');
  assert.equal(assess({ ...good(), finalUrl: 'https://www.ypf.com/404' }, target, config).status, 'failed');
});
