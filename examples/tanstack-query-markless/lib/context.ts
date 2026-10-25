// What the server needs from a request to answer as the old app's tab would: which tab's data, and the sandbox panel's delay.
export const TAB_COOKIE = 'kitchen-sink-tab';
export const SANDBOX_KEYS = ['loaderDelay', 'pendingMs', 'pendingMinMs'] as const;
export type SandboxKey = (typeof SANDBOX_KEYS)[number];
export const SANDBOX_DEFAULTS: Record<SandboxKey, number> = {
	loaderDelay: 500,
	pendingMs: 1000,
	pendingMinMs: 500,
};

export interface RequestContext {
	readonly tab: string;
	/** The old app's `Number(sessionStorage.getItem('loaderDelay') ?? 0)`: 0 until the page has stored the panel's default. */
	readonly loaderDelay: number;
	readonly sandbox: Record<SandboxKey, number>;
	/** Set when the page answers with a redirect: its data is never shown, so it is not fetched. */
	leaving?: boolean;
}

export function cookies(header: string | null): Map<string, string> {
	const out = new Map<string, string>();
	for (const part of (header ?? '').split(';')) {
		const at = part.indexOf('=');
		if (at > 0)
			out.set(part.slice(0, at).trim(), decodeURIComponent(part.slice(at + 1).trim()));
	}
	return out;
}

export function requestContext(request: Request, minted?: string): RequestContext {
	const jar = cookies(request.headers.get('cookie'));
	const stored = (key: SandboxKey) =>
		jar.has(key) ? Number(JSON.parse(jar.get(key)!)) : undefined;
	const sandbox = Object.fromEntries(
		SANDBOX_KEYS.map((k) => [k, stored(k) ?? SANDBOX_DEFAULTS[k]]),
	) as Record<SandboxKey, number>;
	return {
		tab: minted ?? jar.get(TAB_COOKIE) ?? '',
		loaderDelay: stored('loaderDelay') ?? 0,
		sandbox,
	};
}
