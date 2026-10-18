// Lists what the old app keeps serving while only `/` is on Markless: node scripts/old-routes.mjs <old-docs-dist>
// `/` is the Markless page. Pages come from `markless-migrate config --nitro` over .migrate/inventory.json; files from the old build's output.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2];
if (!dist) throw new Error('usage: node scripts/old-routes.mjs <old-docs-dist>');
const snippet = '/tmp/markless-migrate-nitro.ts';
execFileSync(process.execPath, ['../../src/cli.ts', 'config', '--old', 'http://old.invalid', '--new', 'http://new.invalid', '--nitro', snippet], { stdio: 'inherit' });
const pages = [...readFileSync(snippet, 'utf8').matchAll(/^\t+"([^"]+)": \{ proxy:/gm)].map((m) => m[1]).filter((path) => !path.startsWith('/assets/') && path !== '/');
const ours = new Set(readdirSync('public', { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name));
const files = readdirSync(dist)
	.filter((name) => statSync(join(dist, name)).isFile() && !name.endsWith('.html') && !ours.has(name))
	.map((name) => `/${name}`);
// The old build's files keep their URLs; the few the page script ships under the same names are served by Markless.
const shipped = new Set(readdirSync('public/assets'));
const scripts = readdirSync(join(dist, 'assets'))
	.filter((name) => statSync(join(dist, 'assets', name)).isFile() && !shipped.has(name))
	.map((name) => `/assets/${name}`);
const paths = [...new Set([...pages, ...files, '/assets/chunks/**', ...scripts])];
writeFileSync('old-routes.json', `${JSON.stringify({ paths }, null, '\t')}\n`);
process.stdout.write(`old-routes.json: ${pages.length} pages, ${files.length} files, ${scripts.length} build files\n`);
