// components/directory-list.tsx's view of registry/directory.json, as hooks/use-search-registry.ts and
// lib/registry-health/directory.ts build it: ranked by the health /r/registries.json reports (entries checked in the
// last 6 hours), filtered by the query with spaces and @ left out, ten to a page, with the page numbers its
// pagination shows. The registries themselves come from directory-data.ts, loaded on demand.

export interface DirectoryEntry {
	readonly name: string;
	readonly homepage: string;
	readonly description: string;
	/** The logo's symbol file (directory/logos), and its viewBox; empty for a registry with no logo. */
	readonly logo: string;
	readonly viewBox: string;
}

interface Health {
	readonly status: string;
	readonly score: number;
	readonly checkedAt: string;
	readonly monitoringLimited: boolean;
}
interface Ranking {
	readonly score: number;
	readonly itemCount: number;
}
type Ranked = DirectoryEntry & { readonly health?: Health; readonly ranking?: Ranking };

const HEALTH_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const PAGE_SIZE = 10;

const isHealth = (h: unknown): h is Health => Boolean(h) && typeof h === 'object' && typeof (h as Health).status === 'string' && typeof (h as Health).score === 'number' && typeof (h as Health).checkedAt === 'string' && typeof (h as Health).monitoringLimited === 'boolean';
const isRanking = (r: unknown): r is Ranking => Boolean(r) && typeof r === 'object' && typeof (r as Ranking).score === 'number' && Number.isInteger((r as Ranking).itemCount);

function group(r: Ranked, useRanking: boolean): number {
	if (r.health?.status === 'unavailable') return 2;
	if (!r.health || r.health.status === 'observing' || r.health.monitoringLimited || (useRanking && !r.ranking) || r.ranking?.itemCount === 0) return 1;
	return 0;
}

/** The registries in the order the directory lists them, given what /r/registries.json answered (if anything) and when. */
export function rank(directory: readonly DirectoryEntry[], payload: unknown, now: number): readonly Ranked[] {
	const names = new Set(directory.map((r) => r.name));
	const metadata = new Map<string, { health: Health; ranking?: Ranking }>();
	if (Array.isArray(payload)) {
		for (const entry of payload) {
			if (!entry || typeof entry !== 'object' || !names.has(entry.name) || !isHealth(entry.health)) continue;
			const age = now - new Date(entry.health.checkedAt).getTime();
			if (age < 0 || age > HEALTH_MAX_AGE_MS) continue;
			metadata.set(entry.name, { health: entry.health, ...(isRanking(entry.ranking) ? { ranking: entry.ranking } : {}) });
		}
	}
	const useRanking = [...metadata.values()].some((m) => m.ranking);
	return directory
		.map((r): Ranked => ({ ...r, ...metadata.get(r.name) }))
		.toSorted((a, b) => {
			const g = group(a, useRanking) - group(b, useRanking);
			if (g !== 0) return g;
			if (group(a, useRanking) === 0 && a.health && b.health) {
				const score = useRanking ? (b.ranking?.score ?? 0) - (a.ranking?.score ?? 0) : b.health.score - a.health.score;
				if (score !== 0) return score;
			}
			return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'en');
		});
}

/** directory-list.tsx's getPageNumbers: every page up to 7, else the first, the last, the current and its neighbours. */
export function pageNumbers(current: number, total: number): (number | 'ellipsis')[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
	const pages: (number | 'ellipsis')[] = [1];
	if (current > 4) pages.push('ellipsis');
	else if (current >= 4) pages.push(2);
	for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
	if (current < total - 3) pages.push('ellipsis');
	else if (current <= total - 3) pages.push(total - 1);
	pages.push(total);
	return pages;
}

export function pageHref(pathname: string, query: string, page: number): string {
	const params = new URLSearchParams();
	if (query) params.set('q', query);
	if (page > 1) params.set('page', String(page));
	const search = params.toString();
	return search ? `${pathname}?${search}` : pathname;
}

export function homepageUrl(homepage: string): string {
	const url = new URL(homepage);
	url.searchParams.set('utm_source', 'ui.shadcn.com');
	url.searchParams.set('utm_medium', 'referral');
	url.searchParams.set('utm_campaign', 'directory');
	return url.toString();
}

export interface Row {
	readonly name: string;
	readonly href: string;
	readonly description: string;
	readonly logo: string;
	readonly viewBox: string;
	/** The one registry with a blank logo shows an empty media box; its row keeps the hidden drawing so rows share one shape. */
	readonly noLogo: boolean;
	readonly last: boolean;
}

export interface PageLink {
	readonly key: string;
	readonly page: number;
	readonly ellipsis: boolean;
	/** A number's slot hides its ellipsis and an ellipsis's hides its link: rows keep one shape while the pages change. */
	readonly number: boolean;
	readonly href: string;
	readonly current: 'page' | undefined;
	readonly active: 'true' | 'false';
	readonly class: string;
}

/** Previous or Next: its address, and aria-disabled, tabindex and class while there is no page that way. */
export interface Step {
	readonly href: string | undefined;
	readonly disabled: 'true' | undefined;
	readonly tabindex: '-1' | undefined;
	readonly class: string;
}

