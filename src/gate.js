import { readFile } from 'node:fs/promises';
import { evaluateReport } from './policy.js';
const report = JSON.parse(await readFile('results/latest.json', 'utf8'));
const verdict = evaluateReport(report, process.env.HEALTH_POLICY || 'report');
console.log(verdict.message);
if (process.env.GITHUB_ACTIONS) {
  const escaped = verdict.message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.log(`::${verdict.level} title=Resultado del monitoreo::${escaped}`);
}
process.exitCode = verdict.exitCode;
