// Runs inside the page via page.evaluate: must stay self-contained (no imports, no outer references).
export function collectPage({ origin, full }: { origin: string; full: boolean }) {
	const local = (url: string) => (url.startsWith(origin) ? url.slice(origin.length) || '/' : url);
	const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
	const NAME_FROM_CONTENT = new Set(['link', 'button', 'heading', 'cell', 'columnheader', 'option', 'tab', 'menuitem', 'listitem']);
	const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META']);
	const GEOMETRY = new Set(['width', 'height', 'inline-size', 'block-size', 'transform-origin', 'perspective-origin']);

	const scoped = (el: Element) => !el.parentElement?.closest('article, aside, main, nav, section');

	function role(el: Element): string {
		const explicit = el.getAttribute('role');
		if (explicit) return explicit.split(' ')[0]!;
		const tag = el.tagName.toLowerCase();
		switch (tag) {
			case 'a':
			case 'area':
				return el.hasAttribute('href') ? 'link' : 'generic';
			case 'img':
				return el.getAttribute('alt') === '' ? 'presentation' : 'img';
			case 'input': {
				const type = (el.getAttribute('type') ?? 'text').toLowerCase();
				if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
				if (type === 'hidden') return 'none';
				const map: Record<string, string> = { checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox' };
				return map[type] ?? 'textbox';
			}
			case 'header':
				return scoped(el) ? 'banner' : 'generic';
			case 'footer':
				return scoped(el) ? 'contentinfo' : 'generic';
			case 'section':
				return el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') ? 'region' : 'generic';
			case 'select':
				return el.hasAttribute('multiple') ? 'listbox' : 'combobox';
		}
		if (/^h[1-6]$/.test(tag)) return 'heading';
		const map: Record<string, string> = {
			article: 'article', aside: 'complementary', button: 'button', dialog: 'dialog', details: 'group',
			summary: 'button', fieldset: 'group', figure: 'figure', form: 'form', hr: 'separator', li: 'listitem',
			main: 'main', nav: 'navigation', ol: 'list', ul: 'list', option: 'option', output: 'status',
			progress: 'progressbar', table: 'table', tbody: 'rowgroup', thead: 'rowgroup', td: 'cell',
			th: 'columnheader', tr: 'row', textarea: 'textbox', p: 'paragraph', time: 'time', div: 'generic', span: 'generic',
		};
		return map[tag] ?? '';
	}

	function name(el: Element, r: string): string {
		const label = el.getAttribute('aria-label');
		if (label) return clean(label);
		const labelledBy = el.getAttribute('aria-labelledby');
		if (labelledBy) {
			return clean(labelledBy.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
		}
		if (el instanceof HTMLImageElement) return clean(el.alt);
		if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
			const labels = el.labels ? [...el.labels].map((l) => l.textContent ?? '').join(' ') : '';
			return clean(labels || el.getAttribute('placeholder') || el.getAttribute('title') || '');
		}
		if (NAME_FROM_CONTENT.has(r)) return clean(el.textContent ?? '').slice(0, 80);
		return clean(el.getAttribute('title') ?? '');
	}

	const elements = [];
	const paths = new Map<Element, string>();
	for (const el of full ? document.body.querySelectorAll('*') : []) {
		if (SKIP.has(el.tagName)) continue;
		const r = role(el);
		const parent = el.parentElement;
		const parentPath = parent && parent !== document.body ? (paths.get(parent) ?? '') : '';
		const segment = r && r !== 'generic' && r !== 'none' && r !== 'presentation' ? r : '';
		paths.set(el, segment ? (parentPath ? `${parentPath}>${segment}` : segment) : parentPath);
		if (!el.checkVisibility({ visibilityProperty: true })) continue;
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) continue;
		const computed = getComputedStyle(el);
		const style: Record<string, string> = {};
		for (const prop of computed) {
			if (prop.startsWith('--') || GEOMETRY.has(prop)) continue;
			style[prop] = computed.getPropertyValue(prop);
		}
		const text = clean([...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ')).slice(0, 80);
		const tag = el.tagName.toLowerCase();
		elements.push({
			role: r,
			name: name(el, r),
			tag,
			text,
			path: `${paths.get(el) || 'body'}/${tag}`,
			box: { x: Math.round(rect.x + scrollX), y: Math.round(rect.y + scrollY), width: Math.round(rect.width), height: Math.round(rect.height) },
			style,
		});
	}

	const seo: Record<string, string> = {};
	const put = (key: string, value: string | null | undefined) => {
		if (value == null) return;
		let k = key;
		for (let i = 2; k in seo; i++) k = `${key}#${i}`;
		seo[k] = value.split(origin).join('{origin}');
	};
	put('title', document.title);
	put('html:lang', document.documentElement.getAttribute('lang'));
	put('html:dir', document.documentElement.getAttribute('dir'));
	for (const meta of document.head.querySelectorAll('meta[name], meta[property]')) {
		const key = (meta.getAttribute('property') ?? meta.getAttribute('name') ?? '').toLowerCase();
		if (key === 'description' || key === 'robots' || key === 'googlebot' || key.startsWith('og:') || key.startsWith('twitter:')) {
			put(`meta:${key}`, meta.getAttribute('content'));
		}
	}
	for (const link of document.querySelectorAll('link[rel~="canonical"]')) put('canonical', link.getAttribute('href'));
	for (const link of document.querySelectorAll('link[rel~="alternate"][hreflang]')) {
		put(`hreflang:${link.getAttribute('hreflang')!.toLowerCase()}`, link.getAttribute('href'));
	}
	const flatten = (prefix: string, value: unknown): void => {
		if (value !== null && typeof value === 'object') {
			for (const [k, v] of Object.entries(value)) flatten(`${prefix}.${k}`, v);
		} else put(prefix, String(value));
	};
	document.querySelectorAll('script[type="application/ld+json"]').forEach((script, i) => {
		try {
			flatten(`jsonld[${i}]`, JSON.parse(script.textContent ?? ''));
		} catch {
			put(`jsonld[${i}]:invalid`, script.textContent);
		}
	});

	const images = [...document.images].map((img) => ({
		src: local(img.currentSrc || img.src),
		alt: img.getAttribute('alt'),
		naturalWidth: img.naturalWidth,
		naturalHeight: img.naturalHeight,
		broken: img.complete && img.naturalWidth === 0,
	}));
	const fonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family}|${f.style}|${f.weight}`))].sort();
	const text = document.body.innerText.split('\n').map(clean).filter(Boolean);
	const links = [...document.querySelectorAll('a[href], link[rel~="alternate"][hreflang]')].map((a) => (a as HTMLAnchorElement).href).filter(Boolean);
	return { elements, seo, images, fonts, text, links };
}

export async function decodeImages(urls: string[]) {
	const out: Record<string, { width: number; height: number }> = {};
	for (const url of urls) {
		try {
			const bitmap = await createImageBitmap(await (await fetch(url)).blob());
			out[url] = { width: bitmap.width, height: bitmap.height };
		} catch {}
	}
	return out;
}
