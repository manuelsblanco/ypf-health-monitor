import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAlerts, synchronizeAlerts } from '../src/alerts.js';
const page = 'https://www.ypf.com/';
const image = 'https://www.ypf.com/images/photo.webp';
const good = (viewport = 'desktop') => ({ url: page, viewport, status: 'healthy', checks: [{ id: 'navigation', status: 'healthy' }, { id: 'content', status: 'healthy' }], data: { httpStatus: 200, finalUrl: page, thirdPartyErrors: [], resourceErrors: [], brokenImages: [], loadedImageResources: [image] } });
const bad = (viewport = 'desktop') => { const r = good(viewport); r.status = 'degraded'; r.data.loadedImageResources = []; r.data.resourceErrors = [{ type: 'image', url: image, status: 404, error: 'HTTP 404' }]; r.data.brokenImages = [image]; return r; };
const report = (results, id = 'run-1') => ({ id, status: 'degraded', executionStatus: 'completed', timestamp: '2026-10-26T12:00:00Z', runUrl: 'https://github.com/example/repo/actions/runs/1', results });
const settings = { label: 'ypf-health', assignees: ['manuelsblanco'], maxNewPerRun: 20 };
function mock() {
  const issues = [], comments = [];
  const client = {
    listIssues: async () => issues,
    createIssue: async payload => { const issue = { ...payload, number: issues.length + 1, state: 'open', updated_at: new Date().toISOString(), user: { login: 'github-actions[bot]' }, html_url: `https://github.com/example/repo/issues/${issues.length + 1}` }; issues.push(issue); return issue; },
    editIssue: async (number, payload) => Object.assign(issues.find(i => i.number === number), payload),
    comment: async (number, body) => { comments.push({ number, body }); },
  };
  return { client, issues, comments };
}
test('imagen rota se agrupa entre DOM, red y viewports y se asigna al destinatario', async () => {
  const { client, issues } = mock(); await synchronizeAlerts(client, report([bad(), bad('mobile')]), settings);
  assert.equal(issues.length, 1); assert.deepEqual(issues[0].assignees, ['manuelsblanco']);
  assert.match(issues[0].body, /desktop, mobile/); assert.match(issues[0].title, /Imagen rota/);
});
test('no repite avisos de la misma incidencia en cada ejecución', async () => {
  const { client, issues, comments } = mock(); await synchronizeAlerts(client, report([bad()]), settings);
  const next = await synchronizeAlerts(client, report([bad()], 'run-2'), settings);
  assert.equal(issues.length, 1); assert.equal(comments.length, 0); assert.equal(next.events[0].action, 'unchanged');
});
test('no cierra alertas de páginas o vistas que no se volvieron a revisar', async () => {
  const { client, issues } = mock(); await synchronizeAlerts(client, report([bad(), bad('mobile')]), settings);
  await synchronizeAlerts(client, report([good()], 'run-2'), settings); assert.equal(issues[0].state, 'open');
  const skipped = good(); skipped.url = 'https://www.ypf.com/other';
  await synchronizeAlerts(client, report([skipped], 'run-3'), settings); assert.equal(issues[0].state, 'open');
});
test('requiere prueba positiva de carga para notificar recuperación de imagen', async () => {
  const { client, issues, comments } = mock(); await synchronizeAlerts(client, report([bad()]), settings);
  const notObserved = good(); notObserved.data.loadedImageResources = [];
  await synchronizeAlerts(client, report([notObserved], 'run-2'), settings); assert.equal(issues[0].state, 'open');
  await synchronizeAlerts(client, report([good()], 'run-3'), settings);
  assert.equal(issues[0].state, 'closed'); assert.equal(comments.length, 1); assert.match(comments[0].body, /Recuperación/);
});
test('una variante distinta de query no confirma recuperación del recurso', async () => {
  const { client, issues } = mock(); const broken = bad(); broken.data.resourceErrors[0].url += '?id=1'; broken.data.brokenImages = [];
  await synchronizeAlerts(client, report([broken]), settings);
  const different = good(); different.data.loadedImageResources = [image + '?id=2'];
  await synchronizeAlerts(client, report([different], 'run-2'), settings); assert.equal(issues[0].state, 'open');
});
test('reabre el incidente si reaparece en lugar de crear otro issue', async () => {
  const { client, issues, comments } = mock(); await synchronizeAlerts(client, report([bad()]), settings);
  await synchronizeAlerts(client, report([good()], 'run-2'), settings);
  await synchronizeAlerts(client, report([bad()], 'run-3'), settings);
  assert.equal(issues.length, 1); assert.equal(issues[0].state, 'open'); assert.equal(comments.length, 2);
});
test('distingue enlaces 404, caída 503 y errores técnicos del monitor', () => {
  const missing = good(); missing.data.httpStatus = 404;
  const unavailable = good(); unavailable.data.httpStatus = 503;
  const technical = good(); technical.executionError = 'Chromium no arranca';
  assert.equal(collectAlerts(report([missing]))[0].category, 'link');
  assert.equal(collectAlerts(report([unavailable]))[0].category, 'availability');
  assert.equal(collectAlerts(report([technical])).length, 0);
});
test('no avisa por analytics de terceros ni cancelaciones ambiguas', () => {
  const r = good(); r.data.thirdPartyErrors = [{ url: 'https://analytics.test/collect', type: 'fetch', error: 'ERR_ABORTED' }]; r.data.resourceErrors = [{ url: image, type: 'image', error: 'net::ERR_ABORTED' }];
  assert.equal(collectAlerts(report([r])).length, 0);
});
test('los límites difieren nuevas alertas sin descartarlas ni generar duplicados', async () => {
  const { client, issues } = mock(); const second = bad(); second.url = 'https://www.ypf.com/b';
  const a = await synchronizeAlerts(client, report([bad(), second]), { ...settings, maxNewPerRun: 1 });
  assert.equal(issues.length, 1); assert.ok(a.events.some(e => e.action === 'deferred-limit'));
  await synchronizeAlerts(client, report([bad(), second], 'run-2'), { ...settings, maxNewPerRun: 1 }); assert.equal(issues.length, 2);
});
test('no modifica issues manuales aunque copien la marca de una alerta', async () => {
  const { client, issues } = mock(); await synchronizeAlerts(client, report([bad()]), settings);
  issues[0].user.login = 'human'; await synchronizeAlerts(client, report([good()], 'run-2'), settings);
  assert.equal(issues[0].state, 'open');
});
