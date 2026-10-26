import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { buildHistory } from './history.js';
const config = JSON.parse(await readFile('config.json', 'utf8'));
const latest = JSON.parse(await readFile('results/latest.json', 'utf8'));
if (latest.mode && latest.mode !== 'live') throw new Error('La publicación requiere un informe de monitoreo real');
let previous = [];
try { previous = JSON.parse(await readFile('history/history.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const history = buildHistory(previous.filter(run => !run.mode || run.mode === 'live'), latest, config);
await mkdir('history', { recursive: true });
await rm('public', { recursive: true, force: true });
await mkdir('public/data', { recursive: true });
await writeFile('history/history.json', JSON.stringify(history));
await writeFile('public/data/history.json', JSON.stringify(history));
await writeFile('public/data/latest.json', JSON.stringify(latest));
await cp('web', 'public', { recursive: true });
await cp('results', 'public/evidence', { recursive: true, filter: source => !source.endsWith('.zip') });
await writeFile('public/.nojekyll', '');
console.log(`Panel generado · ${history.length} ejecuciones en el historial`);
