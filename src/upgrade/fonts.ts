import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { AddressInfo } from 'node:net';
import { gunzipSync, brotliDecompressSync, gzipSync, inflateSync } from 'node:zlib';
import type { Browser } from 'playwright';
import { weightMatches } from '../check/fonts.ts';
import { formatMetric, judgeLoad, measureLoad, type LoadOptions, type Metrics, type RouteLoad } from '../check/load.ts';

/** The web font the largest text on a page paints with, when the page only finds it once its stylesheet has arrived and been parsed. */
export interface LateFont {
	readonly route: string;
	/** The LCP element, as a short selector and its text. */
	readonly element: string;
	readonly family: string;
	/** The font file's URL as the page should name it: a path on the page's own origin, else absolute. */
	readonly href: string;
	readonly type?: string;
	/** `font-display` of its @font-face; `auto` and `block` hide the text until the file arrives. */
	readonly display: string;
	readonly stylesheet: string;
	/** When the font was requested and when the stylesheet that names it had arrived, in ms after navigation start, on a phone-sized page at full speed. */
	readonly requestedAt: number;
	readonly stylesheetAt: number;
}

export type LateFontFinding = { readonly late: LateFont } | { readonly none: string };

interface PageFinding {
	readonly none?: string;
	readonly element?: string;
	readonly families?: string[];
	readonly weight?: string;
	readonly style?: string;
	readonly faces?: { family: string; urls: string[]; weight: string; style: string; display: string; sheet: string }[];
	readonly resources?: { name: string; startTime: number; responseEnd: number; initiatorType: string }[];
	readonly preloads?: string[];
}

// Runs inside the page after load: the LCP entry, its element's font stack, every @font-face and when each resource loaded.
async function readPage(): Promise<PageFinding> {
	const entry = await new Promise<PerformanceEntry | undefined>((done) => {
		const seen: PerformanceEntry[] = [];
		new PerformanceObserver((list) => seen.push(...list.getEntries())).observe({ type: 'largest-contentful-paint', buffered: true });
		setTimeout(() => done(seen.at(-1)), 300);
	});
	const lcp = entry as (PerformanceEntry & { element?: Element | null; url?: string }) | undefined;
	if (!lcp?.element) return { none: 'the page reported no largest contentful paint element' };
	if (lcp.url) return { none: `its largest contentful paint is an image (${lcp.url}), not text` };
	const el = lcp.element;
	const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, '').toLowerCase();
	const faces: { family: string; urls: string[]; weight: string; style: string; display: string; sheet: string }[] = [];
	const visit = (rules: CSSRuleList, base: string, sheet: string) => {
		for (const rule of rules) {
			if (rule instanceof CSSFontFaceRule) {
				const src = rule.style.getPropertyValue('src');
				const urls = [...src.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].map((m) => new URL(m[2]!, base).href);
				faces.push({ family: unquote(rule.style.getPropertyValue('font-family')), urls, weight: rule.style.getPropertyValue('font-weight') || '400', style: rule.style.getPropertyValue('font-style') || 'normal', display: rule.style.getPropertyValue('font-display') || 'auto', sheet });
			} else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules, base, sheet);
		}
	};
	for (const sheet of document.styleSheets) {
		try {
			visit(sheet.cssRules, sheet.href ?? location.href, sheet.href ?? location.href);
		} catch {}
	}
	const style = getComputedStyle(el);
	const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
	const tag = el.tagName.toLowerCase();
	const cls = [...el.classList].slice(0, 2).map((c) => `.${c}`).join('');
	return {
		element: `${tag}${cls} "${text}"`,
		families: style.fontFamily.split(',').map(unquote),
		weight: style.fontWeight,
		style: style.fontStyle,
		faces,
		resources: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((r) => ({ name: r.name, startTime: r.startTime, responseEnd: r.responseEnd, initiatorType: r.initiatorType })),
		preloads: [...document.querySelectorAll<HTMLLinkElement>('link[rel~="preload"][as="font"]')].map((l) => l.href),
	};
}

const FONT_TYPES: Readonly<Record<string, string>> = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

