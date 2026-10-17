// Copies the old VitePress build's local-search index (the docs pages it covers stay on the old app):
// node scripts/search-index.mjs <old-docs-dist>
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dist = process.argv[2];
if (!dist) throw new Error('usage: node scripts/search-index.mjs <old-docs-dist>');
const chunks = join(dist, 'assets/chunks');
const file = (await readdir(chunks)).find((name) => /^@localSearchIndexroot\.[\w-]+\.js$/.test(name));
if (!file) throw new Error(`no @localSearchIndexroot chunk in ${chunks}`);
const { default: index } = await import(pathToFileURL(join(chunks, file)).href);
await mkdir('search', { recursive: true });
await writeFile('search/index-root.json', index);
process.stdout.write(`wrote search/index-root.json from ${file}\n`);
