import { HINTS } from './hints.ts';
import type { Failure, PageCapture } from './types.ts';

type Marker = readonly [marker: string, framework: string, owners?: readonly string[]];

/**
 * What an old framework writes into its pages for itself: hydration flags, head-manager tags, data scripts, component
 * wrapper elements and its generator meta. A port carries none of them. `owners` are the runtimes (as `frameworkRuntime`
 * names them) whose own pages carry the marker; on a page that runs one of them the marker is that page's own.
 */
export const RUNTIME_MARKERS = {
	attributes: [
		['data-has-hydrated', 'Docusaurus'],
		['data-rh', 'react-helmet'],
		['data-reactroot', 'React', ['React', 'Next.js']],
		['data-reactid', 'React', ['React', 'Next.js']],
		['data-precedence', 'React', ['React', 'Next.js']],
		['data-server-rendered', 'Vue', ['Vue']],
		['data-v-app', 'Vue', ['Vue']],
		['data-n-head', 'Nuxt', ['Vue']],
		['data-n-head-ssr', 'Nuxt', ['Vue']],
		['data-hid', 'Nuxt', ['Vue']],
		['data-nscript', 'Next.js', ['Next.js']],
		['data-n-g', 'Next.js', ['Next.js']],
		['data-n-p', 'Next.js', ['Next.js']],
		['data-next-hide-fouc', 'Next.js', ['Next.js']],
		['data-gatsby-head', 'Gatsby'],
		['data-sveltekit-hydrate', 'SvelteKit', ['Svelte']],
		['data-sveltekit-fetched', 'SvelteKit', ['Svelte']],
		['data-hk', 'Solid', ['Solid']],
		['ng-version', 'Angular', ['Angular']],
		['ng-server-context', 'Angular', ['Angular']],
		['q:container', 'Qwik', ['Qwik']],
		['q:version', 'Qwik', ['Qwik']],
		['q:manifest-hash', 'Qwik', ['Qwik']],
		['q:instance', 'Qwik', ['Qwik']],
		['q:key', 'Qwik', ['Qwik']],
		['q:id', 'Qwik', ['Qwik']],
		['q:head', 'Qwik', ['Qwik']],
	],
	elements: [
		['astro-island', 'Astro'],
		['astro-slot', 'Astro'],
		['astro-static-slot', 'Astro'],
	],
	/** Ids of the data scripts a framework renders its page state into. */
	scriptIds: [
		['__NEXT_DATA__', 'Next.js', ['Next.js']],
		['__NUXT_DATA__', 'Nuxt', ['Vue']],
		['qwikloader', 'Qwik', ['Qwik']],
	],
	/** Script types (or Qwik's `q:func`) a framework's paused state is serialised under. */
	scriptTypes: [
		['qwik/json', 'Qwik', ['Qwik']],
		['qwik/vnode', 'Qwik', ['Qwik']],
	],
	/** Globals an inline script sets to hand the server's state to the client runtime. */
	scriptGlobals: [
		['self.__next_f', 'Next.js', ['Next.js']],
		['window.__NUXT__', 'Nuxt', ['Vue']],
		['window.__remixContext', 'Remix', ['React']],
		['window.__reactRouterContext', 'React Router', ['React']],
		['__staticRouterHydrationData', 'React Router', ['React']],
		['window.qwikevents', 'Qwik', ['Qwik']],
	],
	/** `<meta name="generator">` contents, by the name they start with. */
	generators: [
		['Docusaurus', 'Docusaurus'],
		['Next.js', 'Next.js', ['Next.js']],
		['Nuxt', 'Nuxt', ['Vue']],
		['VitePress', 'VitePress', ['Vue']],
		['VuePress', 'VuePress', ['Vue']],
		['Astro', 'Astro'],
		['Gatsby', 'Gatsby'],
		['Hugo', 'Hugo'],
		['Jekyll', 'Jekyll'],
		['WordPress', 'WordPress'],
		['Eleventy', 'Eleventy'],
		['Hexo', 'Hexo'],
		['Gridsome', 'Gridsome', ['Vue']],
		['Zola', 'Zola'],
		['Starlight', 'Astro'],
		['Mintlify', 'Mintlify'],
		['Drupal', 'Drupal'],
		['Joomla', 'Joomla'],
		['Ghost', 'Ghost'],
		['Wix', 'Wix'],
		['Squarespace', 'Squarespace'],
		['Webflow', 'Webflow'],
	],
} as const satisfies Readonly<Record<'attributes' | 'elements' | 'scriptIds' | 'scriptTypes' | 'scriptGlobals' | 'generators', readonly Marker[]>>;

export interface RuntimeMarker {
	readonly marker: string;
	readonly framework: string;
	readonly owners?: readonly string[];
	/** `served`: in the HTML the server sent; `page`: in the document once the page has loaded. */
	readonly where: 'served' | 'page';
}

const byName = (list: readonly Marker[]) => new Map(list.map(([name, framework, owners]) => [name, { framework, owners }]));
const ATTRIBUTES = byName(RUNTIME_MARKERS.attributes);
const ELEMENTS = byName(RUNTIME_MARKERS.elements);
const SCRIPT_IDS = byName(RUNTIME_MARKERS.scriptIds);
const SCRIPT_TYPES = byName(RUNTIME_MARKERS.scriptTypes);
const GLOBALS = RUNTIME_MARKERS.scriptGlobals.map(([name, framework, owners]: Marker) => ({ re: new RegExp(`(?<![\\w$.])${name.replace(/[.$]/g, '\\$&')}(?![\\w$])`), marker: name, framework, owners }));
const GENERATORS: readonly Marker[] = RUNTIME_MARKERS.generators;

