import { summarizeReport } from './metrics.js';
export function buildHistory(previous, latest, config) {
  const cutoff = Date.parse(latest.timestamp) - config.historyDays * 86400000;
  const compact = { id: latest.id, timestamp: latest.timestamp, status: latest.status, runUrl: latest.runUrl,
    infrastructureError: latest.infrastructureError, mode: latest.mode || 'live',
    metrics: summarizeReport(latest),
    coverage: latest.crawl ? { checkedPages: latest.crawl.checkedPages, discoveredPages: latest.crawl.discoveredPages, complete: latest.crawl.complete } : null,
    results: latest.results.map(({ targetId, name, viewport, status, data }) => ({ targetId, name, viewport, status, durationMs: data.domContentLoadedMs })) };
  return [...previous.filter(x => x.id !== latest.id && Date.parse(x.timestamp) >= cutoff), compact]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-config.maxRuns);
}
