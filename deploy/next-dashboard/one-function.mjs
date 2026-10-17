// node one-function.mjs <server dir> [<.vercel/output>]
// The demo's in-function database (PGlite) is bundled; its WebAssembly, data and extension files go where the bundle looks.
// For Vercel, every /api route is also served by the main function: Nitro gives each its own function, and each function
// instance would start its own database, so a write through an endpoint would never show on a page.
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [server, output] = process.argv.slice(2);
// Markless Router leaves `import { defineHandler } from "nitro"` in the server bundle for api/ and middleware/ files, and
// the Vercel function has no node_modules; for a plain function h3's defineHandler only adds a .fetch the app never calls.
for (const file of await readdir(server, { recursive: true })) {
	if (!file.endsWith('.mjs')) continue;
	const path = join(server, file);
	const code = await readFile(path, 'utf8');
	if (code.includes('from "nitro";')) await writeFile(path, code.replace(/import \{ defineHandler \} from "nitro";/g, 'const defineHandler = (handler) => handler;'));
}
const dist = join(import.meta.dirname, '../../examples/next-dashboard-markless/node_modules/@electric-sql/pglite/dist');
for (const file of ['initdb.wasm', 'pglite.data', 'pglite.wasm']) await cp(join(dist, file), join(server, '_libs', file));
await cp(join(dist, 'uuid-ossp.tar.gz'), join(server, 'uuid-ossp.tar.gz'));
if (output) {
	const functions = join(output, 'functions');
	for (const entry of await readdir(functions)) if (entry !== '__server.func') await rm(join(functions, entry), { recursive: true, force: true });
	const configFile = join(output, 'config.json');
	const config = JSON.parse(await readFile(configFile, 'utf8'));
	config.routes = config.routes.filter((route) => !(route.dest && route.dest !== '/__server'));
	await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`);
}
