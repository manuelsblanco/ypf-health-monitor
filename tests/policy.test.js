import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReport, renderSummary } from '../src/policy.js';
const report = status => ({ status, executionStatus: 'completed', results: [{ url: 'https://example.test/', viewport: 'mobile', status, checks: [{ status, message: 'Detalle observado' }], data: { thirdPartyErrors: [] } }] });
test('incidencias y fallos del sitio se informan sin fallar por defecto', () => {
  for (const status of ['degraded', 'failed']) { const verdict = evaluateReport(report(status)); assert.equal(verdict.exitCode, 0); assert.equal(verdict.level, 'warning'); }
});
test('modo estricto sigue permitiendo hacer fallar la ejecución por salud', () => {
  assert.equal(evaluateReport(report('degraded'), 'strict').exitCode, 1);
  assert.equal(evaluateReport(report('failed'), 'strict').exitCode, 1);
  assert.equal(evaluateReport(report('healthy'), 'strict').exitCode, 0);
});
test('errores técnicos nunca se ignoran en modo informativo', () => {
  assert.equal(evaluateReport({ ...report('failed'), infrastructureError: 'Chromium no arranca' }).exitCode, 1);
  const partial = report('failed'); partial.results[0].executionError = 'Contexto cerrado inesperadamente';
  assert.equal(evaluateReport(partial).exitCode, 1);
  assert.equal(evaluateReport({ status: 'healthy', results: [] }).exitCode, 1);
  assert.equal(evaluateReport(report('healthy'), 'ignore-everything').exitCode, 1);
});
test('el resumen conserva las incidencias y separa salud de ejecución', () => {
  const summary = renderSummary({ ...report('degraded'), crawl: { checkedPages: 3, discoveredPages: 100, complete: false, stopReason: 'page-limit' } });
  assert.match(summary, /Detalle observado/); assert.match(summary, /3 páginas revisadas de 100/); assert.match(summary, /pipeline continúa/); assert.match(summary, /informativos/);
});
