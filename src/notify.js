import { readFile, writeFile, mkdtemp, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { emailConfiguration, sendPendingEmails } from './email.js';
import { collectAlerts, synchronizeAlerts } from './alerts.js';
const exec = promisify(execFile);
const config = JSON.parse(await readFile('config.json', 'utf8'));
const report = JSON.parse(await readFile('results/latest.json', 'utf8'));
if (process.argv.includes('--dry-run')) { console.log(JSON.stringify(collectAlerts(report).map(({ result, ...alert }) => alert), null, 2)); process.exit(0); }
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Las alertas se envían desde Actions. Para inspección local usar --dry-run.');
const repository = process.env.GITHUB_REPOSITORY;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('GITHUB_REPOSITORY inválido');
const settings = { ...config.notifications, assignees: (process.env.ALERT_ASSIGNEES || config.notifications.assignees.join(',')).split(',').map(x => x.trim()).filter(Boolean) };
if (!settings.enabled) { console.log('Alertas desactivadas por configuración'); process.exit(0); }
const temp = await mkdtemp(join(tmpdir(), 'ypf-notify-'));
let sequence = 0;
try {
  const request = async (method, endpoint, body) => {
    const args = ['api', '--hostname', 'github.com', '--method', method, endpoint];
    if (body) { const file = join(temp, `${sequence++}.json`); await writeFile(file, JSON.stringify(body)); args.push('--input', file); }
    try { const { stdout } = await exec('gh', args, { maxBuffer: 8 * 1024 * 1024 }); return stdout.trim() ? JSON.parse(stdout) : null; }
    catch (error) { throw new Error(`GitHub ${method} ${endpoint}: ${error.stderr || error.message}`); }
  };
  const base = `repos/${repository}`;
  // Paginate all managed issues, including closed ones, to reopen recurrences rather than duplicate them.
  const client = {
    async listIssues(label) {
      const all = [];
      for (let page = 1; page <= 50; page++) {
        const batch = await request('GET', `${base}/issues?state=all&labels=${encodeURIComponent(label)}&per_page=100&page=${page}`);
        all.push(...batch); if (batch.length < 100) return all;
      }
      throw new Error('Demasiadas alertas para sincronizar de forma segura; no se crearon duplicados.');
    },
    createIssue: body => request('POST', `${base}/issues`, body),
    editIssue: (number, body) => request('PATCH', `${base}/issues/${number}`, body),
    comment: (number, body) => request('POST', `${base}/issues/${number}/comments`, { body }),
  };
  // An existing label is reused; any permission or API failure remains a visible technical error.
  await exec('gh', ['label', 'create', settings.label, '--repo', repository, '--color', '0451E4', '--description', 'Incidencias automáticas del monitor de salud web', '--force']);
  const mailConfig = emailConfiguration();
  const result = await synchronizeAlerts(client, report, settings);
  result.email = await sendPendingEmails(client, settings, mailConfig, report);
  if (!result.email.enabled) console.log('::warning::Correo directo sin configurar. Los avisos están disponibles en GitHub Issues.');
  await writeFile('results/alerts.json', JSON.stringify(result, null, 2));
  const counts = result.events.reduce((out, e) => ({ ...out, [e.action]: (out[e.action] || 0) + 1 }), {});
  console.log(JSON.stringify(counts));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Alertas de salud\n\n${result.incidents} incidencias observadas. Creadas: ${counts.created || 0}; reabiertas: ${counts.reopened || 0}; recuperadas: ${counts.resolved || 0}; sin cambio: ${counts.unchanged || 0}; diferidas por límite: ${counts['deferred-limit'] || 0}.\n\n[Ver alertas](https://github.com/${repository}/issues?q=is%3Aissue+label%3A${encodeURIComponent(settings.label)})\n`);
} finally { await rm(temp, { recursive: true, force: true }); }
