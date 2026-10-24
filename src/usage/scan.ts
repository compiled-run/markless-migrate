import { frameworkBuilds } from '../client/builds.ts';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { classifyScript, RUNTIME_NAMES } from '../client/classify.ts';
import { request } from '../check/http.ts';
import type { LibrariesFile, LibraryUsage } from '../library/types.ts';
import { EmbedUses, detectEmbeds } from '../embed/detect.ts';
import { writeEmbeds } from '../embed/file.ts';
import { Behaviours, pageBehaviours, scriptBehaviours, type ScriptRef } from './behaviours.ts';
import { parseHtml } from './html.ts';
import { obligationsFor } from './obligations.ts';
import { captureDocSearchShell, docsearchConfig, type DocSearchUse } from './docsearch.ts';
import { analyseScript } from './script.ts';
import { readThemeConfig, THEME_FEATURES } from './themes.ts';
import type { Behaviour, BehaviourKind, ScriptFacts, UsageInventory } from './types.ts';

export const USAGE_FILE = 'usage.json';
export const OBLIGATIONS_FILE = 'obligations.json';

export interface UsageOptions {
	/** The old app, whose served pages and scripts are read. */
	readonly origin?: string;
	/** The old app's build output (static HTML and assets), read instead of the served pages when given. */
	readonly built?: string;
	/** The old app's source: its theme config and (through libraries.json) the library components it renders. */
	readonly source?: string;
	readonly routes: readonly string[];
	readonly headers?: Readonly<Record<string, string>>;
	/** `.migrate/libraries.json`, the source scan of every library the old app imports. */
	readonly libraries?: LibrariesFile;
	readonly concurrency?: number;
	/** Scripts above this size are classified but their effects are not read (a framework bundle). */
	readonly maxScriptBytes?: number;
}

const sha8 = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 8);

async function builtPage(dir: string, route: string): Promise<string | undefined> {
	const path = route.split(/[?#]/)[0]!;
	for (const file of path.endsWith('/') ? [`${path}index.html`] : [`${path}.html`, `${path}/index.html`, path]) {
		const text = await readFile(join(dir, file), 'utf8').catch(() => undefined);
		if (text !== undefined) return text;
	}
	return undefined;
}

async function servedPage(origin: string, route: string, headers: Readonly<Record<string, string>>): Promise<string | undefined> {
	try {
		const response = await request(new URL(route, origin), { headers: { ...headers } });
		// A route that redirects to another site (htmx.org's /discord) is that site's page, not the old app's.
		if (!response.ok || new URL(response.url).origin !== new URL(origin).origin || !/html/.test(response.headers.get('content-type') ?? '')) return undefined;
		return await response.text();
	} catch {
		return undefined;
	}
}

async function pool<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
		while (next < items.length) await work(items[next++]!);
	}));
}

const FAMILY_KIND: Readonly<Record<string, BehaviourKind>> = { modal: 'dialog', drawer: 'dialog', tabs: 'tabs', menu: 'menu', menubar: 'menu', select: 'menu', combobox: 'menu', popover: 'menu', hovercard: 'menu', tooltip: 'menu', navbar: 'menu', collapsible: 'disclosure', accordion: 'disclosure', toaster: 'dismiss', checkbox: 'toggle', toggle: 'toggle', radiogroup: 'toggle', slider: 'component' };

