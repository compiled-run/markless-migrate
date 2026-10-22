// Runs inside the page via page.evaluate: must stay self-contained (no imports, no outer references).
export function collectPage({ origin, full, styles = true }: { origin: string; full: boolean; styles?: boolean }) {
	const local = (url: string) => (url.startsWith(origin) ? url.slice(origin.length) || '/' : url);
	const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
	const NAME_FROM_CONTENT = new Set(['link', 'button', 'heading', 'cell', 'columnheader', 'option', 'tab', 'menuitem', 'listitem']);
	const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META']);
	const GEOMETRY = new Set(['width', 'height', 'inline-size', 'block-size', 'transform-origin', 'perspective-origin']);

	const scoped = (el: Element) => !el.parentElement?.closest('article, aside, main, nav, section');
	// An id a framework generates (React's useId, a diagram's counter) names a gradient, filter or marker differently on
	// each side; a style that points at one is compared by where that element is in the page, not by the id.
	const place = (el: Element) => {
		const steps: string[] = [];
		for (let at: Element | null = el; at && at !== document.documentElement; at = at.parentElement) {
			const same = at.parentElement ? [...at.parentElement.children].filter((c) => c.tagName === at!.tagName) : [at];
			steps.unshift(`${at.tagName.toLowerCase()}:${same.indexOf(at) + 1}`);
		}
		return steps.join('>');
	};
	const idRefs = (value: string) => (value.includes('url("#') ? value.replace(/url\("#([^"]*)"\)/g, (whole, id: string) => { const target = document.getElementById(id); return target ? `url("#{${place(target)}}")` : whole; }) : value);

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
	const refs: Element[] = [];
	const scope = window as unknown as { __mmIds?: WeakMap<Element, number>; __mmNext?: number; __mmElements?: Element[]; __mmById?: Map<number, Element> };
	const byId = (scope.__mmById ??= new Map());
	const ids = (scope.__mmIds ??= new WeakMap());
	const paths = new Map<Element, string>();
	const chains = new Map<Element, string>();
	// Styles go out interned (names, values and whole rows by index): a long page's raw computed styles are tens of MB.
	const props: string[] = [];
	const values: string[] = [];
	const rows: number[][] = [];
	const propAt = new Map<string, number>();
	const valueAt = new Map<string, number>();
	const rowAt = new Map<string, number>();
	const intern = (table: string[], at: Map<string, number>, value: string) => {
		let i = at.get(value);
		if (i === undefined) at.set(value, (i = table.push(value) - 1));
		return i;
	};
	const ofTag = new Map<Element, Map<string, number>>();
	for (const el of full ? [document.documentElement, document.body, ...document.body.querySelectorAll('*')] : []) {
		if (SKIP.has(el.tagName)) continue;
		// An embed, or the Markless component standing in for one (both marked by liveEmbeds), is the embed step's to compare: its inside is opaque here, as a frame's is.
		if (el.parentElement?.closest('[data-markless-migrate-embed]')) continue;
		const r = role(el);
		const parent = el.parentElement;
		const parentPath = parent && parent !== document.body ? (paths.get(parent) ?? '') : '';
		const segment = r && r !== 'generic' && r !== 'none' && r !== 'presentation' ? r : '';
		paths.set(el, segment ? (parentPath ? `${parentPath}>${segment}` : segment) : parentPath);
		const tagName = el.tagName.toLowerCase();
		let nth = 1;
		if (parent) {
			const counts = ofTag.get(parent) ?? new Map<string, number>();
			ofTag.set(parent, counts);
			nth = (counts.get(el.tagName) ?? 0) + 1;
			counts.set(el.tagName, nth);
		}
		chains.set(el, `${parent ? `${chains.get(parent) ?? ''}>` : ''}${tagName}:${nth}`.replace(/^>/, ''));
		if (!el.checkVisibility({ visibilityProperty: true })) continue;
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) continue;
		const computed = styles ? getComputedStyle(el) : undefined;
		const row: number[] = [];
		for (const prop of computed ?? []) {
			if (prop.startsWith('--') || GEOMETRY.has(prop)) continue;
			// A url() resolves against the page: the app's own origin is not part of the value.
			row.push(intern(props, propAt, prop), intern(values, valueAt, idRefs(computed!.getPropertyValue(prop).split(`${location.origin}/`).join('/'))));
		}
		const key = row.join(',');
		let style = rowAt.get(key);
		if (style === undefined) rowAt.set(key, (style = rows.push(row) - 1));
		const text = clean([...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ')).slice(0, 80);
		const tag = el.tagName.toLowerCase();
		if (!ids.has(el)) ids.set(el, (scope.__mmNext = (scope.__mmNext ?? 0) + 1));
		byId.set(ids.get(el)!, el);
		refs.push(el);
		elements.push({
			id: ids.get(el)!,
			role: r,
			name: name(el, r),
			tag,
			text,
			path: `${paths.get(el) || 'body'}/${tag}`,
			chain: chains.get(el)!,
			box: { x: Math.round(rect.x + scrollX), y: Math.round(rect.y + scrollY), width: Math.round(rect.width), height: Math.round(rect.height) },
			style,
		});
	}

	scope.__mmElements = refs;

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
	const embedLines = new Map<string, number>();
	for (const el of document.querySelectorAll<HTMLElement>('[data-markless-migrate-embed]')) for (const line of el.innerText.split('\n').map(clean).filter(Boolean)) embedLines.set(line, (embedLines.get(line) ?? 0) + 1);
	const text = document.body.innerText.split('\n').map(clean).filter(Boolean).filter((line) => {
		const left = embedLines.get(line) ?? 0;
		if (!left) return true;
		embedLines.set(line, left - 1);
		return false;
	});
	const links = [...document.querySelectorAll('a[href], link[rel~="alternate"][hreflang]')].map((a) => (a as HTMLAnchorElement).href).filter(Boolean);
	return { elements, styles: { props, values, rows }, seo, images, fonts, text, links };
}

type Collected = ReturnType<typeof collectPage>;

/** collectPage's elements with their styles as objects; elements with the same computed style share one frozen object. */
export function expandStyles(collected: Collected) {
	const { props, values, rows } = collected.styles;
	const styles = rows.map((row) => {
		const style: Record<string, string> = {};
		for (let i = 0; i < row.length; i += 2) style[props[row[i]!]!] = values[row[i + 1]!]!;
		return Object.freeze(style);
	});
	return { ...collected, elements: collected.elements.map((el) => ({ ...el, style: styles[el.style]! })) };
}

/** Runs collectPage in the page and expands its styles. */
export async function readPage(page: { evaluate: <R, A>(fn: (arg: A) => R, arg: A) => Promise<R> }, options: { origin: string; full: boolean; styles?: boolean }) {
	return expandStyles(await page.evaluate(collectPage, options));
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
