import { accessIsBlocked, signalFor } from './confirmation.js';
import { createHash } from 'node:crypto';
import '../web/diagnostics.js';
const markerPattern = /<!-- ypf-health-alert:v1:([A-Za-z0-9_-]+) -->/;
const canonical = value => { try { const url = new URL(value); url.search = ''; url.hash = ''; url.username = ''; url.password = ''; return url.href; } catch { return String(value); } };
const resourceIdentity = value => { try { const url = new URL(value); url.hash = ''; url.username = ''; url.password = ''; url.searchParams.sort(); return url.href; } catch { return String(value); } };
const keyFor = (category, page, resource) => createHash('sha256').update([category, canonical(page), resourceIdentity(resource)].join('\n')).digest('hex');
export function readAlert(issue) {
  if (issue.user?.login !== 'github-actions[bot]' || issue.pull_request) return null;
  try { const data = JSON.parse(Buffer.from(issue.body.match(markerPattern)[1], 'base64url').toString()); return data.version === 1 && data.key && data.page && ['image', 'link', 'availability', 'functional'].includes(data.category) && Array.isArray(data.viewports) && data.viewports.length ? data : null; } catch { return null; }
}
export function collectAlerts(report) {
  const alerts = new Map();
  const add = (category, page, resource, viewport, evidence, result = null) => {
    if (result && result.confirmation?.required !== false && !result.confirmedSignals?.includes(signalFor(category, resource))) return;
    const key = keyFor(category, page, resource);
    if (!alerts.has(key)) alerts.set(key, { version: 1, key, category, priority: category === 'availability' ? 'critical' : ['link', 'functional'].includes(category) ? 'high' : 'medium', page: canonical(page), resource: canonical(resource), viewports: [], evidence: [], result, lastRunId: report.id });
    const alert = alerts.get(key); if (!alert.viewports.includes(viewport)) alert.viewports.push(viewport);
    alert.evidence.push({ viewport, ...evidence });
  };
  for (const result of report.results || []) {
    if (result.executionError || accessIsBlocked(result.data)) continue;
    const data = result.data || {};
    if (data.navigationError || data.httpStatus >= 500) add('availability', result.url, result.url, result.viewport, { status: data.httpStatus, error: data.navigationError || `HTTP ${data.httpStatus}` }, result);
    else if (data.httpStatus >= 400 || (result.checks || []).some(c => c.id === 'content' && c.status === 'failed')) add('link', result.url, result.url, result.viewport, { status: data.httpStatus, finalUrl: data.finalUrl, title: data.title }, result);
    for (const check of data.functionalResults || []) if (check.status === 'failed') add('functional', result.url, check.id, result.viewport, check, result);
    for (const resource of data.resourceErrors || []) if (resource.type === 'image' && !resource.error?.includes('ERR_ABORTED')) add('image', result.url, resource.originalUrl || resource.url, result.viewport, resource, result);
    for (const resource of data.brokenImages || []) add('image', result.url, resource, result.viewport, { error: 'La imagen no pudo decodificarse (naturalWidth=0)' }, result);
  }
  for (const check of report.crawl?.externalChecks || []) {
    if (!check.confirmed || check.accessBlocked) continue;
    if ([404, 410].includes(check.httpStatus) || check.softError) add('link', check.url, check.url, 'http', check);
    else if (check.httpStatus >= 500 || check.error) add('availability', check.url, check.url, 'http', check);
  }
  return [...alerts.values()];
}
export function confirmedRecovered(alert, report) {
  if (report.infrastructureError || report.executionStatus === 'failed') return false;
  if (alert.viewports.includes('http')) {
    const check = report.crawl?.externalChecks?.find(c => canonical(c.url) === alert.page);
    return check?.status === 'healthy' && check.httpStatus >= 200 && check.httpStatus < 400;
  }
  return alert.viewports.every(viewport => {
    const result = report.results?.find(r => canonical(r.url) === alert.page && r.viewport === viewport && !r.executionError);
    if (!result || accessIsBlocked(result.data) || result.observationStatus === 'unconfirmed' || result.data.navigationError || !result.data.httpStatus || result.data.httpStatus >= 400) return false;
    if ((result.checks || []).some(c => ['navigation', 'content'].includes(c.id) && c.status !== 'healthy')) return false;
    if (alert.category === 'functional') return (result.data.functionalResults || []).some(check => check.id === alert.resource && check.status === 'passed');
    if (alert.category === 'image') {
      // A page not visited, a skipped carousel or an absent resource is not evidence of recovery.
      return (result.data.loadedImageResources || []).some(url => keyFor('image', alert.page, url) === alert.key);
    }
    return true;
  });
}
export function metadata(alert) { const { version, key, category, page, resource, viewports, lastRunId, mailEvent = 'opened', mailDelivered = false, priority, mailDeliveredAt, mailChannel } = alert; return `<!-- ypf-health-alert:v1:${Buffer.from(JSON.stringify({ version, key, category, page, resource, viewports, lastRunId, mailEvent, mailDelivered, priority, mailDeliveredAt, mailChannel })).toString('base64url')} -->`; }
export function setAlertMailState(body, delivered, options = {}) {
  const match = body.match(markerPattern);
  if (!match) throw new Error('No se encontró metadata de alerta');
  const meta = JSON.parse(Buffer.from(match[1], 'base64url').toString());
  return body.replace(markerPattern, metadata({ ...meta, ...options, mailDelivered: delivered }));
}
export function alertBody(alert, report) {
  const names = { image: 'Imagen que no carga', link: 'Enlace o página con error', availability: 'Página inaccesible desde el runner', functional: 'Funcionalidad que no responde' };
  const diagnostic = alert.result ? HealthDiagnostics.buildDiagnosticText(report, { result: alert.result }) : JSON.stringify(HealthDiagnostics.sanitize(alert.evidence), null, 2);
  // Keep source text inert in public issue notifications; no incidental @mentions.
  return [metadata(alert), `## ${names[alert.category]}`, '', `Prioridad: ${alert.priority || 'medium'} · ${['critical', 'high'].includes(alert.priority) ? 'aviso inmediato en la próxima ejecución' : 'resumen diario por correo'}`, `Página: ${alert.page}`, `Recurso: ${alert.resource}`, `Vistas: ${alert.viewports.join(', ')}`, `Observado (UTC): ${report.timestamp}`, `Ejecución: ${report.runUrl || report.id}`, '',
    'Alerta del monitor alpha. Describe lo observado desde GitHub Actions; no demuestra una caída global. Se notifica una vez por incidente. La captura y la traza están en el artefacto de la ejecución.', '', diagnostic.replaceAll('```', '~~~').replaceAll('@', '@\u200b')].join('\n');
}
export async function synchronizeAlerts(client, report, settings) {
  if (!Array.isArray(report.results)) throw new Error('Informe inválido para alertas');
  const current = collectAlerts(report);
  const issues = await client.listIssues(settings.label);
  const managed = issues.map(issue => ({ issue, meta: readAlert(issue) })).filter(x => x.meta);
  const events = [];
  let created = 0;
  for (const alert of current) {
    const matches = managed.filter(x => x.meta.key === alert.key).sort((a, b) => Date.parse(b.issue.updated_at) - Date.parse(a.issue.updated_at));
    const existing = matches.find(x => x.issue.state === 'open') || matches[0];
    if (existing?.issue.state === 'open') {
      const views = [...new Set([...existing.meta.viewports, ...alert.viewports])];
      if (views.length > existing.meta.viewports.length) await client.editIssue(existing.issue.number, { body: alertBody({ ...existing.meta, ...alert, viewports: views, mailEvent: existing.meta.mailEvent, mailDelivered: existing.meta.mailDelivered, lastRunId: existing.meta.lastRunId }, report) });
      events.push({ action: 'unchanged', key: alert.key, issue: existing.issue.html_url }); continue;
    }
    if (existing && existing.meta.lastRunId === report.id) { events.push({ action: 'already-processed', key: alert.key }); continue; }
    if (created >= settings.maxNewPerRun) { events.push({ action: 'deferred-limit', key: alert.key }); continue; }
    const titleNames = { image: 'Imagen que no carga en el monitor', link: 'Página con error en el monitor', availability: 'Página inaccesible desde el monitor', functional: 'Funcionalidad con error' };
    const title = `[Salud YPF] ${titleNames[alert.category]} · ${alert.resource}`.slice(0, 240);
    if (existing) {
      const issue = await client.editIssue(existing.issue.number, { state: 'open', title, body: alertBody(alert, report) });
      await client.comment(existing.issue.number, `La incidencia volvió a observarse el ${report.timestamp}. Ejecución: ${report.runUrl || report.id}`);
      events.push({ action: 'reopened', key: alert.key, issue: issue.html_url });
    } else {
      const issue = await client.createIssue({ title, body: alertBody(alert, report), labels: [settings.label], assignees: alert.priority === 'medium' ? [] : settings.assignees });
      events.push({ action: 'created', key: alert.key, issue: issue.html_url });
    }
    created++;
  }
  const active = new Set(current.map(alert => alert.key));
  let resolved = 0;
  for (const { issue, meta } of managed.filter(x => x.issue.state === 'open')) {
    if (active.has(meta.key) || !confirmedRecovered(meta, report)) continue;
    if (resolved >= (settings.maxRecoveriesPerRun ?? 20)) { events.push({ action: 'deferred-recovery-limit', key: meta.key }); continue; }
    await client.comment(issue.number, `Recuperación observada el ${report.timestamp}: ${meta.category === 'image' ? 'el recurso volvió a cargar' : 'la página volvió a responder correctamente'} en las vistas previamente afectadas. Ejecución: ${report.runUrl || report.id}`);
    await client.editIssue(issue.number, { state: 'closed', state_reason: 'completed', body: setAlertMailState(issue.body, false, { mailEvent: 'resolved', lastRunId: report.id }) });
    events.push({ action: 'resolved', key: meta.key, issue: issue.html_url }); resolved++;
  }
  return { measuredAtUtc: report.timestamp, runId: report.id, incidents: current.length, events };
}
