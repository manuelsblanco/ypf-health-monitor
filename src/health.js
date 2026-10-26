import { accessIsBlocked } from './confirmation.js';
export const ranks = { healthy: 0, degraded: 1, failed: 2 };
export function overall(checks) {
  return checks.reduce((status, check) => ranks[check.status] > ranks[status] ? check.status : status, 'healthy');
}
export function owned(url, hosts, includeSubdomains = false) {
  try { const host = new URL(url).hostname; return hosts.some(allowed => host === allowed || (includeSubdomains && host.endsWith('.' + allowed)));  } catch { return false; }
}
export function assess(data, target, config) {
  if (accessIsBlocked(data)) return { status: 'degraded', observationStatus: 'blocked', checks: [{ id: 'access', status: 'degraded', message: 'Acceso rechazado o limitado para este navegador; salud del sitio no verificable', details: [{ title: data.title, httpStatus: data.httpStatus, finalUrl: data.finalUrl }] }] };
  const checks = [];
  const add = (id, status, message, details = []) => checks.push({ id, status, message, details });
  add('navigation', data.navigationError || !data.httpStatus || data.httpStatus >= 400 ? 'failed' : 'healthy',
    data.navigationError || `HTTP ${data.httpStatus} · ${data.finalUrl}`);
  const errorPage = /\/(?:error|404|500|503|not-found)(?:\.|\/|\?|$)/i.test(data.finalUrl || '') ||
    (config.errorPagePatterns || ['^p[aá]gina no (?:encontrada|disponible)', '^error\\s*404', '^404(?:\\s|$)']).some(pattern =>
      [data.title, ...(data.headingSamples || [])].some(text => new RegExp(pattern, 'i').test(text || '')));
  add('content', errorPage || !new RegExp(target.titlePattern, 'i').test(data.title || '') || data.textLength < target.minimumTextLength ? 'failed' : 'healthy',
    `Título: ${data.title || '(vacío)'} · ${data.textLength} caracteres`);
  add('structure', data.missingSelectors.length ? 'failed' : 'healthy',
    data.missingSelectors.length ? 'Faltan elementos principales' : 'Estructura principal visible', data.missingSelectors);
  add('styles', data.loadedStylesheets < target.minimumLoadedStylesheets || data.badStyles.length ? 'failed' : 'healthy',
    `${data.loadedStylesheets} hojas de estilo aplicadas`, data.badStyles);
  const critical = data.resourceErrors.filter(x => ['stylesheet', 'script', 'document'].includes(x.type));
  const media = data.resourceErrors.filter(x => !['stylesheet', 'script', 'document'].includes(x.type));
  const countResources = entries => new Set(entries.map(error => `${error.type}|${error.originalUrl || error.url}`)).size;
  add('resources', critical.length ? 'failed' : media.length ? 'degraded' : 'healthy',
    `${countResources(critical)} recursos críticos con fallo · ${countResources(media)} otros recursos propios con fallo`, data.resourceErrors);
  add('images', data.brokenImages.length ? 'degraded' : 'healthy', `${data.brokenImages.length} imágenes no decodificadas en esta observación`, data.brokenImages);
  add('pending-images', data.pendingImages?.length ? 'degraded' : 'healthy', `${data.pendingImages?.length || 0} imágenes sin terminar de cargar`, data.pendingImages || []);
  add('image-verification', data.unverifiedImages?.length ? 'degraded' : 'healthy', `${data.unverifiedImages?.length || 0} imágenes sin evidencia suficiente para verificar su decodificación`, data.unverifiedImages || []);
  add('layout', data.horizontalOverflow ? 'degraded' : 'healthy', data.horizontalOverflow ? 'Desbordamiento horizontal detectado' : 'Sin desbordamiento horizontal');
  add('javascript', data.pageErrors.length ? 'degraded' : 'healthy', `${data.pageErrors.length} excepciones JavaScript`, data.pageErrors);
  add('console', data.consoleErrors.length ? 'degraded' : 'healthy', `${data.consoleErrors.length} errores de consola`, data.consoleErrors);
  for (const outcome of data.functionalResults || []) {
    if (outcome.status === 'not-applicable') continue;
    add(outcome.status === 'unverified' ? 'functional-verification' : `functional:${outcome.id}`, outcome.status === 'passed' ? 'healthy' : 'degraded', `${outcome.id}: ${outcome.message}`, [outcome]);
  }
  add('performance', data.domContentLoadedMs > config.slowPageMs ? 'degraded' : 'healthy',
    `DOMContentLoaded: ${data.domContentLoadedMs} ms (umbral ${config.slowPageMs} ms)`);
  return { checks, status: overall(checks) };
}
