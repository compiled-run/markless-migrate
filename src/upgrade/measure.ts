import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Browser, CDPSession, Page } from 'playwright';
import { executedBytes } from '../check/capture.ts';
import { codeEntry, installedPackage } from '../library/package.ts';
import { newAppImports } from '../usage/implement.ts';
import { parse } from 'yuku';
import { walk, type N } from '../source/js.ts';

/** What a measurement is about: a JavaScript-only library the port kept, or the port of a headless library. */
export interface Subject {
	readonly id: string;
	readonly kind: 'kept library' | 'ported headless';
	/** The npm package, for a kept library. */
	readonly package?: string;
	/** The port's directory in the new app (`lib/parity/radix-ui-react-dialog`), for a ported headless library. */
	readonly port?: string;
	/** A CSS selector for its controls on the page, when its kind says where they are. */
	readonly control?: string;
}

export interface SubjectCost {
	readonly bytes: number;
	readonly executed: number;
	readonly cpuMs: number;
	readonly scripts: string[];
}

export interface RouteMeasure {
	readonly route: string;
	readonly costs: Readonly<Record<string, SubjectCost>>;
	/** First use of each subject's own control at 4x CPU: the longest event the interaction produced (Event Timing), in ms. */
	readonly latency: Readonly<Record<string, ({ readonly control: string } & Interaction) | undefined>>;
}

type Attribution = Readonly<Record<string, { readonly bytes: number; readonly modules: readonly (readonly [string, string, number])[] }>>;

export interface Attributor {
	/** Each subject's share (0 to 1) of a script or asset the page loaded. */
	shares(path: string, text: string | undefined, sha256: string | undefined): Map<string, number>;
}

/**
 * What survives minification of a library's code: its string literals and the property names it reads and defines,
 * read from the syntax tree. Shared with a bundle, they show the library is inside it.
 */
function tokens(text: string): Set<string> {
	const out = new Set<string>();
	let program: N;
	try {
		program = parse(text, { sourceType: 'module', preserveParens: false }).program as unknown as N;
	} catch {
		return out;
	}
	walk(program, (n) => {
		if (n.type === 'Literal' && typeof n.value === 'string' && n.value.length >= 8 && n.value.length <= 200) out.add(`"${n.value}`);
		else if (n.type === 'MemberExpression' && !n.computed && n.property?.name?.length >= 10) out.add(`.${n.property.name}`);
		else if (n.type === 'Property' && !n.computed && n.key?.type === 'Identifier' && n.key.name.length >= 10) out.add(`.${n.key.name}`);
		else if (n.type === 'MethodDefinition' && n.key?.type === 'Identifier' && n.key.name.length >= 10) out.add(`.${n.key.name}`);
	});
	return out;
}

/**
 * Who a loaded file belongs to. A Markless chunk is split by the build's own byte attribution (its modules and their
 * sizes); another script by the string literals it shares with each kept library's installed code; a non-script file
 * (a .wasm) by its content hash against the library's files.
 */
/** The files a bundler takes for what the app imports of a package: each imported entry (`mark.js/src/vanilla.js`, or the package's main entry) and the relative modules it imports in turn. */
async function importedFiles(pkg: { dir: string; json: Parameters<typeof codeEntry>[0] }, specifiers: readonly string[]): Promise<string[]> {
	const name = pkg.json.name ?? '';
	const queue = specifiers.map((spec) => (spec === name ? join(pkg.dir, codeEntry(pkg.json) ?? 'index.js') : join(pkg.dir, spec.slice(name.length + 1))));
	const seen = new Set<string>();
	for (let i = 0; i < queue.length && seen.size < 40; i++) {
		let file = queue[i]!;
		if (!/\.(m?js|cjs)$/.test(file)) file = (await stat(`${file}.js`).then(() => `${file}.js`, () => join(file, 'index.js')));
		if (seen.has(file)) continue;
		const text = await readFile(file, 'utf8').catch(() => undefined);
		if (text === undefined) continue;
		seen.add(file);
		for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) queue.push(join(dirname(file), m[1]!));
	}
	return [...seen];
}

