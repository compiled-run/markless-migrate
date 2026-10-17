// The app reads data/notes.db; a fresh build starts from the old app's seeded database.
import { copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', 'data');
await access(join(dir, 'notes.db')).catch(() => copyFile(join(dir, 'seed.db'), join(dir, 'notes.db')));