/** Loads the route on a phone-sized page and finds the web font its LCP text waits for, when nothing preloads it and the page asks for it only after its stylesheet has arrived. */
export async function findLateFont(browser: Browser, origin: string, route: string): Promise<LateFontFinding> {
	const context = await browser.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1.75 });
	try {
		const page = await context.newPage();
		await page.goto(new URL(route, origin).href, { waitUntil: 'load' });
		const found = await page.evaluate(readPage);
		if (found.none) return { none: found.none };
		const resources = found.resources!;
		for (const family of found.families!) {
			const candidates = found.faces!.filter((f) => f.family === family && f.urls.some((u) => resources.some((r) => r.name === u)));
			if (!candidates.length) continue;
			const face = candidates.find((f) => weightMatches(f.weight, found.weight!) && (f.style === 'normal' ? found.style === 'normal' : found.style !== 'normal')) ?? candidates[0]!;
			const url = face.urls.find((u) => resources.some((r) => r.name === u))!;
			const font = resources.find((r) => r.name === url)!;
			if (found.preloads!.includes(url)) return { none: `${found.element} paints with ${family}, which the page already preloads` };
			const sheet = resources.find((r) => r.name === face.sheet);
			const stylesheetAt = sheet?.responseEnd ?? 0;
			if (sheet && font.startTime < stylesheetAt) return { none: `${found.element} paints with ${family}, requested before its stylesheet arrived` };
			const own = new URL(url).origin === new URL(origin).origin;
			const ext = /\.(woff2|woff|ttf|otf)(?:[?#]|$)/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
			return {
				late: {
					route,
					element: found.element!,
					family,
					href: own ? new URL(url).pathname + new URL(url).search : url,
					...(ext && FONT_TYPES[ext] ? { type: FONT_TYPES[ext] } : {}),
					display: face.display,
					stylesheet: own && sheet ? new URL(face.sheet).pathname : face.sheet,
					requestedAt: Math.round(font.startTime),
					stylesheetAt: Math.round(stylesheetAt),
				},
			};
		}
		return { none: `${found.element} paints with ${found.families!.join(', ')}: no web font the page downloaded` };
	} finally {
		await context.close();
	}
}

export function preloadTag(font: Pick<LateFont, 'href' | 'type'>): string {
	return `<link rel="preload" href="${font.href}" as="font"${font.type ? ` type="${font.type}"` : ''} crossorigin>`;
}

/** The page with the preload added at the top of its head, after the charset so it stays in the first 1024 bytes. */
export function withPreload(html: string, tag: string): string {
	const charset = /<meta\s[^>]*charset[^>]*>/i.exec(html);
	if (charset) return html.slice(0, charset.index + charset[0].length) + tag + html.slice(charset.index + charset[0].length);
	const head = /<head(?:\s[^>]*)?>/i.exec(html);
	return head ? html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length) : tag + html;
}

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'te', 'trailer', 'content-length', 'content-encoding', 'alt-svc', 'strict-transport-security']);

function decode(body: Buffer, encoding: string | undefined): Buffer {
	if (encoding === 'gzip') return gunzipSync(body);
	if (encoding === 'br') return brotliDecompressSync(body);
	if (encoding === 'deflate') return inflateSync(body);
	return body;
}

/** Serves `origin` through this machine, the route's page with `tag` added to its head when given; every response is fetched again for every request, as compressed as the origin sent it. */
export async function proxy(origin: string, route: string, tag?: string): Promise<{ origin: string; close: () => Promise<void> }> {
	const target = new URL(origin);
	const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
	const server: Server = createServer((req, res) => {
		const path = req.url ?? '/';
		const headers = { ...req.headers, host: target.host };
		delete headers.connection;
		const upstream = send({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: req.method, path, headers }, (answer: IncomingMessage) => {
			const chunks: Buffer[] = [];
			answer.on('data', (c: Buffer) => chunks.push(c));
			answer.on('end', () => {
				let body: Buffer = Buffer.concat(chunks);
				const encoding = answer.headers['content-encoding'];
				const out: Record<string, string | string[]> = {};
				for (const [k, v] of Object.entries(answer.headers)) if (v !== undefined && !HOP.has(k)) out[k] = v;
				if (answer.headers.location) out.location = answer.headers.location.replace(target.origin, '');
				const isPage = tag && new URL(path, target).pathname === new URL(route, target).pathname && /text\/html/.test(String(answer.headers['content-type']));
				if (isPage) body = gzipSync(withPreload(decode(body, encoding).toString('utf8'), tag!));
				if (isPage || encoding === 'gzip') out['content-encoding'] = 'gzip';
				else if (encoding) out['content-encoding'] = encoding;
				res.writeHead(answer.statusCode ?? 502, out).end(body);
			});
		});
		upstream.on('error', () => res.writeHead(502).end());
		req.pipe(upstream);
	});
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise<void>((done) => server.close(() => done())) };
}

