export function accessIsBlocked(data = {}) {
  return [401, 403, 429].includes(data.httpStatus) || !!data.accessBlocked || /^(?:request rejected|access denied|forbidden|just a moment\.{0,3}|attention required!?)(?:\s*[-|].*)?$/i.test((data.title || '').trim());
}
export function signalFor(kind, value) {
  try { const url = new URL(value); url.hash = ''; url.searchParams.sort(); return `${kind}:${url.href}`; } catch { return `${kind}:${value}`; }
}
export function imageEvidenceIsAmbiguous(data, url) {
  const related = (data.resourceErrors || []).filter(error => error.type === 'image' && signalFor('image', error.originalUrl || error.url) === signalFor('image', url));
  return related.length > 0 && related.every(error => error.error?.includes('ERR_ABORTED') || error.error?.includes('ERR_BLOCKED_BY_ORB') && !error.response && !error.status);
}
export function observationSignals(result) {
  if (!result || result.executionError || accessIsBlocked(result.data)) return [];
  const data = result.data || {};
  const signals = [];
  if (data.navigationError || data.httpStatus >= 500) signals.push(signalFor('availability', result.url));
  else if (data.httpStatus >= 400 || result.checks?.some(c => c.id === 'content' && c.status === 'failed')) signals.push(signalFor('link', result.url));
  for (const url of data.brokenImages || []) if (!imageEvidenceIsAmbiguous(data, url)) signals.push(signalFor('image', url));
  for (const error of data.resourceErrors || []) if (error.type === 'image' && !imageEvidenceIsAmbiguous(data, error.originalUrl || error.url)) signals.push(signalFor('image', error.originalUrl || error.url));
  for (const error of data.resourceErrors || []) if (error.type !== 'image' && !error.error?.includes('ERR_ABORTED') && !(error.error?.includes('ERR_BLOCKED_BY_ORB') && !error.response && !error.status)) signals.push(signalFor(`resource-${error.type}`, error.originalUrl || error.url));
  return [...new Set(signals)];
}
export function applyConfirmation(observations, required = true) {
  const last = observations.at(-1);
  const valid = observations.filter(r => !r.executionError && !accessIsBlocked(r.data));
  let common = new Set(valid.length ? observationSignals(valid[0]) : []);
  for (const result of valid.slice(1)) { const keys = new Set(observationSignals(result)); common = new Set([...common].filter(key => keys.has(key))); }
  const sufficient = !required || observations.length >= 2 && valid.length === observations.length;
  const otherConfirmed = sufficient && (last.checks || []).some(check => !['resources', 'images', 'pending-images', 'image-verification', 'access'].includes(check.id) && check.status !== 'healthy' && valid.every(r => r.checks?.some(c => c.id === check.id && c.status !== 'healthy')));
  const confirmedSignals = sufficient ? [...common] : [];
  let classification;
  if (last.executionError) classification = 'execution-error';
  else if (accessIsBlocked(last.data)) classification = 'blocked';
  else if (last.status === 'healthy') classification = observations.length > 1 ? 'recovered-on-retry' : 'completed';
  else classification = confirmedSignals.length || otherConfirmed || !required ? 'confirmed' : 'unconfirmed';
  const attempts = observations.map((r, index) => ({ attempt: index + 1, status: r.status, accessBlocked: accessIsBlocked(r.data), executionError: r.executionError,
    httpStatus: r.data.httpStatus, title: r.data.title, brokenImages: r.data.brokenImages || [], resourceErrors: r.data.resourceErrors || [], consoleErrors: r.data.consoleErrors || [], javascript: r.data.pageErrorDetails || r.data.pageErrors || [], checks: r.checks, screenshot: r.screenshot, trace: r.trace }));
  const checks = (last.checks || []).map(check => {
    let confirmed = !required || sufficient && valid.every(r => r.checks?.some(c => c.id === check.id && c.status !== 'healthy'));
    if (check.id === 'images') confirmed = sufficient && (last.data.brokenImages || []).every(url => common.has(signalFor('image', url)));
    return { ...check, confirmed };
  });
  if (classification === 'recovered-on-retry') checks.push({ id: 'confirmation', status: 'healthy', message: 'La incidencia inicial no se reprodujo al repetir la comprobación', details: [] });
  return { ...last, checks, status: classification === 'unconfirmed' ? 'degraded' : last.status,
    observationStatus: classification, confirmedSignals, confirmation: { required, classification, attemptCount: observations.length, attempts } };
}

export function groupResourceErrors(events = []) {
  const groups = new Map();
  for (const event of events) {
    const key = JSON.stringify([event.type, event.originalUrl || event.url, event.error, event.status ?? event.response?.status]);
    if (!groups.has(key)) groups.set(key, { ...event, occurrences: 0, phases: [], firstSeenMs: event.elapsedMs, lastSeenMs: event.elapsedMs });
    const group = groups.get(key); group.occurrences++;
    if (event.phase && !group.phases.includes(event.phase)) group.phases.push(event.phase);
    if (event.elapsedMs !== undefined) { group.firstSeenMs = Math.min(group.firstSeenMs ?? event.elapsedMs, event.elapsedMs); group.lastSeenMs = Math.max(group.lastSeenMs ?? event.elapsedMs, event.elapsedMs); }
  }
  return [...groups.values()];
}
