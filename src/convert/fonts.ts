import { LATE_FONT, type LateFace } from '../../parts/late-fonts.ts';
import { attr, removeAttr, setAttr, walk, type Document } from './dom.ts';

/** The attribute capture puts on the blocks whose text a candidate late font draws: the faces' ids, space-separated. */
export const LATE_CANDIDATE = 'data-mm-lf';

/**
 * Runs in the page at the desktop capture: each web font face the page fetched, the blocks whose text it draws, and
 * whether any of that text is in the first screen. A face draws a character when its family is the first in the
 * element's font-family list with a face whose unicode-range has it, as the browser matches fonts; spaces count, since
 * they fetch the face too. The blocks are marked `data-mm-lf` with the face's id before the document is kept;
 * `lateFontsInFirstScreen` then checks them at a phone's width.
 */
export function markLateFontCandidates(attribute: string): { id: string; key: string; family: string; firstScreen: boolean; url: string; urls: string[]; preloaded: boolean; face: { family: string; src: string; descriptors: Record<string, string> } }[] {
	type Face = { key: string; family: string; ranges: [number, number][]; urls: string[]; face: { family: string; src: string; descriptors: Record<string, string> } };
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
				// The face as FontFace takes it: its descriptors by FontFace's names, its url()s absolute.
				const src = rule.style.getPropertyValue('src').replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (_, u: string) => `url(${JSON.stringify(new URL(u, rule.parentStyleSheet?.href ?? location.href).href)})`);
				const descriptors: Record<string, string> = {};
				for (let i = 0; i < rule.style.length; i++) {
					const name = rule.style[i]!;
					if (name === 'src' || name === 'font-family') continue;
					descriptors[name.replace(/^font-(?=style|weight|stretch|display|feature-settings|variation-settings)/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = rule.style.getPropertyValue(name);
				}
				faces.push({ key, family, ranges: range ? parseRanges(range) : [[0, 0x10ffff]], urls, face: { family, src, descriptors } });
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
	const used = faces.filter((f) => f.urls.some((u) => fetched.has(u)));
	const byFamily = new Map<string, Face[]>();
	for (const f of faces) byFamily.set(f.family.toLowerCase(), [...(byFamily.get(f.family.toLowerCase()) ?? []), f]);
	const blockOf = (el: Element | null): Element | null => {
		for (let e = el; e && e !== document.body; e = e.parentElement) {
			const d = getComputedStyle(e).display;
			if (d !== 'inline' && d !== 'contents' && !d.startsWith('table') && d !== 'list-item' && d !== 'ruby') return e;
		}
		return null;
	};
	// Each used face: the blocks it draws text in, and whether a first screen holds any of that text.
	const drawn = new Map<Face, { blocks: Set<Element>; firstScreen: boolean }>(used.map((f) => [f, { blocks: new Set(), firstScreen: false }]));
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const parent = node.parentElement;
		const text = node.textContent ?? '';
		if (!parent || !text.trim()) continue;
		const range = document.createRange();
		range.selectNodeContents(node);
		const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
		if (!rects.length) continue;
		const families = getComputedStyle(parent)
			.fontFamily.split(',')
			.map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase());
		const hit = new Set<Face>();
		for (const ch of new Set(text)) {
			const cp = ch.codePointAt(0)!;
			if (cp === 0x0a || cp === 0x09 || cp === 0x0d) continue;
			for (const family of families) {
				const own = byFamily.get(family);
				// A family no face names is the system's, and draws the character.
				if (!own) break;
				const covering = own.filter((f) => f.ranges.some(([a, b]) => cp >= a && cp <= b));
				if (!covering.length) continue;
				for (const f of covering) hit.add(f);
				break;
			}
		}
		if (!hit.size) continue;
		const inFirst = rects.some((r) => r.top + scrollY < innerHeight);
		const block = blockOf(parent);
		for (const f of hit) {
			const d = drawn.get(f);
			if (!d) continue;
			if (inFirst || !block) d.firstScreen = true;
			if (block) d.blocks.add(block);
		}
	}
	const out: ReturnType<typeof markLateFontCandidates> = [];
	for (const [i, face] of used.entries()) {
		const id = `f${i}`;
		const { blocks, firstScreen: textInFirst } = drawn.get(face)!;
		if (!blocks.size) continue;
		let firstScreen = textInFirst;
		// The outermost blocks only, each wholly below the first screen.
		for (const block of blocks) {
			if ([...blocks].some((other) => other !== block && other.contains(block))) continue;
			if (block.getBoundingClientRect().top + scrollY < innerHeight) firstScreen = true;
			block.setAttribute(attribute, `${block.getAttribute(attribute) ?? ''} ${id}`.trim());
		}
		out.push({ id, key: face.key, family: face.family, firstScreen, url: face.urls.find((u) => fetched.has(u))!, urls: face.urls, preloaded: face.urls.some((u) => preloaded.has(u)), face: face.face });
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


/** At most this many fonts are preloaded on a page: each one is a request the first paint waits for. */
export const MAX_FONT_PRELOADS = 4;

/**
 * Preload links for the web fonts the page's first screen draws that only its stylesheet names and that hide their text
 * until they arrive (a `font-display: swap` face paints in a fallback first, so it is not passed here), so they are fetched
 * with the stylesheet rather than after it: same-origin woff2 files, at most `MAX_FONT_PRELOADS` with any the page already preloads.
 */
export function fontPreloads(urls: readonly string[], origin: string, already: number): { href: string }[] {
	const own = urls.flatMap((u) => {
		const url = URL.parse(u);
		return url && url.origin === new URL(origin).origin && url.pathname.endsWith('.woff2') ? [url.pathname] : [];
	});
	return [...new Set(own)].slice(0, Math.max(0, MAX_FONT_PRELOADS - already)).map((href) => ({ href }));
}

/**
 * Runs in the page: the font files it preloads that a face of its stylesheets names, and those of them the first screen
 * draws, by the font matching a browser does (the first family in an element's list with a face whose range has the
 * character). A preload the first screen does not draw takes bandwidth the stylesheets and scripts need. `swap` holds the
 * preloaded files every face naming which is `font-display: swap`: their text paints in a fallback, so first paint does not need them.
 */
export function fontPreloadsInFirstScreen(): { preloaded: string[]; drawn: string[]; swap: string[] } {
	type Face = { family: string; ranges: [number, number][]; urls: string[]; display: string };
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
				faces.push({ family, ranges: range ? parseRanges(range) : [[0, 0x10ffff]], urls, display: rule.style.getPropertyValue('font-display') || 'auto' });
			} else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) visit((rule as CSSGroupingRule).cssRules);
		}
	};
	for (const sheet of document.styleSheets) {
		try {
			visit(sheet.cssRules);
		} catch {}
	}
	const named = new Set(faces.flatMap((f) => f.urls));
	const preloaded = [...new Set([...document.querySelectorAll<HTMLLinkElement>('link[rel~="preload"][as="font"]')].map((l) => l.href))].filter((u) => named.has(u));
	const byFamily = new Map<string, Face[]>();
	for (const f of faces) byFamily.set(f.family.toLowerCase(), [...(byFamily.get(f.family.toLowerCase()) ?? []), f]);
	const drawn = new Set<string>();
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const parent = node.parentElement;
		const text = node.textContent ?? '';
		if (!parent || !text.trim() || !parent.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
		const range = document.createRange();
		range.selectNodeContents(node);
		if (![...range.getClientRects()].some((r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) continue;
		const families = getComputedStyle(parent)
			.fontFamily.split(',')
			.map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase());
		for (const ch of new Set(text.replace(/\s/g, ''))) {
			const cp = ch.codePointAt(0)!;
			for (const family of families) {
				const own = byFamily.get(family);
				// A family no face names is the system's, and draws the character.
				if (!own) break;
				const covering = own.filter((f) => f.ranges.some(([a, b]) => cp >= a && cp <= b));
				if (!covering.length) continue;
				for (const f of covering) for (const u of f.urls) drawn.add(u);
				break;
			}
		}
	}
	const swap = preloaded.filter((u) => faces.every((f) => !f.urls.includes(u) || f.display === 'swap'));
	return { preloaded, drawn: preloaded.filter((u) => drawn.has(u)), swap };
}

/** The head without the font preloads of the given files (absolute URLs). */
export function withoutFontPreloads<T extends { readonly tag: string; readonly attrs: Readonly<Record<string, string | undefined>> }>(tags: readonly T[], files: readonly string[], origin: string): T[] {
	const gone = new Set(files);
	return tags.filter((t) => !(t.tag === 'link' && /\bpreload\b/.test(t.attrs.rel ?? '') && t.attrs.as === 'font' && t.attrs.href && gone.has(new URL(t.attrs.href, origin).href)));
}

/** The late faces as the page adds them, their files on the page's own origin given by path. */
export function lateFaces(faces: readonly { readonly family: string; readonly src: string; readonly descriptors: Readonly<Record<string, string>> }[], origin: string): LateFace[] {
	const own = new URL(origin).origin;
	const unique = new Map<string, LateFace>();
	for (const f of faces) {
		const src = f.src.replace(/url\("([^"]+)"\)/g, (whole, u: string) => {
			const url = URL.parse(u);
			return url && url.origin === own ? `url(${JSON.stringify(url.pathname + url.search)})` : whole;
		});
		const face = { family: f.family, src, descriptors: f.descriptors };
		unique.set(JSON.stringify(face), face);
	}
	return [...unique.values()];
}
