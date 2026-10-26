import { assess, overall } from '../src/health.js';
import { buildHistory } from '../src/history.js';
export function createDashboardFixture(now = new Date()) {
  const history = [];
  let latest;
  const target = { id: 'ypf-home', name: 'YPF · Inicio', url: 'https://www.ypf.com/', titlePattern: 'YPF', minimumTextLength: 100, minimumLoadedStylesheets: 1 };
  const config = { slowPageMs: 12000, maxRuns: 600, historyDays: 90 };
  const anchor = Math.floor(now.getTime() / 14400000) * 14400000;
  for (let i = 0; i < 42; i++) {
    const results = ['desktop', 'mobile'].map(viewport => {
      const data = { httpStatus: 200, finalUrl: target.url, title: 'Home - YPF', textLength: 4200, loadedStylesheets: 6,
        missingSelectors: [], badStyles: [], brokenImages: [], pendingImages: [], resourceErrors: [], pageErrors: [], consoleErrors: [], thirdPartyErrors: [],
        headingSamples: ['Noticias YPF'], links: [], domContentLoadedMs: 900 + ((i * 137) % 1400) + (viewport === 'mobile' ? 450 : 0), horizontalOverflow: false };
      if ([6, 7, 23, 30, 41].includes(i)) { data.brokenImages.push('https://www.ypf.com/images/fixture-noticia.webp'); data.resourceErrors.push({ url: data.brokenImages[0], type: 'image', status: 404, error: 'HTTP 404 · EJEMPLO SIMULADO' }); }
      if ([14, 15, 31].includes(i)) { data.badStyles.push('https://www.ypf.com/css/fixture.css'); data.loadedStylesheets = 0; data.resourceErrors.push({ url: data.badStyles[0], type: 'stylesheet', status: 404, error: 'HTTP 404 · EJEMPLO SIMULADO' }); }
      if ([20, 21, 41].includes(i) && viewport === 'mobile') data.pageErrors.push('TypeError simulado: el carrusel no pudo inicializarse');
      if ([34, 35].includes(i)) { data.httpStatus = 503; data.title = 'Servicio no disponible'; }
      if ([10, 11].includes(i)) data.domContentLoadedMs = 14500;
      return { targetId: target.id, name: target.name, url: target.url, viewport, depth: 0, data, ...assess(data, target, config), screenshot: null, trace: null };
    });
    latest = { mode: 'test', id: `fixture-${String(i + 1).padStart(3, '0')}`, timestamp: new Date(anchor - (41 - i) * 14400000).toISOString(),
      status: overall(results), runUrl: null, results, crawl: { strategy: 'bfs', checkedPages: 1, discoveredPages: 98, complete: false, stopReason: 'fixture',
        externalDiscovered: 12, externalChecks: [], unchecked: [], checkedUrls: [target.url], edges: [], skipped: {} } };
    const next = buildHistory(history, latest, config); history.splice(0, history.length, ...next);
  }
  return { latest, history };
}