export async function attributor(newSource: string, subjects: readonly Subject[], buildDir: string): Promise<Attributor> {
	const imports = new Map<string, string[]>();
	for (const [spec] of await newAppImports(newSource)) {
		const pkg = subjects.find((s) => s.package && (spec === s.package || spec.startsWith(`${s.package}/`)))?.package;
		if (pkg) imports.set(pkg, [...(imports.get(pkg) ?? []), spec]);
	}
	const attribution = JSON.parse(await readFile(join(buildDir, 'public', 'build', 'byte-attribution.json'), 'utf8').catch(() => '{"chunks":{}}')) as { chunks: Attribution };
	const prints = new Map<string, Set<string>>();
	const hashes = new Map<string, string>();
	for (const s of subjects) {
		if (!s.package) continue;
		const pkg = await installedPackage(newSource, s.package);
		if (!pkg) continue;
		const set = new Set<string>();
		for (const file of await importedFiles(pkg, imports.get(s.package) ?? [s.package])) {
			const text = await readFile(file, 'utf8').catch(() => '');
			for (const t of tokens(text)) set.add(t);
		}
		prints.set(s.id, set);
		for (const file of await readdir(pkg.dir, { recursive: true }).catch(() => [] as string[])) {
			const path = join(pkg.dir, String(file));
			if (!/\.(wasm|riv|woff2?|css)$/.test(path)) continue;
			const size = (await stat(path).catch(() => undefined))?.size ?? 0;
			if (size && size < 20_000_000) hashes.set(createHash('sha256').update(await readFile(path)).digest('hex'), s.id);
		}
	}
	const scanned = new Map<string, Set<string>>();
	return {
		shares(path, text, sha256) {
			const out = new Map<string, number>();
			const chunk = /\/build\/([^/?#]+\.js)$/.exec(path)?.[1];
			const entry = chunk ? attribution.chunks[chunk] : undefined;
			if (entry) {
				const total = entry.modules.reduce((n, m) => n + m[2], 0) || 1;
				for (const s of subjects) {
					const own = entry.modules.filter(([cat, id]) => (s.package && cat === 'third-party' && (id === `npm:${s.package}` || id.startsWith(`npm:${s.package}/`))) || (s.port && id.includes(`${s.port}/`))).reduce((n, m) => n + m[2], 0);
					if (own) out.set(s.id, own / total);
				}
				return out;
			}
			if (sha256 && hashes.has(sha256)) return new Map([[hashes.get(sha256)!, 1]]);
			if (!text) return out;
			let mine = scanned.get(text);
			if (!mine) scanned.set(text, (mine = tokens(text)));
			for (const [id, print] of prints) {
				if (!print.size || !mine.size) continue;
				let shared = 0;
				for (const t of mine) if (print.has(t)) shared++;
				// Most of the library's surviving names are in the script: it is bundled there; its share is the part of the script's names that are the library's.
				if (shared < 10 || shared / print.size < 0.3) continue;
				out.set(id, Math.min(1, shared / mine.size));
			}
			return out;
		},
	};
}

async function throttled(browser: Browser): Promise<{ page: Page; cdp: CDPSession; close(): Promise<void> }> {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: false });
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
	return { page, cdp, close: () => context.close() };
}

const settle = async (page: Page) => {
	await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
	await page.waitForTimeout(1_000);
};

