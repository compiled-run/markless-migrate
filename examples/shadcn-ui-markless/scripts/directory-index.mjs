// Writes lib/site/directory/: index.json (each registry's name, homepage and description, in registry/directory.json's
// order, with its logo's root <svg> attributes) and logos/<slug>.svg (each logo's children as a <symbol id="logo"> that
// the page's <svg>, carrying those attributes as the original's inline logo does, draws through <use>, so the page's
// colour variables still reach it). Usage: node scripts/directory-index.mjs <old app dir>
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFragment } from 'parse5';
import { LOGO_ATTRIBUTES } from '../lib/site/directory.ts';

const [old = '../../deploy/shadcn-ui/old/apps/v4'] = process.argv.slice(2);
const out = new URL('../lib/site/directory/', import.meta.url).pathname;
const directory = JSON.parse(readFileSync(join(old, 'registry/directory.json'), 'utf8'));
rmSync(join(out, 'logos'), { recursive: true, force: true });
mkdirSync(join(out, 'logos'), { recursive: true });
export const slug = (name) => name.replace(/^@/, '').replace(/[^\w-]+/g, '-');

// The original renders each logo with dangerouslySetInnerHTML, so it is read as the HTML parser reads it (a repeated
// attribute keeps its first value, an unclosed element closes); a <use>-referenced file is XML, written well-formed.
const XML_NAME = /^[A-Za-z_][\w.-]*$/;
const escape = (text, quote) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(quote ? /"/g : /(?!)/, '&quot;');
const nameOf = (attr) => (attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name);
function xml(node) {
	if (node.nodeName === '#text') return escape(node.value, false);
	if (!node.tagName) return '';
	const attrs = node.attrs.filter((a) => XML_NAME.test(a.name) && a.prefix !== 'xmlns' && a.name !== 'xmlns').map((a) => ` ${nameOf(a)}="${escape(a.value, true)}"`).join('');
	const children = (node.childNodes ?? []).map(xml).join('');
	return children ? `<${node.tagName}${attrs}>${children}</${node.tagName}>` : `<${node.tagName}${attrs}/>`;
}

const dropped = new Map();
const index = directory.map(({ name, homepage, description, logo }) => {
	// A blank logo (one entry has a space) draws nothing, as an empty dangerouslySetInnerHTML does.
	if (!logo.trim()) return { name, homepage, description, logo: '', viewBox: '' };
	const root = parseFragment(logo.trim()).childNodes.find((n) => n.tagName === 'svg');
	if (!root) throw new Error(`${name}: the logo is no <svg>`);
	const attr = (n) => root.attrs.find((a) => a.name === n && !a.prefix)?.value;
	const viewBox = attr('viewBox') ?? `0 0 ${attr('width') ?? 24} ${attr('height') ?? 24}`;
	// The root's own attributes go on the page's <svg>, which the symbol's children inherit from through <use>.
	const svg = {};
	for (const a of root.attrs) {
		if (a.prefix || a.name === 'xmlns' || a.name === 'viewBox') continue;
		if (LOGO_ATTRIBUTES.includes(a.name)) svg[a.name] = a.value;
		else dropped.set(a.name, (dropped.get(a.name) ?? 0) + 1);
	}
	writeFileSync(join(out, 'logos', `${slug(name)}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><symbol id="logo" viewBox="${escape(viewBox, true)}">${root.childNodes.map(xml).join('')}</symbol></svg>\n`);
	return { name, homepage, description, logo: slug(name), viewBox, ...(Object.keys(svg).length ? { svg } : {}) };
});
writeFileSync(join(out, 'index.json'), JSON.stringify(index) + '\n');
console.log(`${index.length} registries${dropped.size ? `; root attributes no SVG renders, left out: ${[...dropped].map(([n, c]) => `${n} (${c})`).join(', ')}` : ''}`);