// The pagination link's classes (buttonVariants outline or ghost, at size icon or default), as the old page renders them.
export const LINK_CLASS = {
	"active": "group/button inline-flex shrink-0 items-center justify-center rounded-lg border bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 size-8 max-sm:min-h-11 max-sm:min-w-11 cursor-pointer",
	"ghost": "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 size-8 max-sm:min-h-11 max-sm:min-w-11 cursor-pointer",
	"step": "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 max-sm:min-h-11 max-sm:min-w-11",
};

export interface View {
	readonly rows: readonly Row[];
	readonly count: number;
	readonly countLabel: string;
	readonly page: number;
	readonly totalPages: number;
	readonly links: readonly PageLink[];
	readonly previous: Step;
	readonly next: Step;
	/** Pagination shows only with more than one page. */
	readonly navHidden: boolean;
}

const step = (href: string, pad: string): Step => (href ? { href, disabled: undefined, tabindex: undefined, class: `${LINK_CLASS.step} ${pad} cursor-pointer` } : { href: undefined, disabled: 'true', tabindex: '-1', class: `${LINK_CLASS.step} ${pad} pointer-events-none opacity-50` });

const squash = (v: string) => v.toLowerCase().replaceAll(' ', '').replaceAll('@', '');

/** What the list shows for a query and page: lib/registry-health/directory.ts's getRegistryDirectoryPage. */
export function directoryView(ranked: readonly Ranked[], logos: Readonly<Record<string, string>>, pathname: string, query: string, page: number): View {
	const q = squash(query);
	const found = q ? ranked.filter((r) => [r.name, r.description].some((v) => squash(v).includes(q))) : ranked;
	const totalPages = Math.max(1, Math.ceil(found.length / PAGE_SIZE));
	const current = Math.max(1, Math.min(page, totalPages));
	const shown = found.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
	return {
		rows: shown.map((r, i) => ({ name: r.name, href: homepageUrl(r.homepage), description: r.description, logo: r.logo ? `${logos[r.logo] ?? ''}#logo` : '', viewBox: r.viewBox || '0 0 1 1', noLogo: !r.logo, last: i === shown.length - 1 })),
		count: found.length,
		countLabel: found.length === 1 ? 'registry' : 'registries',
		page: current,
		totalPages,
		links: pageNumbers(current, totalPages).map((p, i): PageLink => (p === 'ellipsis' ? { key: `ellipsis-${i}`, page: 0, ellipsis: true, number: false, href: '', current: undefined, active: 'false', class: '' } : { key: String(p), page: p, ellipsis: false, number: true, href: pageHref(pathname, query, p), current: p === current ? 'page' : undefined, active: p === current ? 'true' : 'false', class: p === current ? LINK_CLASS.active : LINK_CLASS.ghost })),
		previous: step(current > 1 ? pageHref(pathname, query, current - 1) : '', 'pl-1.5!'),
		next: step(current < totalPages ? pageHref(pathname, query, current + 1) : '', 'pr-1.5!'),
		navHidden: totalPages <= 1,
	};
}

/** The registries, their logos' file URLs, and the view for a query, page and health answer. */
export async function loadView(pathname: string, query: string, page: number, health: { readonly payload: unknown; readonly at: number } | undefined): Promise<View> {
	const data = await import('./directory-data.ts');
	return directoryView(rank(data.registries, health?.payload, health?.at ?? Date.now()), data.logos, pathname, query, page);
}

export const COMMANDS = (name: string) => ({
	pnpm: `pnpm dlx shadcn@latest registry add ${name}`,
	npm: `npx shadcn@latest registry add ${name}`,
	yarn: `yarn dlx shadcn@latest registry add ${name}`,
	bun: `bunx --bun shadcn@latest registry add ${name}`,
});
export type Manager = keyof ReturnType<typeof COMMANDS>;
export const MANAGERS: readonly Manager[] = ['pnpm', 'npm', 'yarn', 'bun'];

/** hooks/use-config.ts's atom ("config" in localStorage, JSON): the package manager every install tab shares. */
export function storedManager(): Manager {
	try {
		const m = JSON.parse(localStorage.getItem('config') ?? '{}').packageManager;
		return MANAGERS.includes(m) ? m : 'pnpm';
	} catch {
		return 'pnpm';
	}
}
export function storeManager(m: Manager): void {
	let config: Record<string, unknown> = { style: 'base-nova', packageManager: 'pnpm', installationType: 'cli' };
	try {
		config = { ...config, ...JSON.parse(localStorage.getItem('config') ?? '{}') };
	} catch {}
	localStorage.setItem('config', JSON.stringify({ ...config, packageManager: m }));
}

let addressTimer: ReturnType<typeof setTimeout> | undefined;
/** nuqs's useQueryState("q", { limitUrlUpdates: debounce(250) }): the address follows the query 250 ms after typing stops, replacing the entry. */
export function writeQuery(query: string): void {
	clearTimeout(addressTimer);
	addressTimer = setTimeout(() => history.replaceState(history.state, '', pageHref(location.pathname, query, 1)), 250);
}
/** useQueryState("page", { history: "push" }): a page change is a new history entry. */
export function writePage(query: string, page: number): void {
	clearTimeout(addressTimer);
	history.pushState(history.state, '', pageHref(location.pathname, query, page));
}
export function readAddress(): { readonly query: string; readonly page: number } {
	const params = new URLSearchParams(location.search);
	const page = Number.parseInt(params.get('page') ?? '', 10);
	return { query: params.get('q') ?? '', page: Number.isFinite(page) && page > 0 ? page : 1 };
}