/** One fresh load of a route with the CPU slowed 4x on a phone-sized page: what each subject costs there. */
export async function measureLoad(browser: Browser, origin: string, route: string, subjects: readonly Subject[], attribute: Attributor): Promise<Record<string, SubjectCost>> {
	const { page, cdp, close } = await throttled(browser);
	try {
		const urls = new Map<string, { url: string; type: string }>();
		const sizes = new Map<string, number>();
		const scripts = new Map<string, string>();
		cdp.on('Network.responseReceived', (e: { requestId: string; type: string; response: { url: string } }) => void urls.set(e.requestId, { url: e.response.url, type: e.type }));
		cdp.on('Network.loadingFinished', (e: { requestId: string; encodedDataLength: number }) => void sizes.set(e.requestId, e.encodedDataLength));
		cdp.on('Debugger.scriptParsed', (e: { scriptId: string; url: string }) => void (e.url && scripts.set(e.scriptId, e.url)));
		await cdp.send('Network.enable');
		await cdp.send('Debugger.enable');
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
		await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
		await cdp.send('Profiler.start');
		await page.goto(new URL(route, origin).href, { waitUntil: 'load', timeout: 90_000 });
		await settle(page);
		const coverage = (await cdp.send('Profiler.takePreciseCoverage')) as unknown as { result: { scriptId: string; url: string; functions: { ranges: { startOffset: number; endOffset: number; count: number }[] }[] }[] };
		const { profile } = (await cdp.send('Profiler.stop')) as unknown as { profile: { nodes: { id: number; callFrame: { url: string } }[]; samples: number[]; timeDeltas: number[] } };
		const cpu = new Map<string, number>();
		const nodeUrl = new Map(profile.nodes.map((n) => [n.id, n.callFrame.url]));
		profile.samples.forEach((id, i) => {
			const url = nodeUrl.get(id);
			if (url) cpu.set(url, (cpu.get(url) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
		});
		const texts = new Map<string, string>();
		const executed = new Map<string, number>();
		for (const entry of coverage.result) {
			if (!entry.url || !/^https?:/.test(entry.url)) continue;
			const source = texts.get(entry.url) ?? ((await cdp.send('Debugger.getScriptSource', { scriptId: entry.scriptId }).catch(() => ({ scriptSource: '' }))) as { scriptSource: string }).scriptSource;
			texts.set(entry.url, source);
			executed.set(entry.url, (executed.get(entry.url) ?? 0) + executedBytes(source, entry.functions));
		}
		const costs: Record<string, { bytes: number; executed: number; cpuMs: number; scripts: string[] }> = Object.fromEntries(subjects.map((s) => [s.id, { bytes: 0, executed: 0, cpuMs: 0, scripts: [] }]));
		for (const [requestId, { url, type }] of urls) {
			if (!/^https?:/.test(url)) continue;
			const path = new URL(url).pathname;
			let sha: string | undefined;
			if (type !== 'Script' && type !== 'Document' && /\.(wasm|riv|woff2?|css)$/.test(path)) {
				const body = (await cdp.send('Network.getResponseBody', { requestId }).catch(() => undefined)) as { body: string; base64Encoded: boolean } | undefined;
				if (body) sha = createHash('sha256').update(Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8')).digest('hex');
			}
			for (const [id, share] of attribute.shares(path, texts.get(url), sha)) {
				const c = costs[id]!;
				c.bytes += share * (sizes.get(requestId) ?? 0);
				c.executed += share * (executed.get(url) ?? 0);
				c.cpuMs += share * (cpu.get(url) ?? 0);
				c.scripts.push(`${path}${share < 1 ? ` (${Math.round(share * 100)}%)` : ''}`);
			}
		}
		return costs;
	} finally {
		await close();
	}
}

/** Visible buttons on the page, for finding which one first loads a library the page does not load at once (a search box that loads its index and engine on open). */
export async function pageButtons(browser: Browser, origin: string, route: string, limit = 6): Promise<string[]> {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await context.newPage();
	try {
		await page.goto(new URL(route, origin).href, { waitUntil: 'load', timeout: 90_000 });
		await settle(page);
		return await page.$$eval('button, [role="button"]', (els, n) => {
			const out: string[] = [];
			for (const el of els) {
				const r = el.getBoundingClientRect();
				if (!r.width || !r.height) continue;
				const parts: string[] = [];
				for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) parts.unshift(`${e.localName}:nth-child(${e.parentElement ? [...e.parentElement.children].indexOf(e) + 1 : 1})`);
				out.push(`html > ${parts.join(' > ')}`);
				if (out.length >= (n as number)) break;
			}
			return out;
		}, limit);
	} finally {
		await context.close();
	}
}

/** The controls a subject draws on the page: where its kind says (`[aria-haspopup="menu"]`), or elements whose own listeners run its code. */
export async function findControls(browser: Browser, origin: string, route: string, subject: Subject, attribute: Attributor, limit = 2): Promise<string[]> {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await context.newPage();
	try {
		await page.goto(new URL(route, origin).href, { waitUntil: 'load', timeout: 90_000 });
		await settle(page);
		if (subject.control) {
			return await page.$$eval(subject.control, (els, n) => {
				const out: string[] = [];
				for (const el of els) {
					const r = el.getBoundingClientRect();
					if (!r.width || !r.height) continue;
					const parts: string[] = [];
					for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) parts.unshift(`${e.localName}:nth-child(${e.parentElement ? [...e.parentElement.children].indexOf(e) + 1 : 1})`);
					out.push(`html > ${parts.join(' > ')}`);
					if (out.length >= (n as number)) break;
				}
				return out;
			}, limit);
		}
		const cdp = await context.newCDPSession(page);
		const scripts = new Map<string, string>();
		cdp.on('Debugger.scriptParsed', (e: { scriptId: string; url: string }) => void scripts.set(e.scriptId, e.url));
		await cdp.send('Debugger.enable');
		const sources = new Map<string, string>();
		const owned = async (scriptId: string) => {
			const url = scripts.get(scriptId);
			if (!url || !/^https?:/.test(url)) return false;
			if (!sources.has(url)) sources.set(url, ((await cdp.send('Debugger.getScriptSource', { scriptId }).catch(() => ({ scriptSource: '' }))) as { scriptSource: string }).scriptSource);
			return (attribute.shares(new URL(url).pathname, sources.get(url), undefined).get(subject.id) ?? 0) >= 0.5;
		};
		const { result } = (await cdp.send('Runtime.evaluate', { expression: '[...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 1500)' })) as { result: { objectId: string } };
		const { result: props } = (await cdp.send('Runtime.getProperties', { objectId: result.objectId, ownProperties: true })) as { result: { name: string; value?: { objectId?: string } }[] };
		const found: string[] = [];
		for (const p of props) {
			if (!/^\d+$/.test(p.name) || !p.value?.objectId) continue;
			const { listeners } = (await cdp.send('DOMDebugger.getEventListeners', { objectId: p.value.objectId })) as { listeners: { type: string; scriptId: string }[] };
			let mine = false;
			for (const l of listeners) if (/^(click|pointerdown|mousedown|touchstart|keydown|pointermove|mousemove|dragstart)$/.test(l.type) && (await owned(l.scriptId))) mine = true;
			if (!mine) continue;
			const { result: path } = (await cdp.send('Runtime.callFunctionOn', { objectId: p.value.objectId, functionDeclaration: `function () { const parts = []; for (let e = this; e && e !== document.documentElement; e = e.parentElement) parts.unshift(e.localName + ':nth-child(' + (e.parentElement ? [...e.parentElement.children].indexOf(e) + 1 : 1) + ')'); return 'html > ' + parts.join(' > '); }`, returnByValue: true })) as { result: { value: string } };
			found.push(path.value);
			if (found.length >= limit) break;
		}
		return found;
	} finally {
		await context.close();
	}
}

export interface Interaction {
	/** The longest event entry the click produced, or null when every one stayed under Event Timing's 16 ms floor. */
	readonly ms: number | null;
	/** The subject's code the click ran, and fetched, beyond what the load already did. */
	readonly executed: number;
	readonly bytes: number;
}

export interface Use {
	readonly ms: number | null;
	/** Per subject: its code the click ran and fetched beyond what the load did. */
	readonly cost: ReadonlyMap<string, { readonly executed: number; readonly bytes: number }>;
}

/** The first use of a control on a fresh load at 4x CPU, and how much of the subject's code it ran and fetched. */
export async function firstInteraction(browser: Browser, origin: string, route: string, selector: string, attribute: Attributor): Promise<Use> {
	const { page, cdp, close } = await throttled(browser);
	try {
		await page.addInitScript(() => {
			const w = window as unknown as { __mmEvents: { start: number; duration: number }[] };
			w.__mmEvents = [];
			new PerformanceObserver((list) => {
				for (const e of list.getEntries()) w.__mmEvents.push({ start: e.startTime, duration: e.duration });
			}).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
		});
		await cdp.send('Debugger.enable');
		await cdp.send('Profiler.enable');
		await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
		await page.goto(new URL(route, origin).href, { waitUntil: 'load', timeout: 90_000 });
		await settle(page);
		// Taking coverage resets its counters: what the next take reports is what the click alone ran.
		await cdp.send('Profiler.takePreciseCoverage');
		const fetched = new Map<string, { url: string; size: number }>();
		cdp.on('Network.responseReceived', (e: { requestId: string; response: { url: string } }) => void fetched.set(e.requestId, { url: e.response.url, size: 0 }));
		cdp.on('Network.loadingFinished', (e: { requestId: string; encodedDataLength: number }) => {
			const f = fetched.get(e.requestId);
			if (f) f.size = e.encodedDataLength;
		});
		await cdp.send('Network.enable');
		const t0 = await page.evaluate(() => performance.now());
		await page.locator(selector).first().click({ timeout: 5_000 });
		await page.waitForTimeout(800);
		const events = await page.evaluate(() => (window as unknown as { __mmEvents: { start: number; duration: number }[] }).__mmEvents);
		const after = events.filter((e) => e.start >= t0);
		const coverage = (await cdp.send('Profiler.takePreciseCoverage')) as unknown as { result: { scriptId: string; url: string; functions: { ranges: { startOffset: number; endOffset: number; count: number }[] }[] }[] };
		const cost = new Map<string, { executed: number; bytes: number }>();
		const add = (id: string, key: 'executed' | 'bytes', n: number) => {
			const c = cost.get(id) ?? { executed: 0, bytes: 0 };
			c[key] += n;
			cost.set(id, c);
		};
		const texts = new Map<string, string>();
		for (const entry of coverage.result) {
			if (!entry.url || !/^https?:/.test(entry.url)) continue;
			const source = texts.get(entry.url) ?? ((await cdp.send('Debugger.getScriptSource', { scriptId: entry.scriptId }).catch(() => ({ scriptSource: '' }))) as { scriptSource: string }).scriptSource;
			texts.set(entry.url, source);
			const ran = executedBytes(source, entry.functions);
			if (ran) for (const [id, share] of attribute.shares(new URL(entry.url).pathname, source, undefined)) add(id, 'executed', Math.round(share * ran));
		}
		for (const f of fetched.values()) if (/^https?:/.test(f.url)) for (const [id, share] of attribute.shares(new URL(f.url).pathname, texts.get(f.url), undefined)) add(id, 'bytes', Math.round(share * f.size));
		return { ms: after.length ? Math.max(...after.map((e) => e.duration)) : null, cost };
	} finally {
		await close();
	}
}
