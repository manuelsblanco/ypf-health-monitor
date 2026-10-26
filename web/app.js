const labels = { healthy: 'Operativo', degraded: 'Con incidencias', failed: 'Fallo' };
const colors = { healthy: '#167447', degraded: '#9b6800', failed: '#b42336' };
const issueLabels = { images: 'Imágenes', css: 'CSS', javascript: 'JavaScript', links: 'Páginas', other: 'Otros' };
const issueColors = { images: '#0451e4', css: '#3c3c3c', javascript: '#9b6800', links: '#b42336', other: '#167447' };
const element = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const observationLabels = { 'partial-observation': 'Verificación parcial', blocked: 'No verificable desde el monitor', unconfirmed: 'Pendiente de confirmación', 'recovered-on-retry': 'Recuperado al reintentar' };
const badge = (status, observation) => element('span', observationLabels[observation] || labels[status] || status, `badge ${status}`);
const date = value => new Date(value).toLocaleString('es-AR');
const link = (text, href) => { const a = element('a', text); a.href = href; a.rel = 'noopener'; a.target = '_blank'; return a; };
const seconds = value => Number.isFinite(value) ? `${(value / 1000).toFixed(2)} s` : 'Sin métrica';
function svgElement(tag, attrs = {}, text) { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; }
function selectRun(run) { document.querySelector('#selection').textContent = `${run.id} · ${date(run.timestamp)} · ${observationLabels[run.observationStatus] || labels[run.status]} · ${run.metrics?.checkedPages ?? run.coverage?.checkedPages ?? '—'} páginas · ${seconds(run.metrics?.averageDomContentLoadedMs)} · ${run.metrics?.totalIssues ?? 'Sin métrica de'} incidencias`; }
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
  for (let i = 0; i <= 4; i++) { const value = maxY * i / 4; svg.append(svgElement('line', { x1: left, x2: w - right, y1: y(value), y2: y(value), stroke: '#e6e6e6', 'stroke-width': 1 }), svgElement('text', { x: left - 8, y: y(value) + 4, fill: '#626262', 'font-size': 11, 'text-anchor': 'end' }, value.toFixed(kind === 'latency' ? 1 : 0))); }
  if (kind === 'latency') {
    // Gaps remain gaps when older historical records lack metrics.
    let segment = [];
    const flush = () => { if (segment.length) svg.append(svgElement('polyline', { points: segment.join(' '), fill: 'none', stroke: '#0451e4', 'stroke-width': 2.5 })); segment = []; };
    for (const run of runs) { if (!Number.isFinite(run.metrics?.averageDomContentLoadedMs)) flush(); else segment.push(`${x(run)},${y(run.metrics.averageDomContentLoadedMs / 1000)}`); } flush();
  }
  for (const run of valid) {
    const group = svgElement('g', { tabindex: 0, role: 'button', 'aria-label': `${date(run.timestamp)} · ${observationLabels[run.observationStatus] || labels[run.status]} · ${kind === 'latency' ? seconds(run.metrics.averageDomContentLoadedMs) : run.metrics.totalIssues + ' incidencias'}`, class: 'chart-point' });
    group.append(svgElement('title', {}, `${date(run.timestamp)} · ${run.id} · ${observationLabels[run.observationStatus] || labels[run.status]}\n${seconds(run.metrics.averageDomContentLoadedMs)} · ${run.metrics.totalIssues} incidencias`));
    if (kind === 'latency') group.append(svgElement('circle', { cx: x(run), cy: y(run.metrics.averageDomContentLoadedMs / 1000), r: 4.2, fill: colors[run.status] }));
    else {
      const width = Math.max(3, Math.min(16, plotW / Math.max(1, runs.length) * 0.65)); let sum = 0;
      for (const key of Object.keys(issueLabels)) { const value = run.metrics.issues[key] || 0; if (value) group.append(svgElement('rect', { x: x(run) - width / 2, y: y(sum + value), width, height: Math.max(1, y(sum) - y(sum + value)), fill: issueColors[key] })); sum += value; }
      if (!sum) group.append(svgElement('circle', { cx: x(run), cy: y(0), r: 2.4, fill: colors.healthy }));
    }
    group.addEventListener('click', () => selectRun(run)); group.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); selectRun(run); } }); svg.append(group);
  }
  svg.append(svgElement('text', { x: left, y: h - 8, fill: '#626262', 'font-size': 11 }, new Date(start).toLocaleString('es-AR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })), svgElement('text', { x: w - right, y: h - 8, fill: '#626262', 'font-size': 11, 'text-anchor': 'end' }, new Date(end).toLocaleString('es-AR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })));
  container.append(svg);
  const legend = element('div', undefined, 'legend');
  const entries = kind === 'latency' ? Object.entries(labels) : Object.entries(issueLabels);
  for (const [key, text] of entries) { const item = element('span', text); const dot = element('i'); dot.style.background = kind === 'latency' ? colors[key] : issueColors[key]; item.prepend(dot); legend.append(item); } container.append(legend);
}
function renderHistory(history) {
  const days = document.querySelector('#period').value;
  const cutoff = days === 'all' ? 0 : Date.now() - Number(days) * 86400000;
  const runs = history.filter(r => Date.parse(r.timestamp) >= cutoff);
  const verifiable = runs.filter(r => r.verificationPolicy === 'confirm-v1' && !['blocked', 'partial-observation'].includes(r.observationStatus));
  const healthy = verifiable.filter(r => r.status === 'healthy').length;
  const measured = runs.filter(r => r.metrics);
  const totalIssues = measured.reduce((n, r) => n + r.metrics.totalIssues, 0);
  const durations = measured.map(r => r.metrics.averageDomContentLoadedMs).filter(Number.isFinite);
  const kpis = document.querySelector('#kpis'); kpis.replaceChildren();
  for (const [title, value, note] of [['Muestras operativas', verifiable.length ? `${(100 * healthy / verifiable.length).toFixed(1)} %` : 'Sin datos', `${verifiable.length} ejecuciones verificables; ${runs.length - verifiable.length} sin verificación suficiente`], ['Ejecuciones', runs.length, 'Dentro del período seleccionado'], ['Observaciones registradas', measured.length ? totalIssues : 'Sin métrica', `${measured.length} ejecuciones con métricas`], ['Carga media', durations.length ? seconds(durations.reduce((a, b) => a + b, 0) / durations.length) : 'Sin métrica', 'Promedio de DOMContentLoaded']]) { const card = element('article', undefined, 'kpi'); card.append(element('p', title, 'muted'), element('strong', String(value)), element('p', note, 'muted')); kpis.append(card); }
  chart(document.querySelector('#latency-chart'), runs, 'latency'); chart(document.querySelector('#errors-chart'), runs, 'errors');
  document.querySelector('#availability').textContent = `${healthy} de ${verifiable.length} ejecuciones verificables operativas. ${runs.length - verifiable.length} ejecuciones sin verificación suficiente excluidas del porcentaje.`;
  const timeline = document.querySelector('#timeline'); timeline.replaceChildren();
  for (const run of runs) { const block = element('button', '', `block ${run.status}`); block.type = 'button'; block.title = `${date(run.timestamp)} · ${observationLabels[run.observationStatus] || labels[run.status]}`; block.setAttribute('aria-label', block.title); block.addEventListener('click', () => selectRun(run)); timeline.append(block); }
  const tbody = document.querySelector('#history'); tbody.replaceChildren();
  for (const run of [...runs].reverse()) { const tr = element('tr'), state = element('td'), source = element('td'); state.append(badge(run.status, run.observationStatus)); if (run.runUrl) source.append(link('Ver en GitHub ↗', run.runUrl)); else { const b = element('button', `Local · ${run.id}`); b.type = 'button'; b.addEventListener('click', () => selectRun(run)); source.append(b); }
    tr.append(element('td', date(run.timestamp)), state, element('td', String(run.metrics?.checkedPages ?? run.coverage?.checkedPages ?? '—')), element('td', seconds(run.metrics?.averageDomContentLoadedMs)), element('td', String(run.metrics?.totalIssues ?? 'Sin métrica')), source); tbody.append(tr); }
  document.querySelector('#selection').textContent = runs.length ? 'Seleccioná una ejecución en los gráficos, bloques o tabla.' : 'No hay muestras en este período.';
}
function copyButton(report, options = {}, label = 'Copiar diagnóstico para IA') {
  const button = element('button', label, 'copy-diagnostic'); button.type = 'button';
  button.addEventListener('click', async () => {
    const text = HealthDiagnostics.buildDiagnosticText(report, { ...options, baseUrl: location.href });
    try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard no disponible'); await navigator.clipboard.writeText(text); button.textContent = 'Copiado'; document.querySelector('#copy-status').textContent = 'Diagnóstico copiado'; setTimeout(() => { button.textContent = label; }, 2000); }
    catch { const dialog = document.querySelector('#copy-dialog'); const field = document.querySelector('#copy-text'); field.value = text; dialog.showModal(); field.focus(); field.select(); }
  });
  return button;
}
function renderChecks(latest) {
  const container = document.querySelector('#checks'); container.replaceChildren();
  const filter = document.querySelector('#state-filter').value;
  const results = latest.results.filter(r => filter === 'all' || (filter === 'issues' ? r.status !== 'healthy' : r.status === 'failed'));
  document.querySelector('#no-checks').hidden = !!results.length;
  for (const result of results) {
    const card = element('article', undefined, 'card');
    card.append(copyButton(latest, { result }), badge(result.status, result.observationStatus), element('h3', `${result.data.title || result.name} · ${result.viewport}`), link(result.url, result.url));
    for (const check of result.checks) { const uncertain = check.status !== 'healthy' && check.confirmed === false; const row = element('details', undefined, `check ${uncertain ? 'degraded' : check.status}`); row.open = check.status !== 'healthy'; row.append(element('summary', `${uncertain ? 'Observación sin confirmar' : labels[check.status]} · ${check.message}`)); if (check.details.length) row.append(element('pre', JSON.stringify(check.details, null, 2))); if (check.status !== 'healthy') row.append(copyButton(latest, { result, check }, 'Copiar este error')); card.append(row); }
    if (result.confirmation) { const attempts = element('details'); attempts.append(element('summary', `${result.confirmation.attemptCount} intento(s) · ${observationLabels[result.observationStatus] || 'Comprobación completada'}`), element('pre', JSON.stringify(result.confirmation.attempts, null, 2))); card.append(attempts); }
    if (result.data.thirdPartyErrors?.length) { const details = element('details'); details.append(element('summary', `${result.data.thirdPartyErrors.length} fallos de terceros (informativos)`), element('p', 'Son observaciones de red externas. Las cancelaciones no confirman por sí solas una falla del sitio.', 'muted'), copyButton(latest, { result, thirdPartyOnly: true }, 'Copiar errores de terceros'), element('pre', JSON.stringify(result.data.thirdPartyErrors, null, 2))); for (const error of result.data.thirdPartyErrors) { const hint = element('p', HealthDiagnostics.describeNetworkError(error).interpretation.join(' '), 'muted'); details.append(hint); } card.append(details); }
    if (result.data.unavailableInteractions?.length) card.append(element('p', `Controles no disponibles: ${result.data.unavailableInteractions.join(', ')}. Sus estados no fueron verificados.`, 'muted'));
    if (result.screenshot) card.append(link('Ver captura ↗', `evidence/${result.screenshot}`));
    container.append(card);
  }
}
async function start() {
  const data = await (async () => { const responses = await Promise.all(['latest', 'history'].map(async name => { const response = await fetch(`data/${name}.json`, { cache: 'no-store' }); if (!response.ok) throw new Error(`No se pudo cargar ${name}: HTTP ${response.status}`); return response.json(); })); return { latest: responses[0], history: responses[1] }; })();
  const { latest, history } = data;
  const summary = document.querySelector('#summary'); summary.replaceChildren();
  const stale = Date.now() - Date.parse(latest.timestamp) > 6 * 3600000;
  summary.append(badge(latest.status, latest.observationStatus), element('h2', stale ? 'Informe desactualizado' : 'Estado de las páginas revisadas'), element('p', date(latest.timestamp)));
  const blocked = latest.results.filter(result => result.observationStatus === 'blocked').length;
  const uncertain = latest.results.filter(result => result.observationStatus === 'unconfirmed').length;
  if (blocked || uncertain) summary.append(element('p', `${blocked} comprobaciones bloqueadas y ${uncertain} sin confirmar. Estos estados no prueban que el sitio esté caído.`, 'muted'));
  if (latest.runUrl) summary.append(link('Ver ejecución en GitHub ↗', latest.runUrl));
  if (latest.infrastructureError) summary.append(element('pre', latest.infrastructureError));
  if (latest.crawl) { const c = latest.crawl; summary.append(element('p', `${c.strategy.toUpperCase()} · ${c.checkedPages} páginas revisadas de ${c.discoveredPages} descubiertas · ${c.complete ? 'Alcance configurado completado' : 'Recorrido parcial: ' + c.stopReason}`), element('p', `${c.externalDiscovered} enlaces externos descubiertos · ${c.externalChecks.length} comprobados. Los pendientes no se consideran verificados.`, 'muted')); if (c.externalChecks.length) { const details = element('details'); details.append(element('summary', 'Resultados externos'), element('pre', JSON.stringify(c.externalChecks, null, 2))); summary.append(details); } }
  const allCopy = copyButton(latest, {}, 'Copiar informe para IA'); allCopy.id = 'copy-all'; document.querySelector('#copy-all').replaceWith(allCopy);
  renderHistory(history); renderChecks(latest);
  document.querySelector('#period').addEventListener('change', () => renderHistory(history)); document.querySelector('#state-filter').addEventListener('change', () => renderChecks(latest));
  const download = document.querySelector('#export'); download.disabled = false; download.addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = element('a'); a.href = url; a.download = 'ypf-health-live.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
}
start().catch(error => { document.querySelector('#summary').replaceChildren(element('h2', 'Sin datos disponibles'), element('p', error.message)); });
