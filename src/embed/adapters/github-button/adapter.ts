import type { EmbedData } from '../../data.ts';
import type { EmbedUse } from '../../types.ts';
import type { EmbedAdapter } from '../index.ts';

type Scheme = 'light' | 'dark';

/** buttons.js's `data-color-scheme` ("no-preference: light; light: light; dark: dark;"), light everywhere when absent. */
export function colorScheme(value: string | undefined): { none: Scheme; light: Scheme; dark: Scheme } {
	if (!value) return { none: 'light', light: 'light', dark: 'light' };
	if (value === 'light' || value === 'dark') return { none: value, light: value, dark: value };
	const parts = Object.fromEntries(value.split(';').map((p) => p.split(':').map((s) => s.trim())).filter((p) => p.length === 2) as [string, string][]);
	const pick = (v: string | undefined, fallback: Scheme): Scheme => (v === 'light' || v === 'dark' ? v : fallback);
	return { none: pick(parts['no-preference'], 'light'), light: pick(parts.light, 'light'), dark: pick(parts.dark, 'dark') };
}

/** What buttons.js counts for a link, and where its count links: by the path's shape, as its own code decides. */
function counted(href: string): { field: string; noun: string; suffix: string } | undefined {
	const parts = new URL(href, 'https://github.com').pathname.split('/').filter(Boolean);
	if (parts.length === 1) return { field: 'followers', noun: 'followers', suffix: '?tab=followers' };
	if (parts.length === 2) return { field: 'stars', noun: 'stargazers', suffix: '' };
	if (parts[2] === 'subscription') return { field: 'watchers', noun: 'subscribers', suffix: '' };
	if (parts[2] === 'fork') return { field: 'forks', noun: 'forks', suffix: '/forks' };
	return undefined;
}

export const GITHUB_BUTTON: EmbedAdapter = {
	id: 'github-button',
	provider: 'github-button',
	dir: 'github-button',
	module: 'github-button.tsrx',
	component: 'GitHubButton',
	files: ['github-button.tsrx', 'octicons.ts'],
	certifiedBy: 'the embed step of check against buttons.js 2.33 on htmx.org: / and /examples/click-to-edit/, desktop and mobile, light and dark (examples/htmx-org-LOG.md)',
	notes: ['Only the light and dark palettes are drawn; a data-color-scheme naming another GitHub theme falls back to light or dark.', 'The count is the one read at convert time; run embeds install --refresh before a deploy to update it.'],
	props(use: EmbedUse, data: EmbedData) {
		const a = use.attributes;
		const frame = a.src ? new URLSearchParams(new URL(a.src).hash.slice(1)) : undefined;
		const attr = (name: string) => frame?.get(name) ?? a[name] ?? undefined;
		const href = attr('href') ?? use.url ?? '';
		const count = attr('data-show-count') === 'true' ? counted(href) : undefined;
		const value = count ? data.fields[count.field] : undefined;
		const htmlUrl = typeof data.fields.htmlUrl === 'string' ? data.fields.htmlUrl : href;
		return {
			embed: use.id,
			href,
			text: attr('data-text') ?? a['#text'] ?? '',
			...(attr('aria-label') ? { ariaLabel: attr('aria-label') } : {}),
			icon: attr('data-icon') ?? 'mark-github',
			...(attr('data-size') === 'large' ? { large: true } : {}),
			scheme: colorScheme(attr('data-color-scheme')),
			...(count && typeof value === 'number' ? { count: value, countHref: `${htmlUrl}${count.suffix}`, countNoun: count.noun } : {}),
		};
	},
};
