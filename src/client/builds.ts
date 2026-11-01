import { parseHtml } from '../usage/html.ts';
import { classifyScript, moduleImports } from './classify.ts';

/**
 * Where a framework serves its own build output, recognised by the transport global its pages carry. A script served
 * from there on such a page is that framework's code, even when one chunk alone carries no runtime marker.
 */
const BUILD_PATHS: readonly (readonly [framework: string, pageMarker: RegExp, path: RegExp])[] = [
	['Next.js', /self\.__next_f|__NEXT_DATA__/, /^\/_next\//],
	['Nuxt', /window\.__NUXT__|__NUXT_DATA__/, /^\/_nuxt\//],
	['Gatsby', /___gatsby/, /^\/(?:app|framework|webpack-runtime|commons)-[\w]+\.js$/],
	['SvelteKit', /__sveltekit_/, /^\/_app\/immutable\//],
	['Astro', /astro-island/, /^\/_astro\//],
];

const QWIK_CONTAINER = /<html\b[^>]*\sq:container=/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Qwik's chunks (`q-<hash>.js`) under the container's `q:base`, and the bundle graph its preloader fetches. */
function qwikBuild(servedHtml: string): RegExp {
	const base = /<html\b[^>]*\sq:base="([^"]*)"/.exec(servedHtml)?.[1] || '/build/';
	const dir = new URL(base, 'http://x/').pathname.replace(/\/?$/, '/');
	return new RegExp(`^${escape(dir)}q-[\\w-]+\\.js$|^/assets/[\\w-]+-bundle-graph\\.json$`);
}

/** The framework builds a served page belongs to. */
export function frameworkBuilds(servedHtml: string): { framework: string; path: RegExp }[] {
	const found = BUILD_PATHS.filter(([, marker]) => marker.test(servedHtml)).map(([framework, , path]) => ({ framework, path }));
	if (QWIK_CONTAINER.test(servedHtml)) found.push({ framework: 'Qwik', path: qwikBuild(servedHtml) });
	return found;
}

const IMPORTED = /\bimport\s*\(\s*["']([^"']+)["']|\bfrom\s*["']([^"']+)["']/g;
// Qwik Insights' listener for the symbols Qwik's runtime loads, which only that runtime dispatches.
const QWIK_SYMBOLS = /addEventListener\(\s*["']qsymbol["']/;
// The functions a paused Qwik container serialises for its state (`q:func="qwik/json"`).
const QWIK_FUNCS = /\bdocument\[\s*["']qFuncs_/;

/** The framework whose own code an inline script is (it imports that framework's build, or listens for what only it dispatches), if any. */
export function frameworkInlineScript(text: string, builds: readonly { framework: string; path: RegExp }[], origin = 'http://x'): string | undefined {
	if (QWIK_SYMBOLS.test(text) || QWIK_FUNCS.test(text)) return 'Qwik';
	for (const m of text.matchAll(IMPORTED)) {
		const url = URL.parse(m[1] ?? m[2]!, origin);
		const found = url && url.origin === new URL(origin).origin ? builds.find((b) => b.path.test(url.pathname)) : undefined;
		if (found) return found.framework;
	}
	return undefined;
}

/**
 * The old origin's scripts that are another framework's runtime: one whose code defines it, or one importing, however
 * deeply, a module of that origin that does (a Vite entry is one import of the chunk holding React). Each is read once.
 */
export class RuntimeScripts {
	readonly #origin: string;
	readonly #read: (url: string) => Promise<string | undefined>;
	readonly #modules = new Map<string, Promise<{ readonly runtime: boolean; readonly imports: readonly string[] }>>();

	constructor(origin: string, read: (url: string) => Promise<string | undefined> = (url) => fetch(url).then((r) => (r.ok ? r.text() : undefined), () => undefined)) {
		this.#origin = new URL(origin).origin;
		this.#read = read;
	}

	/** The scripts and script preloads of a page's HTML that are a runtime, by absolute URL. */
	async among(html: string): Promise<Set<string>> {
		const urls = parseHtml(html).flatMap((el) => {
			const rel = el.attrs.get('rel') ?? '';
			const url = el.tag === 'script' ? el.attrs.get('src') : el.tag === 'link' && (/\bmodulepreload\b/.test(rel) || (/\bpreload\b/.test(rel) && el.attrs.get('as') === 'script')) ? el.attrs.get('href') : undefined;
			const href = url ? URL.parse(url, this.#origin) : null;
			return href && href.origin === this.#origin ? [href.href] : [];
		});
		const found = new Set<string>();
		for (const url of new Set(urls)) if (await this.#reaches(url)) found.add(url);
		return found;
	}

	async #reaches(url: string): Promise<boolean> {
		const seen = new Set<string>();
		const queue = [url];
		while (queue.length) {
			const next = queue.shift()!;
			if (seen.has(next)) continue;
			seen.add(next);
			const module = await this.#module(next);
			if (module.runtime) return true;
			queue.push(...module.imports);
		}
		return false;
	}

	#module(url: string): Promise<{ readonly runtime: boolean; readonly imports: readonly string[] }> {
		let module = this.#modules.get(url);
		if (!module) {
			module = this.#read(url).then((text) => {
				if (text === undefined) return { runtime: false, imports: [] };
				const imports = moduleImports(text).flatMap((specifier) => {
					const href = URL.parse(specifier, url);
					return href && href.origin === this.#origin ? [href.href] : [];
				});
				return { runtime: classifyScript(text).runtimes.length > 0, imports };
			});
			this.#modules.set(url, module);
		}
		return module;
	}
}
