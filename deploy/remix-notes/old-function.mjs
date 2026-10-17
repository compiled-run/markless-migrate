// Deploy-only entry for the old Remix app as one Vercel function (Build Output API): the app's own server build, unchanged,
// behind @remix-run/node's request handler. Each instance starts from the seeded SQLite file, copied to /tmp.
import { copyFileSync, existsSync } from 'node:fs';

const database = '/tmp/notes.db';
if (!existsSync(database)) copyFileSync(new URL('./seed.db', import.meta.url), database);
process.env.DATABASE_URL = `file:${database}?connection_limit=1`;
process.env.NODE_ENV = 'production';

const { createRequestHandler } = await import('@remix-run/node');
const build = await import('./build/index.js');
const handle = createRequestHandler(build, 'production');

export default { fetch: (request) => handle(request) };
