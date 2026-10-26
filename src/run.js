import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { inspect } from './monitor.js';
import { crawl } from './crawl.js';
import { overall } from './health.js';

const config = JSON.parse(await readFile('config.json', 'utf8'));
if (process.env.CRAWL_STRATEGY) config.crawl.strategy = process.env.CRAWL_STRATEGY;
for (const [key, env] of [['maxPages', 'MAX_PAGES'], ['maxDepth', 'MAX_DEPTH']]) {
  if (process.env[env]) { const value = Number(process.env[env]); if (!Number.isInteger(value) || value < 1) throw new Error(`${env} debe ser un entero positivo`); config.crawl[key] = value; }
}
const report = { id: `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${process.env.GITHUB_RUN_ID || 'local'}`, timestamp: new Date().toISOString(),
  runUrl: process.env.GITHUB_ACTIONS ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  status: 'failed', results: [] };
await mkdir('results', { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  if (config.crawl?.enabled) Object.assign(report, await crawl({ browser, config, inspect, outputDir: 'results' }));
  else for (const target of config.targets) {
    for (const viewport of target.viewports) report.results.push(await inspect(browser, target, viewport, config, 'results'));
  }
  if (!report.results.length) throw new Error('No hay controles configurados');
  report.status = overall([...report.results, ...(report.crawl?.externalChecks || [])]);
} catch (error) {
  report.infrastructureError = error.message;
} finally {
  try { await browser?.close(); } catch (error) { report.status = 'failed'; report.infrastructureError = error.message; }
  const executionErrors = report.results.filter(result => result.executionError);
  if (executionErrors.length && !report.infrastructureError) report.infrastructureError = `${executionErrors.length} comprobaciones no pudieron ejecutarse por errores del monitor.`;
  const nonHealthy = report.results.filter(result => result.status !== 'healthy');
  report.observationStatus = report.results.length && report.results.every(result => result.observationStatus === 'blocked') ? 'blocked' : nonHealthy.length && nonHealthy.every(result => ['blocked', 'unconfirmed'].includes(result.observationStatus)) ? 'partial-observation' : 'completed';
  report.blockedChecks = report.results.filter(result => result.observationStatus === 'blocked').length;
  report.unconfirmedChecks = report.results.filter(result => result.observationStatus === 'unconfirmed').length;
  report.executionStatus = report.infrastructureError ? 'failed' : 'completed';
  await writeFile('results/latest.json', JSON.stringify(report, null, 2));
}
console.log(`${report.status.toUpperCase()} · ${report.results.length} controles · ${report.id}`);
// Technical errors stay failures even in report-only health mode. Publication still happens first.
