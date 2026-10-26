import { readFile } from 'node:fs/promises';
const report = JSON.parse(await readFile('results/latest.json', 'utf8'));
if (report.status !== 'healthy') {
  console.error(`Salud ${report.status}. Revisá el panel y los artefactos de esta ejecución.`);
  process.exitCode = 1;
}
