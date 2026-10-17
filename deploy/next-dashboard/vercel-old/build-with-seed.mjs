// Deploy-only build step: `next build` prerenders /dashboard from the database, so it runs against the seeded embedded one
// (spawned, not spawnSync: this process must keep answering the build's queries).
import { spawn } from 'node:child_process';
import { startEmbeddedPostgres } from './embedded-postgres/index.mjs';
import seedSql from './embedded-postgres/seed-dashboard.mjs';

const url = await startEmbeddedPostgres({ seedSql, port: 54339 });
const build = spawn('next', ['build'], { stdio: 'inherit', env: { ...process.env, POSTGRES_URL: url }, shell: true });
build.on('exit', (code) => process.exit(code ?? 1));
