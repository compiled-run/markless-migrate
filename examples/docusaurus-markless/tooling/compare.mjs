// Compares what the importer generated for each route (tooling/.out/) with what the old site renders
// (tooling/.oracle/, written by oracle.mjs): `node tooling/compare.mjs [route...] [--limit n] [--summary]`.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseHtml } from './source/html.mjs';

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 8;
const summary = args.includes('--summary');
const wanted = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--limit');
const oracleDir = join(import.meta.dirname, '.oracle');
const outDir = join(import.meta.dirname, '.out');
const files = (await readdir(outDir)).filter((f) => f.endsWith('.html'));
const routes = files.map((f) => decodeURIComponent(f.slice(0, -5))).filter((r) => !wanted.length || wanted.includes(r));

const normStyle = (value) =>
	value
		.split(';')
		.map((d) => d.trim().replace(/\s*:\s*/, ':'))
		.filter(Boolean)
		.join(';');
const label = (node) => {
	const cls = node.attrs.find(([n]) => n === 'class')?.[1];
	const id = node.attrs.find(([n]) => n === 'id')?.[1];
	return `${node.tag}${id ? `#${id}` : ''}${cls ? `.${cls.split(/\s+/).slice(0, 2).join('.')}` : ''}`;
};
const show = (node) => (typeof node === 'string' ? JSON.stringify(node.slice(0, 80)) : `<${label(node)}>`);

function diff(a, b, path, out) {
	if (out.length >= limit) return;
	if (typeof a === 'string' || typeof b === 'string') {
		if (a !== b) out.push(`${path}: text ${show(a ?? '')} -> ${show(b ?? '')}`);
		return;
	}
	if (a.tag !== b.tag) return void out.push(`${path}: <${label(a)}> -> <${label(b)}>`);
	const attrsA = new Map(a.attrs.map(([n, v]) => [n, n === 'style' ? normStyle(v) : v]));
	const attrsB = new Map(b.attrs.map(([n, v]) => [n, n === 'style' ? normStyle(v) : v]));
	for (const [n, v] of attrsA) if (attrsB.get(n) !== v) out.push(`${path}>${label(a)}: @${n} ${JSON.stringify(v).slice(0, 120)} -> ${JSON.stringify(attrsB.get(n) ?? null).slice(0, 120)}`);
	for (const [n, v] of attrsB) if (!attrsA.has(n)) out.push(`${path}>${label(a)}: @${n} (none) -> ${JSON.stringify(v).slice(0, 120)}`);
	const here = `${path}>${label(a)}`;
	const length = Math.max(a.children.length, b.children.length);
	for (let i = 0; i < length && out.length < limit; i++) {
		const x = a.children[i];
		const y = b.children[i];
		if (x === undefined) return void out.push(`${here}[${i}]: extra ${show(y)}`);
		if (y === undefined) return void out.push(`${here}[${i}]: missing ${show(x)}`);
		if ((typeof x === 'string') !== (typeof y === 'string') || (typeof x !== 'string' && x.tag !== y.tag)) {
			out.push(`${here}[${i}]: ${show(x)} -> ${show(y)}`);
			return;
		}
		diff(x, y, here, out);
	}
}

// What lib/site.ts does at start: parts kept only for later (mobile drawer, unopened lists) leave the page and
// the importer's data-mm-* hints are read and removed.
function boot(node) {
	if (typeof node === 'string') return node;
	const children = node.children.filter((c) => typeof c === 'string' || !c.attrs.some(([n]) => n === 'data-mm-mobile' || n === 'data-mm-lazy')).map(boot);
	return { ...node, attrs: node.attrs.filter(([n]) => !n.startsWith('data-mm-')), children };
}

// State the page's script sets once it runs (and the oracle captured): the word-wrap button of a code block that
// overflows, the TOC entry highlighted for the scroll position.
function settle(node) {
	if (typeof node === 'string') return node;
	const children = node.children.filter((c) => typeof c === 'string' || !(c.tag === 'button' && c.attrs.some(([n, v]) => n === 'aria-label' && v === 'Toggle word wrap'))).map(settle);
	const attrs = node.attrs.filter(([n]) => !(n === 'style' && node.attrs.some(([k]) => k === 'data-rmiz-ghost')));
	return { ...node, attrs: attrs.map(([n, v]) => [n, n === 'class' ? v.replace(/\s*table-of-contents__link--active/, '') : v]), children };
}

let same = 0;
const tally = new Map();
for (const route of routes) {
	const oracle = JSON.parse(await readFile(join(oracleDir, `${encodeURIComponent(route)}.json`), 'utf8').catch(() => 'null'));
	if (!oracle) {
		process.stdout.write(`${route}: no oracle\n`);
		continue;
	}
	const generated = await readFile(join(outDir, `${encodeURIComponent(route)}.html`), 'utf8');
	const [a] = parseHtml(oracle.body).map(settle);
	const [b] = parseHtml(generated).map(boot);
	const out = [];
	diff(a, b, '', out);
	if (!out.length) same++;
	if (summary) {
		for (const line of out.slice(0, 1)) {
			const key = line.replace(/\[\d+\]/g, '[]').replace(/"[^"]*"/g, '"…"');
			tally.set(key, (tally.get(key) ?? 0) + 1);
		}
	} else if (out.length) process.stdout.write(`\n${route}\n  ${out.join('\n  ')}\n`);
}
if (summary) for (const [key, n] of [...tally].sort((x, y) => y[1] - x[1])) process.stdout.write(`${n}\t${key}\n`);
process.stdout.write(`\n${same} of ${routes.length} routes identical\n`);
