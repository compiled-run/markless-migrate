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
