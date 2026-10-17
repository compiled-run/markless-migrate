// Prints the old app's rendered DOM under a selector as .tsrx markup, a starting point for porting the static
// parts of a route: node dom-to-tsrx.mjs <url> <selector> [--nth n] [--viewport WxH] [--click <selector>]...
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const [url, selector] = args;
const opt = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : fallback;
};
const [w, h] = opt('--viewport', '1280x800').split('x').map(Number);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(400);
for (let i = 0; i < args.length; i++) if (args[i] === '--click') {
	await p.click(args[i + 1]);
	await p.waitForTimeout(400);
}
const out = await p.evaluate(({ selector, nth }) => {
	const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
	const SVG_LEAF = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'stop', 'use']);
	const text = (s) => (s.includes('@') ? `{${JSON.stringify(s)}}` : s.replace(/[{}<>]/g, (c) => `{'${c}'}`));
	const attr = (v) => (/["{}]/.test(v) ? `{${JSON.stringify(v)}}` : `"${v}"`);
	const lines = [];
	const emit = (node, depth) => {
		const pad = '\t'.repeat(depth);
		if (node.nodeType === 3) {
			const t = node.textContent.replace(/\s+/g, ' ');
			if (t.trim()) lines.push(pad + text(t.trim() === t ? t : t));
			return;
		}
		if (node.nodeType !== 1) return;
		const tag = node.tagName.toLowerCase() === node.tagName ? node.tagName : node.tagName.toLowerCase();
		const name = node.namespaceURI === 'http://www.w3.org/2000/svg' ? node.localName : tag;
		const attrs = node.getAttributeNames().map((a) => (node.getAttribute(a) === '' && /^(hidden|disabled|checked|readonly|required|novalidate|multiple|selected)$/.test(a) ? a : `${a}=${attr(node.getAttribute(a))}`));
		const open = `<${name}${attrs.length ? ` ${attrs.join(' ')}` : ''}`;
		const kids = [...node.childNodes].filter((c) => c.nodeType === 1 || (c.nodeType === 3 && c.textContent.trim()));
		if (VOID.has(name) || (!kids.length && SVG_LEAF.has(name))) return void lines.push(`${pad}${open} />`);
		if (!kids.length) return void lines.push(`${pad}${open}></${name}>`);
		if (kids.length === 1 && kids[0].nodeType === 3) return void lines.push(`${pad}${open}>${text(kids[0].textContent.replace(/\s+/g, ' ').trim())}</${name}>`);
		lines.push(`${pad}${open}>`);
		for (const c of node.childNodes) emit(c, depth + 1);
		lines.push(`${pad}</${name}>`);
	};
	const el = document.querySelectorAll(selector)[nth];
	if (!el) return `no element for ${selector}`;
	emit(el, 0);
	return lines.join('\n');
}, { selector, nth: Number(opt('--nth', '0')) });
process.stdout.write(`${out}\n`);
await b.close();