export interface FontPreloadMeasure {
	readonly font: LateFont;
	/** `old` is the page with the preload, `new` the page as it is: a red LCP verdict means the preload paints the largest text sooner, beyond noise. */
	readonly load: RouteLoad;
	readonly lcpSavingMs: number;
	/** The LCP comes sooner with the preload, beyond noise. */
	readonly significant: boolean;
	/** The FCP comes later with the preload, beyond noise: the font is fetched at the highest priority, and Lighthouse counts it as holding back the first paint. */
	readonly fcpWorse?: { readonly ms: number; readonly p: number };
}

const good = (runs: RouteLoad['old']['runs']) => runs.filter((r): r is Metrics => !('error' in r));

/** FCP with the preload against FCP without it, judged the other way round. */
export function fcpCost(load: RouteLoad): FontPreloadMeasure['fcpWorse'] {
	const plain = good(load.new.runs);
	const preloaded = good(load.old.runs);
	if (!plain.length || !preloaded.length) return undefined;
	const fcp = judgeLoad(plain, preloaded).find((v) => v.metric === 'fcp')!;
	return fcp.ok ? undefined : { ms: Math.round(fcp.worse), p: fcp.p };
}

/** Lighthouse mobile on the page as it is and with the preload added, both through the same local proxy so only the preload differs. */
export async function measurePreload(origin: string, font: LateFont, options: LoadOptions = {}, measure: typeof measureLoad = measureLoad): Promise<FontPreloadMeasure> {
	const [plain, preloaded] = await Promise.all([proxy(origin, font.route), proxy(origin, font.route, preloadTag(font))]);
	try {
		const loads = await measure({ old: preloaded.origin, new: plain.origin }, [font.route], options);
		const load = loads.get(font.route)!;
		const lcp = load.verdicts.find((v) => v.metric === 'lcp');
		const cost = fcpCost(load);
		return { font, load, lcpSavingMs: lcp ? Math.round(lcp.worse) : 0, significant: Boolean(lcp && !lcp.ok), ...(cost ? { fcpWorse: cost } : {}) };
	} finally {
		await Promise.all([plain.close(), preloaded.close()]);
	}
}

export function describePreload(m: FontPreloadMeasure): string {
	const lcp = m.load.verdicts.find((v) => v.metric === 'lcp');
	const fcp = m.load.verdicts.find((v) => v.metric === 'fcp');
	if (!lcp) return `not measured: ${m.load.skipped ?? 'no Lighthouse run finished'}`;
	const list = (side: 'old' | 'new', metric: 'lcp' | 'fcp') => good(m.load[side].runs).map((r) => formatMetric(metric, r[metric])).join(', ');
	const runs = `; LCP runs now ${list('new', 'lcp')}, with the preload ${list('old', 'lcp')}`;
	const cost = m.fcpWorse ? `; the preload makes FCP ${formatMetric('fcp', m.fcpWorse.ms)} later beyond noise (p = ${m.fcpWorse.p.toFixed(3)})` : '';
	return `Lighthouse mobile, median of ${m.load.runs} runs each: LCP ${formatMetric('lcp', lcp.new)} now, ${formatMetric('lcp', lcp.old)} with the preload (${m.lcpSavingMs >= 0 ? `${formatMetric('lcp', m.lcpSavingMs)} sooner` : `${formatMetric('lcp', -m.lcpSavingMs)} later`}, p = ${lcp.p.toFixed(3)})${fcp ? `; FCP ${formatMetric('fcp', fcp.new)} now, ${formatMetric('fcp', fcp.old)} with it` : ''}${cost}${runs}`;
}
