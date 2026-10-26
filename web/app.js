const labels = { healthy: 'Operativo', degraded: 'Con incidencias', failed: 'Fallo' };
const colors = { healthy: '#71dfb7', degraded: '#ffd27a', failed: '#ff8d9e' };
const issueLabels = { images: 'Imágenes', css: 'CSS', javascript: 'JavaScript', links: 'Páginas', other: 'Otros' };
const issueColors = { images: '#62b7ff', css: '#b59aff', javascript: '#ffd27a', links: '#ff8d9e', other: '#71dfb7' };
const element = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const badge = status => element('span', labels[status] || status, `badge ${status}`);
const date = value => new Date(value).toLocaleString('es-AR');
const link = (text, href) => { const a = element('a', text); a.href = href; a.rel = 'noopener'; a.target = '_blank'; return a; };
const seconds = value => Number.isFinite(value) ? `${(value / 1000).toFixed(2)} s` : 'Sin métrica';
function svgElement(tag, attrs = {}, text) { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; }
function selectRun(run) { document.querySelector('#selection').textContent = `${run.mode === 'demo' ? 'SIMULADO · ' : ''}${run.id} · ${date(run.timestamp)} · ${labels[run.status]} · ${run.metrics?.checkedPages ?? run.coverage?.checkedPages ?? '—'} páginas · ${seconds(run.metrics?.averageDomContentLoadedMs)} · ${run.metrics?.totalIssues ?? 'Sin métrica de'} incidencias`; }
function chart(container, runs, kind) {
  container.replaceChildren();
  const valid = runs.filter(r => r.metrics && (kind !== 'latency' || Number.isFinite(r.metrics.averageDomContentLoadedMs)));
  if (!valid.length) { container.append(element('p', 'Todavía no hay métricas disponibles para este período.', 'muted')); return; }
  const w = 620, h = 225, left = 40, right = 18, top = 20, bottom = 35, plotW = w - left - right, plotH = h - top - bottom;
  const start = Math.min(...runs.map(r => Date.parse(r.timestamp))), end = Math.max(...runs.map(r => Date.parse(r.timestamp)));
  const x = run => left + (end === start ? 0.5 : (Date.parse(run.timestamp) - start) / (end - start)) * plotW;
  const maximum = Math.max(1, ...valid.map(r => kind === 'latency' ? r.metrics.averageDomContentLoadedMs / 1000 : r.metrics.totalIssues));
  const maxY = Math.ceil(maximum * 1.15);
  const y = value => top + plotH * (1 - value / maxY);
  const svg = svgElement('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': `${kind === 'latency' ? 'Carga media en segundos' : 'Incidencias'}: ${valid.length} ejecuciones con métricas`, class: 'chart' });
  for (let i = 0; i <= 4; i++) { const value = maxY * i / 4; svg.append(svgElement('line', { x1: left, x2: w - right, y1: y(value), y2: y(value), stroke: '#2a3b55', 'stroke-width': 1 }), svgElement('text', { x: left - 8, y: y(value) + 4, fill: '#9ab0d1', 'font-size': 11, 'text-anchor': 'end' }, value.toFixed(kind === 'latency' ? 1 : 0))); }
  if (kind === 'latency') {
    // Gaps remain gaps when older historical records lack metrics.
    let segment = [];
    const flush = () => { if (segment.length) svg.append(svgElement('polyline', { points: segment.join(' '), fill: 'none', stroke: '#62b7ff', 'stroke-width': 2.5 })); segment = []; };
    for (const run of runs) { if (!Number.isFinite(run.metrics?.averageDomContentLoadedMs)) flush(); else segment.push(`${x(run)},${y(run.metrics.averageDomContentLoadedMs / 1000)}`); } flush();
  }
  for (const run of valid) {
    const group = svgElement('g', { tabindex: 0, role: 'button', 'aria-label': `${date(run.timestamp)} · ${labels[run.status]} · ${kind === 'latency' ? seconds(run.metrics.averageDomContentLoadedMs) : run.metrics.totalIssues + ' incidencias'}`, class: 'chart-point' });
    group.append(svgElement('title', {}, `${date(run.timestamp)} · ${run.id} · ${labels[run.status]}\n${seconds(run.metrics.averageDomContentLoadedMs)} · ${run.metrics.totalIssues} incidencias`));
    if (kind === 'latency') group.append(svgElement('circle', { cx: x(run), cy: y(run.metrics.averageDomContentLoadedMs / 1000), r: 4.2, fill: colors[run.status] }));
    else {
      const width = Math.max(3, Math.min(16, plotW / Math.max(1, runs.length) * 0.65)); let sum = 0;
      for (const key of Object.keys(issueLabels)) { const value = run.metrics.issues[key] || 0; if (value) group.append(svgElement('rect', { x: x(run) - width / 2, y: y(sum + value), width, height: Math.max(1, y(sum) - y(sum + value)), fill: issueColors[key] })); sum += value; }
      if (!sum) group.append(svgElement('circle', { cx: x(run), cy: y(0), r: 2.4, fill: colors.healthy }));
    }
    group.addEventListener('click', () => selectRun(run)); group.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); selectRun(run); } }); svg.append(group);
  }
  svg.append(svgElement('text', { x: left, y: h - 8, fill: '#9ab0d1', 'font-size': 11 }, new Date(start).toLocaleString('es-AR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })), svgElement('text', { x: w - right, y: h - 8, fill: '#9ab0d1', 'font-size': 11, 'text-anchor': 'end' }, new Date(end).toLocaleString('es-AR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })));
  container.append(svg);
  const legend = element('div', undefined, 'legend');
  const entries = kind === 'latency' ? Object.entries(labels) : Object.entries(issueLabels);
  for (const [key, text] of entries) { const item = element('span', text); const dot = element('i'); dot.style.background = kind === 'latency' ? colors[key] : issueColors[key]; item.prepend(dot); legend.append(item); } container.append(legend);
}
function renderHistory(history) {
  const days = document.querySelector('#period').value;
  const cutoff = days === 'all' ? 0 : Date.now() - Number(days) * 86400000;
  const runs = history.filter(r => Date.parse(r.timestamp) >= cutoff);
  const healthy = runs.filter(r => r.status === 'healthy').length;
  const measured = runs.filter(r => r.metrics);
  const totalIssues = measured.reduce((n, r) => n + r.metrics.totalIssues, 0);
  const durations = measured.map(r => r.metrics.averageDomContentLoadedMs).filter(Number.isFinite);
  const kpis = document.querySelector('#kpis'); kpis.replaceChildren();
  for (const [title, value, note] of [['Muestras operativas', runs.length ? `${(100 * healthy / runs.length).toFixed(1)} %` : 'Sin datos', 'Porcentaje de ejecuciones saludables'], ['Ejecuciones', runs.length, 'Dentro del período seleccionado'], ['Incidencias registradas', measured.length ? totalIssues : 'Sin métrica', `${measured.length} ejecuciones con métricas`], ['Carga media', durations.length ? seconds(durations.reduce((a, b) => a + b, 0) / durations.length) : 'Sin métrica', 'Promedio de DOMContentLoaded']]) { const card = element('article', undefined, 'kpi'); card.append(element('p', title, 'muted'), element('strong', String(value)), element('p', note, 'muted')); kpis.append(card); }
  chart(document.querySelector('#latency-chart'), runs, 'latency'); chart(document.querySelector('#errors-chart'), runs, 'errors');
  document.querySelector('#availability').textContent = `${healthy} de ${runs.length} ejecuciones operativas en el período seleccionado.`;
  const timeline = document.querySelector('#timeline'); timeline.replaceChildren();
  for (const run of runs) { const block = element('button', '', `block ${run.status}`); block.type = 'button'; block.title = `${date(run.timestamp)} · ${labels[run.status]}`; block.setAttribute('aria-label', block.title); block.addEventListener('click', () => selectRun(run)); timeline.append(block); }
  const tbody = document.querySelector('#history'); tbody.replaceChildren();
  for (const run of [...runs].reverse()) { const tr = element('tr'), state = element('td'), source = element('td'); state.append(badge(run.status)); if (run.runUrl) source.append(link('Ver en GitHub ↗', run.runUrl)); else { const b = element('button', `${run.mode === 'demo' ? 'Demo' : 'Local'} · ${run.id}`); b.type = 'button'; b.addEventListener('click', () => selectRun(run)); source.append(b); }
    tr.append(element('td', date(run.timestamp)), state, element('td', String(run.metrics?.checkedPages ?? run.coverage?.checkedPages ?? '—')), element('td', seconds(run.metrics?.averageDomContentLoadedMs)), element('td', String(run.metrics?.totalIssues ?? 'Sin métrica')), source); tbody.append(tr); }
  document.querySelector('#selection').textContent = runs.length ? 'Seleccioná una ejecución en los gráficos, bloques o tabla.' : 'No hay muestras en este período.';
}
function renderChecks(latest) {
  const container = document.querySelector('#checks'); container.replaceChildren();
  const filter = document.querySelector('#state-filter').value;
  const results = latest.results.filter(r => filter === 'all' || (filter === 'issues' ? r.status !== 'healthy' : r.status === 'failed'));
  document.querySelector('#no-checks').hidden = !!results.length;
  for (const result of results) {
    const card = element('article', undefined, 'card');
    card.append(badge(result.status), element('h3', `${result.data.title || result.name} · ${result.viewport}`), link(result.url, result.url));
    for (const check of result.checks) { const row = element('details', undefined, `check ${check.status}`); row.open = check.status !== 'healthy'; row.append(element('summary', `${labels[check.status]} · ${check.message}`)); if (check.details.length) row.append(element('pre', JSON.stringify(check.details, null, 2))); card.append(row); }
    if (result.data.thirdPartyErrors?.length) { const details = element('details'); details.append(element('summary', `${result.data.thirdPartyErrors.length} fallos de terceros (informativos)`), element('pre', JSON.stringify(result.data.thirdPartyErrors, null, 2))); card.append(details); }
    if (result.data.unavailableInteractions?.length) card.append(element('p', `Controles no disponibles: ${result.data.unavailableInteractions.join(', ')}. Sus estados no fueron verificados.`, 'muted'));
    if (result.screenshot) card.append(link('Ver captura ↗', `evidence/${result.screenshot}`));
    else if (latest.mode === 'demo') card.append(element('p', 'Ejemplo simulado: no se generaron capturas ni trazas reales.', 'muted'));
    container.append(card);
  }
}
async function start() {
  const data = globalThis.__MONITOR_DEMO__ || await (async () => { const responses = await Promise.all(['latest', 'history'].map(async name => { const response = await fetch(`data/${name}.json`, { cache: 'no-store' }); if (!response.ok) throw new Error(`No se pudo cargar ${name}: HTTP ${response.status}`); return response.json(); })); return { latest: responses[0], history: responses[1] }; })();
  const { latest, history } = data;
  const demo = latest.mode === 'demo'; document.querySelector('#demo-banner').hidden = !demo;
  const summary = document.querySelector('#summary'); summary.replaceChildren();
  const stale = !demo && Date.now() - Date.parse(latest.timestamp) > 6 * 3600000;
  summary.append(badge(latest.status), element('h2', demo ? 'Último estado simulado' : stale ? 'Informe desactualizado' : 'Estado de las páginas revisadas'), element('p', date(latest.timestamp)));
  if (latest.runUrl) summary.append(link('Ver ejecución en GitHub ↗', latest.runUrl));
  if (latest.infrastructureError) summary.append(element('pre', latest.infrastructureError));
  if (latest.crawl) { const c = latest.crawl; summary.append(element('p', `${c.strategy.toUpperCase()} · ${c.checkedPages} páginas revisadas de ${c.discoveredPages} descubiertas · ${c.complete ? 'Alcance configurado completado' : 'Recorrido parcial: ' + c.stopReason}`), element('p', `${c.externalDiscovered} enlaces externos descubiertos · ${c.externalChecks.length} comprobados. Los pendientes no se consideran verificados.`, 'muted')); if (c.externalChecks.length) { const details = element('details'); details.append(element('summary', 'Resultados externos'), element('pre', JSON.stringify(c.externalChecks, null, 2))); summary.append(details); } }
  renderHistory(history); renderChecks(latest);
  document.querySelector('#period').addEventListener('change', () => renderHistory(history)); document.querySelector('#state-filter').addEventListener('change', () => renderChecks(latest));
  const download = document.querySelector('#export'); download.disabled = false; download.addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = element('a'); a.href = url; a.download = `ypf-health-${demo ? 'DEMO' : 'live'}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
}
start().catch(error => { document.querySelector('#summary').replaceChildren(element('h2', 'Sin datos disponibles'), element('p', error.message)); });
