// node patch-new.mjs <function dir>: Markless Router leaves `import { defineHandler } from "nitro"` in the server bundle for
// middleware/ files, and the Vercel function has no node_modules; for a plain function h3's defineHandler only adds a .fetch.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [server] = process.argv.slice(2);
for (const file of await readdir(server, { recursive: true })) {
	if (!file.endsWith('.mjs')) continue;
	const code = await readFile(join(server, file), 'utf8');
	if (code.includes('from "nitro";')) await writeFile(join(server, file), code.replace(/import \{ defineHandler \} from "nitro";/g, 'const defineHandler = (handler) => handler;'));
}
