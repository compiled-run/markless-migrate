// A page's addresses for itself must be ones the public can open: one on a loopback host is the build machine's.
import { appHeaders, type SideEnv } from './browser.ts';
import type { Failure } from './types.ts';

const HINT = 'This address for the page points at a loopback host (the machine the page was built or captured on), so a link preview, a search engine or a language switch sends visitors nowhere. Build the page with its public origin, or derive these tags from the request.';

/** The SEO fields that name the page's own address. */
export const isSelfUrl = (key: string): boolean => {
	const base = key.replace(/#\d+$/, '');
	return base === 'meta:og:url' || base === 'meta:twitter:url' || base === 'canonical' || base.startsWith('hreflang:') || (base.startsWith('jsonld[') && /\.(url|@id)$/.test(base));
};

export const isLoopback = (host: string): boolean => /^(localhost|127(\.\d{1,3}){3}|\[::1\]|::1|0\.0\.0\.0)$/i.test(host);

const originOf = (value: string): string | undefined => {
	try {
		const url = new URL(value);
		return /^https?:$/.test(url.protocol) ? url.origin : undefined;
	} catch {
		return undefined;
	}
};

/** The same app at another name for the same loopback host, so a page that names the address it was asked for can be told from one with an address built in. */
export function aliasOf(origin: string): string | undefined {
	const url = new URL(origin);
	if (url.hostname === '127.0.0.1') url.hostname = 'localhost';
	else if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
	else return undefined;
	return url.origin;
}

/** Each self-address field's value in an HTML document, keyed as the page capture keys them. */
export function selfUrlsInHtml(html: string): Map<string, string> {
	const out = new Map<string, string>();
	const put = (key: string, value: string) => {
		let k = key;
		for (let i = 2; out.has(k); i++) k = `${key}#${i}`;
		out.set(k, value.replace(/&amp;/g, '&'));
	};
	const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(2).find((v) => v !== undefined);
	for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
		const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
		const content = attr(tag, 'content');
		if ((key === 'og:url' || key === 'twitter:url') && content !== undefined) put(`meta:${key}`, content);
	}
	for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
		const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
		const href = attr(tag, 'href');
		if (href === undefined) continue;
		if (rel.includes('canonical')) put('canonical', href);
		const lang = attr(tag, 'hreflang');
		if (rel.includes('alternate') && lang) put(`hreflang:${lang.toLowerCase()}`, href);
	}
	let i = 0;
	for (const [, body] of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
		const at = i++;
		let data: unknown;
		try {
			data = JSON.parse(body!);
		} catch {
			continue;
		}
		const walk = (prefix: string, value: unknown): void => {
			if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(`${prefix}.${k}`, v);
			else if (/\.(url|@id)$/.test(prefix) && typeof value === 'string') put(prefix, value);
		};
		walk(`jsonld[${at}]`, data);
	}
	return out;
}

/**
 * The new page's self-addresses that point at a loopback host: red outright when the host is not the one the check served the
 * page from (an address built into the page), and, when it is that very address, red if the page names it again when asked at
 * another name for the same host (built in, not taken from the request).
 */
export async function selfUrlFailures(route: string, seo: Readonly<Record<string, string>>, env: SideEnv, old?: { readonly seo: Readonly<Record<string, string>>; readonly origin: string }, fetchHtml: (url: string, headers: Record<string, string>) => Promise<string | undefined> = defaultFetch): Promise<Failure[]> {
	const failures: Failure[] = [];
	const served = new URL(env.origin).origin;
	// An original that names a loopback host other than its own here has the same fault: the port keeping it is parity.
	const oldHasIt = (key: string) => {
		const value = old?.seo[key]?.split('{origin}').join(new URL(old.origin).origin);
		const origin = value ? originOf(value) : undefined;
		return Boolean(origin && isLoopback(new URL(origin).hostname) && origin !== new URL(old!.origin).origin);
	};
	const fail = (key: string, value: string) => failures.push({ route, dimension: 'seo', check: key, expected: 'an address of the page on its public origin', actual: `${value}: a loopback address`, hint: HINT });
	const asServed: string[] = [];
	for (const [key, raw] of Object.entries(seo)) {
		if (!isSelfUrl(key)) continue;
		const value = raw.split('{origin}').join(served);
		const origin = originOf(value);
		if (!origin || !isLoopback(new URL(origin).hostname) || oldHasIt(key)) continue;
		if (origin !== served) fail(key, value);
		else asServed.push(key);
	}
	const alias = asServed.length ? aliasOf(served) : undefined;
	if (alias) {
		const html = await fetchHtml(new URL(route, alias).href, appHeaders(env));
		if (html !== undefined) {
			const again = selfUrlsInHtml(html);
			for (const key of asServed) {
				const value = again.get(key);
				if (value && originOf(value) === served) fail(key, value);
			}
		}
	}
	return failures;
}

async function defaultFetch(url: string, headers: Record<string, string>): Promise<string | undefined> {
	try {
		const res = await fetch(url, { headers });
		return res.ok ? await res.text() : undefined;
	} catch {
		return undefined;
	}
}
