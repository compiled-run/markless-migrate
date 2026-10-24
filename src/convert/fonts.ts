import { LATE_FONT } from '../../parts/late-fonts.ts';
import { attr, removeAttr, setAttr, walk, type Document } from './dom.ts';

/** The attribute capture puts on the blocks whose text a candidate late font draws: the faces' ids, space-separated. */
export const LATE_CANDIDATE = 'data-mm-lf';

/**
 * Runs in the page at the desktop capture: each web font the page loaded without preloading it, the blocks whose text it
 * draws, and whether any of that text is in the first screen. The blocks are marked `data-mm-lf` with the face's id
 * before the document is kept; `lateFontsInFirstScreen` then checks them at a phone's width.
 */
export function markLateFontCandidates(attribute: string): { id: string; key: string; family: string; firstScreen: boolean }[] {
	type Face = { key: string; family: string; ranges: [number, number][]; urls: string[] };
	const faces: Face[] = [];
	const parseRanges = (value: string): [number, number][] =>
		value
			.split(',')
			.map((part) => part.trim().replace(/^U\+/i, ''))
			.filter(Boolean)
			.map((part) => {
				if (part.includes('?')) return [parseInt(part.replace(/\?/g, '0'), 16), parseInt(part.replace(/\?/g, 'F'), 16)];
				const [a, b] = part.split('-');
				return [parseInt(a!, 16), parseInt(b ?? a!, 16)];
			});
	const visit = (rules: CSSRuleList) => {
		for (const rule of rules) {
			if (rule instanceof CSSFontFaceRule) {
				const family = rule.style.getPropertyValue('font-family').replace(/^["']|["']$/g, '').trim();
				const range = rule.style.getPropertyValue('unicode-range');
				const urls = [...rule.style.getPropertyValue('src').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => new URL(m[1]!, rule.parentStyleSheet?.href ?? location.href).href);
				const key = `${family}|${rule.style.getPropertyValue('font-weight')}|${rule.style.getPropertyValue('font-style')}|${range}`;
				faces.push({ key, family, ranges: range ? parseRanges(range) : [[0, 0x10ffff]], urls });
			} else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) visit((rule as CSSGroupingRule).cssRules);
		}
	};
	for (const sheet of document.styleSheets) {
		try {
			visit(sheet.cssRules);
		} catch {}
	}
	const fetched = new Set(performance.getEntriesByType('resource').map((e) => e.name));
	const preloaded = new Set([...document.querySelectorAll('link[rel~="preload"][as="font"]')].map((l) => (l as HTMLLinkElement).href));
	const late = faces.filter((f) => f.urls.some((u) => fetched.has(u)) && !f.urls.some((u) => preloaded.has(u)));
	const out: { id: string; key: string; family: string; firstScreen: boolean }[] = [];
	const families = (el: Element) =>
		getComputedStyle(el)
			.fontFamily.split(',')
			.map((f) => f.trim().replace(/^["']|["']$/g, ''));
	const inRange = (text: string, ranges: [number, number][]) => {
		for (const ch of text) {
			const cp = ch.codePointAt(0)!;
			if (cp > 0x7f && ranges.some(([a, b]) => cp >= a && cp <= b)) return true;
		}
		return false;
	};
	const blockOf = (el: Element | null): Element | null => {
		for (let e = el; e && e !== document.body; e = e.parentElement) {
			const d = getComputedStyle(e).display;
			if (d !== 'inline' && d !== 'contents' && !d.startsWith('table') && d !== 'list-item' && d !== 'ruby') return e;
		}
		return null;
	};
	for (const [i, face] of late.entries()) {
		const id = `f${i}`;
		let firstScreen = false;
		const blocks = new Set<Element>();
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const parent = node.parentElement;
			if (!parent || !node.textContent || !inRange(node.textContent, face.ranges) || !families(parent).includes(face.family)) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
			if (!rects.length) continue;
			if (rects.some((r) => r.top + scrollY < innerHeight)) firstScreen = true;
			const block = blockOf(parent);
			if (!block) firstScreen = true;
			else blocks.add(block);
		}
		if (!blocks.size) continue;
		// The outermost blocks only, each wholly below the first screen.
		for (const block of blocks) {
			if ([...blocks].some((other) => other !== block && other.contains(block))) continue;
			if (block.getBoundingClientRect().top + scrollY < innerHeight) firstScreen = true;
			block.setAttribute(attribute, `${block.getAttribute(attribute) ?? ''} ${id}`.trim());
		}
		out.push({ id, key: face.key, family: face.family, firstScreen });
	}
	return out;
}

/** Runs in the page at another width: the faces whose marked blocks or text reach into the first screen there. */
export function lateFontsInFirstScreen(attribute: string): string[] {
	const hit = new Set<string>();
	for (const el of document.querySelectorAll(`[${attribute}]`)) {
		const r = el.getBoundingClientRect();
		if (r.height > 0 && r.top + scrollY < innerHeight) for (const key of (el.getAttribute(attribute) ?? '').split(' ')) hit.add(key);
	}
	return [...hit];
}

/** The marked blocks of the faces no first screen draws keep `data-mm-late-font`; every other mark goes. Returns how many blocks wait for the load event. */
export function applyLateFonts(doc: Document, late: readonly string[]): number {
	let n = 0;
	for (const el of walk(doc)) {
		const marks = attr(el, LATE_CANDIDATE);
		if (marks === undefined) continue;
		removeAttr(el, LATE_CANDIDATE);
		if (marks.split(' ').some((id) => late.includes(id))) {
			setAttr(el, LATE_FONT, '');
			n++;
		}
	}
	return n;
}

