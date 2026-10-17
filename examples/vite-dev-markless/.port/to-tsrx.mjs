// Drafts .tsrx markup from the old page's live DOM, one file per region: node .port/to-tsrx.mjs <url> <out-dir> <width> [click-selector]
import { chromium } from 'playwright';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
const [url, out, width = '1280', click] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const THEME = process.env.THEME_SRC;
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(join(THEME, 'assets'));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(width), height: 800 } });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
if (click) { await p.click(click); await p.waitForTimeout(800); }
const regions = await p.evaluate((mode) => {
	const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
	const BOOL = new Set(['inert', 'hidden', 'checked', 'disabled', 'data-nosnippet', 'open', 'selected', 'readonly', 'required', 'autofocus']);
	const needsExpr = (t) => /[{}<>@&]/.test(t);
	const lit = (t) => JSON.stringify(t);
	function attrs(el) {
		return [...el.attributes]
			.filter((a) => !(a.name === 'style' && a.value === ''))
			.map((a) => {
				if (BOOL.has(a.name) && a.value === '') return ' ' + a.name;
				if (/["{}]/.test(a.value)) return ` ${a.name}={${lit(a.value)}}`;
				return ` ${a.name}="${a.value.replace(/&/g, '&amp;')}"`;
			})
			.join('');
	}
	const textOut = (t) => (needsExpr(t) || t !== t.trim() ? `{${lit(t)}}` : t);
	function inline(node) {
		if (node.nodeType === 8) return '';
		if (node.nodeType === 3) return node.textContent ? `{${lit(node.textContent)}}` : '';
		const name = node.namespaceURI === 'http://www.w3.org/2000/svg' ? node.localName : node.tagName.toLowerCase();
		if (VOID.has(name)) return `<${name}${attrs(node)} />`;
		return `<${name}${attrs(node)}>${[...node.childNodes].map(inline).join('')}</${name}>`;
	}
	function emit(node, depth) {
		const pad = '\t'.repeat(depth);
		if (node.nodeType === 8) return '';
		if (node.nodeType === 3) {
			let t = node.textContent.replace(/\s+/g, ' ');
			const prev = node.previousSibling, next = node.nextSibling;
			if (!prev) t = t.trimStart();
			if (!next) t = t.trimEnd();
			if (t === '') return '';
			if (t === ' ') return pad + "{' '}\n";
			return pad + textOut(t) + '\n';
		}
		const name = node.namespaceURI === 'http://www.w3.org/2000/svg' ? node.localName : node.tagName.toLowerCase();
		const open = `<${name}${attrs(node)}`;
		if (VOID.has(name)) return `${pad}${open} />\n`;
		if (name === 'pre') return `${pad}${inline(node)}\n`;
		const kids = [...node.childNodes].filter((k) => k.nodeType !== 8);
		if (!kids.length) return `${pad}${open}></${name}>\n`;
		if (kids.every((k) => k.nodeType === 3)) {
			const t = node.textContent.replace(/\s+/g, ' ').trim();
			return `${pad}${open}>${t ? textOut(t) : ''}</${name}>\n`;
		}
		return `${pad}${open}>\n${kids.map((k) => emit(k, depth + 1)).join('')}${pad}</${name}>\n`;
	}
	const parts = {};
	if (mode === 'menu') {
		for (const el of document.querySelectorAll('#mobile-menu, .VPLocalSearchBox, [role=dialog]')) parts[(el.id || el.className.split(' ')[0] || 'dialog')] = emit(el, 0);
		return parts;
	}
	const layout = document.querySelector('.marketing-layout');
	const kids = [...layout.children];
	parts['00-banner'] = emit(kids[0], 0);
	parts['01-header'] = emit(kids[1], 0);
	const content = kids[2].firstElementChild;
	[...content.children].forEach((el, i) => (parts[String(i + 10)] = emit(el, 0)));
	return parts;
}, click ? 'menu' : 'page');
const decode = (u) => (u.startsWith('data:image/svg+xml,') ? decodeURIComponent(u.slice(19)) : null);
const imports = new Map();
const origin = new URL(url).origin;
const bytes = new Map();
for (const v of Object.values(regions)) for (const [, u] of v.matchAll(/"(\/assets\/[^"]+)"/g)) if (!bytes.has(u)) bytes.set(u, Buffer.from(await (await fetch(origin + u)).arrayBuffer()));
function assetFor(u) {
	let file;
	const m = u.match(/^\/assets\/(.+)\.[\w-]{8}(\.\w+)$/);
	if (m) file = files.filter((f) => basename(f) === m[1] + m[2] && readFileSync(f).equals(bytes.get(u)));
	const svg = decode(u);
	if (svg) file = files.filter((f) => f.endsWith('.svg') && readFileSync(f, 'utf8').trim() === svg.trim());
	if (!file?.length) return null;
	return file.map((f) => f.slice(THEME.length + 1)).sort((a, b) => a.length - b.length)[0];
}
for (const [k, v] of Object.entries(regions)) {
	const used = new Set();
	const body = v.replace(/ (src|href)=(?:"([^"]+)"|\{("(?:[^"\\]|\\.)*")\})/g, (all, attr, plain, quoted) => {
		const raw = plain ?? JSON.parse(quoted);
		if (!raw.startsWith('/assets/') && !raw.startsWith('data:image')) return all;
		const rel = assetFor(raw);
		if (!rel) return all;
		const id = rel.replace(/^assets\//, '').replace(/\.\w+$/, '').replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/^\d/, '_$&');
		imports.set(id, rel);
		used.add(id);
		return ` ${attr}={${id}}`;
	});
	writeFileSync(`${out}/${k}.tsrx.txt`, [...used].map((id) => `import ${id} from '../${imports.get(id)}';\n`).join('') + '\n' + body);
}
await b.close();
