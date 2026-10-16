import { tagHeaders, type SideEnv } from './browser.ts';
import type { Blocked } from './types.ts';

export interface Answer {
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
}

interface Rule {
	readonly vendor: string;
	readonly header?: RegExp;
	readonly cookie?: RegExp;
	readonly body?: RegExp;
	/** The marker alone proves a wall only when the status says the request was refused. */
	readonly refusedOnly?: boolean;
}

const RULES: readonly Rule[] = [
	{ vendor: 'Cloudflare', header: /^cf-mitigated: challenge$/i },
	{ vendor: 'Cloudflare', body: /<title>(Just a moment\.\.\.|Attention Required! \| Cloudflare)<\/title>|\/cdn-cgi\/challenge-platform\/|cf_chl_opt|cf-browser-verification/i },
	{ vendor: 'Vercel', header: /^x-vercel-mitigated: challenge$/i },
	{ vendor: 'AWS WAF', header: /^x-amzn-waf-action: (challenge|captcha)$/i },
	{ vendor: 'AWS WAF', body: /awswaf\.com|AwsWafIntegration/i, refusedOnly: true },
	{ vendor: 'Akamai', body: /errors\.edgesuite\.net|Reference #\d+\.[0-9a-f]+\.\d+/i, refusedOnly: true },
	{ vendor: 'Akamai', header: /^server: AkamaiGHost$/i, refusedOnly: true },
	{ vendor: 'DataDome', header: /^x-datadome(-cid)?: /i, refusedOnly: true },
	{ vendor: 'DataDome', cookie: /^datadome$/i, refusedOnly: true },
	{ vendor: 'DataDome', body: /captcha-delivery\.com|ct\.captcha-delivery/i },
	{ vendor: 'PerimeterX', body: /captcha\.px-cdn\.net|client\.perimeterx\.net|_pxAppId|id="px-captcha"/i },
	{ vendor: 'PerimeterX', cookie: /^_px(3|hd|vid)$/i, refusedOnly: true },
	{ vendor: 'Akamai', cookie: /^(_abck|bm_sz|ak_bmsc)$/i, refusedOnly: true },
	{ vendor: 'Imperva', body: /_Incapsula_Resource|Incapsula incident ID/i },
	{ vendor: 'hCaptcha', body: /hcaptcha\.com\/1\/api\.js|class="h-captcha"/i, refusedOnly: true },
	{ vendor: 'reCAPTCHA', body: /google\.com\/recaptcha\/(api|enterprise)\.js|class="g-recaptcha"/i, refusedOnly: true },
	{ vendor: 'Cloudflare Turnstile', body: /challenges\.cloudflare\.com\/turnstile/i, refusedOnly: true },
];

const INTERSTITIAL = /<title>[^<]*(captcha|are you (a )?(human|robot)|security check|verify(ing)? you|access denied|checking your browser|bot protection|one more step)[^<]*<\/title>/i;
const GENERIC = /captcha|are you (a )?(human|robot)|checking your browser|unusual traffic|automated (queries|requests)/i;

/** The bot wall that answered instead of the app, if any; an ordinary 403 or 429 without challenge markers is not one. */
export function detectChallenge(answer: Answer): { vendor: string; evidence: string } | undefined {
	const refused = [401, 403, 429, 503].includes(answer.status);
	const headerLines = Object.entries(answer.headers).map(([k, v]) => `${k.toLowerCase()}: ${v}`);
	const cookieNames = (answer.headers['set-cookie'] ?? '').split(/,(?=\s*[\w-]+=)/).map((c) => c.trim().split('=')[0]!);
	for (const rule of RULES) {
		if (rule.refusedOnly && !refused && !INTERSTITIAL.test(answer.body)) continue;
		const header = rule.header && headerLines.find((line) => rule.header!.test(line));
		if (header) return { vendor: rule.vendor, evidence: `header ${header}` };
		const cookie = rule.cookie && cookieNames.find((name) => rule.cookie!.test(name));
		if (cookie) return { vendor: rule.vendor, evidence: `cookie ${cookie}` };
		const marker = rule.body?.exec(answer.body);
		if (marker) return { vendor: rule.vendor, evidence: `page contains ${JSON.stringify(marker[0].slice(0, 80))}` };
	}
	if ((answer.status === 403 || answer.status === 429) && GENERIC.test(answer.body)) {
		return { vendor: `an unrecognised bot wall (${answer.status})`, evidence: `page contains ${JSON.stringify(GENERIC.exec(answer.body)![0])}` };
	}
	return undefined;
}

export function blockedResult(side: 'old' | 'new', status: number, found: { vendor: string; evidence: string }): Blocked {
	return { side, status, ...found, message: `blocked by ${found.vendor} on ${side.toUpperCase()} (${status}, ${found.evidence}): use a staging URL or pass --header/--cookie with a bypass token` };
}

/** Thrown from a page load when a challenge page answers, so the route stops instead of failing every check. */
export class BlockedError extends Error {
	readonly blocked: Omit<Blocked, 'side' | 'message'>;
	readonly origin: string;
	constructor(blocked: Omit<Blocked, 'side' | 'message'>, origin: string) {
		super(`blocked by ${blocked.vendor}`);
		this.blocked = blocked;
		this.origin = origin;
	}
}

const MAX_BODY = 256 * 1024;

/** Loads the route as the checker's own requests do, following redirects on the app's origin, and reports a bot wall on the way. */
export async function probeWall(env: SideEnv, route: string, side: 'old' | 'new'): Promise<Blocked | undefined> {
	const home = new URL(env.origin).origin;
	let url = new URL(route, env.origin);
	try {
		for (let hop = 0; hop < 10 && url.origin === home; hop++) {
			const response = await fetch(url, { headers: tagHeaders(env), redirect: 'manual' });
			const body = (await response.text()).slice(0, MAX_BODY);
			const headers: Record<string, string> = {};
			response.headers.forEach((value, key) => (headers[key] = value));
			const setCookie = response.headers.getSetCookie();
			if (setCookie.length) headers['set-cookie'] = setCookie.join(', ');
			const found = detectChallenge({ status: response.status, headers, body });
			if (found) return blockedResult(side, response.status, found);
			const location = response.headers.get('location');
			if (response.status < 300 || response.status >= 400 || !location) return undefined;
			url = new URL(location, url);
		}
	} catch {}
	return undefined;
}

/** `--header 'name: value'` and `--cookie name=value`, as check options. */
export function bypassOptions(headers: readonly string[] = [], cookies: readonly string[] = []): { headers?: Record<string, string>; cookies?: { name: string; value: string }[] } {
	const parsed: Record<string, string> = {};
	for (const h of headers) {
		const i = h.indexOf(':');
		if (i < 1) throw new Error(`--header must be name:value, got ${JSON.stringify(h)}`);
		parsed[h.slice(0, i).trim().toLowerCase()] = h.slice(i + 1).trim();
	}
	const jar = cookies.flatMap((c) =>
		c.split(';').map((part) => {
			const i = part.indexOf('=');
			if (i < 1) throw new Error(`--cookie must be name=value, got ${JSON.stringify(c)}`);
			return { name: part.slice(0, i).trim(), value: part.slice(i + 1).trim() };
		}),
	);
	return { ...(headers.length ? { headers: parsed } : {}), ...(jar.length ? { cookies: jar } : {}) };
}
