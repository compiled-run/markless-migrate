// The app reads data/notes.db; a fresh build starts from the old app's seeded database. The seed is also written as a
// module (server/seed-db.mjs) for the demo deployment, whose function copies it to /tmp on cold start.
import { access, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'data');
await access(join(dir, 'notes.db')).catch(() => copyFile(join(dir, 'seed.db'), join(dir, 'notes.db')));
const seed = await readFile(join(dir, 'seed.db'));
await writeFile(join(root, 'server/seed-db.mjs'), `export default ${JSON.stringify(seed.toString('base64'))};\n`);
