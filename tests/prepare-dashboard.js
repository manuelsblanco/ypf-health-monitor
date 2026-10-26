import { mkdtemp, mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDashboardFixture } from './dashboard-data.js';
export async function prepareDashboardFixture() {
  const root = await mkdtemp(join(tmpdir(), 'ypf-dashboard-test-'));
  await cp('web', root, { recursive: true });
  await mkdir(join(root, 'data'));
  for (const [name, value] of Object.entries(createDashboardFixture())) await writeFile(join(root, 'data', name + '.json'), JSON.stringify(value));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}
