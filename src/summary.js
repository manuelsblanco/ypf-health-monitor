import { readFile, appendFile } from 'node:fs/promises';
import { renderSummary } from './policy.js';
let summary;
try { const report = JSON.parse(await readFile('results/latest.json', 'utf8')); summary = renderSummary(report, process.env.HEALTH_POLICY || 'report'); }
catch (error) { if (error.code !== 'ENOENT') throw error; summary = '## Monitoreo YPF\n\nNo se generó el informe. Revisar los pasos técnicos anteriores del pipeline.\n'; }
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
else console.log(summary);
