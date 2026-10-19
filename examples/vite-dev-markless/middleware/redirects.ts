import type { MiddlewareHttpContext } from '@markless/router';
import redirects from '../lib/redirects.json' with { type: 'json' };

const exact = new Map(redirects.filter((r) => !r.from.includes('*')).map((r) => [r.from, r]));
const moved = (status: number, location: string) => new Response(null, { status, headers: { location } });

// Clean URLs and the docs' _redirects, as the old deployment serves them: `/x.html` and `/x/index.html` first move to
// `/x`, and a rule then moves `/x` on (so `/x.html` takes two hops when `/x` itself is redirected).
export default function redirect({ url }: MiddlewareHttpContext) {
	if (url.pathname.endsWith('.html')) return moved(308, url.pathname.replace(/(\/index)?\.html$/, '') + url.search);
	const rule = exact.get(url.pathname);
	if (rule) return moved(rule.status, rule.to + url.search);
	if (url.pathname.endsWith('.txt') && url.pathname !== '/llms.txt' && url.pathname !== '/llms-full.txt') return moved(308, url.pathname.replace(/\.txt$/, '.md') + url.search);
	return undefined;
}