/** A library's used components and hooks, from the source scan, as behaviours: the props each site passes, where it is, which routes render it. */
function libraryBehaviours(lib: LibraryUsage, into: Behaviours, limits: string[]): void {
	if (lib.class === 'as-is' || lib.class === 'framework' || lib.class === 'drop') return;
	const themeName = lib.name.replace(/^@theme-original\//, '@theme/');
	for (const e of lib.exports) {
		if (e.kind === 'type' || e.kind === 'value' || !e.sites.length) continue;
		// A swizzled theme component (src/theme/ColorModeToggle.tsx) is that theme feature, on every page the theme draws it.
		const swizzled = e.sites.map((s) => /(?:^|\/)src\/theme\/(.+?)(?:\/index)?\.[jt]sx?$/.exec(s.file)?.[1]).find(Boolean);
		const theme = THEME_FEATURES.find((f) => f.component === themeName || (swizzled && f.component === `@theme/${swizzled}`));
		if (!theme && !e.sites.some((s) => s.routes?.length)) {
			limits.push(`${lib.name} ${e.name}: used in ${e.sites[0]!.file} and ${e.sites.length - 1} other place(s), none rendered by a route (build tooling, or code no page uses); not counted`);
			continue;
		}
		const family = (e.maps?.target ?? lib.replacement?.replace(/^@markless\/ui\s+/, '') ?? '').split(/[.\s]/)[0] ?? '';
		const kind: BehaviourKind = theme?.kind ?? FAMILY_KIND[family] ?? 'component';
		const props = Object.fromEntries(Object.entries(e.props).map(([k, v]) => [k, v.values.length ? v.values : v.dynamic ? '{dynamic}' : true]));
		const routes = [...new Set(e.sites.flatMap((s) => s.routes ?? []))];
		for (const s of e.sites.slice(0, 12)) {
			const draft = theme
				? { library: theme.theme, feature: theme.feature, kind, summary: theme.summary, details: { component: theme.component }, key: { feature: theme.feature } }
				: { library: lib.name, feature: e.name, kind, summary: `${lib.name} ${e.name}${Object.keys(props).length ? ` with ${Object.keys(props).filter((p) => p !== 'children').slice(0, 8).join(', ')}` : ''}${e.maps?.target ? ` (→ @markless/ui ${e.maps.target})` : ''}`, details: { kind: e.kind, props, options: Object.keys(e.options), reads: e.reads, ...(e.maps ? { maps: e.maps.target } : {}) }, key: { library: lib.name, export: e.name } };
			into.add(draft, undefined, { file: s.file, line: s.line });
		}
		if (routes.length) for (const r of routes) into.add(theme ? { library: theme.theme, feature: theme.feature, kind, summary: theme.summary, details: { component: theme.component }, key: { feature: theme.feature } } : { library: lib.name, feature: e.name, kind, summary: '', details: {}, key: { library: lib.name, export: e.name } }, r, { file: e.sites[0]!.file, line: e.sites[0]!.line });
	}
}

function keptLibrary(library: string, script: string, route: string, into: Behaviours): void {
	into.add({ library, feature: 'kept library', kind: 'library', summary: `${library} (${script}) is kept as it is during the migration: the same library loads and the page makes the same calls into it; the upgrade step measures it once the routes are green`, details: { script }, key: { library } }, route, { file: script, line: 1 });
}

/**
 * The semantic usage inventory: every behaviour the old site's pages use, read from the markup each page is served
 * (or built) with, the syntax tree of every script it loads, its theme config, and the source scan of its libraries;
 * each with where it lives and the checks it must pass.
 */
export async function scanUsage(options: UsageOptions): Promise<UsageInventory> {
	const into = new Behaviours();
	const limits: string[] = [];
	const scriptsByKey = new Map<string, { ref: ScriptRef; routes: Set<string> }>();
	const embedUses = new EmbedUses();
	let pages = 0;
	const builtBy = new Map<string, string>();
	await pool(options.routes, options.concurrency ?? 6, async (route) => {
		const html = options.built ? await builtPage(options.built, route) : options.origin ? await servedPage(options.origin, route, options.headers ?? {}) : undefined;
		if (html === undefined) return;
		pages++;
		const builds = frameworkBuilds(html);
		const elements = parseHtml(html);
		const found = detectEmbeds(elements, route, options.origin);
		embedUses.add(found, route);
		for (const ref of pageBehaviours(elements, route, into, found)) {
			const key = ref.src ? new URL(ref.src, options.origin ?? 'http://built.invalid').href : `inline:${sha8(ref.text ?? '')}`;
			const path = ref.src ? new URL(key).pathname : undefined;
			const build = path ? builds.find((b) => b.path.test(path)) : undefined;
			if (build) builtBy.set(key, build.framework);
			const known = scriptsByKey.get(key);
			// An inline script shared by every page is named after its shortest route (/ rather than a debug page).
			if (known) {
				known.routes.add(route);
				if (!ref.src && route.length < known.ref.route.length) known.ref = ref;
			} else scriptsByKey.set(key, { ref, routes: new Set([route]) });
		}
	});
	const scripts: ScriptFacts[] = [];
	const max = options.maxScriptBytes ?? 2_000_000;
	// The site's own external scripts first, so a page script calling a function one of them defines (demo.js's onGet) is read as using it.
	const globals = new Map<string, string>();
	let docsearch: DocSearchUse | undefined;
	const ordered = [...scriptsByKey].sort(([, a], [, b]) => Number(!a.ref.src) - Number(!b.ref.src));
	for (const [key, { ref, routes }] of ordered) {
		let text = ref.text;
		const local = Boolean(ref.src) && new URL(key).origin === new URL(options.origin ?? 'http://built.invalid').origin;
		const name = ref.src ? (local ? new URL(key).pathname : key) : `${key} (on ${ref.route}, line ${ref.line})`;
		if (ref.src) {
			text = options.built && (local || !options.origin) && ref.src.startsWith('/') ? await readFile(join(options.built, new URL(key).pathname), 'utf8').catch(() => undefined) : undefined;
			text ??= await request(key, { headers: { ...(local ? options.headers : {}) } }).then((r) => (r.ok ? r.text() : undefined)).catch(() => undefined);
		}
		if (text === undefined) {
			limits.push(`script ${name} could not be read`);
			scripts.push({ script: name, routes: [...routes].sort(), bytes: 0, effects: 0, parsed: false });
			continue;
		}
		const { runtimes, libraries, parsed: classified } = classifyScript(text);
		docsearch ??= docsearchConfig(text);
		const framework = builtBy.get(key);
		if (framework && !runtimes.length) {
			scripts.push({ script: name, routes: [...routes].sort(), bytes: Buffer.byteLength(text), runtime: `${framework} build`, effects: 0, parsed: classified });
			continue;
		}
		const pkg = ref.src && !local ? /\/npm\/((?:@[\w.-]+\/)?[\w.-]+?)(?:@[^/]*)?(?:\/|$)/.exec(new URL(key).pathname)?.[1] : undefined;
		const library = libraries[0] ?? pkg;
		// A JavaScript-only library is kept as it is during the migration: one behaviour, with the page's calls into it as what the site uses of it.
		if (!runtimes.length && library) {
			scripts.push({ script: name, routes: [...routes].sort(), bytes: Buffer.byteLength(text), runtime: `kept library ${library}`, effects: 0, parsed: classified });
			for (const r of routes) keptLibrary(library, name, r, into);
			continue;
		}
		// Another origin's script that is no library is an embed's own code: what the site uses of it is the embed it draws, not its internals.
		if (ref.src && options.origin && !local && !runtimes.length) {
			scripts.push({ script: name, routes: [...routes].sort(), bytes: Buffer.byteLength(text), runtime: `third-party ${new URL(key).hostname}`, effects: 0, parsed: classified });
			continue;
		}
		if (runtimes.length || text.length > max) {
			scripts.push({ script: name, routes: [...routes].sort(), bytes: Buffer.byteLength(text), ...(runtimes.length ? { runtime: runtimes.map((r) => RUNTIME_NAMES[r]).join(' + ') } : {}), effects: 0, parsed: classified });
			if (!runtimes.length) limits.push(`script ${name} is ${Math.round(text.length / 1024)} kB, above the size whose effects are read`);
			continue;
		}
		const analysis = analyseScript(text, ref.src ? 1 : ref.line, globals);
		if (ref.src) for (const fn of analysis.defines) globals.set(fn, name);
		for (const r of routes) scriptBehaviours(name, analysis.effects, r, (line) => (ref.src ? { file: name, line } : { route: ref.route, element: `inline <script> ${key}`, line }), into);
		scripts.push({ script: name, routes: [...routes].sort(), bytes: Buffer.byteLength(text), effects: analysis.effects.length, parsed: analysis.parsed });
		if (!analysis.parsed) limits.push(`script ${name} did not parse cleanly; the effects read may be incomplete`);
	}
	for (const lib of options.libraries?.libraries ?? []) libraryBehaviours(lib, into, limits);
	const config = options.source ? await readThemeConfig(options.source) : [];
	let behaviours = into.list();
	behaviours = behaviours.map((b): Behaviour => {
		const settings = config.filter((c) => c.theme === b.library && c.feature === b.feature);
		if (!settings.length) return b;
		return { ...b, details: { ...b.details, settings: Object.assign({}, ...settings.map((s) => s.settings)) }, sites: [...b.sites, ...settings.map((s) => ({ file: s.file, line: s.line }))] };
	});
	const obligations = behaviours.flatMap(obligationsFor);
	// A theme that configures DocSearch in the site's source (Docusaurus' themeConfig.algolia) names it there instead.
	if (!docsearch) for (const b of behaviours) docsearch ??= b.feature.includes('DocSearch') ? docsearchConfig(JSON.stringify(b.details.settings ?? {})) : undefined;
	const shell = docsearch && options.origin && !options.built ? await captureDocSearchShell(options.origin, options.routes, options.headers ?? {}).catch(() => undefined) : undefined;
	if (docsearch && shell) docsearch = { ...docsearch, shell };
	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		...(options.origin ? { origin: options.origin } : {}),
		...(options.source ? { source: options.source } : {}),
		...(options.built ? { built: options.built } : {}),
		pages,
		behaviours,
		obligations,
		scripts: scripts.sort((a, b) => a.script.localeCompare(b.script)),
		embeds: embedUses.list(),
		...(docsearch ? { docsearch } : {}),
		limits,
	};
}

export async function writeUsage(inventory: UsageInventory, stateDir: string): Promise<{ usage: string; obligations: string; embeds: string }> {
	await mkdir(stateDir, { recursive: true });
	const usage = join(stateDir, USAGE_FILE);
	const obligations = join(stateDir, OBLIGATIONS_FILE);
	await writeFile(usage, `${JSON.stringify(inventory, null, '\t')}\n`);
	await writeFile(obligations, `${JSON.stringify({ version: 1, generatedAt: inventory.generatedAt, obligations: inventory.obligations }, null, '\t')}\n`);
	const embeds = await writeEmbeds({ version: 1, generatedAt: inventory.generatedAt, embeds: inventory.embeds ?? [] }, stateDir);
	return { usage, obligations, embeds };
}

export async function readUsage(stateDir: string): Promise<UsageInventory | undefined> {
	const text = await readFile(join(stateDir, USAGE_FILE), 'utf8').catch(() => undefined);
	return text ? (JSON.parse(text) as UsageInventory) : undefined;
}
