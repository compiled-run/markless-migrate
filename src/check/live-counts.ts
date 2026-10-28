import type { RouteCapture } from './types.ts';

// A GitHub repository's star count a page shows in a link to the repository: the old site reads it from GitHub when it is
// built or rendered, the port has the count it read when it was converted. Once GitHub's API confirms the old page shows
// the live count, the new page is shown that count too, as both sides are shown one third-party answer.

const REPO = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
const COUNT = /^(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?[kKmM]?)$/;

export const repoOf = (href: string) => (REPO.test(href) ? href.replace(/\/$/, '') : undefined);

/** Links to a repository whose accessible name ends in a count, from an accessibility snapshot: repository and the count's text. */
export function countLinks(aria: readonly string[]): { repo: string; text: string }[] {
	const out: { repo: string; text: string }[] = [];
	aria.forEach((line, i) => {
		const link = /^(\s*)- link "(?:.*\s)?([^\s"]+)":?$/.exec(line);
		if (!link || !COUNT.test(link[2]!)) return;
		const url = aria.slice(i + 1).find((l) => /^\s*- \/url: /.test(l) || l.search(/\S/) <= link[1]!.length);
		const repo = url && /^\s*- \/url: /.test(url) ? repoOf(url.replace(/^\s*- \/url: /, '').trim()) : undefined;
		if (repo) out.push({ repo, text: link[2]! });
	});
	return out;
}

/** The count `text` shows `stars` within one unit of its last digit (127k: 126,000 to 128,000), or within 1% for a long number that moved since. */
export function showsCount(text: string, stars: number): boolean {
	const short = /^(\d+(?:\.(\d+))?)([kKmM])$/.exec(text);
	if (short) {
		const scale = short[3]!.toLowerCase() === 'k' ? 1e3 : 1e6;
		return Math.abs(Number(short[1]) * scale - stars) <= scale / 10 ** (short[2]?.length ?? 0);
	}
	const n = Number(text.replace(/,/g, ''));
	return Number.isFinite(n) && Math.abs(n - stars) <= Math.max(1, stars * 0.01);
}

const asked = new Map<string, Promise<number | undefined>>();

/** The repository's star count from GitHub's API now, or undefined when GitHub does not answer. */
export function gitHubStars(repo: string, fetcher: typeof fetch = fetch): Promise<number | undefined> {
	const api = repo.replace('https://github.com/', 'https://api.github.com/repos/');
	if (!asked.has(api)) {
		const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
		asked.set(
			api,
			fetcher(api, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'markless-migrate check', ...(token ? { authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(10_000) })
				.then(async (r) => (r.ok ? ((await r.json()) as { stargazers_count?: number }).stargazers_count : undefined))
				.catch(() => undefined),
		);
	}
	return asked.get(api)!;
}

/** Adds to `into` each repository count the old pages show that GitHub confirms is live, by repository. */
export async function learnLiveCounts(olds: readonly RouteCapture[], into: Map<string, string>, fetcher: typeof fetch = fetch): Promise<void> {
	const seen = new Map<string, string>();
	for (const o of olds) for (const page of Object.values(o.pages)) for (const { repo, text } of countLinks(page.aria)) if (!into.has(repo)) seen.set(repo, text);
	for (const [repo, text] of seen) {
		const stars = await gitHubStars(repo, fetcher);
		if (stars !== undefined && showsCount(text, stars)) into.set(repo, text);
	}
}

/** Run in the new page: a count in a link to one of these repositories reads as the old page's count. */
export function pinLiveCounts(counts: readonly (readonly [string, string])[]): void {
	const want = new Map(counts);
	const selector = counts.flatMap(([repo]) => [`a[href="${repo}"]`, `a[href="${repo}/"]`]).join(', ');
	const pattern = /^(\s*)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?[kKmM]?)(\s*)$/;
	const pin = () => {
		for (const a of document.querySelectorAll<HTMLAnchorElement>(selector)) {
			const text = want.get(a.href.replace(/\/$/, ''));
			if (text === undefined) continue;
			const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const found = pattern.exec(node.nodeValue ?? '');
				if (found && found[2] !== text) node.nodeValue = `${found[1]}${text}${found[3]}`;
			}
		}
	};
	new MutationObserver(pin).observe(document, { childList: true, subtree: true });
	document.addEventListener('DOMContentLoaded', pin);
}

export const pinnedCounts = (counts: ReadonlyMap<string, string>): string[] => [...counts].map(([repo, text]) => `live data: the star count in links to ${repo} reads ${text} on the new page too, the count the old page showed and GitHub's API confirmed when check ran`);
