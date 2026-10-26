const statuses = new Set(['healthy', 'degraded', 'failed']);
export function evaluateReport(report, policy = 'report') {
  const technical = message => ({ exitCode: 1, level: 'error', category: 'execution', message });
  if (!['report', 'strict'].includes(policy)) return technical(`Política desconocida: ${policy}`);
  if (!report || !statuses.has(report.status) || !Array.isArray(report.results) || !report.results.length) return technical('El monitor no generó un informe válido con comprobaciones.');
  if (report.results.some(result => !statuses.has(result.status))) return technical('El informe contiene estados de comprobación inválidos.');
  const executionErrors = report.results.filter(result => result.executionError);
  if (report.infrastructureError || report.executionStatus === 'failed' || executionErrors.length) return technical(report.infrastructureError || `${executionErrors.length} comprobaciones no pudieron ejecutarse por errores del monitor.`);
  if (report.status === 'healthy' && report.results.some(result => result.status !== 'healthy')) return technical('El estado global contradice los resultados del informe.');
  if (report.status === 'healthy') return { exitCode: 0, level: 'notice', category: 'health', message: 'Monitoreo completado. Las páginas revisadas están operativas.' };
  return {
    exitCode: policy === 'strict' ? 1 : 0,
    level: policy === 'strict' ? 'error' : 'warning', category: 'health',
    message: `Monitoreo completado. Salud del sitio: ${report.status}. Las incidencias están en el dashboard y los artefactos.${policy === 'strict' ? ' Política estricta: el pipeline queda rojo.' : ' Política informativa: el pipeline continúa correctamente.'}`,
  };
}
export function renderSummary(report, policy = 'report') {
  const verdict = evaluateReport(report, policy);
  const counts = { healthy: 0, degraded: 0, failed: 0 };
  for (const result of report.results || []) if (result.status in counts) counts[result.status]++;
  const cell = value => String(value ?? '—').replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ');
  const lines = [`## Monitoreo YPF · salud ${cell(report.status)}`, '', verdict.message, '',
    `**Política:** ${policy}. El estado del pipeline describe la ejecución; el estado del sitio se informa por separado.`, '',
    `Comprobaciones: ${counts.healthy} operativas, ${counts.degraded} con incidencias y ${counts.failed} con fallos.`, ''];
  if (report.crawl) lines.push(`**Cobertura:** ${report.crawl.checkedPages} páginas revisadas de ${report.crawl.discoveredPages} descubiertas. ${report.crawl.complete ? 'Alcance configurado completado.' : `Recorrido parcial (${cell(report.crawl.stopReason)}); los enlaces pendientes no están verificados.`}`, '');
  lines.push('| Página | Vista | Salud | Comprobaciones con problemas | Errores de terceros (informativos) |', '|---|---|---|---|---|');
  for (const result of report.results || []) lines.push(`| ${cell(result.url)} | ${cell(result.viewport)} | ${cell(result.status)} | ${cell((result.checks || []).filter(check => check.status !== 'healthy').map(check => check.message).join('; ') || 'Sin incidencias')} | ${result.data?.thirdPartyErrors?.length || 0} |`);
  if (report.infrastructureError) lines.push('', `**Error técnico:** ${cell(report.infrastructureError)}`);
  lines.push('', 'Los detalles completos, URLs, capturas y diagnósticos copiables están en el dashboard y en `latest.json` del artefacto de esta ejecución. Los errores de terceros no se convierten automáticamente en fallos del sitio.');
  return lines.join('\n') + '\n';
}
