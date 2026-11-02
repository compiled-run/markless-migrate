import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { importStylesheets } from '../src/convert/stylesheet-imports.ts';

const link = (href: string, extra: Record<string, string> = {}) => ({ tag: 'link', attrs: { rel: 'stylesheet', href, ...extra } });
const meta = { tag: 'meta', attrs: { name: 'x', content: 'y' } };

async function app(sheets: Record<string, string>, pages: Record<string, string>) {
	const dir = await mkdtemp(join(tmpdir(), 'mm-sheet-imports-'));
	for (const [href, css] of Object.entries(sheets)) {
		await mkdir(join(dir, 'public', href, '..'), { recursive: true });
		await writeFile(join(dir, 'public', href), css);
	}
	for (const [file, source] of Object.entries(pages)) {
		await mkdir(join(dir, file, '..'), { recursive: true });
		await writeFile(join(dir, file), source);
	}
	return dir;
}

test('a page imports its sheets in cascade order, a twice-linked sheet at its last link, and its head keeps the rest', async () => {
	const dir = await app({ '/_converted/styles/a.css': '.a{color:red}', '/_converted/styles/b.css': '.b{background:url(/x.png)}' }, { 'pages/docs/x.tsrx': '// generated\nimport X from "x";\n' });
	const head = [meta, link('/_converted/styles/a.css'), link('/_converted/styles/b.css'), link('/_converted/styles/a.css')];
	const heads = new Map([['/docs/x/', head]]);
	assert.equal((await importStylesheets(dir, join(dir, 'public'), new Map([['pages/docs/x.tsrx', ['/docs/x/']]]), heads, false)).moved, 1);
	assert.equal(await readFile(join(dir, 'pages/docs/x.tsrx'), 'utf8'), '// generated\nimport "../../styles/converted/_converted/styles/b.css";\nimport "../../styles/converted/_converted/styles/a.css";\nimport X from "x";\n');
	assert.equal(await readFile(join(dir, 'styles/converted/_converted/styles/a.css'), 'utf8'), '.a{color:red}');
	assert.deepEqual(heads.get('/docs/x/'), [meta]);
	await rm(dir, { recursive: true, force: true });
});

test('a relative url() in an imported sheet is rewritten to the path it named from the public file, and every path the sheet loads is returned', async () => {
	const css = '@font-face{font-family:f;src:url(../media/f.woff2) format("woff2"),url( "g h.woff" )}.a{background:url(/x.png)}.b{mask:url(data:image/svg+xml;utf8,<svg/>)}.c{filter:url(#n)}';
	const dir = await app({ '/_next/static/chunks/s.css': css }, { 'p/one.tsrx': '//\n' });
	const heads = new Map([['/one', [link('/_next/static/chunks/s.css')]]]);
	assert.deepEqual(await importStylesheets(dir, join(dir, 'public'), new Map([['p/one.tsrx', ['/one']]]), heads, false), { moved: 1, urls: ['/_next/static/media/f.woff2', '/_next/static/chunks/g%20h.woff', '/x.png'] });
	assert.equal(await readFile(join(dir, 'styles/converted/_next/static/chunks/s.css'), 'utf8'), '@font-face{font-family:f;src:url("/_next/static/media/f.woff2") format("woff2"),url("/_next/static/chunks/g%20h.woff")}.a{background:url(/x.png)}.b{mask:url(data:image/svg+xml;utf8,<svg/>)}.c{filter:url(#n)}');
	assert.equal(await readFile(join(dir, 'public/_next/static/chunks/s.css'), 'utf8'), css);
	await rm(dir, { recursive: true, force: true });
});

test('a page keeps its links when its routes differ, a sheet has a media query, a cross-origin href or an @import', async () => {
	const dir = await app({ '/s/a.css': '.a{}', '/s/b.css': '.b{}', '/s/rel.css': '@import "./r.css";.r{}' }, { 'p/one.tsrx': '//\n', 'p/two.tsrx': '//\n', 'p/three.tsrx': '//\n', 'p/four.tsrx': '//\n' });
	const heads = new Map([
		['/one', [link('/s/a.css')]],
		['/one?tab=2', [link('/s/b.css')]],
		['/two', [link('/s/a.css', { media: 'print' })]],
		['/three', [link('https://cdn.example/a.css')]],
		['/four', [link('/s/rel.css')]],
	]);
	const before = structuredClone([...heads]);
	const pages = new Map([
		['p/one.tsrx', ['/one', '/one?tab=2']],
		['p/two.tsrx', ['/two']],
		['p/three.tsrx', ['/three']],
		['p/four.tsrx', ['/four']],
	]);
	assert.deepEqual(await importStylesheets(dir, join(dir, 'public'), pages, heads, false), { moved: 0, urls: [] });
	assert.deepEqual([...heads], before);
	for (const file of pages.keys()) assert.equal(await readFile(join(dir, file), 'utf8'), '//\n');
	await rm(dir, { recursive: true, force: true });
});
