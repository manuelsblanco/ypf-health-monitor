import test from 'node:test';
import assert from 'node:assert/strict';
import { probeExternal } from '../src/probe.js';
function requestFor(entries) { let index = 0; return { get: async url => { const e = entries[Math.min(index++, entries.length - 1)]; if (e.error) throw new Error(e.error); return { status: () => e.status, headers: () => ({ 'content-type': 'text/html' }), text: async () => e.body || '', url: () => url, dispose: async () => {} }; } }; }
const config = { timeoutMs: 100, confirmation: { attempts: 2, delayMs: 0 }, errorPagePatterns: ['^Page not found$'] };
test('404 transitorio que responde 200 al repetir no se confirma', async () => {
  const r = await probeExternal(requestFor([{ status: 404 }, { status: 200 }]), 'https://example.test/', config);
  assert.equal(r.status, 'healthy'); assert.equal(r.confirmed, false); assert.equal(r.attempts.length, 2);
});
test('404 repetido confirma un enlace con error', async () => {
  const r = await probeExternal(requestFor([{ status: 404 }]), 'https://example.test/', config);
  assert.equal(r.confirmed, true);
});
test('un desafío de acceso HTTP 200 es no verificable, no un sitio saludable o caído', async () => {
  const r = await probeExternal(requestFor([{ status: 200, body: '<title>Request Rejected</title>The requested URL was rejected' }]), 'https://example.test/', config);
  assert.equal(r.accessBlocked, true); assert.equal(r.confirmed, false); assert.equal(r.status, 'degraded');
});
test('la página de error conocida con HTTP 200 se confirma como soft 404', async () => {
  const r = await probeExternal(requestFor([{ status: 200, body: '<title>Page not found</title>' }]), 'https://example.test/', config);
  assert.equal(r.softError, true); assert.equal(r.confirmed, true);
});
