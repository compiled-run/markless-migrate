// Drafts .tsrx markup from a live page's server HTML (scripts off), one element per output file:
// node deploy/htmx-org/to-tsrx.ts <url> <out.tsrx.txt> <css-selector> [drop-attribute-regex]
// Framework attributes (htmx hx-*, hyperscript _, Alpine x-/@/:) are dropped; behaviour is rewritten by hand.
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [url, out, selector = 'body', drop = '^(hx-|_$|classes$|preload$|x-|@|:|wire:)'] = process.argv.slice(2);
if (!url || !out) throw new Error('usage: to-tsrx.ts <url> <out> <selector> [drop-regex]');
const browser = await chromium.launch();
const page = await browser.newPage({ javaScriptEnabled: false });
await page.goto(url, { waitUntil: 'load' });
const result = await page.evaluate(
	({ selector, drop }) => {
		const DROP = new RegExp(drop);
		const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
		const lit = (t: string) => JSON.stringify(t);
		const skipped: string[] = [];
		const attrs = (el: Element) =>
			[...el.attributes]
				.filter((a) => !DROP.test(a.name))
				.map((a) => {
					if (a.value === '' && ['hidden', 'disabled', 'checked', 'multiple', 'selected', 'readonly', 'required', 'open', 'async', 'defer'].includes(a.name)) return ` ${a.name}`;
					if (/["{}\\]/.test(a.value) || a.value.includes('\n')) return ` ${a.name}={${lit(a.value)}}`;
					return ` ${a.name}="${a.value}"`;
				})
				.join('');
		const BLOCKISH = /^(block|flex|grid|list-item|table|table-row|table-cell|table-row-group|none|flow-root)$/;
		const isBlock = (n: Node | null) => !n || (n.nodeType === 1 && BLOCKISH.test(getComputedStyle(n as Element).display)) || n.nodeType === 8;
		const sibling = (n: Node, dir: 'previousSibling' | 'nextSibling') => {
			let s = n[dir];
			while (s && s.nodeType !== 1 && !(s.nodeType === 3 && (s.textContent ?? '').trim())) s = s[dir];
			return s;
		};
		const collapsible = (n: Node) => {
			const parent = n.parentElement;
			if (parent && /flex|grid/.test(getComputedStyle(parent).display)) return true;
			return isBlock(sibling(n, 'previousSibling')) && isBlock(sibling(n, 'nextSibling'));
		};
		const tag = (el: Element) => (el.namespaceURI === 'http://www.w3.org/2000/svg' ? el.localName : el.tagName.toLowerCase());
		// TSRX collapses whitespace runs in text to one space and drops whitespace-only text, so those need a string expression.
		const escapeText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;').replace(/@/g, '&#64;');
		// HTML whitespace only: JavaScript's \s also matches the no-break spaces code samples indent with.
		const collapse = (t: string) => t.replace(/[ \t\n\r\f]+/g, ' ');
		const textOut = (t: string) => (/[\n\t\r\f\u00a0]|  /.test(t) || !t.replace(/[ \t\n\r\f]/g, '') ? `{${lit(t)}}` : escapeText(t));
		const preserves = (el: Element) => /^(pre|pre-wrap|break-spaces)$/.test(getComputedStyle(el).whiteSpace);
		function inline(node: Node, pre: boolean): string {
			if (node.nodeType === 3) {
				const t = node.textContent ?? '';
				return pre ? textOut(t) : textOut(collapse(t));
			}
			if (node.nodeType !== 1) return '';
			const el = node as Element;
			const name = tag(el);
			if (name === 'script' || name === 'template' || name === 'style' || name === 'noscript') {
				skipped.push(`<${name}> (inline) ${(el.textContent ?? '').trim().slice(0, 80)}`);
				return '';
			}
			if (VOID.has(name)) return `<${name}${attrs(el)} />`;
			const inPre = pre || name === 'pre' || name === 'textarea' || preserves(el);
			return `<${name}${attrs(el)}>${[...el.childNodes].map((k) => inline(k, inPre)).join('')}</${name}>`;
		}
		function emit(node: Node, depth: number): string {
			const pad = '\t'.repeat(depth);
			if (node.nodeType === 3) {
				const t = collapse(node.textContent ?? '');
				if (t === '') return '';
				if (t === ' ' && collapsible(node)) return '';
				return `${pad}{${lit(t)}}\n`;
			}
			if (node.nodeType !== 1) return '';
			// (only whitespace text reaches emit: mixed content is written inline)
			const el = node as Element;
			const name = tag(el);
			if (name === 'script' || name === 'template' || name === 'noscript') {
				skipped.push(`<${name}${attrs(el)}> ${(el.textContent ?? '').trim().slice(0, 80)}`);
				return `${pad}{/* dropped <${name}> */}\n`;
			}
			if (name === 'style') {
				skipped.push(`<style> ${(el.textContent ?? '').trim().slice(0, 80)}`);
				return `${pad}{/* moved <style> to a stylesheet */}\n`;
			}
			if (VOID.has(name)) return `${pad}<${name}${attrs(el)} />\n`;
			if (name === 'pre' || name === 'textarea' || preserves(el)) return `${pad}${inline(el, true)}\n`;
			if ([...el.childNodes].some((k) => k.nodeType === 3 && (k.textContent ?? '').trim())) return `${pad}${inline(el, false)}\n`;
			const kids = [...el.childNodes].filter((k) => k.nodeType === 1 || k.nodeType === 3);
			if (!kids.length) return `${pad}<${name}${attrs(el)}></${name}>\n`;
			if (kids.length === 1 && kids[0]!.nodeType === 3) {
				const t = collapse(kids[0]!.textContent ?? '');
				const safe = t === t.trim() && /^[A-Za-z0-9.,;!?'’()\-–—:…$ ]+$/.test(t);
				return `${pad}<${name}${attrs(el)}>${safe ? t : `{${lit(t)}}`}</${name}>\n`;
			}
			return `${pad}<${name}${attrs(el)}>\n${kids.map((k) => emit(k, depth + 1)).join('')}${pad}</${name}>\n`;
		}
		const roots = [...document.querySelectorAll(selector)];
		return { markup: roots.map((r) => emit(r, 0)).join('\n'), skipped };
	},
	{ selector, drop },
);
await writeFile(out, result.markup);
process.stdout.write(`${out}: ${result.markup.split('\n').length} lines; skipped:\n${result.skipped.map((s) => `  ${s}`).join('\n')}\n`);
await browser.close();