/** The old-framework markers in an HTML document; text and code that only mention one (escaped in a code block, quoted in a script) do not count. */
export function runtimeMarkers(html: string, where: RuntimeMarker['where']): RuntimeMarker[] {
	const found = new Map<string, RuntimeMarker>();
	const add = (marker: string, { framework, owners }: { framework: string; owners?: readonly string[] | undefined }) => found.has(marker) || found.set(marker, { marker, framework, ...(owners ? { owners } : {}), where });
	const markup = html.replace(/<!--[\s\S]*?-->/g, '');
	for (const m of markup.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) for (const g of GLOBALS) if (g.re.test(m[1]!)) add(g.marker, g);
	const tags = markup.replace(/<(script|style|textarea)\b([^>]*)>[\s\S]*?<\/\1>/gi, '<$1$2></$1>');
	for (const m of tags.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g)) {
		const tag = m[1]!.toLowerCase();
		if (ELEMENTS.has(tag)) add(`<${tag}>`, ELEMENTS.get(tag)!);
		const attrs = new Map<string, string>();
		for (const a of (m[2] ?? '').matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
			const name = a[1]!.toLowerCase();
			attrs.set(name, a[2] ?? a[3] ?? a[4] ?? '');
			if (ATTRIBUTES.has(name)) add(name, ATTRIBUTES.get(name)!);
		}
		const id = attrs.get('id');
		if (tag === 'script' && id && SCRIPT_IDS.has(id)) add(`<script id="${id}">`, SCRIPT_IDS.get(id)!);
		const type = tag === 'script' ? (attrs.get('type') || attrs.get('q:func')) : undefined;
		if (type && SCRIPT_TYPES.has(type)) add(`<script type="${type}">`, SCRIPT_TYPES.get(type)!);
		const content = attrs.get('content')?.trim() ?? '';
		const generator = tag === 'meta' && attrs.get('name')?.toLowerCase() === 'generator' ? GENERATORS.find(([name]) => content.toLowerCase().startsWith(name.toLowerCase())) : undefined;
		if (generator) add(`<meta name="generator" content="${content}">`, { framework: generator[1], owners: generator[2] });
	}
	return [...found.values()];
}

/** The new page's old-framework markers, unless the page runs that framework itself. The old page carrying them is the reference's own business and never a difference. */
export function residueFailures(route: string, next: PageCapture | undefined): Failure[] {
	if (!next) return [];
	const runs = new Set(next.assets.flatMap((a) => (a.runtime ? [a.runtime] : [])));
	const seen = new Set<string>();
	return (next.residue ?? [])
		.filter((r) => !r.owners?.some((o) => runs.has(o)) && !seen.has(r.marker) && seen.add(r.marker))
		.map((r) => ({
			route,
			dimension: 'http',
			check: `old framework runtime marker ${r.marker}`,
			viewport: next.viewport,
			expected: '(absent)',
			actual: `${r.marker} (${r.framework}) ${r.where === 'served' ? 'in the HTML the server sends' : 'in the page once it has loaded'}`,
			hint: HINTS.residue,
		}));
}

/**
 * A port page that runs the original's framework: a script of the page carries a UI framework's runtime the original's page
 * also runs, or is one of the original's own script files. A Markless page that boots the old runtime beside its own is not
 * a port of that page, whatever it renders; JS weight alone cannot show it, since the original loads the same runtime.
 */
export function originalRuntimeFailures(route: string, old: PageCapture | undefined, next: PageCapture | undefined): Failure[] {
	if (!old || !next?.routeFile) return [];
	const theirs = new Set(old.assets.flatMap((a) => (a.runtime ? [a.runtime] : [])));
	const code = (a: { readonly type: string }) => a.type === 'script' || a.type === 'worker' || a.type === 'serviceworker';
	const oldScripts = new Set(old.assets.filter((a) => code(a) && a.url.startsWith('/')).map((a) => a.url));
	// A worker's script answers on the page as a script too: one entry per file, named a worker when it is one.
	const byUrl = new Map<string, (typeof next.assets)[number]>();
	for (const a of next.assets) if (code(a) && a.status < 400 && (!byUrl.has(a.url) || a.type !== 'script')) byUrl.set(a.url, { ...a, runtime: a.runtime ?? byUrl.get(a.url)?.runtime });
	const scripts = [...byUrl.values()];
	const runs = [...new Set(scripts.flatMap((a) => (a.runtime && theirs.has(a.runtime) ? [a.runtime] : [])))];
	const own = scripts.filter((a) => oldScripts.has(a.url));
	const carriers = scripts.filter((a) => a.runtime && theirs.has(a.runtime));
	if (!runs.length && !own.length) return [];
	const named = (runs.length ? runs : [...theirs]).join(', ') || 'the original\'s';
	return [{
		route,
		dimension: 'weight',
		check: "runs the original's framework",
		viewport: next.viewport,
		expected: `a Markless page with none of the original's runtime (${[...theirs].join(', ') || 'its scripts'})`,
		actual: `${named} runs on the port: ${[own.length ? `${own.length} of the original's own script file${own.length === 1 ? '' : 's'} load${own.length === 1 ? 's' : ''} (${own.slice(0, 3).map((a) => a.url).join(', ')}${own.length > 3 ? ', …' : ''})` : '', runs.length ? `${carriers.length} script${carriers.length === 1 ? '' : 's'} carr${carriers.length === 1 ? 'ies' : 'y'} the ${runs.join(' and ')} runtime (${carriers.slice(0, 3).map((a) => `${a.type === 'script' ? '' : `${a.type} `}${a.url}`).join(', ')}${carriers.length > 3 ? ', …' : ''})` : ''].filter(Boolean).join('; ')}`,
		hint: HINTS.originalRuntime,
	}];
}
