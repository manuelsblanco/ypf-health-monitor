export function summarizeReport(report) {
  const issues = { links: 0, images: 0, css: 0, javascript: 0, other: 0 };
  const times = [];
  for (const result of report.results) {
    const data = result.data || {};
    const resources = data.resourceErrors || [];
    const count = (types, extra = []) => new Set([...resources.filter(r => types.includes(r.type)).map(r => r.originalUrl || r.url), ...extra]).size;
    issues.images += count(['image'], [...(data.brokenImages || []), ...(data.pendingImages || [])]);
    issues.css += count(['stylesheet'], data.badStyles || []);
    issues.javascript += count(['script']) + (data.pageErrors?.length || 0);
    issues.links += result.checks?.some(c => ['navigation', 'content'].includes(c.id) && c.status === 'failed') ? 1 : 0;
    issues.other += count(['xhr', 'fetch', 'media', 'font', 'other']);
    if (Number.isFinite(data.domContentLoadedMs) && data.domContentLoadedMs > 0) times.push(data.domContentLoadedMs);
  }
  return { issues, totalIssues: Object.values(issues).reduce((a, b) => a + b, 0),
    averageDomContentLoadedMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    checkedPages: report.crawl?.checkedPages ?? new Set(report.results.map(r => r.url)).size,
    checks: report.results.length };
}
