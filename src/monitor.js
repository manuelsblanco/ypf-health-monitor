import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { assess, owned } from './health.js';

export async function inspect(browser, target, viewport, config, outputDir) {
  try { return await inspectPage(browser, target, viewport, config, outputDir); }
  catch (error) {
    return { targetId: target.id, name: target.name, url: target.url, viewport, status: 'failed', executionError: error.message,
      checks: [{ id: 'monitor', status: 'failed', message: 'No se pudo ejecutar esta comprobación', details: [error.message] }],
      data: { resourceErrors: [], thirdPartyErrors: [], pageErrors: [], consoleErrors: [], brokenImages: [], pendingImages: [], badStyles: [], domContentLoadedMs: null }, screenshot: null, trace: null };
  }
}
async function inspectPage(browser, target, viewport, config, outputDir) {
  const context = await browser.newContext({
    viewport: viewport === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: viewport === 'mobile', hasTouch: viewport === 'mobile',
    locale: 'es-AR', ignoreHTTPSErrors: false,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.timeoutMs);
  const observationStart = Date.now();
  let phase = 'navigation';
  const responses = new WeakMap();
  const requestContext = req => {
    const chain = []; let current = req;
    while (current) { chain.unshift({ url: current.url(), status: responses.get(current)?.status ?? null }); current = current.redirectedFrom(); }
    let frameUrl = null; try { frameUrl = req.frame().url(); } catch {}
    return { method: req.method(), phase, elapsedMs: Date.now() - observationStart, frameUrl, redirectChain: chain, response: responses.get(req) || null, timing: req.timing() };
  };
  const data = { pageErrorDetails: [], cleanupCancellations: [], resourceErrors: [], pageErrors: [], consoleErrors: [], thirdPartyErrors: [],
    badStyles: [], brokenImages: [], missingSelectors: [], textLength: 0, loadedStylesheets: 0,
    httpStatus: null, finalUrl: target.url, title: '', domContentLoadedMs: 0 };
  const hosts = [...new Set([...config.resourceHosts, new URL(target.url).hostname])];
  const ignored = config.ignoreUrlPatterns.map(x => new RegExp(x));
  const capture = entry => {
    if (ignored.some(pattern => pattern.test(entry.url))) return;
    if (phase === 'closing' && entry.error?.includes('ERR_ABORTED')) { data.cleanupCancellations.push(entry); return; }
    // Follow the original URL so redirects to an external error page still count as first-party failures.
    (owned(entry.originalUrl || entry.url, hosts, config.includeResourceSubdomains) ? data.resourceErrors : data.thirdPartyErrors).push(entry);
  };
  const original = request => { let r = request; while (r.redirectedFrom()) r = r.redirectedFrom(); return r.url(); };
  page.on('requestfailed', req => capture({ url: req.url(), originalUrl: original(req), type: req.resourceType(), error: req.failure()?.errorText, ...requestContext(req) }));
  page.on('response', response => {
    const req = response.request(), type = req.resourceType(), url = response.url();
    const headers = response.headers();
    const mime = headers['content-type'] || '';
    const safeHeaders = Object.fromEntries(['content-type','content-length','x-content-type-options','cross-origin-resource-policy','access-control-allow-origin','cache-control'].filter(key => headers[key]).map(key => [key, headers[key]]));
    responses.set(req, { status: response.status(), mime, headers: safeHeaders });
    const wrongMime = (type === 'stylesheet' && !mime.includes('text/css')) ||
      (type === 'script' && mime.includes('text/html')) ||
      (type === 'image' && mime.includes('text/html')) ||
      (type === 'media' && mime.includes('text/html'));
    if (response.status() >= 400 || (response.status() < 300 && wrongMime)) capture({ url, originalUrl: original(req), type, status: response.status(), error: wrongMime ? `MIME inesperado: ${mime}` : `HTTP ${response.status()}`, ...requestContext(req) });
  });
  page.on('pageerror', error => { data.pageErrors.push(error.message); data.pageErrorDetails.push({ name: error.name, message: error.message, stack: error.stack, phase, elapsedMs: Date.now() - observationStart }); });
  page.on('console', message => {
    // Third-party console noise remains visible in request diagnostics, but does not mark YPF down.
    if (message.type() === 'error' && owned(message.location().url, hosts, config.includeResourceSubdomains)) data.consoleErrors.push({ message: message.text(), url: message.location().url, location: message.location(), phase, elapsedMs: Date.now() - observationStart });
  });
  await mkdir(outputDir, { recursive: true });
  const base = `${target.id}-${createHash('sha256').update(target.url).digest('hex').slice(0, 12)}-${viewport}`;
  let screenshot = null, trace = null;
  const discoveredLinks = new Set();
  const collectLinks = async () => { for (const href of await page.locator('a[href],area[href]').evaluateAll(elements => elements.map(a => a.href))) discoveredLinks.add(href); };
  try {
    await context.tracing.start({ screenshots: true, snapshots: true });
    const start = Date.now();
    try {
      const response = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
      data.httpStatus = response?.status() ?? null;
    } catch (error) { data.navigationError = error.message; }
    data.domContentLoadedMs = Date.now() - start;
    phase = 'settling';
    data.environment = { browser: context.browser()?.version(), userAgent: await page.evaluate(() => navigator.userAgent), viewport: page.viewportSize(), locale: 'es-AR' };
    await page.waitForTimeout(config.settleMs);
    // Only explicitly allowlisted, non-submitting controls; never click arbitrary links/buttons.
    phase = 'interaction';
    data.interactions = [];
    data.unavailableInteractions = [];
    await collectLinks();
    for (const action of config.crawl?.safeInteractions || []) {
      const control = page.locator(action.selector).first();
      if (!await control.isVisible()) data.unavailableInteractions.push(action.selector);
      for (let n = 0; n < action.maxClicks; n++) {
        if (!await control.isVisible() || !await control.isEnabled()) break;
        const unsafe = await control.evaluate(el => el.tagName !== 'BUTTON' || (!!el.form && el.type !== 'button'));
        if (unsafe) break;
        try {
          await control.click({ timeout: 2000, noWaitAfter: true });
          await page.waitForTimeout(250);
          data.interactions.push(action.selector);
          await collectLinks();
        } catch { break; }
      }
      // Close an expanded menu after observing it, so content remains visible.
      if (await control.isVisible() && await control.getAttribute('aria-expanded') === 'true') {
        try { await control.click({ timeout: 2000 }); } catch { /* Report remains usable. */ }
      }
    }
    // Bounded scroll activates lazy resources. A budget is required for infinite scrolling pages.
    phase = 'scrolling';
    const scrollStarted = Date.now();
    data.scrollComplete = false;
    for (let step = 0; step < (config.crawl?.maxScrollSteps ?? 20); step++) {
      const atBottom = await page.evaluate(step => {
        window.scrollTo(0, step * window.innerHeight * 0.85);
        return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 5;
      }, step);
      await page.waitForTimeout(300);
      await collectLinks();
      if (atBottom) { data.scrollComplete = true; break; }
      if (Date.now() - scrollStarted > (config.crawl?.maxScrollMs ?? 10000)) break;
    }
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    phase = 'observation';
    Object.assign(data, await page.evaluate(() => ({
      headingSamples: [...document.querySelectorAll('h1,h2,[role=heading]')].slice(0, 30).map(el => el.innerText.trim().slice(0, 500)),
      title: document.title, finalUrl: location.href, textLength: document.body?.innerText.trim().length || 0,
      loadedStylesheets: document.styleSheets.length,
      badStyles: [...document.querySelectorAll('link[rel="stylesheet"]')].filter(l => !l.sheet && !l.disabled && (!l.media || matchMedia(l.media).matches)).map(l => l.href),
      brokenImages: [...document.images].filter(i => i.currentSrc && i.complete && !i.naturalWidth).map(i => i.currentSrc),
      links: [...new Set([...document.querySelectorAll('a[href],area[href]')].map(a => a.href))],
      backgroundImages: [...new Set([...document.querySelectorAll('*')].map(el => getComputedStyle(el).backgroundImage).filter(x => x !== 'none'))],
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 10,
      pendingImages: [...document.images].filter(i => i.currentSrc && !i.complete).map(i => i.currentSrc),
    })));
    data.links = [...new Set([...discoveredLinks, ...data.links])];
    for (const selector of target.requiredSelectors) {
      if (!await page.locator(selector).first().isVisible()) data.missingSelectors.push(selector);
    }
    for (const selector of target.requiredPresentSelectors || []) {
      if (!await page.locator(selector).count()) data.missingSelectors.push(selector);
    }
    phase = 'evidence';
    await page.screenshot({ path: `${outputDir}/${base}.png`, fullPage: true, timeout: 15000 });
    screenshot = `${base}.png`;
  } catch (error) {
    data.inspectionError = error.message;
  } finally {
    try { await context.tracing.stop({ path: `${outputDir}/${base}.zip` }); trace = `${base}.zip`; } catch { /* Context may be gone. */ }
    phase = 'closing';
    await context.close();
  }
  data.resourceErrors = [...new Map(data.resourceErrors.map(x => [JSON.stringify(x), x])).values()];
  const assessment = assess(data, target, config);
  if (data.inspectionError) { assessment.status = 'failed'; assessment.checks.push({ id: 'monitor', status: 'failed', message: 'La comprobación no pudo completarse', details: [data.inspectionError] }); }
  return { targetId: target.id, name: target.name, url: target.url, viewport, ...assessment, executionError: data.inspectionError, data, screenshot, trace };
}
