import test from 'node:test';
import assert from 'node:assert/strict';
import '../web/diagnostics.js';
const { redactUrl, describeNetworkError, buildDiagnosticText } = globalThis.HealthDiagnostics;
test('URL copiada oculta tracking, credenciales y fragmentos', () => {
  const clean = redactUrl('https://alice:password@example.test/file?token=secret&cid=tracking&errorCode=404#secret');
  for (const value of ['alice', 'password', 'secret', 'tracking']) assert.ok(!clean.includes(value));
  assert.ok(clean.includes('errorCode=404'));
});
test('cancelaciones y ORB se explican como evidencia sin afirmar causa raíz', () => {
  assert.match(describeNetworkError({ error: 'net::ERR_ABORTED' }).interpretation.join(' '), /no equivale a HTTP 404/);
  assert.match(describeNetworkError({ error: 'net::ERR_BLOCKED_BY_ORB', url: 'https://github.com/example/fonts/blob/main/din.css' }).interpretation.join(' '), /Content-Type/);
});
test('diagnóstico incluye contexto, pruebas y límites sin inventar datos ausentes', () => {
  const result = { url: 'https://example.test/', viewport: 'mobile', status: 'degraded', checks: [], screenshot: 'page.png', trace: 'page.zip', data: { thirdPartyErrors: [{ url: 'https://analytics.test/collect?cid=private-id', error: 'net::ERR_ABORTED' }] } };
  const text = buildDiagnosticText({ id: 'run-1', timestamp: '2026-10-26T10:00:00Z', results: [result] });
  assert.match(text, /mobile/); assert.match(text, /page.png/); assert.match(text, /page.zip/);
  assert.match(text, /No capturado en esta ejecución/); assert.ok(!text.includes('private-id'));
  assert.match(text, /hipótesis/); assert.match(text, /2026-10-26/);
});
test('copiar un error de imágenes también incluye los eventos ORB relacionados', () => {
  const url = 'https://example.test/image.webp';
  const check = { id: 'images', status: 'degraded', message: 'Imagen no decodificada', details: [url] };
  const result = { url: 'https://example.test/', viewport: 'desktop', status: 'degraded', checks: [check], data: { resourceErrors: [{ url, originalUrl: url, type: 'image', error: 'net::ERR_BLOCKED_BY_ORB' }], thirdPartyErrors: [] } };
  const copied = buildDiagnosticText({ id: 'r', results: [result] }, { result, check });
  assert.match(copied, /ERR_BLOCKED_BY_ORB/); assert.match(copied, /first-party/); assert.match(copied, /overallFindings/);
});
