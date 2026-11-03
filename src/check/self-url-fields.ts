// Which SEO fields name the page's own address, and that address by its path: pure, so the judges can read them.

/** The SEO fields that name the page's own address. */
export const isSelfUrl = (key: string): boolean => {
	const base = key.replace(/#\d+$/, '');
	return base === 'meta:og:url' || base === 'meta:twitter:url' || base === 'canonical' || base.startsWith('hreflang:') || (base.startsWith('jsonld[') && /\.(url|@id)$/.test(base));
};

/** A self-address by its path, query and fragment: `{origin}/docs`, `https://ui.shadcn.com/docs` and `/docs` are one address of the page. */
export function selfPath(value: string): string {
	const url = URL.parse(value.split('{origin}').join('http://origin.invalid'));
	return url && /^https?:$/.test(url.protocol) ? `${url.pathname}${url.search}${url.hash}` : value;
}
