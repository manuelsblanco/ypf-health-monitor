import test from 'node:test';
import assert from 'node:assert/strict';
import { accessIsBlocked, applyConfirmation, observationSignals } from '../src/confirmation.js';
import { assess } from '../src/health.js';
import { collectAlerts } from '../src/alerts.js';
const page = 'https://example.test/'; const image = page + 'photo.webp';
const healthy = () => ({ url: page, viewport: 'desktop', status: 'healthy', checks: [{ id: 'images', status: 'healthy', details: [] }], data: { title: 'Home', httpStatus: 200, brokenImages: [], resourceErrors: [] } });
const broken = (url = image) => ({ ...healthy(), status: 'degraded', checks: [{ id: 'images', status: 'degraded', details: [url] }], data: { title: 'Home', httpStatus: 200, brokenImages: [url], resourceErrors: [{ type: 'image', url, status: 404, error: 'HTTP 404' }] } });
test('un problema que desaparece al repetir no crea una alerta', () => {
  const result = applyConfirmation([broken(), healthy()]);
  assert.equal(result.status, 'healthy'); assert.equal(result.observationStatus, 'recovered-on-retry');
  assert.equal(result.confirmation.attempts.length, 2); assert.equal(collectAlerts({ results: [result] }).length, 0);
});
test('un recurso que falla en ambos intentos se confirma', () => {
  const result = applyConfirmation([broken(), broken()]);
  assert.equal(result.observationStatus, 'confirmed'); assert.equal(collectAlerts({ results: [result] }).length, 1);
});
test('dos imágenes diferentes que fallan una vez cada una no se confirman', () => {
  const result = applyConfirmation([broken(), broken(page + 'other.webp')]);
  assert.equal(result.observationStatus, 'unconfirmed'); assert.equal(collectAlerts({ results: [result] }).length, 0);
});
test('Request Rejected con HTTP 200 no se presenta como falta de CSS ni como sitio caído', () => {
  const data = { title: 'Request Rejected', httpStatus: 200, loadedStylesheets: 0 };
  assert.equal(accessIsBlocked(data), true);
  const result = assess(data, {}, {}); assert.equal(result.status, 'degraded'); assert.equal(result.checks[0].id, 'access');
  assert.equal(result.checks.some(c => c.id === 'styles'), false);
  assert.deepEqual(observationSignals({ url: page, ...result, data }), []);
});
test('HTTP 403 y 429 indican acceso limitado, sin declarar un enlace roto', () => {
  assert.equal(accessIsBlocked({ title: 'Forbidden', httpStatus: 403 }), true);
  assert.equal(accessIsBlocked({ httpStatus: 429 }), true);
});
test('ORB sin respuesta HTTP sigue siendo evidencia ambigua aunque se repita', () => {
  const result = broken(); result.data.resourceErrors = [{ type: 'image', url: image, error: 'net::ERR_BLOCKED_BY_ORB', response: null }];
  const confirmed = applyConfirmation([result, structuredClone(result)]);
  assert.equal(confirmed.observationStatus, 'unconfirmed'); assert.equal(confirmed.checks[0].confirmed, false);
  assert.equal(collectAlerts({ results: [confirmed] }).length, 0);
});
test('las repeticiones del mismo error conservan evidencia sin inflar el número de recursos', async () => {
  const { groupResourceErrors } = await import('../src/confirmation.js');
  const grouped = groupResourceErrors([{ type: 'image', url: image, error: 'ORB', phase: 'navigation', elapsedMs: 100 }, { type: 'image', url: image, error: 'ORB', phase: 'settling', elapsedMs: 200 }]);
  assert.equal(grouped.length, 1); assert.equal(grouped[0].occurrences, 2);
  assert.deepEqual(grouped[0].phases, ['navigation', 'settling']); assert.equal(grouped[0].lastSeenMs, 200);
});
