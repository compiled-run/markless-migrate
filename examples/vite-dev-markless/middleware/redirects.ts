import type { MiddlewareHttpContext } from '@markless/router';
import redirects from '../lib/redirects.json' with { type: 'json' };

const exact = new Map(redirects.filter((r) => !r.from.includes('*')).map((r) => [r.from, r]));
const moved = (status: number, location: string) => new Response(null, { status, headers: { location } });

// The docs' _redirects, and clean URLs as the old deployment serves them: `/x.html` and `/x/index.html` move to `/x`.
export default function redirect({ url }: MiddlewareHttpContext) {
	const rule = exact.get(url.pathname);
	if (rule) return moved(rule.status, rule.to + url.search);
	if (url.pathname.endsWith('.txt') && url.pathname !== '/llms.txt' && url.pathname !== '/llms-full.txt') return moved(308, url.pathname.replace(/\.txt$/, '.md') + url.search);
	if (url.pathname.endsWith('.html')) return moved(308, url.pathname.replace(/(\/index)?\.html$/, '') + url.search);
	return undefined;
}
