import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { createDemo } from './demo-data.js';
const data = createDemo();
// Separate directory and separate history: demo never writes results/ or history/.
await rm('public-demo', { recursive: true, force: true });
await mkdir('public-demo/data', { recursive: true });
await cp('web', 'public-demo', { recursive: true });
for (const [key, value] of Object.entries(data)) await writeFile(`public-demo/data/${key}.json`, JSON.stringify(value, null, 2));
await writeFile('public-demo/.nojekyll', '');
let html = await readFile('web/index.html', 'utf8');
const css = await readFile('web/style.css', 'utf8');
const js = await readFile('web/app.js', 'utf8');
const payload = JSON.stringify(data).replaceAll('<', '\\u003c');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`)
  .replace('<script src="app.js" defer></script>', '')
  .replace('</body>', () => `<script>globalThis.__MONITOR_DEMO__=${payload};</script><script>${js}</script></body>`);
await writeFile('demo.html', html);
console.log('Demo: demo.html (abrir directamente) o npm run preview:demo → http://localhost:4173');
