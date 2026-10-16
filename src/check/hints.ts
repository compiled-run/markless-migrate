const SEO_HINTS: Record<string, string> = {
	title: 'Set the same <title> in the new route.',
	canonical: 'Emit the same <link rel="canonical"> href; a changed canonical moves the page in search results.',
	'meta:description': 'Set the same <meta name="description"> content.',
	'meta:robots': 'Set the same <meta name="robots">; a missing or changed value can de-index the page.',
	'html:lang': 'Set the same lang attribute on <html>; screen readers and search engines use it to pick the language.',
	'html:dir': 'Set the same dir attribute on <html>.',
};

export function seoHint(key: string): string {
	const base = key.replace(/#\d+$/, '');
	if (SEO_HINTS[base]) return SEO_HINTS[base];
	if (base.startsWith('hreflang:')) return 'Emit a <link rel="alternate" hreflang> for every locale the old route listed, with the same href.';
	if (base.startsWith('meta:og:') || base.startsWith('meta:twitter:')) return `Set the same <meta> ${base.slice(5)} tag; link previews read it.`;
	if (base.startsWith('jsonld')) return 'Emit the same JSON-LD structured data (compared as parsed data, so key order and whitespace do not matter).';
	return 'Emit the same head tag as the old route.';
}

export const HINTS = {
	status: 'Return the same status code. If the old route answered 404, make the new not-found handler send 404, not 200: a soft 404 gets indexed.',
	redirects: 'Recreate the redirect with the same status (301/308 permanent, 302/307 temporary) and the same target.',
	contentType: 'Serve the route with the same Content-Type.',
	aria: 'The accessibility tree differs: check headings, landmarks, link and button names and image alt text in the new markup.',
	text: 'The visible text differs: port the missing copy or remove the extra copy.',
	visual: 'Pixels differ in the named region. If the DOM and CSS checks pass, look at fonts, images and stacking there.',
	visualSize: 'The page has a different size: an element is taller, shorter or missing. Compare the elements inside the region.',
	assetMissing: 'Serve this file at the same URL in the new app (for example from its public directory) or redirect it; other sites and caches link to it.',
	assetType: 'Serve the file with the same Content-Type.',
	assetDimensions: 'Serve the same image: its decoded size differs.',
	assetBroken: 'This URL fails on the new side; fix the reference or serve the file.',
	image: 'The image at this position in the page loads a different picture or fails to load.',
	fonts: 'A different font renders this text. Port the @font-face rule with the same font file (compared by content, not by family name) and the font-family stack, and make sure the file is served.',
	css: 'Port the rule that sets this property for this element in the old stylesheet; computed values must match.',
	weight: 'The new route downloads or runs more JavaScript at load than the old one. Look at the scripts only the new route loads.',
} as const;
