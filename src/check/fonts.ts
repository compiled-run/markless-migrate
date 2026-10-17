import type { Page } from 'playwright';
import type { ElementSnapshot } from './types.ts';

interface FontFaceInfo {
	readonly family: string;
	readonly urls: readonly string[];
	readonly weight: string;
	readonly style: string;
}

interface PlatformFont {
	readonly familyName: string;
	readonly isCustomFont: boolean;
	readonly glyphCount: number;
}

// Runs inside the page: marks the collected elements that have text of their own and lists every @font-face rule.
function markTextElements(indices: number[]) {
	const scope = window as unknown as { __mmElements?: Element[] };
	const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, '').toLowerCase();
	const faces: { family: string; urls: string[]; weight: string; style: string }[] = [];
	const visit = (rules: CSSRuleList, base: string) => {
		for (const rule of rules) {
			if (rule instanceof CSSFontFaceRule) {
				const src = rule.style.getPropertyValue('src');
				const urls = [...src.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].map((m) => new URL(m[2]!, base).href);
				faces.push({ family: unquote(rule.style.getPropertyValue('font-family')), urls, weight: rule.style.getPropertyValue('font-weight') || '400', style: rule.style.getPropertyValue('font-style') || 'normal' });
			} else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules, base);
		}
	};
	for (const sheet of document.styleSheets) {
		try {
			visit(sheet.cssRules, sheet.href ?? location.href);
		} catch {}
	}
	const elements = indices.map((i, k) => {
		const el = scope.__mmElements![i]!;
		el.setAttribute('data-mm-font', String(k));
		const style = getComputedStyle(el);
		return { families: style.fontFamily.split(',').map(unquote), weight: style.fontWeight, style: style.fontStyle };
	});
	return { faces, elements };
}

function unmark() {
	for (const el of document.querySelectorAll('[data-mm-font]')) el.removeAttribute('data-mm-font');
}

function weightMatches(range: string, weight: string): boolean {
	const named: Record<string, number> = { normal: 400, bold: 700 };
	const [low, high = low] = range.split(/\s+/).map((part) => named[part] ?? Number(part));
	const w = Number(weight);
	return !Number.isFinite(low) || (w >= low! && w <= high!);
}

// Which web font file renders the text: the first family in the element's stack with a downloaded @font-face that fits its weight and style.
function fontFile(element: { families: readonly string[]; weight: string; style: string }, faces: readonly FontFaceInfo[], hashes: ReadonlyMap<string, string>): string | undefined {
	for (const family of element.families) {
		const candidates = faces.filter((face) => face.family === family && face.urls.some((url) => hashes.has(url)));
		const face = candidates.find((f) => weightMatches(f.weight, element.weight) && (f.style === 'normal' ? element.style === 'normal' : element.style !== 'normal')) ?? candidates[0];
		const url = face?.urls.find((u) => hashes.has(u));
		if (url) return hashes.get(url);
	}
	return undefined;
}

export function fontSignature(fonts: readonly PlatformFont[], file: string | undefined): string {
	return fonts
		.filter((font) => font.glyphCount > 0)
		.sort((a, b) => b.glyphCount - a.glyphCount)
		.map((font) => (font.isCustomFont ? `web font ${font.familyName}${file ? ` (sha256 ${file.slice(0, 12)})` : ''}` : font.familyName))
		.join(' + ');
}

export async function renderedFonts(page: Page, elements: readonly ElementSnapshot[], hashes: ReadonlyMap<string, string>): Promise<ElementSnapshot[]> {
	const indices = elements.flatMap((el, i) => (el.text ? [i] : []));
	if (!indices.length) return [...elements];
	const session = await page.context().newCDPSession(page);
	try {
		const { faces, elements: info } = await page.evaluate(markTextElements, indices);
		await session.send('DOM.enable');
		await session.send('CSS.enable');
		const { root } = await session.send('DOM.getDocument', { depth: 0 });
		const { nodeIds } = await session.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-mm-font]' });
		const out = [...elements];
		// Marked nodes come back in document order, which need not be the snapshot's order (and an element the page
		// replaced since is no longer there), so each node names its own index.
		for (const nodeId of nodeIds) {
			const attributes = ((await session.send('DOM.getAttributes', { nodeId })) as { attributes: string[] }).attributes;
			const k = Number(attributes[attributes.indexOf('data-mm-font') + 1]);
			const i = indices[k];
			if (i === undefined) continue;
			const { fonts } = (await session.send('CSS.getPlatformFontsForNode', { nodeId })) as { fonts: PlatformFont[] };
			const file = fonts.some((f) => f.isCustomFont) ? fontFile(info[k]!, faces, hashes) : undefined;
			out[i] = { ...out[i]!, font: fontSignature(fonts, file) };
		}
		return out;
	} finally {
		await page.evaluate(unmark).catch(() => {});
		await session.detach().catch(() => {});
	}
}
