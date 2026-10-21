import { createHash } from 'node:crypto';
import type { Browser, Response } from 'playwright';
import { parseHtml } from '../usage/html.ts';
import { classifyScript, RUNTIME_NAMES } from './classify.ts';

/**
 * The page guard: on each route, every static asset the old page loads (CSS, fonts, images, SVG, media) must load on
 * the new page with the same bytes, every inline <style> must be kept, every inline style attribute must be the same,
 * every frame and sized element must keep its box, and no script the new page runs may be another framework's runtime.
 * What differs between two loads of the old page is that page's own variation and is left out.
 */
export interface PageCapture {
	readonly route: string;
	readonly assets: ReadonlyMap<string, { readonly kind: string; readonly sha256: string; readonly bytes: number }>;
	/** Hashes of the <style> blocks the served page itself carries (a script's injected styles are its behaviour, not an asset). */
	readonly styleBlocks: readonly string[];
	/** Hashes of every <style> in the loaded page, shadow roots included. */
	readonly liveBlocks: readonly string[];
	readonly styled: readonly Styled[];
	readonly boxes: readonly Box[];
	readonly runtimes: readonly { readonly script: string; readonly runtimes: readonly string[] }[];
}

interface Styled {
	readonly key: string;
	readonly style: string;
}

interface Box {
	readonly key: string;
	readonly width: number;
	readonly height: number;
	readonly what: string;
}

export interface PageFinding {
	readonly route: string;
	readonly kind: 'asset changed' | 'asset missing' | 'asset added' | 'inline <style> changed' | 'inline style differs' | 'size differs' | 'foreign runtime';
	readonly subject: string;
	readonly expected?: string;
	readonly actual?: string;
	/** Red findings fail the route; an added asset, or a finding an allowance covers, is listed only. */
	readonly red: boolean;
	/** The reason of the allowance in .migrate/guard-allow.json that covers it. */
	readonly allowed?: string;
}

const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const STATIC = new Set(['stylesheet', 'font', 'image', 'media']);

function local(url: string, origin: string): string {
	const u = new URL(url);
	return u.origin === new URL(origin).origin ? u.pathname + u.search : u.href;
}

/** Runs in the page: inline style attributes, inline <style> text and the boxes of frames and sized elements, open shadow roots included. */
function readPage() {
	const styled: { key: string; style: string }[] = [];
	const boxes: { key: string; width: number; height: number; what: string }[] = [];
	const blocks: string[] = [];
	const counts = new Map<string, number>();
	const own = (el: Element) => `${el.localName}${el.id ? `#${el.id}` : ''}${[...el.classList].slice(0, 2).map((c) => `.${c}`).join('')}`;
	// An element with neither id nor class is named inside its nearest ancestor that has one: `div.port-attribution a`.
	const name = (el: Element) => {
		if (el.id || el.classList.length) return own(el);
		let up = el.parentElement;
		while (up && !up.id && !up.classList.length) up = up.parentElement;
		return up && up.localName !== 'body' && up.localName !== 'html' ? `${own(up)} ${own(el)}` : own(el);
	};
	const ordinal = (base: string) => {
		const n = (counts.get(base) ?? 0) + 1;
		counts.set(base, n);
		return n === 1 ? base : `${base} #${n}`;
	};
	const sizedStyle = /(^|;\s*)(width|height|min-width|min-height|max-width|max-height|flex-basis|inline-size|block-size)\s*:/;
	const walk = (root: Document | ShadowRoot, host: string) => {
		for (const el of root.querySelectorAll('*')) {
			if (el.localName === 'style') blocks.push(el.textContent ?? '');
			const css = (el as HTMLElement).style?.cssText ?? '';
			const replaced = /^(iframe|canvas|video|embed|object)$/.test(el.localName);
			// A part kept in the page closed (a dialog the old library mounts only when it opens) shows nothing; its style is compared once it is shown.
			if (css && css !== 'display: contents;' && !el.closest('[hidden]')) styled.push({ key: `${host}${name(el)}`, style: css });
			if (replaced || (css && sizedStyle.test(css))) {
				const r = el.getBoundingClientRect();
				const src = (el as HTMLIFrameElement).src;
				const where = src ? (() => { try { const u = new URL(src); return ` ${u.origin}${u.pathname}`; } catch { return ''; } })() : '';
				boxes.push({ key: ordinal(`${host}${name(el)}${where}`), width: Math.round(r.width * 2) / 2, height: Math.round(r.height * 2) / 2, what: `<${el.localName}${css ? ` style="${css}"` : ''}>` });
			}
			if (el.shadowRoot) walk(el.shadowRoot, `${host}${name(el)} >> `);
		}
	};
	walk(document, '');
	return { styled, boxes, blocks };
}

