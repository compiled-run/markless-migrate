import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const file = join(import.meta.dirname, '../server/overview.snapshot.json');
await writeFile(file, '{}\n', { flag: 'wx' }).catch(() => {});
const { overviewLive } = await import('../server/pages.ts');
await writeFile(file, `${JSON.stringify(await overviewLive(), null, '\t')}\n`);
process.exit(0);
