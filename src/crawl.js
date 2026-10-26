import { probeExternal } from './probe.js';
import { overall, owned } from './health.js';
const binary = /\.(?:pdf|zip|rar|7z|docx?|xlsx?|pptx?|csv|mp4|webm|mp3|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|css|js|xml|json)$/i;
export function normalizeUrl(value, base, options) {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return { reason: 'protocol' };
    url.hash = '';
    if (binary.test(url.pathname)) return { reason: 'download', url: url.href };
    if (options.excludePatterns.some(pattern => new RegExp(pattern, 'i').test(url.href))) return { reason: 'excluded', url: url.href };
    for (const key of [...url.searchParams.keys()]) if (!options.queryParameters.includes(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    if (!owned(url.href, options.allowedHosts, options.includeSubdomains)) return { reason: 'external', url: url.href };
    return { url: url.href };
  } catch { return { reason: 'invalid' }; }
}
export async function crawl({ browser, config, inspect, outputDir }) {
  const opts = config.crawl;
  if (!['bfs', 'dfs'].includes(opts.strategy)) throw new Error('Estrategia inválida: usar bfs o dfs');
  const frontier = [];
  const discovered = new Set();
  const visited = new Set();
  const edges = [], results = [], skipped = {}, external = new Set();
  let discoveryLimit = false;
  const enqueue = entry => {
    if (discovered.has(entry.url)) return;
    if (discovered.size >= opts.maxDiscoveredUrls) { discoveryLimit = true; return; }
    discovered.add(entry.url); frontier.push(entry);
  };
  for (const target of config.targets) {
    const seed = normalizeUrl(target.url, target.url, opts);
    if (seed.reason) throw new Error(`Semilla fuera del alcance: ${target.url}`);
    enqueue({ url: seed.url, depth: 0, target });
  }
  const started = Date.now();
  while (frontier.length && visited.size < opts.maxPages && Date.now() - started < opts.maxDurationMs) {
    const current = opts.strategy === 'dfs' ? frontier.pop() : frontier.shift();
    visited.add(current.url);
    const links = new Set();
    for (const viewport of current.target.viewports) {
      const target = current.depth === 0 ? { ...current.target, url: current.url } : {
        id: current.target.id, name: current.target.name, viewports: current.target.viewports,
        ...opts.discoveredPage, requiredPresentSelectors: opts.discoveredPage?.requiredPresentSelectors ?? [], url: current.url,
      };
      const result = await inspect(browser, target, viewport, config, outputDir);
      result.depth = current.depth;
      results.push(result);
      for (const url of result.data.links || []) links.add(url);
    }
    for (const href of [...links].sort()) {
      const next = normalizeUrl(href, current.url, opts);
      // A bounded graph prevents query traps and pages with huge generated link lists.
      if (edges.length < opts.maxDiscoveredUrls * 5) edges.push({ from: current.url, to: next.url || href, disposition: next.reason || 'internal' });
      if (next.reason) {
        skipped[next.reason] = (skipped[next.reason] || 0) + 1;
        if (next.reason === 'external' && external.size < opts.maxDiscoveredUrls) external.add(next.url);
        continue;
      }
      if (current.depth < opts.maxDepth) enqueue({ url: next.url, depth: current.depth + 1, target: current.target });
    }
  }
  const checkedUrls = [...visited];
  const unchecked = [...new Set(edges.filter(e => e.disposition === 'internal' && !visited.has(e.to)).map(e => e.to))];
  const externalChecks = [];
  if (opts.checkExternalLinks) {
    // API GET checks availability only; external sites are never recursively crawled.
    const context = await browser.newContext();
    try {
      for (const url of [...external].slice(0, opts.maxExternalLinks)) {
        externalChecks.push(await probeExternal(context.request, url, config));
      }
    } finally { await context.close(); }
  }
  return { results, status: overall([...results, ...externalChecks]), crawl: {
    strategy: opts.strategy, checkedPages: visited.size, discoveredPages: new Set([...checkedUrls, ...unchecked]).size,
    checkedUrls, unchecked, complete: !unchecked.length && !discoveryLimit,
    stopReason: discoveryLimit ? 'discovery-limit' : Date.now() - started >= opts.maxDurationMs ? 'time-limit' : frontier.length ? 'page-limit' : unchecked.length ? 'depth-limit' : 'exhausted',
    maxPages: opts.maxPages, maxDepth: opts.maxDepth, edges, skipped, externalChecks,
    externalDiscovered: external.size, externalUnchecked: Math.max(0, external.size - externalChecks.length), durationMs: Date.now() - started,
  } };
}