export async function capturePage(browser: Browser, origin: string, route: string, options: { readonly settleMs?: number; readonly headers?: Readonly<Record<string, string>> } = {}): Promise<PageCapture> {
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...(options.headers ? { extraHTTPHeaders: { ...options.headers } } : {}) });
	const page = await context.newPage();
	const pending: Promise<void>[] = [];
	const assets = new Map<string, { kind: string; sha256: string; bytes: number }>();
	const scripts: { script: string; runtimes: string[] }[] = [];
	let served = '';
	const onResponse = (response: Response) => {
		let frame;
		try {
			frame = response.frame();
		} catch {
			return;
		}
		if (frame !== page.mainFrame()) return;
		const type = response.request().resourceType();
		const svg = /svg/.test(response.headers()['content-type'] ?? '');
		if (response.status() >= 300 && response.status() < 400) return;
		if (type === 'document' && !served) pending.push(response.text().then((t) => void (served = t), () => {}));
		else if (STATIC.has(type) || (svg && type !== 'document')) {
			pending.push(response.body().then((body) => void assets.set(local(response.url(), origin), { kind: svg ? 'svg' : type, sha256: sha(body), bytes: body.length }), () => {}));
		} else if (type === 'script') {
			pending.push(response.text().then((text) => {
				const runtimes = classifyScript(text).runtimes.map((r) => RUNTIME_NAMES[r]);
				if (runtimes.length) scripts.push({ script: local(response.url(), origin), runtimes });
			}, () => {}));
		}
	};
	page.on('response', onResponse);
	try {
		await page.goto(new URL(route, origin).href, { waitUntil: 'load', timeout: 60_000 });
		await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
		await page.waitForTimeout(options.settleMs ?? 1_000);
		const read = await page.evaluate(readPage);
		const inline = await page.$$eval('script:not([src])', (list) => list.map((s) => ({ type: s.getAttribute('type') ?? '', text: s.textContent ?? '' })));
		for (const [i, s] of inline.entries()) {
			if (s.type && !/javascript|ecmascript|^module$/.test(s.type)) continue;
			const runtimes = classifyScript(s.text).runtimes.map((r) => RUNTIME_NAMES[r]);
			if (runtimes.length) scripts.push({ script: `inline <script> #${i + 1}`, runtimes });
		}
		page.off('response', onResponse);
		await Promise.all(pending);
		const blocks = parseHtml(served).filter((el) => el.tag === 'style').map((el) => sha(el.text ?? ''));
		return { route, assets, styleBlocks: blocks, liveBlocks: read.blocks.map((b) => sha(b)), styled: read.styled, boxes: read.boxes, runtimes: scripts };
	} finally {
		await context.close();
	}
}

const multiset = (list: readonly string[]) => {
	const m = new Map<string, number>();
	for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
	return m;
};

