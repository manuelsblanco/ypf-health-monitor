import { summarizeReport } from './metrics.js';
export function buildHistory(previous, latest, config) {
  const cutoff = Date.parse(latest.timestamp) - config.historyDays * 86400000;
  const compact = { id: latest.id, timestamp: latest.timestamp, status: latest.status, runUrl: latest.runUrl,
    verificationPolicy: latest.results.length && latest.results.every(result => result.confirmation) ? 'confirm-v1' : 'legacy',
    infrastructureError: latest.infrastructureError, observationStatus: latest.observationStatus, blockedChecks: latest.blockedChecks, unconfirmedChecks: latest.unconfirmedChecks, mode: latest.mode || 'live',
    metrics: summarizeReport(latest),
    coverage: latest.crawl ? { checkedPages: latest.crawl.checkedPages, discoveredPages: latest.crawl.discoveredPages, complete: latest.crawl.complete } : null,
    results: latest.results.map(({ targetId, name, viewport, status, observationStatus, data }) => ({ targetId, name, viewport, status, observationStatus, durationMs: data.domContentLoadedMs })) };
  return [...previous.filter(x => x.id !== latest.id && Date.parse(x.timestamp) >= cutoff), compact]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-config.maxRuns);
}
