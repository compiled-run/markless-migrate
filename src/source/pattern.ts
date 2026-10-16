/** Joins route path pieces into one normalised pattern starting with `/`. */
export function joinPath(...parts: (string | undefined)[]): string {
	const pieces = parts.filter((p): p is string => !!p && p !== '/');
	const trailing = pieces.length > 0 && pieces.at(-1)!.endsWith('/');
	const joined = pieces.map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
	return joined ? `/${joined}${trailing ? '/' : ''}` : '/';
}

export const isDynamic = (pattern: string) => /(^|\/)[:*]/.test(pattern);

type Seg = { kind: 'static'; value: string } | { kind: 'param'; optional: boolean } | { kind: 'rest'; optional: boolean };

function segments(pattern: string): Seg[] {
	return pattern
		.split('/')
		.filter(Boolean)
		.map((s): Seg => {
			if (s.startsWith(':')) return { kind: 'param', optional: s.endsWith('?') };
			if (s.startsWith('*')) return { kind: 'rest', optional: s.endsWith('?') };
			return { kind: 'static', value: s.toLowerCase() };
		});
}

/** Whether a concrete path (query and trailing slash ignored) is one this pattern serves. */
export function matchRoute(pattern: string, path: string): boolean {
	const want = segments(pattern);
	const have = path
		.split(/[?#]/)[0]!
		.split('/')
		.filter(Boolean)
		.map((s) => {
			try {
				return decodeURIComponent(s).toLowerCase();
			} catch {
				return s.toLowerCase();
			}
		});
	const go = (i: number, j: number): boolean => {
		if (i === want.length) return j === have.length;
		const seg = want[i]!;
		if (seg.kind === 'static') return j < have.length && have[j] === seg.value && go(i + 1, j + 1);
		if (seg.kind === 'param') return (j < have.length && go(i + 1, j + 1)) || (seg.optional && go(i + 1, j));
		for (let k = have.length; k >= j + (seg.optional ? 0 : 1); k--) if (go(i + 1, k)) return true;
		return false;
	};
	return go(0, 0);
}

/** How specific a pattern is, so the most specific of several matches can be preferred. */
export function specificity(pattern: string): number {
	return segments(pattern).reduce((sum, s) => sum + (s.kind === 'static' ? 100 : s.kind === 'param' ? (s.optional ? 5 : 10) : s.optional ? 0 : 1), 0);
}

/** Converts a path-to-regexp style matcher (`/dashboard/:path*`, `/admin(.*)`) to a pattern. */
export function fromMatcher(matcher: string): string {
	const cleaned = matcher
		.replace(/\(\.\*\)|\/\(\.\*\)/g, '/*rest?')
		.replace(/:(\w+)\*/g, '*$1?')
		.replace(/:(\w+)\+/g, '*$1')
		.replace(/:(\w+)\?/g, ':$1?')
		.replace(/\{([^}]*)\}\?/g, '$1')
		.replace(/\([^)]*\)/g, '');
	return joinPath(cleaned.replace(/\/\/+/g, '/'));
}

/** Whether pattern `outer` serves every path `inner` serves; with `prefix`, also everything below `outer`. */
export function covers(outer: string, inner: string, prefix = false): boolean {
	const o = outer.split('/').filter(Boolean);
	const i = inner.split('/').filter(Boolean);
	for (let k = 0; k < o.length; k++) {
		const a = o[k]!;
		if (a.startsWith('*')) return true;
		const b = i[k];
		if (b === undefined) return o.slice(k).every((s) => s.endsWith('?'));
		if (a.startsWith(':')) continue;
		if (a.toLowerCase() !== b.toLowerCase()) return false;
	}
	return prefix || o.length === i.length;
}