/** Differences between the old page and the new one, leaving out whatever differed between two loads of the old page. */
export function comparePages(old: PageCapture, again: PageCapture | undefined, next: PageCapture): { findings: PageFinding[]; varied: string[] } {
	const route = old.route;
	const findings: PageFinding[] = [];
	const varied: string[] = [];
	for (const [url, a] of old.assets) {
		const b = next.assets.get(url);
		const twice = again?.assets.get(url);
		if (again && (!twice || twice.sha256 !== a.sha256)) {
			varied.push(`asset ${url}`);
			continue;
		}
		if (!b) findings.push({ route, kind: 'asset missing', subject: `${a.kind} ${url}`, expected: `${a.bytes} bytes, sha256 ${a.sha256.slice(0, 12)}`, actual: 'not loaded by the new page', red: true });
		else if (b.sha256 !== a.sha256) findings.push({ route, kind: 'asset changed', subject: `${a.kind} ${url}`, expected: `${a.bytes} bytes, sha256 ${a.sha256.slice(0, 12)}`, actual: `${b.bytes} bytes, sha256 ${b.sha256.slice(0, 12)}`, red: true });
	}
	const oldHashes = new Set([...old.assets.values()].map((a) => a.sha256));
	for (const [url, b] of next.assets) if (!old.assets.has(url) && !oldHashes.has(b.sha256) && b.kind === 'stylesheet') findings.push({ route, kind: 'asset added', subject: `${b.kind} ${url}`, actual: `${b.bytes} bytes, not on the old page`, red: false });
	const newBlocks = new Set([...next.liveBlocks, ...next.styleBlocks, ...[...next.assets.values()].map((a) => a.sha256)]);
	const againBlocks = new Set(again?.styleBlocks ?? old.styleBlocks);
	for (const [i, block] of old.styleBlocks.entries()) {
		if (!againBlocks.has(block)) continue;
		if (!newBlocks.has(block)) findings.push({ route, kind: 'inline <style> changed', subject: `inline <style> #${i + 1}`, expected: `kept byte for byte (sha256 ${block.slice(0, 12)}), inline or as a stylesheet`, actual: 'no <style> or stylesheet with those bytes on the new page', red: true });
	}
	const label = (s: Styled) => `${s.key} style="${s.style}"`;
	const oldStyles = multiset(old.styled.map(label));
	const againStyles = again ? multiset(again.styled.map(label)) : oldStyles;
	const newStyles = multiset(next.styled.map(label));
	const onlyOld: Styled[] = [];
	const onlyNew: Styled[] = [];
	for (const s of old.styled) {
		const l = label(s);
		if ((againStyles.get(l) ?? 0) !== (oldStyles.get(l) ?? 0)) {
			if (!varied.includes(`style ${l}`)) varied.push(`style ${l}`);
			continue;
		}
		const left = newStyles.get(l) ?? 0;
		if (left > 0) newStyles.set(l, left - 1);
		else onlyOld.push(s);
	}
	for (const s of next.styled) {
		const l = label(s);
		if (varied.includes(`style ${l}`)) continue;
		const left = newStyles.get(l) ?? 0;
		if (left > 0) {
			newStyles.set(l, left - 1);
			onlyNew.push(s);
		}
	}
	const tag = (s: Styled) => s.key.replace(/[#.].*$/, '').replace(/^.* >> /, '');
	for (const s of onlyOld) {
		const twin = onlyNew.findIndex((n) => n.key === s.key) >= 0 ? onlyNew.findIndex((n) => n.key === s.key) : onlyNew.findIndex((n) => tag(n) === tag(s));
		const pair = twin >= 0 ? onlyNew.splice(twin, 1)[0] : undefined;
		if (pair && pair.style === s.style) findings.push({ route, kind: 'inline style differs', subject: s.key, expected: `style="${s.style}" on ${s.key}`, actual: `the same style on ${pair.key}: the element sits elsewhere (another parent or shadow root)`, red: true });
		else findings.push({ route, kind: 'inline style differs', subject: s.key, expected: `style="${s.style}"`, actual: pair ? `${pair.key === s.key ? '' : `${pair.key} `}style="${pair.style}"` : 'no element with that inline style', red: true });
	}
	for (const n of onlyNew) findings.push({ route, kind: 'inline style differs', subject: n.key, expected: 'no such inline style on the old page', actual: `style="${n.style}"`, red: true });
	const againBoxes = new Map((again?.boxes ?? old.boxes).map((b) => [b.key, b]));
	const newBoxes = new Map(next.boxes.map((b) => [b.key, b]));
	for (const b of old.boxes) {
		const twice = againBoxes.get(b.key);
		if (again && (!twice || Math.abs(twice.width - b.width) > 1 || Math.abs(twice.height - b.height) > 1)) {
			varied.push(`box ${b.key}`);
			continue;
		}
		const n = newBoxes.get(b.key);
		if (!n) continue;
		if (Math.abs(n.width - b.width) > 1 || Math.abs(n.height - b.height) > 1) findings.push({ route, kind: 'size differs', subject: b.key, expected: `${b.width}x${b.height} px (${b.what})`, actual: `${n.width}x${n.height} px (${n.what})`, red: true });
	}
	for (const s of next.runtimes) findings.push({ route, kind: 'foreign runtime', subject: s.script, expected: 'no other framework or library runtime: implement what the page uses in Markless', actual: s.runtimes.join(' + '), red: true });
	return { findings, varied };
}

export function summarizePageFindings(findings: readonly PageFinding[], varied: readonly string[]): string {
	const red = findings.filter((f) => f.red);
	const lines = [`Page guard (static assets byte for byte, inline styles, boxes, no foreign runtime): ${red.length ? `${red.length} difference${red.length === 1 ? '' : 's'}` : 'no differences'}`];
	for (const f of findings.filter((x) => !x.allowed)) lines.push(`  ${f.red ? 'FAIL' : 'note'}  ${f.route}  [${f.kind}] ${f.subject}${f.expected ? `\n        expected: ${f.expected}` : ''}${f.actual ? `\n        actual:   ${f.actual}` : ''}`);
	const allowed = new Map<string, number>();
	for (const f of findings) if (f.allowed) allowed.set(f.allowed, (allowed.get(f.allowed) ?? 0) + 1);
	for (const [reason, n] of allowed) lines.push(`  allowed  ${n} difference${n === 1 ? '' : 's'}: ${reason}`);
	if (varied.length) lines.push(`  Varied between two loads of the old page, left out: ${varied.slice(0, 5).join('; ')}${varied.length > 5 ? `; ${varied.length - 5} more` : ''}`);
	return `${lines.join('\n')}\n`;
}
