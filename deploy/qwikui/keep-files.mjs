// Before a deploy replaces production: every file production's pages load, at once or on use, must be in the new build's
// static output (copied from earlier builds kept in .kept/, else refused), so a tab opened before the deploy still gets
// its next chunk and stylesheet. Content-hashed names cannot collide.
//   node keep-files.mjs <static dir> <production origin> <targets.json>
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { previousFilesGone } from '../../src/cache/skew.ts';

const [dir, production, targets] = process.argv.slice(2);
const kept = join(import.meta.dirname, '.kept');
const routes = JSON.parse(readFileSync(targets, 'utf8')).routes.filter((r) => r.endsWith('/'));
const server = createServer((req, res) => {
	const file = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
	res.writeHead(file.startsWith(dir) && existsSync(file) && statSync(file).isFile() ? 200 : 404).end();
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const local = `http://127.0.0.1:${server.address().port}`;
let gone = await previousFilesGone(production, local, routes);
for (const g of gone) {
	if (!existsSync(join(kept, g.path))) continue;
	mkdirSync(dirname(join(dir, g.path)), { recursive: true });
	cpSync(join(kept, g.path), join(dir, g.path));
}
gone = await previousFilesGone(production, local, routes);
server.close();
// This build's own files join the kept ones, for the deploy after this one.
for (const sub of ['build', '_converted', 'assets']) if (existsSync(join(dir, sub))) cpSync(join(dir, sub), join(kept, sub), { recursive: true });
if (gone.length) {
	console.error(`${gone.length} files production's pages load are in neither this build nor an earlier kept one:\n${gone.slice(0, 20).map((g) => `  ${g.path} (${g.route})`).join('\n')}`);
	process.exit(1);
}
console.log("every file production's pages load, at once or on use, is in this deploy");
